// Ironhaven — screenshot scenes: each one plays the real rules forward from a fresh
// world for a fixed number of steps, steered by an autopilot that routes along the road
// grid in Manhattan phases and brakes into turns, so the frame is what a short game
// really looks like and the same seed always gives the same frame.
(function () {
  const STEP = 1 / 30;

  // Phased Manhattan routing on the road grid: first get onto the nearest road
  // line, then drive along it to the target's road, then along that road to the
  // target. Brake while turning and slow down near the target so the car never
  // wedges into a building.
  function autopilotDrive(car, target) {
    const px = car.mesh.position.x, pz = car.mesh.position.z;
    const dist = Math.hypot(target.x - px, target.z - pz);
    const roadZ = Math.round(pz / 40) * 40;
    let wantHeading;
    if (Math.abs(pz - roadZ) > 2) wantHeading = Math.atan2(0, Math.sign(roadZ - pz) || 1);
    else if (Math.abs(px - target.x) > 2) wantHeading = Math.atan2(Math.sign(target.x - px), 0);
    else wantHeading = Math.atan2(0, Math.sign(target.z - pz) || 1);
    const err = IH.angleDiff(car.heading, wantHeading);
    const steer = IH.clamp(err * 2.4, -1, 1);
    const input = { fwd: false, back: false, steer, handbrake: false };
    if (dist < 10) {
      input.fwd = Math.abs(car.speed) < 6;
      input.back = Math.abs(car.speed) > 8;
    } else if (Math.abs(err) > 1.3) {
      input.back = Math.abs(car.speed) > 6;
      input.fwd = Math.abs(car.speed) < 4;
    } else {
      input.fwd = true;
    }
    return input;
  }

  function autopilotWalk(G, target) {
    const p = G.player;
    const dx = target.x - p.mesh.position.x, dz = target.z - p.mesh.position.z;
    const want = Math.atan2(dx, dz);
    p.heading = want;
    return { fwd: true, sprint: true, steer: 0 };
  }

  function simulate(G, seconds, inputFn) {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
      const input = inputFn ? inputFn() : {};
      IH.updateWorld(STEP, input);
    }
  }

  // Stage the named scene and return the screen to draw over it.
  function stageShot(G, name) {
    G.resetWorld(1);
    if (name === 'start') {
      simulate(G, 5, null);
      return 'title';
    }
    G.startNewGame();
    if (name === 'drive') {
      const car = IH.makeCar(G, 'sedan', 0, 120, 0);
      car.owned = true;
      G.allCars.push(car);
      G.enterCar(car);
      const target = G.city.places.docks;
      simulate(G, 27, () => autopilotDrive(G.playerCar, target));
      return 'play';
    }
    if (name === 'chase') {
      const car = IH.makeCar(G, 'sport', 40, 40, Math.PI);
      car.owned = true;
      G.allCars.push(car);
      G.enterCar(car);
      IH.setWanted(G, 3, 'the chase is on');
      IH.spawnPoliceCar(G, car.mesh.position);
      IH.spawnPoliceCar(G, car.mesh.position);
      const target = G.city.places.safehouse;
      simulate(G, 13, () => autopilotDrive(G.playerCar, target));
      return 'play';
    }
    if (name === 'heist') {
      G.missionIndex = 7;
      IH.startMission(G, 7);
      G.player.mesh.position.set(40, 0, -40);
      G.player.heading = Math.PI;
      G.missionState.phase = 2;
      G.missionState.marker = { x: G.city.places.docks.x, z: G.city.places.docks.z };
      IH.setWanted(G, 5, 'the vault alarm is screaming');
      IH.spawnPoliceCar(G, G.player.mesh.position);
      const target = G.city.places.docks;
      simulate(G, 5, () => autopilotWalk(G, target));
      return 'play';
    }
    simulate(G, 5, null);
    return 'title';
  }

  IH.stageShot = stageShot;
})();
