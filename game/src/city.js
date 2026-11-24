// Ironhaven — the city: a dusk industrial port on a road grid, built procedurally from a seed.
(function () {
  const GRID = 40;            // road spacing
  const HALF = 200;           // playable half-extent
  const ROAD_W = 10;

  // Named places the missions use. Every one sits on a road crossing so the
  // autopilot (and the player) can always drive straight to it.
  const PLACES = {
    garage:    { x: 0,    z: 120, name: 'Voss Auto' },
    docks:     { x: 160,  z: 0,   name: 'Harbor Docks' },
    downtown:  { x: 0,    z: -40, name: 'Downtown' },
    passenger: { x: -40,  z: -40, name: 'Crosstown Pickup' },
    dropoff:   { x: 40,   z: -80, name: 'Meridian Plaza' },
    sportscar: { x: -120, z: 40,  name: 'Kessler Row' },
    warehouse: { x: -160, z: 120, name: 'Pier 9 Warehouse' },
    vault:     { x: 40,   z: -40, name: 'Meridian Vault' },
    safehouse: { x: -120, z: -120, name: 'Safehouse' },
    tailStart: { x: 80,   z: 80,  name: 'Container Yard' },
  };

  function windowTexture(rng, litRatio) {
    return IH.canvasTexture(128, 256, (ctx, w, h) => {
      ctx.fillStyle = '#241d2b'; ctx.fillRect(0, 0, w, h);
      const cols = 6, rows = 14;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = rng() < litRatio;
          ctx.fillStyle = lit
            ? IH.pick(rng, ['#ffb347', '#ffd27a', '#ff9a5c', '#cfe8ff'])
            : '#14101a';
          ctx.fillRect(8 + c * 20, 10 + r * 17, 12, 10);
        }
      }
    });
  }

  function build(G, seed) {
    const rng = IH.mulberry32(seed);
    const scene = G.scene;
    const city = {
      colliders: [], lamps: [], places: PLACES, grid: GRID, half: HALF, rain: null,
    };
    G.city = city;

    // Dusk sky, fog, and light: a low orange sun under a purple sky.
    scene.background = new THREE.Color(0x2e1f3d);
    scene.fog = new THREE.FogExp2(0x2e1f3d, 0.0028);
    const hemi = new THREE.HemisphereLight(0x8a6bb0, 0x1c1410, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xff8c4a, 1.5);
    sun.position.set(-120, 45, -160);
    scene.add(sun);
    // The low sun itself, a flat glowing disc on the horizon.
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(16, 32),
      new THREE.MeshBasicMaterial({ color: 0xffa14d, fog: false })
    );
    sunDisc.position.set(-260, 26, -330);
    sunDisc.lookAt(0, 26, 0);
    scene.add(sunDisc);

    // Ground slab.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 240, HALF * 2 + 240),
      new THREE.MeshLambertMaterial({ color: 0x191420 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Roads: asphalt strips with a dashed centre line, on the grid lines.
    const roadTex = IH.canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#23202a'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3a3542';
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 2, 2);
      ctx.fillStyle = '#c9b458'; ctx.fillRect(w / 2 - 1, 0, 2, 18);
    });
    roadTex.repeat.set(1, 1);
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    const roadGeoX = new THREE.PlaneGeometry(HALF * 2, ROAD_W);
    const roadGeoZ = new THREE.PlaneGeometry(ROAD_W, HALF * 2);
    for (let c = -HALF; c <= HALF; c += GRID) {
      const rx = new THREE.Mesh(roadGeoX, roadMat);
      rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.02, c);
      const rz = new THREE.Mesh(roadGeoZ, roadMat);
      rz.rotation.x = -Math.PI / 2; rz.position.set(c, 0.02, 0);
      scene.add(rx); scene.add(rz);
    }
    // Block slabs between roads, slightly raised and lighter.
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x2b2433 });
    for (let bx = -HALF + GRID / 2; bx < HALF; bx += GRID) {
      for (let bz = -HALF + GRID / 2; bz < HALF; bz += GRID) {
        const slab = new THREE.Mesh(new THREE.PlaneGeometry(GRID - ROAD_W - 2, GRID - ROAD_W - 2), slabMat);
        slab.rotation.x = -Math.PI / 2;
        slab.position.set(bx, 0.01, bz);
        scene.add(slab);
      }
    }

    // Buildings: 1-3 boxes per block, towers downtown, low sheds near the docks.
    const winTexes = [windowTexture(rng, 0.42), windowTexture(rng, 0.3), windowTexture(rng, 0.55)];
    const facadeCols = [0x3a3345, 0x453a3a, 0x2f3a44, 0x4a3f35];
    const downtownR = 90;
    for (let bx = -HALF + GRID / 2; bx < HALF; bx += GRID) {
      for (let bz = -HALF + GRID / 2; bz < HALF; bz += GRID) {
        const distC = Math.hypot(bx, bz);
        const isDowntown = distC < downtownR;
        const isDock = bx > 120;
        if (isDock && rng() < 0.4) continue; // container yard stays open
        const count = isDowntown ? 1 : (rng() < 0.55 ? 2 : 1);
        for (let k = 0; k < count; k++) {
          // Keep every building inside its block: |offset| + half-width <= 13.5,
          // so no wall ever reaches the road (roads end 5 from the centre line).
          const w = count === 1 ? IH.rand(rng, 12, 20) : IH.rand(rng, 10, 16);
          const d = count === 1 ? IH.rand(rng, 12, 20) : IH.rand(rng, 10, 16);
          const h = isDowntown ? IH.rand(rng, 45, 95) : isDock ? IH.rand(rng, 6, 12) : IH.rand(rng, 10, 30);
          const ox = count === 1 ? 0 : (k === 0 ? -5.5 : 5.5);
          const oz = count === 1 ? 0 : (k === 0 ? 5.5 : -5.5);
          const x = bx + ox, z = bz + oz;
          const tex = IH.pick(rng, winTexes);
          const mat = new THREE.MeshLambertMaterial({
            color: IH.pick(rng, facadeCols), map: tex,
            emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55,
          });
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(x, h / 2, z);
          scene.add(b);
          city.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
          // A lit rooftop sign on the tallest downtown towers.
          if (isDowntown && h > 70 && rng() < 0.5) {
            const sign = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.5, 1.6, 0.6),
              new THREE.MeshBasicMaterial({ color: IH.pick(rng, [0xff5c7a, 0x39d0ff, 0xffb347]) })
            );
            sign.position.set(x, h + 1, z);
            scene.add(sign);
          }
        }
      }
    }

    // Container yard (east): stacked shipping containers in rust, teal and ochre.
    // Centres sit on block centres only, so no container ever blocks a road.
    const contCols = [0x9a4a2e, 0x2e6b6b, 0xb07f2a, 0x5a6b2e, 0x7a3a4a];
    const blockCentres = [-140, -100, -60, -20, 20, 60, 100, 140];
    for (let i = 0; i < 26; i++) {
      const x = IH.pick(rng, [140, 180]) + IH.rand(rng, -4, 4);
      const z = IH.pick(rng, blockCentres) + IH.rand(rng, -4, 4);
      const stack = 1 + Math.floor(rng() * 3);
      for (let s = 0; s < stack; s++) {
        const c = new THREE.Mesh(
          new THREE.BoxGeometry(12, 2.8, 3),
          new THREE.MeshLambertMaterial({ color: IH.pick(rng, contCols) })
        );
        c.position.set(x, 1.4 + s * 2.9, z);
        c.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
        scene.add(c);
      }
      city.colliders.push({ minX: x - 6.5, maxX: x + 6.5, minZ: z - 6.5, maxZ: z + 6.5 });
    }
    // Two gantry cranes over the yard.
    for (const cz of [-60, 60]) {
      const crane = new THREE.Group();
      const legMat = new THREE.MeshLambertMaterial({ color: 0xc7a23a });
      for (const [lx, lz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 34, 1.2), legMat);
        leg.position.set(lx, 17, lz); crane.add(leg);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 2.4), legMat);
      beam.position.set(0, 34, 0); crane.add(beam);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3), new THREE.MeshLambertMaterial({ color: 0x2a2a33 }));
      cab.position.set(6, 32, 0); crane.add(cab);
      crane.position.set(165, 0, cz);
      scene.add(crane);
      city.colliders.push({ minX: 158, maxX: 172, minZ: cz - 5, maxZ: cz + 5 });
    }

    // Harbor: water east of the docks, piers, and a bridge spanning it.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(160, HALF * 2 + 240),
      new THREE.MeshPhongMaterial({ color: 0x0e2a3d, shininess: 120, specular: 0x6688aa })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(HALF + 80, 0.03, 0);
    scene.add(water);
    for (const pz of [-100, -20, 60]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 8),
        new THREE.MeshLambertMaterial({ color: 0x4a3a28 }));
      pier.position.set(HALF + 8, 0.6, pz);
      scene.add(pier);
    }
    // Bridge: an arched span over the harbor mouth at the north edge.
    const bridge = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(90, 1.5, 10),
      new THREE.MeshLambertMaterial({ color: 0x3d3a44 }));
    deck.position.y = 14; bridge.add(deck);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(34, 1.4, 8, 24, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0xb03a2e }));
    arch.position.y = 14; bridge.add(arch);
    for (const sx of [-40, -20, 0, 20, 40]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 12, 6),
        new THREE.MeshLambertMaterial({ color: 0x888888 }));
      cable.position.set(sx, 20, 0); bridge.add(cable);
    }
    bridge.position.set(225, 0, -170);
    scene.add(bridge);

    // Street lamps along the roads, glowing amber.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x22222a });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
    for (let c = -HALF; c <= HALF; c += GRID) {
      for (let d = -HALF; d <= HALF; d += GRID * 2) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
        pole.position.set(c + 6, 3.5, d); scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), bulbMat);
        bulb.position.set(c + 6, 7.2, d); scene.add(bulb);
        city.lamps.push(bulb);
      }
    }

    // Wet-road puddles: dark glossy discs catching the dusk light.
    const pudMat = new THREE.MeshPhongMaterial({ color: 0x1a2a44, shininess: 140, specular: 0x99bbdd });
    for (let i = 0; i < 42; i++) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(IH.rand(rng, 1.5, 4), 18), pudMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(IH.rand(rng, -HALF, HALF), 0.04, IH.rand(rng, -HALF, HALF));
      p.scale.y = IH.rand(rng, 0.4, 0.8);
      scene.add(p);
    }

    // Rain: a cloud of points that falls and wraps around the camera.
    const rainCount = 1400;
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = IH.rand(rng, -60, 60);
      rainPos[i * 3 + 1] = IH.rand(rng, 0, 40);
      rainPos[i * 3 + 2] = IH.rand(rng, -60, 60);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
      color: 0x9fb8d8, size: 0.35, transparent: true, opacity: 0.55,
    }));
    rain.frustumCulled = false;
    scene.add(rain);
    city.rain = rain;

    // Garage sign: Voss Auto, a glowing marker over the start point.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xff6b35 }));
    sign.position.set(PLACES.garage.x, 8, PLACES.garage.z + 12);    scene.add(sign);
  }

  // Keep the rain falling around the camera.
  function update(G, dt) {
    const rain = G.city.rain;
    if (!rain) return;
    const pos = rain.geometry.attributes.position;
    const cam = G.camera.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * 26;
      if (y < 0) y = 40;
      pos.setY(i, y);
      // Recentre the cloud on the camera so rain follows the player.
      pos.setX(i, cam.x + (((pos.getX(i) - cam.x + 60) % 120) + 120) % 120 - 60);
      pos.setZ(i, cam.z + (((pos.getZ(i) - cam.z + 60) % 120) + 120) % 120 - 60);
    }
    pos.needsUpdate = true;
  }

  // Push a circle out of every building/container and the world edge.
  function collide(G, pos, r) {
    for (const b of G.city.colliders) IH.pushOutAABB(pos, r, b);
    pos.x = IH.clamp(pos.x, -HALF + 2, HALF + 6);
    pos.z = IH.clamp(pos.z, -HALF + 2, HALF - 2);
  }

  IH.cityBuild = build;
  IH.cityUpdate = update;
  IH.cityCollide = collide;
})();
