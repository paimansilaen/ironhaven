// Ironhaven — vehicles: box-built cars, arcade driving, and road traffic.
(function () {
  const TYPES = {
    sedan: { len: 4.4, wid: 1.9, h: 0.75, cabin: 0.65, accel: 14, top: 26, color: 0x5a6b7a },
    taxi:  { len: 4.4, wid: 1.9, h: 0.75, cabin: 0.65, accel: 14, top: 25, color: 0xf2c200 },
    truck: { len: 6.4, wid: 2.2, h: 1.1, cabin: 0.9, accel: 9,  top: 19, color: 0x7a4a2e },
    van:   { len: 5.2, wid: 2.0, h: 1.0, cabin: 0.8, accel: 11, top: 21, color: 0x8a8a92 },
    sport: { len: 4.2, wid: 2.0, h: 0.6, cabin: 0.5, accel: 20, top: 36, color: 0xc22e3a },
    police:{ len: 4.6, wid: 2.0, h: 0.75, cabin: 0.65, accel: 17, top: 30, color: 0x22242a },
  };

  function makeCar(G, type, x, z, heading) {
    const t = TYPES[type] || TYPES.sedan;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: t.color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(t.wid, t.h, t.len), bodyMat);
    body.position.y = 0.55 + t.h / 2;
    g.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(t.wid * 0.85, t.cabin, t.len * 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1a2028 })
    );
    cabin.position.set(0, 0.55 + t.h + t.cabin / 2 - 0.05, -t.len * 0.05);
    g.add(cabin);
    // Wheels: cylinders spun onto their sides.
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0e });
    for (const [wx, wz] of [[-t.wid / 2, t.len * 0.32], [t.wid / 2, t.len * 0.32], [-t.wid / 2, -t.len * 0.32], [t.wid / 2, -t.len * 0.32]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.36, wz);
      g.add(w);
    }
    // Headlights and taillights.
    const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), hl);
      h.position.set(s * t.wid * 0.32, 0.85, t.len / 2 + 0.02);
      g.add(h);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      tl.position.set(s * t.wid * 0.32, 0.85, -t.len / 2 - 0.02);
      g.add(tl);
    }
    let lightBar = null;
    if (type === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffe14d }));
      sign.position.set(0, 0.55 + t.h + t.cabin + 0.15, 0);
      g.add(sign);
    }
    if (type === 'police') {
      lightBar = new THREE.Group();
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      red.position.x = -0.45; lightBar.add(red);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
      blue.position.x = 0.45; lightBar.add(blue);
      lightBar.position.set(0, 0.55 + t.h + t.cabin + 0.12, 0);
      lightBar.userData = { red, blue };
      g.add(lightBar);
      // White doors: two pale panels on the body sides.
      for (const s of [-1, 1]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, t.h * 0.7, t.len * 0.4),
          new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
        door.position.set(s * (t.wid / 2 + 0.02), 0.55 + t.h / 2, 0);
        g.add(door);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = heading;
    G.scene.add(g);
    return {
      mesh: g, type, heading, speed: 0, steer: 0,
      accel: t.accel, top: t.top, len: t.len, wid: t.wid,
      ramCd: 0, lightBar, isTraffic: false, isPolice: type === 'police',
      wpIndex: 0, waypoints: null, stuckT: 0,
    };
  }

  // Arcade drive: accel/brake/reverse, speed-scaled steering, Space handbrake drift.
  function drive(G, car, input, dt) {
    const fwd = input.accel ? 1 : input.brake ? -1 : 0;
    if (fwd > 0) car.speed += car.accel * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0.5 ? car.accel * 1.4 : car.accel * 0.7) * dt;
    else car.speed -= car.speed * 0.6 * dt; // coast drag
    if (input.handbrake) {
      car.speed -= car.speed * 1.8 * dt;
      car.heading += input.steer * 1.9 * dt * Math.sign(car.speed || 1);
    }
    car.speed = IH.clamp(car.speed, -car.top * 0.45, car.top);
    if (Math.abs(car.speed) < 0.05 && fwd === 0) car.speed = 0;
    const steerScale = IH.clamp(Math.abs(car.speed) / 8, 0, 1) * 0.9;
    car.heading += input.steer * steerScale * 1.35 * dt * Math.sign(car.speed || 1);
    car.mesh.rotation.y = car.heading;
    car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
    car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
    IH.cityCollide(G, car.mesh.position, Math.max(car.len, car.wid) * 0.55);
    // Headlight glow follows the player car only (one spotlight, cheap).
    if (G.playerCar === car && G.headlight) {
      G.headlight.position.copy(car.mesh.position).y += 1;
      G.headlight.target.position.set(
        car.mesh.position.x + Math.sin(car.heading) * 12,
        0, car.mesh.position.z + Math.cos(car.heading) * 12
      );
    }
  }

  // Soft push between two cars so traffic never overlaps.
  function separateCars(a, b) {
    const pa = a.mesh.position, pb = b.mesh.position;
    const dx = pa.x - pb.x, dz = pa.z - pb.z;
    const d = Math.hypot(dx, dz);
    const min = (a.len + b.len) * 0.42;
    if (d >= min || d < 1e-6) return;
    const push = (min - d) / 2;
    const nx = dx / d, nz = dz / d;
    pa.x += nx * push; pa.z += nz * push;
    pb.x -= nx * push; pb.z -= nz * push;
  }

  // A rectangular loop of road waypoints around the block grid.
  function makeLoop(rng, cx, cz, rx, rz) {
    const pts = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) pts.push({ x: cx - rx + (2 * rx * i) / steps, z: cz - rz });
    for (let i = 1; i <= steps; i++) pts.push({ x: cx + rx, z: cz - rz + (2 * rz * i) / steps });
    for (let i = 1; i <= steps; i++) pts.push({ x: cx + rx - (2 * rx * i) / steps, z: cz + rz });
    for (let i = 1; i < steps; i++) pts.push({ x: cx - rx, z: cz + rz - (2 * rz * i) / steps });
    return pts;
  }

  function spawnTraffic(G, rng, n) {
    const types = ['sedan', 'sedan', 'taxi', 'truck', 'van'];
    for (let i = 0; i < n; i++) {
      const cx = (Math.floor(rng() * 9) - 4) * 40;
      const cz = (Math.floor(rng() * 9) - 4) * 40;
      const car = makeCar(G, IH.pick(rng, types), cx, cz, rng() * Math.PI * 2);
      car.isTraffic = true;
      car.waypoints = makeLoop(rng, cx, cz, 40 + Math.floor(rng() * 3) * 40, 40 + Math.floor(rng() * 3) * 40);
      car.wpIndex = Math.floor(rng() * car.waypoints.length);
      car.speed = IH.rand(rng, 5, 9);
      G.traffic.push(car);
    }
  }

  function updateTraffic(G, dt) {
    const playerPos = G.player.mesh.position;
    for (const car of G.traffic) {
      if (!car.waypoints || car.waypoints.length === 0) continue;
      const wp = car.waypoints[car.wpIndex];
      const dx = wp.x - car.mesh.position.x, dz = wp.z - car.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) { car.wpIndex = (car.wpIndex + 1) % car.waypoints.length; continue; }
      const want = Math.atan2(dx, dz);
      const turn = IH.angleDiff(car.heading, want);
      car.heading += IH.clamp(turn, -1.6 * dt, 1.6 * dt);
      // Slow for the car ahead.
      let ahead = false;
      for (const other of G.allCars) {
        if (other === car) continue;
        const ox = other.mesh.position.x - car.mesh.position.x;
        const oz = other.mesh.position.z - car.mesh.position.z;
        const od = Math.hypot(ox, oz);
        if (od < 11 && Math.abs(IH.angleDiff(car.heading, Math.atan2(ox, oz))) < 0.5) { ahead = true; break; }
      }
      const target = ahead ? 0 : 8;
      car.speed += IH.clamp(target - car.speed, -10 * dt, 6 * dt);
      car.mesh.rotation.y = car.heading;
      car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
      car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
      IH.cityCollide(G, car.mesh.position, car.len * 0.5);
      // Respawn near the player when it has drifted far away, snapped onto roads.
      if (IH.dist2d(car.mesh.position.x, car.mesh.position.z, playerPos.x, playerPos.z) > 260) {
        const nx = Math.round((playerPos.x + (Math.random() - 0.5) * 160) / 40) * 40;
        const nz = Math.round((playerPos.z + (Math.random() - 0.5) * 160) / 40) * 40;
        car.mesh.position.set(IH.clamp(nx, -160, 160), 0, IH.clamp(nz, -160, 160));
        car.waypoints = makeLoop(Math.random, car.mesh.position.x, car.mesh.position.z, 80, 80);
        car.wpIndex = 0;
      }
    }
    for (let i = 0; i < G.allCars.length; i++) {
      for (let j = i + 1; j < G.allCars.length; j++) separateCars(G.allCars[i], G.allCars[j]);
    }
  }

  IH.makeCar = makeCar;
  IH.driveCar = drive;
  IH.spawnTraffic = spawnTraffic;
  IH.updateTraffic = updateTraffic;
  IH.carTypes = TYPES;
})();
