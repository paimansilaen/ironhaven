// Ironhaven — the story: eight jobs that pay down Mara's $50,000 debt, job by job.
(function () {
  const TOTAL_DEBT = 50000;
  const DEFS = [
    { name: 'First Run', reward: 1850, objective: 'Drive the package to the Harbor Docks before the timer runs out.' },
    { name: 'Night Fare', reward: 2500, objective: 'Pick up the passenger at Crosstown, then drop them at Meridian Plaza.' },
    { name: 'Borrowed Wheels', reward: 3500, objective: 'Take the marked sport car on Kessler Row and bring it to Voss Auto.' },
    { name: 'The Tail', reward: 4500, objective: 'Follow the target car. Stay 10–35 m back. Get too close and you are made.' },
    { name: 'Harbor Heat', reward: 6000, objective: 'Two stars on you. Lose the police and reach the safehouse.' },
    { name: 'Pier 9', reward: 7500, objective: 'Clear the warehouse thugs on foot. Fists or pistol — your call.' },
    { name: 'Three Stars', reward: 9500, objective: 'Three stars. Break the cordon and reach the safehouse.' },
    { name: 'The Meridian Vault', reward: 14650, objective: 'Get into the Meridian vault on foot, grab the cash, and run to the docks.' },
  ];

  function makeBeacon(G) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.25;
    g.add(ring);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    pillar.position.y = 17;
    g.add(pillar);
    g.visible = false;
    G.scene.add(g);
    return g;
  }

  function clearMissionActors(G) {
    for (const t of G.thugs) { if (!t.dead) { G.scene.remove(t.mesh); t.dead = true; } }
    G.thugs = [];
    if (G.missionCar) {
      const i = G.allCars.indexOf(G.missionCar);
      if (i >= 0) G.allCars.splice(i, 1);
      const ti = G.traffic.indexOf(G.missionCar);
      if (ti >= 0) G.traffic.splice(ti, 1);
      if (G.playerCar === G.missionCar) G.playerCar = null;
      G.scene.remove(G.missionCar.mesh);
      G.missionCar = null;
    }
    if (G.tailCar) {
      const i = G.allCars.indexOf(G.tailCar);
      if (i >= 0) G.allCars.splice(i, 1);
      G.scene.remove(G.tailCar.mesh);
      G.tailCar = null;
    }
  }

  function startMission(G, idx) {
    clearMissionActors(G);
    const def = DEFS[idx];
    const P = G.city.places;
    const st = { phase: 0, t: 0, tailTime: 0, spottedT: 0, timer: 0, marker: null };
    G.missionState = st;
    G.mission = def;
    if (idx === 0) {
      st.timer = 90;
      st.marker = { x: P.docks.x, z: P.docks.z };
    } else if (idx === 1) {
      st.marker = { x: P.passenger.x, z: P.passenger.z };
      st.passenger = IH.makePerson(G, P.passenger.x, P.passenger.z, { shirt: 0xd8c24a });
      G.peds.push(st.passenger);
    } else if (idx === 2) {
      const car = IH.makeCar(G, 'sport', P.sportscar.x, P.sportscar.z, 0.4);
      car.marked = true;
      G.missionCar = car;
      G.allCars.push(car);
      st.marker = { x: P.sportscar.x, z: P.sportscar.z };
    } else if (idx === 3) {
      const car = IH.makeCar(G, 'sedan', P.tailStart.x, P.tailStart.z, 0);
      car.isTraffic = true;
      car.waypoints = [
        { x: 80, z: 100 }, { x: 80, z: -80 }, { x: -80, z: -80 }, { x: -80, z: 100 },
      ];
      car.wpIndex = 0; car.speed = 9;
      G.tailCar = car;
      G.allCars.push(car);
      st.marker = { x: car.mesh.position.x, z: car.mesh.position.z };
    } else if (idx === 4) {
      IH.setWanted(G, 2, 'the Harbor Crew tipped off the police');
      st.marker = { x: P.safehouse.x, z: P.safehouse.z };
    } else if (idx === 5) {
      G.thugs = IH.spawnThugs(G, P.warehouse.x, P.warehouse.z, 4);
      st.marker = { x: P.warehouse.x, z: P.warehouse.z };
    } else if (idx === 6) {
      IH.setWanted(G, 3, 'three stars — the whole precinct is out');
      st.marker = { x: P.safehouse.x, z: P.safehouse.z };
    } else if (idx === 7) {
      st.marker = { x: P.vault.x, z: P.vault.z };
    }
    G.hudObjective(def.name + ' — ' + def.objective);
    G.hudToast('Mission ' + (idx + 1) + '/8: ' + def.name + ' — ' + IH.fmtMoney(def.reward));
    IH.audio.sting();
  }

  function finishMission(G) {
    const def = G.mission;
    G.cash += def.reward;
    G.debt = Math.max(0, G.debt - def.reward);
    G.hudToast('Job done: +' + IH.fmtMoney(def.reward) + ' — debt left ' + IH.fmtMoney(G.debt));
    IH.audio.sting();
    G.saveGame();
    clearMissionActors(G);
    G.missionIndex += 1;
    if (G.missionIndex >= DEFS.length) {
      G.storyComplete();
      return;
    }
    startMission(G, G.missionIndex);
  }

  function failMission(G, why) {
    G.hudToast('Mission failed: ' + why + ' — try again.');
    IH.audio.fail();
    startMission(G, G.missionIndex);
  }

  function at(G, x, z, r) {
    const pp = G.playerCar ? G.playerCar.mesh.position : G.player.mesh.position;
    return IH.dist2d(pp.x, pp.z, x, z) < r;
  }

  function update(G, dt) {
    const idx = G.missionIndex;
    if (idx >= DEFS.length || !G.missionState) return;
    const st = G.missionState;
    const P = G.city.places;
    st.t += dt;
    // Keep the beacon on the current marker.
    if (st.marker) {
      G.beacon.visible = true;
      G.beacon.position.set(st.marker.x, 0, st.marker.z);
      G.beacon.rotation.y += dt * 0.8;
    } else G.beacon.visible = false;

    if (idx === 0) {
      st.timer -= dt;
      G.missionTimer = st.timer;
      if (st.timer <= 0) { failMission(G, 'the package arrived late'); return; }
      if (at(G, P.docks.x, P.docks.z, 8)) finishMission(G);
    } else if (idx === 1) {
      if (st.phase === 0) {
        if (at(G, P.passenger.x, P.passenger.z, 5)) {
          st.phase = 1;
          st.marker = { x: P.dropoff.x, z: P.dropoff.z };
          G.hudToast('Passenger aboard. Take them to Meridian Plaza.');
          IH.audio.pickup();
        }
      } else if (at(G, P.dropoff.x, P.dropoff.z, 6)) finishMission(G);
    } else if (idx === 2) {
      if (G.missionCar) st.marker = { x: G.missionCar.mesh.position.x, z: G.missionCar.mesh.position.z };
      if (G.playerCar === G.missionCar && at(G, P.garage.x, P.garage.z, 9)) finishMission(G);
    } else if (idx === 3) {
      const car = G.tailCar;
      if (!car) return;
      const pp = G.playerCar ? G.playerCar.mesh.position : G.player.mesh.position;
      const d = IH.dist2d(pp.x, pp.z, car.mesh.position.x, car.mesh.position.z);
      st.marker = { x: car.mesh.position.x, z: car.mesh.position.z };
      // Drive the target around its loop.
      const wp = car.waypoints[car.wpIndex];
      const wdx = wp.x - car.mesh.position.x, wdz = wp.z - car.mesh.position.z;
      if (Math.hypot(wdx, wdz) < 5) car.wpIndex = (car.wpIndex + 1) % car.waypoints.length;
      else {
        const want = Math.atan2(wdx, wdz);
        car.heading += IH.clamp(IH.angleDiff(car.heading, want), -1.8 * dt, 1.8 * dt);
        car.mesh.rotation.y = car.heading;
        car.mesh.position.x += Math.sin(car.heading) * car.speed * dt;
        car.mesh.position.z += Math.cos(car.heading) * car.speed * dt;
        IH.cityCollide(G, car.mesh.position, car.len * 0.5);
      }
      if (d < 8) {
        st.spottedT += dt;
        G.hudObjective('Too close! Back off — spotted in ' + Math.max(0, 2 - st.spottedT).toFixed(1) + 's');
        if (st.spottedT > 2) { failMission(G, 'the target made you'); return; }
      } else if (d >= 10 && d <= 35) {
        st.tailTime += dt;
        st.spottedT = 0;
        G.hudObjective('Tail the target: ' + Math.floor(st.tailTime) + 's / 15s in the band');
        if (st.tailTime >= 15) finishMission(G);
      } else {
        st.spottedT = 0;
        G.hudObjective('Tail the target — stay 10–35 m back (' + Math.round(d) + ' m now)');
      }
    } else if (idx === 4 || idx === 6) {
      if (at(G, P.safehouse.x, P.safehouse.z, 8)) {
        IH.setWanted(G, 0);
        finishMission(G);
      }
    } else if (idx === 5) {
      const alive = G.thugs.filter((t) => !t.dead).length;
      G.hudObjective('Clear Pier 9: ' + alive + ' thugs left');
      if (alive === 0) finishMission(G);
    } else if (idx === 7) {
      if (st.phase === 0) {
        if (!G.playerCar && at(G, P.vault.x, P.vault.z, 5)) {
          st.phase = 1;
          G.hudObjective('Inside the vault. Press E to grab the cash.');
          G.hudToast('The vault is open. Grab it and run.');
        }
      } else if (st.phase === 1) {
        if (G.grabCash) {
          G.grabCash = false;
          st.phase = 2;
          st.marker = { x: P.docks.x, z: P.docks.z };
          IH.setWanted(G, 5, 'the vault alarm is screaming');
          G.hudToast('Cash grabbed! Five stars — run to the docks!');
          IH.audio.sting();
        }
      } else if (at(G, P.docks.x, P.docks.z, 9)) {
        IH.setWanted(G, 0);
        finishMission(G);
      }
    }
  }

  IH.missionDefs = DEFS;
  IH.totalDebt = TOTAL_DEBT;
  IH.makeBeacon = makeBeacon;
  IH.startMission = startMission;
  IH.updateMissions = update;
  IH.clearMissionActors = clearMissionActors;
})();
