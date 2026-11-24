// Ironhaven — pedestrians who wander and flee, and the police who answer the wanted level.
(function () {
  const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c24a, 0x9a4ad8, 0xd8d8d8, 0x4ad8c2];

  function makePerson(G, x, z, opts) {
    const o = opts || {};
    const g = new THREE.Group();
    const shirt = o.shirt != null ? o.shirt : IH.pick(Math.random, SHIRTS);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32),
      new THREE.MeshLambertMaterial({ color: shirt }));
    body.position.y = 1.05; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshLambertMaterial({ color: o.skin != null ? o.skin : 0xc99a6b }));
    head.position.y = 1.62; g.add(head);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3),
      new THREE.MeshLambertMaterial({ color: o.pants != null ? o.pants : 0x2a2a33 }));
    legs.position.y = 0.35; g.add(legs);
    if (o.cop) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.38),
        new THREE.MeshLambertMaterial({ color: 0x14204a }));
      cap.position.y = 1.83; g.add(cap);
    }
    g.position.set(x, 0, z);
    G.scene.add(g);
    return {
      mesh: g, heading: Math.random() * Math.PI * 2, speed: 0,
      wp: null, wpT: 0, flee: null, cop: !!o.cop, punchCd: 0,
      health: o.health || 100, dead: false, isPed: !o.cop && !o.thug, thug: !!o.thug,
    };
  }

  function randomSidewalk(rng, near) {
    // A point just off a road, near `near` when given.
    const cx = near ? near.x : 0, cz = near ? near.z : 0;
    const gx = IH.clamp(Math.round((cx + (rng() - 0.5) * 160) / 40) * 40, -160, 160);
    const gz = IH.clamp(Math.round((cz + (rng() - 0.5) * 160) / 40) * 40, -160, 160);
    return { x: gx + 7, z: gz + IH.rand(rng, -14, 14) };
  }

  function spawnPedestrians(G, rng, n) {
    for (let i = 0; i < n; i++) {
      const p = randomSidewalk(rng);
      const ped = makePerson(G, p.x, p.z, {});
      ped.wp = randomSidewalk(rng, { x: p.x, z: p.z });
      G.peds.push(ped);
    }
  }

  function updatePedestrians(G, dt) {
    const pp = G.player.mesh.position;
    const playerCar = G.playerCar;
    const threat = G.lastShotAt || null;
    for (const ped of G.peds) {
      if (ped.dead) continue;
      // Flee gunshots and speeding cars.
      let fx = 0, fz = 0, fleeing = false;
      if (threat && IH.dist2d(ped.mesh.position.x, ped.mesh.position.z, threat.x, threat.z) < 18) {
        fx = ped.mesh.position.x - threat.x; fz = ped.mesh.position.z - threat.z; fleeing = true;
      } else if (playerCar && Math.abs(playerCar.speed) > 10 &&
        IH.dist2d(ped.mesh.position.x, ped.mesh.position.z, playerCar.mesh.position.x, playerCar.mesh.position.z) < 12) {
        fx = ped.mesh.position.x - playerCar.mesh.position.x;
        fz = ped.mesh.position.z - playerCar.mesh.position.z; fleeing = true;
      }
      if (fleeing) {
        const d = Math.hypot(fx, fz) || 1;
        ped.heading = Math.atan2(fx / d, fz / d);
        ped.speed = 4.2;
      } else {
        ped.wpT -= dt;
        if (!ped.wp || ped.wpT <= 0 || IH.dist2d(ped.mesh.position.x, ped.mesh.position.z, ped.wp.x, ped.wp.z) < 2) {
          ped.wp = randomSidewalk(Math.random, ped.mesh.position);
          ped.wpT = 12;
        }
        const dx = ped.wp.x - ped.mesh.position.x, dz = ped.wp.z - ped.mesh.position.z;
        ped.heading = Math.atan2(dx, dz);
        ped.speed = 1.5;
      }
      ped.mesh.rotation.y = ped.heading;
      ped.mesh.position.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.mesh.position.z += Math.cos(ped.heading) * ped.speed * dt;
      IH.cityCollide(G, ped.mesh.position, 0.5);
      // Walk bob.
      ped.mesh.position.y = Math.abs(Math.sin(G.time * 8 + ped.heading * 10)) * 0.05;
    }
    if (threat && G.time - (G.lastShotTime || 0) > 2) G.lastShotAt = null;
  }

  // --- Wanted level -------------------------------------------------------
  function setWanted(G, level, reason) {
    const before = G.wanted;
    G.wanted = IH.clamp(level, 0, 5);
    if (G.wanted > before) {
      G.wantedTimer = 0;
      G.hudToast('WANTED ' + '★'.repeat(G.wanted) + (reason ? ' — ' + reason : ''));
    }
    if (G.wanted === 0) {
      // Stand the police down.
      for (const c of G.policeCars) c.retire = true;
      for (const c of G.footCops) c.dead = true;
    }
  }

  function raiseWanted(G, reason) { setWanted(G, G.wanted + 1, reason); }

  function spawnPoliceCar(G, near) {
    const a = Math.random() * Math.PI * 2;
    const x = IH.clamp(near.x + Math.sin(a) * 80, -180, 180);
    const z = IH.clamp(near.z + Math.cos(a) * 80, -180, 180);
    const car = IH.makeCar(G, 'police', x, z, Math.atan2(near.x - x, near.z - z));
    car.isPolice = true;
    G.policeCars.push(car);
    G.allCars.push(car);
    return car;
  }

  function updatePolice(G, dt) {
    const pp = G.player.mesh.position;
    const playerCar = G.playerCar;
    const target = playerCar ? playerCar.mesh.position : pp;

    // Keep the right number of patrol cars on the street.
    const want = Math.min(G.wanted, 3);
    const live = G.policeCars.filter((c) => !c.retire).length;
    if (live < want && G.spawnCd <= 0) {
      spawnPoliceCar(G, target);
      G.spawnCd = 2.5;
    }
    G.spawnCd -= dt;

    for (const car of G.policeCars) {
      if (car.retire) {
        // Drive away and despawn.
        car.speed = Math.max(car.speed - 4 * dt, -6);
        car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
        car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
        if (IH.dist2d(car.mesh.position.x, car.mesh.position.z, pp.x, pp.z) > 200) {
          G.scene.remove(car.mesh);
          G.policeCars.splice(G.policeCars.indexOf(car), 1);
          G.allCars.splice(G.allCars.indexOf(car), 1);
        }
        continue;
      }
      const dx = target.x - car.mesh.position.x, dz = target.z - car.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      const turn = IH.angleDiff(car.heading, wantHeading);
      const speedBefore = car.speed;
      car.heading += IH.clamp(turn, -2.2 * dt, 2.2 * dt);
      const targetSpeed = dist > 14 ? 30 : 18;
      car.speed += IH.clamp(targetSpeed - car.speed, -12 * dt, 10 * dt);
      car.mesh.rotation.y = car.heading;
      car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
      car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
      IH.cityCollide(G, car.mesh.position, car.len * 0.5);
      // Stuck against a building: back up and swing around.
      if (Math.abs(car.speed) < 1.5 && dist > 10) car.stuckT += dt;
      else car.stuckT = 0;
      if (car.stuckT > 1.2) {
        car.heading += Math.PI * 0.7;
        car.speed = -8;
        car.stuckT = 0;
      }
      // RAM the player car: a hard shove with a 1.2 s cooldown and a bounce-back.
      // NOTE: no separation damping is applied to police contact — damping pinned the
      // player car in testing, so the ram is a one-shot impulse only.
      car.ramCd -= dt;
      if (playerCar && dist < 4.5 && car.ramCd <= 0) {
        const nx = dx / (dist || 1), nz = dz / (dist || 1);
        playerCar.speed += 6;
        playerCar.mesh.position.x += nx * 1.2;
        playerCar.mesh.position.z += nz * 1.2;
        G.player.health = Math.max(0, G.player.health - 4);
        car.speed = -car.speed * 0.35; // bounce-back
        car.ramCd = 1.2;
        IH.audio.blip(120, 0.2, 'sawtooth', 0.2);
      }
      // Flash the light bar.
      if (car.lightBar) {
        const on = Math.floor(G.time * 6) % 2 === 0;
        car.lightBar.userData.red.material.color.setHex(on ? 0xff2020 : 0x550000);
        car.lightBar.userData.blue.material.color.setHex(on ? 0x000055 : 0x2040ff);
      }
      void speedBefore;
    }

    // On-foot cops when the player is on foot and wanted.
    if (!playerCar && G.wanted >= 2) {
      const liveCops = G.footCops.filter((c) => !c.dead).length;
      if (liveCops < Math.min(G.wanted - 1, 3) && G.copSpawnCd <= 0) {
        const a = Math.random() * Math.PI * 2;
        const cop = makePerson(G, pp.x + Math.sin(a) * 30, pp.z + Math.cos(a) * 30, { cop: true, shirt: 0x1a2a55, pants: 0x14204a });
        G.footCops.push(cop);
        G.copSpawnCd = 3;
      }
    }
    G.copSpawnCd -= dt;
    for (const cop of G.footCops) {
      if (cop.dead) continue;
      const dx = pp.x - cop.mesh.position.x, dz = pp.z - cop.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      cop.heading = Math.atan2(dx, dz);
      cop.mesh.rotation.y = cop.heading;
      cop.speed = 4.6;
      cop.mesh.position.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.mesh.position.z += Math.cos(cop.heading) * cop.speed * dt;
      IH.cityCollide(G, cop.mesh.position, 0.5);
      cop.punchCd -= dt;
      if (dist < 1.9 && cop.punchCd <= 0) {
        cop.punchCd = 0.9;
        G.player.health = Math.max(0, G.player.health - 9);
        IH.audio.blip(140, 0.12, 'square', 0.12);
      }
      // BUSTED: a cop touches the slow on-foot player.
      if (dist < 1.2 && G.player.speed < 2) {
        G.busted();
        return;
      }
      if (dist > 160) cop.dead = true;
    }

    // Wanted decay: no police line of sight for a while, the heat cools off.
    let nearest = Infinity;
    for (const c of G.policeCars) {
      if (c.retire) continue;
      nearest = Math.min(nearest, IH.dist2d(c.mesh.position.x, c.mesh.position.z, pp.x, pp.z));
    }
    for (const c of G.footCops) {
      if (!c.dead) nearest = Math.min(nearest, IH.dist2d(c.mesh.position.x, c.mesh.position.z, pp.x, pp.z));
    }
    if (G.wanted > 0 && nearest > 55) {
      G.wantedTimer += dt;
      if (G.wantedTimer > 9) {
        setWanted(G, G.wanted - 1);
        G.wantedTimer = 0;
        if (G.wanted === 0) G.hudToast('You lost them. The heat is off.');
      }
    } else G.wantedTimer = 0;
  }

  IH.makePerson = makePerson;
  IH.spawnPedestrians = spawnPedestrians;
  IH.updatePedestrians = updatePedestrians;
  IH.setWanted = setWanted;
  IH.raiseWanted = raiseWanted;
  IH.spawnPoliceCar = spawnPoliceCar;
  IH.updatePolice = updatePolice;
})();
