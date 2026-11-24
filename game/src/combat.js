// Ironhaven — combat: fists, a pistol, warehouse thugs, and health/ammo pickups.
(function () {
  const PUNCH_RANGE = 2.6, PUNCH_DMG = 30, PISTOL_DMG = 34, MAG = 12;

  function spawnThugs(G, x, z, n) {
    const thugs = [];
    for (let i = 0; i < n; i++) {
      const t = IH.makePerson(G, x + (Math.random() - 0.5) * 16, z + (Math.random() - 0.5) * 16,
        { thug: true, shirt: 0x3a3a3a, pants: 0x222222, health: 100 });
      t.shootCd = 1 + Math.random();
      thugs.push(t);
    }
    return thugs;
  }

  // Enemies (thugs and hostile foot cops are handled by police.js; thugs shoot here).
  function updateThugs(G, dt) {
    const pp = G.player.mesh.position;
    for (const t of G.thugs) {
      if (t.dead) continue;
      const dx = pp.x - t.mesh.position.x, dz = pp.z - t.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      t.heading = Math.atan2(dx, dz);
      t.mesh.rotation.y = t.heading;
      if (dist > 16) {
        t.speed = 3.4;
        t.mesh.position.x += Math.sin(t.heading) * t.speed * dt;
        t.mesh.position.z += Math.cos(t.heading) * t.speed * dt;
      } else if (dist < 6) {
        // Back off a little, keep shooting distance.
        t.mesh.position.x -= Math.sin(t.heading) * 1.2 * dt;
        t.mesh.position.z -= Math.cos(t.heading) * 1.2 * dt;
      }
      IH.cityCollide(G, t.mesh.position, 0.5);
      t.shootCd -= dt;
      if (dist < 26 && t.shootCd <= 0) {
        t.shootCd = 1.4 + Math.random() * 0.8;
        IH.audio.shot();
        // Thugs are bad shots: they hit roughly one time in three.
        if (Math.random() < 0.34) {
          G.player.health = Math.max(0, G.player.health - 7);
          G.hudFlash();
        }
        // Muzzle flash: a brief bright sprite at the thug's hand.
        t.mesh.position.y = 0.02;
        setTimeout(() => { if (t.mesh) t.mesh.position.y = 0; }, 60);
      }
    }
  }

  // A punch: short range, in front of the player.
  function punch(G) {
    const p = G.player;
    if (p.punchCd > 0 || p.inCar) return false;
    p.punchCd = 0.45;
    p.punchAnim = 0.25;
    IH.audio.blip(200, 0.08, 'square', 0.1);
    const px = p.mesh.position.x, pz = p.mesh.position.z;
    const targets = [...G.thugs, ...G.footCops, ...G.peds];
    for (const t of targets) {
      if (t.dead) continue;
      const dx = t.mesh.position.x - px, dz = t.mesh.position.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > PUNCH_RANGE) continue;
      const ang = IH.angleDiff(p.heading, Math.atan2(dx, dz));
      if (Math.abs(ang) > 1.1) continue;
      hurtTarget(G, t, PUNCH_DMG);
      return true;
    }
    return false;
  }

  // The pistol: a raycast along the CAMERA FORWARD from the player. The scene matrix
  // must be updated first, or the ray aims at the player's feet.
  function shoot(G) {
    const p = G.player;
    if (p.inCar || p.fireCd > 0 || p.reloadT > 0) return false;
    if (p.ammo <= 0) { IH.audio.blip(90, 0.08, 'square', 0.12); p.reloadT = 1.2; return false; }
    p.fireCd = 0.28;
    p.ammo -= 1;
    IH.audio.shot();
    G.scene.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, G.camera);
    ray.far = 90;
    const meshes = [];
    for (const t of [...G.thugs, ...G.footCops, ...G.peds]) {
      if (t.dead) continue;
      t.mesh.traverse((m) => { if (m.isMesh) { m.userData.target = t; meshes.push(m); } });
    }
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const t = hits[0].object.userData.target;
      hurtTarget(G, t, PISTOL_DMG);
      G.lastShotAt = { x: t.mesh.position.x, z: t.mesh.position.z };
      G.lastShotTime = G.time;
    } else {
      G.lastShotAt = { x: p.mesh.position.x + Math.sin(p.heading) * 10, z: p.mesh.position.z + Math.cos(p.heading) * 10 };
      G.lastShotTime = G.time;
    }
    return true;
  }

  function hurtTarget(G, t, dmg) {
    t.health -= dmg;
    if (t.health <= 0 && !t.dead) {
      t.dead = true;
      t.mesh.rotation.x = -Math.PI / 2; // fall flat
      t.mesh.position.y = 0.35;
      if (t.thug) G.hudToast('Thug down.');
      if (t.isPed) IH.raiseWanted(G, 'pedestrian down');
    }
  }

  // Pickups: green crosses heal, amber boxes refill ammo.
  function spawnPickups(G, rng) {
    const spots = [];
    for (let i = 0; i < 8; i++) {
      const gx = (Math.floor(rng() * 9) - 4) * 40;
      const gz = (Math.floor(rng() * 9) - 4) * 40;
      spots.push({ x: gx + 8, z: gz + IH.rand(rng, -12, 12), kind: i % 2 === 0 ? 'health' : 'ammo' });
    }
    for (const s of spots) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshBasicMaterial({ color: s.kind === 'health' ? 0x2fd35a : 0xffb347 }));
      box.position.y = 0.8;
      g.add(box);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.15;
      g.add(ring);
      g.position.set(s.x, 0, s.z);
      G.scene.add(g);
      G.pickups.push({ mesh: g, kind: s.kind, taken: false, spin: rng() * 6 });
    }
  }

  function updatePickups(G, dt) {
    const pp = G.player.mesh.position;
    for (const pk of G.pickups) {
      if (pk.taken) continue;
      pk.spin += dt;
      pk.mesh.rotation.y = pk.spin;
      pk.mesh.children[0].position.y = 0.8 + Math.sin(pk.spin * 2) * 0.12;
      if (IH.dist2d(pp.x, pp.z, pk.mesh.position.x, pk.mesh.position.z) < 1.8) {
        pk.taken = true;
        G.scene.remove(pk.mesh);
        if (pk.kind === 'health') {
          G.player.health = Math.min(100, G.player.health + 40);
          G.hudToast('Health +40');
        } else {
          G.player.reserveAmmo += 24;
          G.hudToast('Ammo +24');
        }
        IH.audio.pickup();
      }
    }
  }

  IH.spawnThugs = spawnThugs;
  IH.updateThugs = updateThugs;
  IH.punch = punch;
  IH.shoot = shoot;
  IH.spawnPickups = spawnPickups;
  IH.updatePickups = updatePickups;
  IH.MAG_SIZE = MAG;
})();
