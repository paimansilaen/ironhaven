// IRONHAVEN — open-world crime game. Third-person on foot + arcade driving,
// traffic & pedestrians, wanted/police, combat, 8 story missions, HUD + minimap,
// save/load, WebAudio synth sound, dusk rain. All systems live in this file;
// the city comes from city.js, sound from audio.js.
(function () {
  'use strict';
  var STEP = 1 / 60;
  var SAVE_KEY = 'ironhaven-save-v1';
  var DEBT_START = 50000;

  var params = new URLSearchParams(window.location.search);
  var shotName = params.get('shot');
  var seedParam = parseInt(params.get('seed') || '', 10);
  var SEED = Number.isInteger(seedParam) ? seedParam : 1;
  var SELFTEST = params.get('selftest') === '1';

  // ---------------------------------------------------------------- state
  var G = {
    mode: 'title',           // title | play | paused | busted | wasted | end
    time: 0,
    cash: 350, debt: DEBT_START, missionIndex: 0,
    wanted: 0, wantedTimer: 0, lastSeen: 0, bustedProg: 0,
    player: null, cars: [], traffic: [], peds: [], policeCars: [], cops: [],
    enemies: [], pickups: [], markers: [],
    mission: null,            // runtime mission state
    camYaw: 0, camPitch: 0.32, camDist: 9,
    keys: {}, mouseDown: false, dragMoved: 0, muted: false,
    spawnTimer: 0, saveTimer: 0, msgTimer: 0,
    rng: mulberry32(SEED),
  };
  window.__ironhaven = G;

  var canvas = document.getElementById('game');
  var renderer, scene, camera, city;
  var rain, rainPos, rainVel;
  var beacon, beaconGem;
  var playerMesh, playerParts;
  var clockLast = performance.now();

  // ------------------------------------------------------------- utilities
  function $(id) { return document.getElementById(id); }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // ------------------------------------------------------------ factories
  function makeCarMesh(type) {
    var g = new THREE.Group();
    var colors = { sedan: 0x7e2f2f, taxi: 0xd8a928, truck: 0x3f5a74, police: 0x22262e, sport: 0x2f6e4f, van: 0x5a5a52 };
    var col = colors[type] || 0x7e2f2f;
    var bodyMat = new THREE.MeshLambertMaterial({ color: col });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2630 });
    var len = type === 'truck' ? 5.8 : 4.4;
    var body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.85, len), bodyMat);
    body.position.y = 0.72; g.add(body);
    if (type === 'truck') {
      var cargo = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 3.2), new THREE.MeshLambertMaterial({ color: 0x8a8578 }));
      cargo.position.set(0, 1.5, -1.1); g.add(cargo);
      var cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 1.4), glassMat);
      cab.position.set(0, 1.55, 1.9); g.add(cab);
    } else {
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 2.2), glassMat);
      cabin.position.set(0, 1.45, -0.2); g.add(cabin);
    }
    if (type === 'taxi') {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
      sign.position.set(0, 2.0, -0.2); g.add(sign);
    }
    if (type === 'police') {
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 4.42), new THREE.MeshBasicMaterial({ color: 0xe8e8e8 }));
      stripe.position.y = 0.75; g.add(stripe);
      var barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      barR.position.set(-0.45, 1.95, -0.2); g.add(barR);
      var barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      barB.position.set(0.45, 1.95, -0.2); g.add(barB);
    }
    var headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    [-0.65, 0.65].forEach(function (x) {
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), headMat);
      h.position.set(x, 0.75, len / 2 + 0.02); g.add(h);
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xcc2222 }));
      t.position.set(x, 0.75, -len / 2 - 0.02); g.add(t);
    });
    var wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    var wheels = [];
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.42, p[1]);
      g.add(w); wheels.push(w);
    });
    g.userData.wheels = wheels;
    return g;
  }

  function makePersonMesh(shirt, pants, skin) {
    var g = new THREE.Group();
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), new THREE.MeshLambertMaterial({ color: shirt }));
    torso.position.y = 1.18; g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), new THREE.MeshLambertMaterial({ color: skin || 0xc9997a }));
    head.position.y = 1.78; g.add(head);
    var hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x2a1c12 }));
    hair.position.y = 1.96; g.add(hair);
    var legMat = new THREE.MeshLambertMaterial({ color: pants });
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26), legMat);
    legL.position.set(-0.16, 0.4, 0); g.add(legL);
    var legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
    var armMat = new THREE.MeshLambertMaterial({ color: shirt });
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), armMat);
    armL.position.set(-0.42, 1.2, 0); g.add(armL);
    var armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
    g.userData = { legL: legL, legR: legR, armL: armL, armR: armR, torso: torso };
    return g;
  }

  function makeCar(type, x, z, heading, kind) {
    var mesh = makeCarMesh(type);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    var car = {
      mesh: mesh, type: type, kind: kind || 'traffic',
      x: x, z: z, heading: heading, speed: 0,
      targetSpeed: 8 + G.rng() * 6, axis: 'z', dir: 1, lane: 0,
      turnCooldown: 0, blocked: 0, hp: 100, hitCd: 0,
    };
    G.cars.push(car);
    return car;
  }

  function makePed(x, z, shirt) {
    var mesh = makePersonMesh(shirt || pick(G.rng, [0x7a8a99, 0x9a7a5a, 0x5a7a5a, 0x8a5a7a, 0xa88a3a]), 0x2e3440);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    var ped = {
      mesh: mesh, x: x, z: z, heading: G.rng() * Math.PI * 2,
      speed: 0, tx: x, tz: z, flee: 0, walkPhase: G.rng() * 6,
    };
    G.peds.push(ped);
    return ped;
  }

  // -------------------------------------------------------------- missions
  var MISSIONS = [
    { title: '1 · FIRST RUN', reward: 1500,
      intro: 'Dell Kaine wants a package moved, no questions. Take the sedan by Voss Auto and drop it at the container yard — 90 seconds.',
      obj: 'Drive the package to the container yard' },
    { title: '2 · NIGHT SHIFT', reward: 2000,
      intro: 'A fare named Rook is waiting on the north road. Pick him up, then get him to the east docks road. Mind the clock.',
      obj: 'Pick up Rook, then drop him off' },
    { title: '3 · MARKED', reward: 3000,
      intro: 'A black sedan is parked up north — Kaine wants it in the Voss Auto lot. Stealing it will draw heat. That is the job.',
      obj: 'Steal the marked sedan, bring it to Voss Auto' },
    { title: '4 · THE TAIL', reward: 3500,
      intro: 'A Harbor Crew truck is moving product through downtown. Follow it for 30 seconds. Get too close and the driver spots you.',
      obj: 'Tail the gray truck — stay back, stay close' },
    { title: '5 · LOUD', reward: 5000,
      intro: 'The job went loud. Three stars and the whole Ironhaven PD is coming. Get to the safehouse, fast.',
      obj: 'Escape the police — reach the safehouse' },
    { title: '6 · WAREHOUSE', reward: 6000,
      intro: 'Four of Kaine\'s crew are holding the warehouse. Go in on foot. You have a pistol now — use it.',
      obj: 'Clear the warehouse — eliminate 4 crew' },
    { title: '7 · HEAT', reward: 8000,
      intro: 'Three stars again. This time you cannot just run — lose the cops completely, then slip to the safehouse.',
      obj: 'Lose the wanted level, then reach the safehouse' },
    { title: '8 · THE VAULT', reward: 21000,
      intro: 'The last job. Meridian Development\'s vault, downtown. Grab the cash, take five stars, and vanish at the docks.',
      obj: 'Rob the Meridian vault, escape to the docks' },
  ];
  var REWARDS = MISSIONS.map(function (m) { return m.reward; });

  function missionTarget() {
    var m = G.mission;
    if (!m) return null;
    var P = city.places;
    switch (m.index) {
      case 0: return { x: 87, z: 116 };
      case 1: return m.stage === 0 ? { x: 0, z: -58 } : { x: 116, z: 58 };
      case 2: return m.stage === 0 ? { x: 58, z: -116 } : { x: -87, z: 58 };
      case 3: return m.targetCar ? { x: m.targetCar.x, z: m.targetCar.z } : null;
      case 4: return { x: P.safehouse.x, z: P.safehouse.z };
      case 5: return { x: P.warehouse.x, z: P.warehouse.z - 16 };
      case 6: return G.wanted > 0 ? null : { x: P.safehouse.x, z: P.safehouse.z };
      case 7: return m.stage === 0 ? { x: 29, z: 14 } : m.stage === 1 ? { x: 29, z: 14 } : { x: P.docks.x, z: P.docks.z };
      default: return null;
    }
  }

  function setupMission(index) {
    var P = city.places;
    // clear mission entities from the previous attempt
    G.enemies.forEach(function (e) { scene.remove(e.mesh); });
    G.enemies = [];
    if (G.mission && G.mission.targetCar) {
      var tc = G.mission.targetCar;
      var i = G.cars.indexOf(tc);
      if (i >= 0 && tc.kind === 'mission') { scene.remove(tc.mesh); G.cars.splice(i, 1); }
    }
    if (G.mission && G.mission.passenger) {
      var pi = G.peds.indexOf(G.mission.passenger);
      if (pi >= 0) { scene.remove(G.mission.passenger.mesh); G.peds.splice(pi, 1); }
    }
    var def = MISSIONS[index];
    var m = { index: index, stage: 0, timer: 0, data: {}, targetCar: null, passenger: null, progress: 0 };
    G.mission = m;
    switch (index) {
      case 0: m.timer = 90; break;
      case 1:
        m.timer = 150;
        m.passenger = makePed(0, -58, 0xd8c23a);
        m.passenger.wait = true;
        m.passenger.tx = 0; m.passenger.tz = -58;
        break;
      case 2:
        m.timer = 150;
        m.targetCar = makeCar('sedan', 58, -116, Math.PI / 2, 'mission');
        m.targetCar.speed = 0;
        break;
      case 3:
        m.timer = 180;
        m.targetCar = makeCar('truck', 0, -58, 0, 'mission');
        m.targetCar.axis = 'x'; m.targetCar.dir = 1; m.targetCar.targetSpeed = 10;
        break;
      case 4:
        m.timer = 120; setWanted(3);
        break;
      case 5:
        m.timer = 240;
        G.player.ammo = Math.max(G.player.ammo, 60);
        G.player.pistolOut = true;
        for (var e = 0; e < 4; e++) {
          var ex = P.warehouse.x - 12 + e * 8, ez = P.warehouse.z - 16 + (e % 2) * 3;
          var mesh = makePersonMesh(0x3a3a3a, 0x222222, 0xb08a6a);
          mesh.position.set(ex, 0, ez);
          scene.add(mesh);
          G.enemies.push({ mesh: mesh, x: ex, z: ez, hp: 60, shootCd: 1 + G.rng(), alive: true, walkPhase: 0 });
        }
        break;
      case 6:
        m.timer = 240; setWanted(3);
        break;
      case 7:
        m.timer = 200;
        break;
    }
    showMsg(def.title, def.intro, 6);
    SFX.sting();
    updateHUD();
  }

  function missionPassed() {
    var def = MISSIONS[G.mission.index];
    G.cash += def.reward;
    G.debt = Math.max(0, G.debt - def.reward);
    showMsg('MISSION PASSED', def.title + ' — +' + money(def.reward) + '  ·  debt now ' + money(G.debt), 5);
    SFX.sting();
    saveGame();
    var done = G.mission.index >= MISSIONS.length - 1;
    G.mission = null;
    G.missionIndex++;
    if (done) {
      showEnd('DEBT PAID', 'Fifty thousand, paid in full. The garage is yours again, Mara. Ironhaven is yours — free roam.', function () { hideEnd(); });
    } else {
      setTimeout(function () { if (G.mode === 'play') setupMission(G.missionIndex); }, 4500);
    }
    updateHUD();
  }

  function missionFailed(reason) {
    if (!G.mission) return;
    SFX.fail();
    showEnd('MISSION FAILED', reason + ' — the job is still open. Try again.', function () {
      hideEnd();
      if (G.mode === 'play') setupMission(G.missionIndex);
    });
  }

  // ------------------------------------------------------------ wanted/police
  function setWanted(n) {
    G.wanted = Math.max(0, Math.min(5, n));
    G.wantedTimer = 0;
    G.lastSeen = 0;
    SFX.setSiren(G.wanted > 0);
    updateHUD();
  }

  function spawnPoliceCar() {
    var a = G.rng() * Math.PI * 2, r = 80 + G.rng() * 40;
    var p = city.nearestRoadPoint(G.player.x + Math.cos(a) * r, G.player.z + Math.sin(a) * r);
    var car = makeCar('police', p.x, p.z, G.rng() * Math.PI * 2, 'police');
    car.targetSpeed = 26;
    G.policeCars.push(car);
    return car;
  }
  function spawnCop() {
    var a = G.rng() * Math.PI * 2, r = 25 + G.rng() * 15;
    var mesh = makePersonMesh(0x1c2a44, 0x1c2a44, 0xc9997a);
    var x = G.player.x + Math.cos(a) * r, z = G.player.z + Math.sin(a) * r;
    var c = city.collideCircle(x, z, 1);
    mesh.position.set(c.x, 0, c.z);
    scene.add(mesh);
    var cop = { mesh: mesh, x: c.x, z: c.z, punchCd: 0, walkPhase: G.rng() * 6 };
    G.cops.push(cop);
    return cop;
  }

  // ---------------------------------------------------------------- player
  function createPlayer() {
    playerMesh = makePersonMesh(0x8a2f2f, 0x2e3440, 0xc9997a);
    playerMesh.position.set(city.places.garage.x, 0, city.places.garage.z + 16);
    scene.add(playerMesh);
    playerParts = playerMesh.userData;
    G.player = {
      x: city.places.garage.x, z: city.places.garage.z + 16,
      heading: 0, health: 100, speed: 0,
      inCar: null, pistolOut: false, ammo: 0, punchCd: 0, shootCd: 0,
      walkPhase: 0, hitCd: 0, invuln: 0,
    };
  }

  function damagePlayer(n) {
    var p = G.player;
    if (p.invuln > 0 || G.mode !== 'play') return;
    p.health -= n;
    p.invuln = 0.25;
    if (p.health <= 0) { p.health = 0; wasted(); }
    updateHUD();
  }

  function wasted() {
    if (G.mode !== 'play') return;
    G.mode = 'wasted';
    SFX.fail(); SFX.setEngine(0, false); SFX.setSiren(false);
    var hadMission = !!G.mission;
    G.cash = Math.max(0, G.cash - 100);
    showEnd('WASTED', 'Mara is down. The crew drags her out of the rain — $100 lighter.' + (hadMission ? ' The job is still open.' : ''), function () {
      hideEnd();
      respawn();
      if (hadMission) setupMission(G.missionIndex);
    });
  }

  function busted() {
    if (G.mode !== 'play') return;
    G.mode = 'busted';
    SFX.busted(); SFX.setEngine(0, false); SFX.setSiren(false);
    var hadMission = !!G.mission;
    setWanted(0);
    G.cash = Math.max(0, G.cash - 150);
    showEnd('BUSTED', 'Ironhaven PD takes Mara in. Bail costs $150.' + (hadMission ? ' The job is still open.' : ''), function () {
      hideEnd();
      respawn();
      if (hadMission) setupMission(G.missionIndex);
    });
  }

  function respawn() {
    var p = G.player, P = city.places;
    if (p.inCar) { p.inCar.kind = 'parked'; p.inCar = null; }
    p.x = P.safehouse.x; p.z = P.safehouse.z + 10;
    p.health = 100; p.speed = 0; p.heading = 0;
    G.bustedProg = 0;
    playerMesh.visible = true;
    playerMesh.position.set(p.x, 0, p.z);
    G.mode = 'play';
    updateHUD();
  }

  // ---------------------------------------------------------------- combat
  var raycaster = null;
  function shootTargets() {
    var list = [];
    G.enemies.forEach(function (e) { if (e.alive) list.push(e.mesh); });
    G.cops.forEach(function (c) { list.push(c.mesh); });
    G.peds.forEach(function (p) { list.push(p.mesh); });
    return list;
  }
  function doShoot() {
    var p = G.player;
    if (!p.pistolOut || p.ammo <= 0 || p.shootCd > 0 || G.mode !== 'play') return false;
    p.ammo--; p.shootCd = 0.28;
    SFX.gunshot();
    if (!raycaster) raycaster = new THREE.Raycaster();
    // Aim along the camera's forward direction, fired from the player: the
    // camera looks down at the player, so a ray through the screen centre
    // would strike the ground at the player's feet instead of the target.
    camera.updateMatrixWorld();
    var dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    raycaster.set(new THREE.Vector3(p.x, 1.4, p.z), dir);
    raycaster.far = 80;
    scene.updateMatrixWorld(true); // meshes moved by scripted steps need fresh world matrices before raycasting
    var hits = raycaster.intersectObjects(shootTargets(), true);
    if (hits.length) {
      var obj = hits[0].object, root = obj;
      while (root.parent && root.parent !== scene) root = root.parent;
      var en = G.enemies.find(function (e) { return e.mesh === root; });
      if (en) {
        en.hp -= 34;
        if (en.hp <= 0) { en.alive = false; scene.remove(en.mesh); maybeDropPickup(en.x, en.z); }
        updateHUD();
        return true;
      }
      var cop = G.cops.find(function (c) { return c.mesh === root; });
      if (cop) {
        var ci = G.cops.indexOf(cop);
        scene.remove(cop.mesh); G.cops.splice(ci, 1);
        setWanted(G.wanted + 1);
        return true;
      }
      var ped = G.peds.find(function (pd) { return pd.mesh === root; });
      if (ped) {
        var pi = G.peds.indexOf(ped);
        scene.remove(ped.mesh); G.peds.splice(pi, 1);
        setWanted(G.wanted + 1);
        return true;
      }
    }
    return true;
  }
  function doPunch() {
    var p = G.player;
    if (p.punchCd > 0 || G.mode !== 'play') return;
    p.punchCd = 0.45;
    SFX.punch();
    var fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    function hit(list, dmg, kill) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        var dx = t.x - p.x, dz = t.z - p.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.3) {
          if (t.hp !== undefined) {
            t.hp -= dmg;
            if (t.hp <= 0) { t.alive = false; scene.remove(t.mesh); maybeDropPickup(t.x, t.z); }
          } else {
            var idx = list.indexOf(t);
            scene.remove(t.mesh); list.splice(idx, 1);
            setWanted(G.wanted + 1);
          }
          return true;
        }
      }
      return false;
    }
    hit(G.enemies, 30) || hit(G.cops, 0) || hit(G.peds, 0);
  }
  function maybeDropPickup(x, z) {
    if (G.rng() < 0.4) spawnPickup(G.rng() < 0.5 ? 'health' : 'ammo', x + 1, z + 1);
  }
  function spawnPickup(kind, x, z) {
    var mat = kind === 'health' ? new THREE.MeshBasicMaterial({ color: 0x2ecc71 }) : new THREE.MeshBasicMaterial({ color: 0xf5c542 });
    var mesh = new THREE.Group();
    var b1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.28), mat);
    var b2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.28), mat);
    mesh.add(b1); mesh.add(b2);
    mesh.position.set(x, 1.0, z);
    scene.add(mesh);
    G.pickups.push({ mesh: mesh, kind: kind, x: x, z: z, phase: G.rng() * 6 });
  }

  // -------------------------------------------------------------- interact
  function nearestCar(maxD) {
    var p = G.player, best = null, bd = maxD;
    G.cars.forEach(function (c) {
      var d = dist2d(p.x, p.z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }
  function tryInteract() {
    var p = G.player;
    if (G.mode !== 'play') return;
    if (p.inCar) {
      var car = p.inCar;
      car.kind = 'parked'; car.speed = 0;
      p.inCar = null;
      p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.2;
      p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.2;
      var c = city.collideCircle(p.x, p.z, 1);
      p.x = c.x; p.z = c.z;
      playerMesh.visible = true;
      playerMesh.position.set(p.x, 0, p.z);
      SFX.click();
      return;
    }
    // mission 2 pickup
    if (G.mission && G.mission.index === 1 && G.mission.stage === 0 && G.mission.passenger) {
      var ps = G.mission.passenger;
      if (dist2d(p.x, p.z, ps.x, ps.z) < 3.5) {
        G.mission.stage = 1;
        var pi = G.peds.indexOf(ps);
        scene.remove(ps.mesh); G.peds.splice(pi, 1);
        showMsg('ROOK IS IN', 'Get him to the east docks road. Clock is running.', 3);
        SFX.pickup();
        return;
      }
    }
    var car = nearestCar(4.5);
    if (!car) return;
    if (car.kind === 'traffic' || car.kind === 'mission') {
      // stealing: the driver flees on foot
      var d = makePed(car.x + 2, car.z + 2, 0xcccccc);
      d.flee = 4;
      if (car.kind === 'mission' && G.mission && G.mission.index === 2 && G.mission.stage === 0) {
        G.mission.stage = 1;
        showMsg('CAR TAKEN', 'Marked sedan stolen — get it to Voss Auto.', 3);
      } else {
        showMsg('CAR STOLEN', 'Wanted level up.', 2.5);
      }
      setWanted(G.wanted + 1);
    }
    if (car.kind === 'police') { setWanted(Math.min(5, G.wanted + 2)); showMsg('STOLE A POLICE CAR', 'The whole PD is coming.', 3); }
    car.kind = 'player';
    p.inCar = car;
    playerMesh.visible = false;
    SFX.click();
    updateHUD();
  }

  // ---------------------------------------------------------------- update
  function stepPlayer(dt) {
    var p = G.player, k = G.keys;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);
    p.hitCd = Math.max(0, p.hitCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.inCar) { stepDriving(dt); return; }
    var fwdX = Math.sin(G.camYaw), fwdZ = Math.cos(G.camYaw);
    var rX = Math.cos(G.camYaw), rZ = -Math.sin(G.camYaw);
    var mx = 0, mz = 0;
    if (k.KeyW || k.ArrowUp) { mx += fwdX; mz += fwdZ; }
    if (k.KeyS || k.ArrowDown) { mx -= fwdX; mz -= fwdZ; }
    if (k.KeyA || k.ArrowLeft) { mx -= rX; mz -= rZ; }
    if (k.KeyD || k.ArrowRight) { mx += rX; mz += rZ; }
    var len = Math.hypot(mx, mz);
    var sprint = k.ShiftLeft || k.ShiftRight;
    var speed = sprint ? 8.5 : 5;
    if (len > 0) {
      mx /= len; mz /= len;
      p.x += mx * speed * dt; p.z += mz * speed * dt;
      p.heading = Math.atan2(mx, mz);
      p.walkPhase += dt * (sprint ? 13 : 9);
      p.speed = speed;
    } else p.speed = 0;
    var c = city.collideCircle(p.x, p.z, 0.9);
    p.x = c.x; p.z = c.z;
    playerMesh.position.set(p.x, 0, p.z);
    playerMesh.rotation.y = p.heading;
    var swing = p.speed > 0 ? Math.sin(p.walkPhase) * 0.55 : 0;
    playerParts.legL.rotation.x = swing;
    playerParts.legR.rotation.x = -swing;
    playerParts.armL.rotation.x = -swing * 0.7;
    playerParts.armR.rotation.x = swing * 0.7;
    // pickups
    for (var i = G.pickups.length - 1; i >= 0; i--) {
      var pk = G.pickups[i];
      if (dist2d(p.x, p.z, pk.x, pk.z) < 2) {
        if (pk.kind === 'health') p.health = Math.min(100, p.health + 30);
        else p.ammo += 24;
        scene.remove(pk.mesh); G.pickups.splice(i, 1);
        SFX.pickup();
        updateHUD();
      }
    }
    SFX.setEngine(0, false);
  }

  function stepDriving(dt) {
    var p = G.player, car = p.inCar, k = G.keys;
    var maxSpeed = car.type === 'sport' ? 34 : car.type === 'truck' ? 22 : 29;
    if (k.KeyW || k.ArrowUp) car.speed += 22 * dt;
    if (k.KeyS || k.ArrowDown) car.speed -= (car.speed > 0.5 ? 30 : 12) * dt;
    if (k.Space) car.speed -= Math.sign(car.speed) * 26 * dt;
    if (!k.KeyW && !k.KeyS) car.speed -= Math.sign(car.speed) * 6 * dt;
    car.speed = clamp(car.speed, -10, maxSpeed);
    if (Math.abs(car.speed) < 0.15 && !k.KeyW && !k.KeyS) car.speed = 0;
    var steer = 0;
    if (k.KeyA || k.ArrowLeft) steer = 1;
    if (k.KeyD || k.ArrowRight) steer = -1;
    var sf = clamp(Math.abs(car.speed) / 10, 0, 1);
    car.heading += steer * sf * 1.9 * dt * Math.sign(car.speed || 1);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    var before = { x: car.x, z: car.z };
    var c = city.collideCircle(car.x, car.z, 2.1);
    if (Math.abs(c.x - before.x) > 0.01 || Math.abs(c.z - before.z) > 0.01) {
      car.speed *= 0.45;
      if (Math.abs(car.speed) > 8 && p.hitCd <= 0) { damagePlayer(4); p.hitCd = 1; }
    }
    car.x = c.x; car.z = c.z;
    p.x = car.x; p.z = car.z; p.heading = car.heading; p.speed = Math.abs(car.speed);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    car.mesh.userData.wheels.forEach(function (w, i) {
      w.rotation.x += car.speed * dt * 2;
      if (i < 2) w.rotation.y = steer * 0.35;
    });
    // scare pedestrians
    if (Math.abs(car.speed) > 8) {
      G.peds.forEach(function (pd) {
        if (dist2d(car.x, car.z, pd.x, pd.z) < 12) pd.flee = 2.5;
      });
    }
    SFX.setEngine(Math.abs(car.speed) / maxSpeed, true);
  }

  function stepTraffic(dt) {
    G.cars.forEach(function (car) {
      if (car.kind === 'player' || car.kind === 'police') return;
      car.turnCooldown -= dt;
      // obstacle ahead: slow down
      var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      var blocked = false;
      G.cars.forEach(function (o) {
        if (o === car) return;
        var dx = o.x - car.x, dz = o.z - car.z;
        var d = Math.hypot(dx, dz);
        if (d < 9 && d > 0.1 && (dx * fx + dz * fz) / d > 0.7) blocked = true;
      });
      if (G.player.inCar) {
        var pc = G.player.inCar;
        var dx = pc.x - car.x, dz = pc.z - car.z;
        var d = Math.hypot(dx, dz);
        if (d < 9 && (dx * fx + dz * fz) / (d || 1) > 0.7) blocked = true;
      }
      var target = blocked ? 0 : car.targetSpeed;
      car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
      if (car.kind === 'mission' && G.mission && G.mission.index === 3) {
        // the tail target cruises a loop; keep it moving steadily
        car.speed = 10;
      }
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // turn at intersections
      if (car.turnCooldown <= 0) {
        var nearLine = null;
        city.roadLines.forEach(function (L) {
          if (car.axis === 'z' && Math.abs(car.z - L) < 3) nearLine = L;
          if (car.axis === 'x' && Math.abs(car.x - L) < 3) nearLine = L;
        });
        if (nearLine !== null && G.rng() < 0.35) {
          if (car.axis === 'z') {
            car.axis = 'x'; car.dir = G.rng() < 0.5 ? 1 : -1;
            car.z = nearLine + (car.dir > 0 ? 3.5 : -3.5);
            car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            car.axis = 'z'; car.dir = G.rng() < 0.5 ? 1 : -1;
            car.x = nearLine + (car.dir > 0 ? -3.5 : 3.5);
            car.heading = car.dir > 0 ? 0 : Math.PI;
          }
          car.turnCooldown = 2;
        }
      }
      var c = city.collideCircle(car.x, car.z, 2.1);
      car.x = c.x; car.z = c.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    });
    // car-car separation (player car vs traffic)
    if (G.player.inCar) {
      var pc = G.player.inCar;
      G.cars.forEach(function (o) {
        if (o === pc || o.kind === 'player') return;
        var dx = pc.x - o.x, dz = pc.z - o.z;
        var d = Math.hypot(dx, dz);
        if (d < 4.2 && d > 0.01) {
          var push = (4.2 - d) / 2;
          pc.x += dx / d * push; pc.z += dz / d * push;
          o.x -= dx / d * push; o.z -= dz / d * push;
          if (Math.abs(pc.speed) > 6 && G.player.hitCd <= 0) { damagePlayer(3); G.player.hitCd = 1; }
          // police contact is governed by the ram logic (bounce + cooldown);
          // damping here as well would pin the player under a chase
          if (o.kind !== 'police') { pc.speed *= 0.85; o.speed *= 0.7; }
        }
      });
    }
  }

  function stepPeds(dt) {
    G.peds.forEach(function (pd) {
      if (pd.wait) { pd.mesh.position.set(pd.x, 0, pd.z); return; }
      pd.walkPhase += dt * 8;
      var tx = pd.tx, tz = pd.tz, sp = 2.4;
      if (pd.flee > 0) {
        pd.flee -= dt;
        var dx = pd.x - G.player.x, dz = pd.z - G.player.z;
        var d = Math.hypot(dx, dz) || 1;
        tx = pd.x + dx / d * 10; tz = pd.z + dz / d * 10;
        sp = 5;
      }
      var dx2 = tx - pd.x, dz2 = tz - pd.z;
      var d2 = Math.hypot(dx2, dz2);
      if (d2 < 1.5) {
        if (pd.flee <= 0) {
          var rp = city.randomRoadPoint(G.rng);
          pd.tx = clamp(rp.x + 9.5, -198, 198);
          pd.tz = clamp(rp.z + 9.5, -198, 196);
        }
      } else {
        pd.x += dx2 / d2 * sp * dt;
        pd.z += dz2 / d2 * sp * dt;
        pd.heading = Math.atan2(dx2, dz2);
      }
      var c = city.collideCircle(pd.x, pd.z, 0.8);
      pd.x = c.x; pd.z = c.z;
      pd.mesh.position.set(pd.x, 0, pd.z);
      pd.mesh.rotation.y = pd.heading;
      var swing = Math.sin(pd.walkPhase) * 0.5;
      pd.mesh.userData.legL.rotation.x = swing;
      pd.mesh.userData.legR.rotation.x = -swing;
    });
  }

  function stepPolice(dt) {
    var p = G.player;
    // spawn / despawn to match wanted level
    G.spawnTimer -= dt;
    var wantCars = G.wanted > 0 ? Math.min(2 + G.wanted, 5) : 0;
    var wantCops = G.wanted > 0 && !p.inCar ? Math.min(G.wanted, 3) : 0;
    if (G.spawnTimer <= 0) {
      if (G.policeCars.length < wantCars) spawnPoliceCar();
      else if (G.cops.length < wantCops) spawnCop();
      G.spawnTimer = 1.2;
    }
    if (G.wanted === 0) {
      G.policeCars.forEach(function (c) { scene.remove(c.mesh); });
      G.policeCars = [];
      G.cops.forEach(function (c) { scene.remove(c.mesh); });
      G.cops = [];
      SFX.setSiren(false);
    }
    // police cars chase
    var nearest = 1e9;
    G.policeCars.forEach(function (car) {
      var dx = p.x - car.x, dz = p.z - car.z;
      var d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, d);
      var desired = Math.atan2(dx, dz);
      var diff = angleDiff(desired, car.heading);
      car.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
      var target = d < 5 ? 10 : 27;
      car.speed += clamp(target - car.speed, -20 * dt, 14 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      var c = city.collideCircle(car.x, car.z, 2.1);
      car.x = c.x; car.z = c.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      // ram the player, then bounce back: a ram costs the player speed, but
      // the cruiser has to re-approach before it can ram again, so a chase
      // stays a chase instead of a permanent pin
      car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
      if (d < 4.6 && car.ramCd <= 0) {
        if (p.inCar) {
          p.inCar.speed *= 0.6;
          if (Math.abs(car.speed) > 10 && p.hitCd <= 0) { damagePlayer(5); p.hitCd = 1; }
        } else if (p.hitCd <= 0) { damagePlayer(8); p.hitCd = 1; }
        car.speed = -car.speed * 0.25;
        car.ramCd = 1.2;
      }
    });
    // on-foot cops chase and punch
    G.cops.forEach(function (cop) {
      cop.punchCd -= dt;
      var dx = p.x - cop.x, dz = p.z - cop.z;
      var d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, d);
      if (d > 1.6) {
        cop.x += dx / (d || 1) * 5.2 * dt;
        cop.z += dz / (d || 1) * 5.2 * dt;
        cop.walkPhase += dt * 10;
      } else if (cop.punchCd <= 0 && !p.inCar) {
        cop.punchCd = 0.8;
        damagePlayer(7);
        G.bustedProg += 0.8;
      }
      var c = city.collideCircle(cop.x, cop.z, 0.8);
      cop.x = c.x; cop.z = c.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = Math.atan2(dx, dz);
      var swing = Math.sin(cop.walkPhase) * 0.5;
      cop.mesh.userData.legL.rotation.x = swing;
      cop.mesh.userData.legR.rotation.x = -swing;
    });
    // wanted decay when no police can see the player
    if (G.wanted > 0) {
      if (nearest > 55) {
        G.lastSeen += dt;
        if (G.lastSeen > 9) { setWanted(G.wanted - 1); }
      } else G.lastSeen = 0;
    }
    if (G.bustedProg >= 2 && !p.inCar) busted();
    else if (G.bustedProg > 0 && nearest > 3) G.bustedProg = Math.max(0, G.bustedProg - dt * 0.5);
  }

  function stepEnemies(dt) {
    var p = G.player;
    G.enemies.forEach(function (e) {
      if (!e.alive) return;
      e.shootCd -= dt;
      var dx = p.x - e.x, dz = p.z - e.z;
      var d = Math.hypot(dx, dz);
      if (d > 6 && d < 45) {
        e.x += dx / d * 2.6 * dt;
        e.z += dz / d * 2.6 * dt;
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = Math.atan2(dx, dz);
      if (e.shootCd <= 0 && d < 42 && G.mode === 'play') {
        e.shootCd = 1.4 + G.rng() * 0.9;
        SFX.gunshot();
        if (G.rng() < 0.4) damagePlayer(6);
      }
    });
    // remove dead
    G.enemies = G.enemies.filter(function (e) { return e.alive; });
  }

  function stepMission(dt) {
    var m = G.mission;
    if (!m) return;
    m.timer -= dt;
    if (m.timer <= 0) { missionFailed('Time ran out on ' + MISSIONS[m.index].title + '.'); return; }
    var p = G.player, P = city.places;
    switch (m.index) {
      case 0: {
        if (dist2d(p.x, p.z, 87, 116) < 6) missionPassed();
        break;
      }
      case 1: {
        if (m.stage === 1 && dist2d(p.x, p.z, 116, 58) < 6) missionPassed();
        break;
      }
      case 2: {
        if (m.stage === 1 && p.inCar === m.targetCar && dist2d(p.x, p.z, -87, 58) < 6) missionPassed();
        break;
      }
      case 3: {
        var tc = m.targetCar;
        if (!tc) break;
        var d = dist2d(p.x, p.z, tc.x, tc.z);
        if (d < 10) {
          m.progress += dt;
          if (m.progress > 1.5) { missionFailed('The driver spotted you tailing him.'); return; }
        } else m.progress = Math.max(0, m.progress - dt);
        if (d > 12 && d < 45) m.data.tailTime = (m.data.tailTime || 0) + dt;
        else if (d >= 45) m.data.tailTime = Math.max(0, (m.data.tailTime || 0) - dt * 0.5);
        if ((m.data.tailTime || 0) >= 30) missionPassed();
        break;
      }
      case 4: {
        if (dist2d(p.x, p.z, P.safehouse.x, P.safehouse.z) < 8) missionPassed();
        break;
      }
      case 5: {
        if (G.enemies.length === 0) missionPassed();
        break;
      }
      case 6: {
        if (G.wanted === 0 && dist2d(p.x, p.z, P.safehouse.x, P.safehouse.z) < 8) missionPassed();
        break;
      }
      case 7: {
        if (m.stage === 0 && dist2d(p.x, p.z, 29, 14) < 5) {
          if (p.inCar) { showMsg('ON FOOT', 'Park the car — the vault needs feet, not wheels.', 2.5); }
          else { m.stage = 1; m.progress = 0; showMsg('CRACKING THE VAULT', 'Hold position…', 2); }
        } else if (m.stage === 1) {
          if (dist2d(p.x, p.z, 29, 14) < 5) {
            m.progress += dt;
            if (m.progress >= 4) {
              m.stage = 2;
              G.cash += 0; // reward lands on escape
              setWanted(5);
              showMsg('VAULT CRACKED — $21,000', 'Five stars. Get to the docks, NOW.', 4);
              SFX.sting();
            }
          } else m.progress = Math.max(0, m.progress - dt);
        } else if (m.stage === 2 && dist2d(p.x, p.z, P.docks.x, P.docks.z) < 8) {
          missionPassed();
        }
        break;
      }
    }
  }

  function stepRain(dt) {
    if (!rain) return;
    var cx = camera.position.x, cz = camera.position.z;
    for (var i = 0; i < rainPos.length; i += 3) {
      rainPos[i + 1] -= rainVel[i / 3] * dt;
      if (rainPos[i + 1] < 0) {
        rainPos[i] = cx + (G.rng() - 0.5) * 110;
        rainPos[i + 1] = 30 + G.rng() * 12;
        rainPos[i + 2] = cz + (G.rng() - 0.5) * 110;
      }
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }

  function step(dt) {
    if (G.mode !== 'play' && G.mode !== 'title') return;
    G.time += dt;
    var ambient = G.mode === 'title';
    if (!ambient) {
      stepPlayer(dt);
      stepMission(dt);
      if (G.mode !== 'play') return; // mission end / wasted / busted changed mode
      stepPolice(dt);
      if (G.mode !== 'play') return;
      stepEnemies(dt);
    }
    stepTraffic(dt);
    stepPeds(dt);
    stepRain(dt);
    G.pickups.forEach(function (pk) {
      pk.phase += dt * 3;
      pk.mesh.position.y = 1.0 + Math.sin(pk.phase) * 0.25;
      pk.mesh.rotation.y += dt;
    });
    // beacon follows the mission target
    var t = missionTarget();
    if (t && !ambient) {
      beacon.visible = true; beaconGem.visible = true;
      beacon.position.set(t.x, 15, t.z);
      beaconGem.position.set(t.x, 5 + Math.sin(G.time * 3) * 0.6, t.z);
      beaconGem.rotation.y += dt * 2;
    } else { beacon.visible = false; beaconGem.visible = false; }
    // autosave
    G.saveTimer += dt;
    if (G.saveTimer > 15) { G.saveTimer = 0; saveGame(); }
    updateHUD();
    drawMinimap();
  }

  // ------------------------------------------------------------ camera/HUD
  function updateCamera() {
    var p = G.player;
    var dist = p.inCar ? 11 : G.camDist;
    var cx = p.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
    var cz = p.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
    var cy = 2.2 + Math.sin(G.camPitch) * dist + (p.inCar ? 1.2 : 0.6);
    camera.position.set(cx, cy, cz);
    camera.lookAt(p.x, 1.8, p.z);
  }

  function updateHUD() {
    var p = G.player;
    if (!p) return;
    $('cash').textContent = money(G.cash);
    $('debt').textContent = money(G.debt);
    $('ammo').textContent = p.pistolOut ? String(p.ammo) : '—';
    $('healthfill').style.width = Math.max(0, p.health) + '%';
    var stars = '';
    for (var i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '<span class="off">★</span>';
    $('wanted').innerHTML = stars;
    var m = G.mission;
    if (m) {
      $('obj-title').textContent = MISSIONS[m.index].title;
      $('obj-text').textContent = MISSIONS[m.index].obj;
      var extra = '';
      if (m.index === 3) extra = ' · tailed ' + Math.floor(m.data.tailTime || 0) + '/30s';
      if (m.index === 7 && m.stage === 1) extra = ' · cracking ' + Math.floor(m.progress) + '/4s';
      $('obj-timer').textContent = fmtTime(m.timer) + extra;
    } else {
      $('obj-title').textContent = G.debt <= 0 ? 'IRONHAVEN — FREE ROAM' : 'IRONHAVEN';
      $('obj-text').textContent = G.debt <= 0 ? 'Debt paid. The city is yours, Mara.' : 'No active job. Drive to Voss Auto to pick up work.';
      $('obj-timer').textContent = '';
    }
    var speed = p.inCar ? Math.abs(p.inCar.speed) * 2.2 : p.speed * 2.2;
    $('speed').innerHTML = Math.round(speed) + ' <small>mph</small>';
    $('crosshair').style.display = p.pistolOut && !p.inCar ? 'block' : 'none';
    $('hint').textContent = p.inCar
      ? 'WASD drive · Space handbrake · E exit car · P pause'
      : 'WASD move · E enter car · Q pistol · Click shoot · F punch · Shift sprint · P pause';
  }

  function drawMinimap() {
    var cv = $('minimap'), g = cv.getContext('2d');
    var S = 190, scale = S / 430, ox = S / 2, oz = S / 2;
    function mx(x) { return ox + x * scale; }
    function mz(z) { return oz + z * scale; }
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(ox, oz, S / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#10131c'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#0d2836'; g.fillRect(0, mz(200), S, S - mz(200)); // harbor water
    g.strokeStyle = '#3a3f4a'; g.lineWidth = 5;
    city.roadLines.forEach(function (L) {
      g.beginPath(); g.moveTo(mx(-210), mz(L)); g.lineTo(mx(210), mz(L)); g.stroke();
      g.beginPath(); g.moveTo(mx(L), mz(-210)); g.lineTo(mx(L), mz(210)); g.stroke();
    });
    g.fillStyle = '#2f333d';
    for (var bi = -3; bi <= 2; bi++) for (var bj = -3; bj <= 2; bj++) {
      g.fillRect(mx(bi * 58 + 8), mz(bj * 58 + 8), 42 * scale, 42 * scale);
    }
    var t = missionTarget();
    if (t && G.mode === 'play') {
      g.fillStyle = '#ffd75e';
      g.beginPath(); g.arc(mx(t.x), mz(t.z), 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffd75e'; g.lineWidth = 2;
      g.beginPath(); g.arc(mx(t.x), mz(t.z), 10 + Math.sin(G.time * 4) * 2, 0, Math.PI * 2); g.stroke();
    }
    G.traffic.forEach(function (c) {
      g.fillStyle = '#9aa0aa';
      g.fillRect(mx(c.x) - 1.5, mz(c.z) - 1.5, 3, 3);
    });
    G.policeCars.forEach(function (c) {
      g.fillStyle = '#4d8dff';
      g.beginPath(); g.arc(mx(c.x), mz(c.z), 3.5, 0, Math.PI * 2); g.fill();
    });
    G.enemies.forEach(function (e) {
      g.fillStyle = '#ff4444';
      g.beginPath(); g.arc(mx(e.x), mz(e.z), 3, 0, Math.PI * 2); g.fill();
    });
    // player arrow
    var px = mx(G.player.x), pz = mz(G.player.z);
    g.save();
    g.translate(px, pz);
    g.rotate(Math.PI - G.player.heading);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
    g.restore();
  }

  function showMsg(title, sub, secs) {
    var el = $('msg');
    el.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    el.style.display = 'block';
    G.msgTimer = secs || 3;
    setTimeout(function () { el.style.display = 'none'; }, (secs || 3) * 1000);
  }

  // ------------------------------------------------------------ save/load
  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: G.cash, debt: G.debt, missionIndex: G.missionIndex, health: G.player.health,
      }));
    } catch (e) { /* storage may be off */ }
  }
  function loadSave() {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function applySave(s) {
    G.cash = s.cash; G.debt = s.debt; G.missionIndex = Math.min(s.missionIndex, MISSIONS.length - 1);
    if (G.player) G.player.health = s.health || 100;
  }

  // -------------------------------------------------------------- screens
  function startGame(fromSave) {
    SFX.unlock();
    if (fromSave) { var s = loadSave(); if (s) applySave(s); }
    $('title-screen').classList.remove('on');
    $('end-screen').classList.remove('on');
    $('pause-screen').classList.remove('on');
    $('hud').classList.add('on');
    var p = G.player, P = city.places;
    if (p.inCar) { p.inCar.kind = 'parked'; p.inCar = null; }
    p.x = P.garage.x; p.z = P.garage.z + 16;
    p.health = 100; p.speed = 0; p.heading = 0;
    playerMesh.visible = true;
    playerMesh.position.set(p.x, 0, p.z);
    setWanted(0);
    G.mode = 'play';
    if (G.missionIndex < MISSIONS.length) setupMission(G.missionIndex);
    else { G.mission = null; }
    updateHUD();
  }
  function pauseGame() {
    if (G.mode !== 'play') return;
    G.mode = 'paused';
    $('pause-screen').classList.add('on');
    SFX.setEngine(0, false);
  }
  function resumeGame() {
    if (G.mode !== 'paused') return;
    G.mode = 'play';
    $('pause-screen').classList.remove('on');
  }
  function quitToTitle() {
    G.mode = 'title';
    $('pause-screen').classList.remove('on');
    $('end-screen').classList.remove('on');
    $('hud').classList.remove('on');
    $('title-screen').classList.add('on');
    var s = loadSave();
    $('btn-continue').style.display = s ? 'inline-block' : 'none';
    SFX.setEngine(0, false); SFX.setSiren(false);
  }
  var endCb = null;
  function showEnd(title, text, cb) {
    $('end-title').textContent = title;
    $('end-text').textContent = text;
    $('end-screen').classList.add('on');
    endCb = cb;
  }
  function hideEnd() { $('end-screen').classList.remove('on'); endCb = null; }

  // ---------------------------------------------------------------- input
  function bindInput() {
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space') e.preventDefault();
      G.keys[e.code] = true;
      if (e.code === 'KeyE') tryInteract();
      if (e.code === 'KeyQ' && G.mode === 'play' && !G.player.inCar) {
        G.player.pistolOut = !G.player.pistolOut;
        if (G.player.pistolOut && G.player.ammo === 0) G.player.ammo = 24;
        SFX.click(); updateHUD();
      }
      if (e.code === 'KeyF') doPunch();
      if (e.code === 'KeyM') { G.muted = SFX.toggleMute(); }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (G.mode === 'play') pauseGame();
        else if (G.mode === 'paused') resumeGame();
      }
    });
    window.addEventListener('keyup', function (e) { G.keys[e.code] = false; });
    canvas.addEventListener('mousedown', function (e) { G.mouseDown = true; G.dragMoved = 0; G._mx = e.clientX; G._my = e.clientY; });
    window.addEventListener('mousemove', function (e) {
      if (!G.mouseDown) return;
      var dx = e.clientX - G._mx, dy = e.clientY - G._my;
      G._mx = e.clientX; G._my = e.clientY;
      G.dragMoved += Math.abs(dx) + Math.abs(dy);
      G.camYaw -= dx * 0.005;
      G.camPitch = clamp(G.camPitch + dy * 0.004, 0.05, 1.1);
    });
    window.addEventListener('mouseup', function () {
      if (G.mouseDown && G.dragMoved < 6 && G.mode === 'play') doShoot();
      G.mouseDown = false;
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      G.camDist = clamp(G.camDist + Math.sign(e.deltaY) * 1.5, 5, 16);
    }, { passive: false });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.mode === 'play') pauseGame();
    });
    $('btn-start').addEventListener('click', function () { startGame(false); });
    $('btn-continue').addEventListener('click', function () { startGame(true); });
    $('btn-resume').addEventListener('click', resumeGame);
    $('btn-save').addEventListener('click', function () { saveGame(); showMsg('SAVED', 'Progress saved.', 2); });
    $('btn-quit').addEventListener('click', quitToTitle);
    $('btn-end').addEventListener('click', function () { if (endCb) endCb(); });
  }

  // ---------------------------------------------------------------- world
  function buildWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x241d2e);
    scene.fog = new THREE.Fog(0x241d2e, 55, 330);
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    var hemi = new THREE.HemisphereLight(0x9a86c8, 0x2a2018, 0.85);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xff9a5c, 1.25);
    sun.position.set(-180, 60, -80);
    scene.add(sun);
    // low dusk sun disc on the western horizon
    var sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: 0xff7a3c, fog: false }));
    sunDisc.position.set(-320, 34, -60);
    sunDisc.lookAt(0, 20, 0);
    scene.add(sunDisc);

    city = CITY.buildCity(scene, G.rng);

    // beacon + gem for the mission target
    beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 34, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    beacon.visible = false;
    scene.add(beacon);
    beaconGem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshBasicMaterial({ color: 0xffd75e }));
    beaconGem.visible = false;
    scene.add(beaconGem);

    // rain
    var N = 800;
    rainPos = new Float32Array(N * 3);
    rainVel = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      rainPos[i * 3] = (G.rng() - 0.5) * 110;
      rainPos[i * 3 + 1] = G.rng() * 40;
      rainPos[i * 3 + 2] = (G.rng() - 0.5) * 110;
      rainVel[i] = 45 + G.rng() * 25;
    }
    var rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fb4cc, size: 0.32, transparent: true, opacity: 0.55 }));
    scene.add(rain);

    // wet-road puddles (dark reflective-looking patches)
    var pudMat = new THREE.MeshBasicMaterial({ color: 0x33465c, transparent: true, opacity: 0.5 });
    for (var j = 0; j < 14; j++) {
      var rp = city.randomRoadPoint(G.rng);
      var pud = new THREE.Mesh(new THREE.PlaneGeometry(6 + G.rng() * 8, 3 + G.rng() * 4), pudMat);
      pud.rotation.x = -Math.PI / 2;
      pud.position.set(rp.x, 0.06, rp.z);
      scene.add(pud);
    }

    createPlayer();

    // parked cars near the garage + around town
    var parkedSpots = [
      ['sedan', -80, 58, 0], ['taxi', -58, 20, Math.PI / 2], ['sport', 116, -20, -Math.PI / 2],
      ['van', 58, 116, 0], ['sedan', -116, -58, Math.PI / 2], ['truck', 174, 80, Math.PI],
      ['sedan', 0, 174, 0], ['taxi', -174, -116, 0],
    ];
    parkedSpots.forEach(function (s) { makeCar(s[0], s[1], s[2], s[3], 'parked'); });
    // traffic
    var trafficTypes = ['sedan', 'sedan', 'taxi', 'van', 'sport', 'sedan', 'taxi', 'truck', 'sedan', 'van', 'sedan', 'taxi', 'sport', 'sedan'];
    for (var t = 0; t < 14; t++) {
      var rp2 = city.randomRoadPoint(G.rng);
      var car = makeCar(trafficTypes[t], rp2.x, rp2.z, rp2.axis === 'z' ? (rp2.dir > 0 ? 0 : Math.PI) : (rp2.dir > 0 ? Math.PI / 2 : -Math.PI / 2), 'traffic');
      car.axis = rp2.axis; car.dir = rp2.dir;
      car.speed = car.targetSpeed;
    }
    G.traffic = G.cars.filter(function (c) { return c.kind === 'traffic'; });
    // pedestrians
    var shirtCols = [0x7a8a99, 0x9a7a5a, 0x5a7a5a, 0x8a5a7a, 0xa88a3a, 0x6a7a8a];
    for (var q = 0; q < 18; q++) {
      var rp3 = city.randomRoadPoint(G.rng);
      var ped = makePed(clamp(rp3.x + 9.5, -198, 198), clamp(rp3.z + 9.5, -198, 196), pick(G.rng, shirtCols));
      ped.tx = ped.x; ped.tz = ped.z;
    }
    // pickups around the city
    spawnPickup('health', -58, 0);
    spawnPickup('ammo', 58, 58);
    spawnPickup('health', 116, -116);
    spawnPickup('ammo', -116, 116);

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function resetDynamic(seed) {
    G.rng = mulberry32(seed);
    // remove dynamic entities, keep the static city
    G.cars.forEach(function (c) { scene.remove(c.mesh); });
    G.cars = []; G.traffic = [];
    G.peds.forEach(function (p) { scene.remove(p.mesh); });
    G.peds = [];
    G.cops.forEach(function (c) { scene.remove(c.mesh); });
    G.policeCars = []; G.cops = [];
    G.enemies.forEach(function (e) { scene.remove(e.mesh); });
    G.enemies = [];
    G.pickups.forEach(function (pk) { scene.remove(pk.mesh); });
    G.pickups = [];
    if (playerMesh) scene.remove(playerMesh);
    G.mission = null; G.missionIndex = 0;
    G.cash = 350; G.debt = DEBT_START; G.wanted = 0; G.bustedProg = 0;
    buildWorldDynamic();
    createPlayer();
  }
  function buildWorldDynamic() {
    var parkedSpots = [
      ['sedan', -80, 58, 0], ['taxi', -58, 20, Math.PI / 2], ['sport', 116, -20, -Math.PI / 2],
      ['van', 58, 116, 0], ['sedan', -116, -58, Math.PI / 2], ['truck', 174, 80, Math.PI],
      ['sedan', 0, 174, 0], ['taxi', -174, -116, 0],
    ];
    parkedSpots.forEach(function (s) { makeCar(s[0], s[1], s[2], s[3], 'parked'); });
    var trafficTypes = ['sedan', 'sedan', 'taxi', 'van', 'sport', 'sedan', 'taxi', 'truck', 'sedan', 'van', 'sedan', 'taxi', 'sport', 'sedan'];
    for (var t = 0; t < 14; t++) {
      var rp = city.randomRoadPoint(G.rng);
      var car = makeCar(trafficTypes[t], rp.x, rp.z, rp.axis === 'z' ? (rp.dir > 0 ? 0 : Math.PI) : (rp.dir > 0 ? Math.PI / 2 : -Math.PI / 2), 'traffic');
      car.axis = rp.axis; car.dir = rp.dir; car.speed = car.targetSpeed;
    }
    G.traffic = G.cars.filter(function (c) { return c.kind === 'traffic'; });
    for (var q = 0; q < 18; q++) {
      var rp3 = city.randomRoadPoint(G.rng);
      var ped = makePed(clamp(rp3.x + 9.5, -198, 198), clamp(rp3.z + 9.5, -198, 196), pick(G.rng, [0x7a8a99, 0x9a7a5a, 0x5a7a5a, 0x8a5a7a, 0xa88a3a, 0x6a7a8a]));
      ped.tx = ped.x; ped.tz = ped.z;
    }
    spawnPickup('health', -58, 0);
    spawnPickup('ammo', 58, 58);
  }

  // ---------------------------------------------------------------- shots
  function nearestLine(v) {
    var best = city.roadLines[0], bd = 1e9;
    city.roadLines.forEach(function (L) { var d = Math.abs(L - v); if (d < bd) { bd = d; best = L; } });
    return best;
  }
  var _ap = { lx: 0, lz: 0, n: 0, rev: 0, phase: 0, turnX: 0, tx: 0, tz: 0 };
  function autopilotDrive(dt, target) {
    var p = G.player, car = p.inCar;
    if (!car) return;
    // stuck recovery: barely moved for a second -> reverse and turn away
    _ap.n++;
    if (_ap.n % 60 === 0) {
      var moved = dist2d(_ap.lx, _ap.lz, car.x, car.z);
      if (moved < 1 && Math.abs(car.speed) < 3) _ap.rev = 45;
      _ap.lx = car.x; _ap.lz = car.z;
    }
    if (_ap.rev > 0) {
      _ap.rev--;
      G.keys.KeyW = false; G.keys.KeyS = true;
      G.keys.KeyA = true; G.keys.KeyD = false;
      return;
    }
    // Phased Manhattan routing on the road grid: (A) drive along the current
    // road to the turn intersection, (B) turn and drive to the target's road,
    // (C) drive straight to the target. The turn intersection is the road
    // line just before the target in the direction of travel, so the car
    // never has to reverse or cut a block corner.
    if (_ap.tx !== target.x || _ap.tz !== target.z) {
      _ap.tx = target.x; _ap.tz = target.z; _ap.phase = 0;
      var lines = city.roadLines;
      if (target.x >= car.x) {
        _ap.turnX = lines[0];
        lines.forEach(function (L) { if (L <= target.x) _ap.turnX = L; });
      } else {
        _ap.turnX = lines[lines.length - 1];
        lines.forEach(function (L) { if (L >= target.x) _ap.turnX = L; });
      }
    }
    var roadZ = nearestLine(car.z);
    var wx, wz;
    if (_ap.phase === 0) {
      wx = _ap.turnX; wz = roadZ;
      if (Math.abs(car.x - _ap.turnX) < 4) _ap.phase = 1;
    } else if (_ap.phase === 1) {
      wx = _ap.turnX; wz = target.z;
      if (Math.abs(car.z - target.z) < 4) _ap.phase = 2;
    } else { wx = target.x; wz = target.z; }
    var dx = wx - car.x, dz = wz - car.z;
    var desired = Math.atan2(dx, dz);
    var diff = angleDiff(desired, car.heading);
    // brake into hard turns: at full speed the turning radius (~13 units)
    // swings the car off the road and into the block's buildings
    var hardTurn = Math.abs(diff) > 0.4;
    G.keys.KeyW = !hardTurn || Math.abs(car.speed) < 6;
    G.keys.KeyS = hardTurn && Math.abs(car.speed) > 8;
    G.keys.KeyA = diff > 0.12;
    G.keys.KeyD = diff < -0.12;
    G.keys.Space = false;
  }
  function runShot(name) {
    resetDynamic(SEED);
    var P = city.places;
    if (name === 'start') {
      G.mode = 'title';
      $('title-screen').classList.add('on');
      $('btn-continue').style.display = 'none'; // clean cover: start only
      $('hud').classList.remove('on');
      G.camYaw = 0.7; G.camPitch = 0.5; G.camDist = 60;
      var px = P.downtown.x, pz = P.downtown.z;
      camera.position.set(px + 90, 55, pz + 120);
      camera.lookAt(px, 20, pz);
      for (var i = 0; i < 300; i++) { stepTraffic(STEP); stepPeds(STEP); }
      renderer.render(scene, camera);
      renderer.render(scene, camera);
      window.__shotReady = true;
      return;
    }
    // play scenes
    $('title-screen').classList.remove('on');
    $('hud').classList.add('on');
    startGame(false);
    var p = G.player;
    if (name === 'drive' || name === 'chase') {
      var car = nearestCar(60);
      if (!car) car = G.cars[0];
      p.x = car.x + 2; p.z = car.z + 2;
      p.inCar = car; car.kind = 'player'; car.speed = 0;
      car.heading = Math.PI / 2; // east along the road in front of the garage
      playerMesh.visible = false;
      G.camYaw = car.heading + Math.PI;
      var target = { x: 87, z: 116 };
      if (name === 'chase') {
        setWanted(3);
        spawnPoliceCar(); spawnPoliceCar();
        // stage the cruisers on the road behind the player, not inside blocks
        G.policeCars.forEach(function (pc, idx) {
          var rp = city.nearestRoadPoint(car.x - 30 - idx * 14, car.z);
          pc.x = rp.x; pc.z = rp.z;
        });
      }
      var steps = name === 'chase' ? 420 : 600; // drive: the car reaches the yard in ~10s; catch it on arrival
      for (var s = 0; s < steps; s++) {
        autopilotDrive(STEP, target);
        step(STEP);
        if (G.mode !== 'play') break;
      }
      G.keys.KeyW = false; G.keys.KeyA = false; G.keys.KeyD = false; G.keys.KeyS = false; G.keys.Space = false;
    } else if (name === 'heist') {
      G.missionIndex = 7;
      setupMission(7);
      G.mission.stage = 2;
      setWanted(5);
      // open ground by the pier, clear of the cranes: Mara on foot with the
      // docks beacon and the skyline ahead, police closing from the north
      p.x = -14; p.z = 182;
      playerMesh.position.set(p.x, 0, p.z);
      spawnPoliceCar(); spawnPoliceCar(); spawnPoliceCar();
      G.camYaw = Math.PI; G.camPitch = 0.35; // camera on the pier, looking north: Mara, skyline, police closing in
      for (var h = 0; h < 180; h++) step(STEP);
    }
    updateCamera();
    updateHUD();
    drawMinimap();
    renderer.render(scene, camera);
    requestAnimationFrame(function () {
      renderer.render(scene, camera);
      window.__shotReady = true;
    });
  }

  // -------------------------------------------------------------- selftest
  function runSelfTest() {
    var R = [];
    function t(name, ok, info) { R.push({ name: name, pass: !!ok, info: String(info || '') }); }
    function steps(n) { for (var i = 0; i < n; i++) step(STEP); }
    function setKeys(o) { Object.keys(o).forEach(function (k) { G.keys[k] = o[k]; }); }
    try {
      t('1 load offline, no console errors', window.__errors.length === 0 && !!window.THREE && scene.children.length > 40,
        'errors=[' + window.__errors.join('|') + '] sceneChildren=' + scene.children.length);
      startGame(false);
      t('2 title -> start', G.mode === 'play', 'mode=' + G.mode);
      var p0 = { x: G.player.x, z: G.player.z };
      G.camYaw = Math.PI / 2; // face east, open road along the garage front
      setKeys({ KeyW: true }); steps(60); setKeys({ KeyW: false });
      t('3 walk on foot', dist2d(p0.x, p0.z, G.player.x, G.player.z) > 2,
        'moved=' + dist2d(p0.x, p0.z, G.player.x, G.player.z).toFixed(1));
      var parked = G.cars.find(function (c) { return c.kind === 'parked'; });
      G.player.x = parked.x + 2; G.player.z = parked.z + 2;
      playerMesh.position.set(G.player.x, 0, G.player.z);
      tryInteract();
      var inCar = !!G.player.inCar;
      if (inCar) G.player.inCar.heading = Math.PI / 2; // east along the road
      setKeys({ KeyW: true }); steps(120); setKeys({ KeyW: false });
      t('4 enter + drive a car', inCar && Math.abs(G.player.inCar.speed) > 4,
        'inCar=' + inCar + ' speed=' + (G.player.inCar ? G.player.inCar.speed.toFixed(1) : 'n/a'));
      var tc = G.traffic[0];
      var c0 = { x: tc.x, z: tc.z };
      steps(120);
      t('5 traffic cars move', dist2d(c0.x, c0.z, tc.x, tc.z) > 3,
        'moved=' + dist2d(c0.x, c0.z, tc.x, tc.z).toFixed(1));
      var pd = G.peds[0];
      var d0 = { x: pd.x, z: pd.z };
      steps(120);
      t('6 pedestrians move', dist2d(d0.x, d0.z, pd.x, pd.z) > 1,
        'moved=' + dist2d(d0.x, d0.z, pd.x, pd.z).toFixed(1));
      setWanted(0);
      var occ = G.cars.find(function (c) { return c.kind === 'traffic'; });
      if (G.player.inCar) tryInteract();
      G.player.x = occ.x + 2; G.player.z = occ.z + 2;
      playerMesh.position.set(G.player.x, 0, G.player.z);
      tryInteract();
      t('7 steal a car raises wanted', G.wanted >= 1, 'wanted=' + G.wanted);
      setWanted(2);
      var pc0 = G.policeCars.length ? { x: G.policeCars[0].x, z: G.policeCars[0].z } : null;
      steps(60);
      var spawned = G.policeCars.length > 0;
      var pc1 = spawned ? { x: G.policeCars[0].x, z: G.policeCars[0].z } : null;
      steps(240);
      var moved = pc0 && pc1 ? dist2d(pc0.x, pc0.z, G.policeCars[0].x, G.policeCars[0].z) > 2 : spawned;
      var dBefore = pc1 ? dist2d(pc1.x, pc1.z, G.player.x, G.player.z) : 999;
      var dAfter = spawned ? dist2d(G.policeCars[0].x, G.policeCars[0].z, G.player.x, G.player.z) : 999;
      t('8 police chase at wanted >= 1', spawned && (moved || dAfter < dBefore),
        'police=' + G.policeCars.length + ' distBefore=' + dBefore.toFixed(0) + ' distAfter=' + dAfter.toFixed(0));
      if (G.player.inCar) tryInteract();
      G.player.pistolOut = true; G.player.ammo = 30;
      var mesh = makePersonMesh(0x3a3a3a, 0x222222, 0xb08a6a);
      mesh.position.set(G.player.x + 4, 0, G.player.z);
      scene.add(mesh);
      var en = { mesh: mesh, x: G.player.x + 4, z: G.player.z, hp: 60, shootCd: 99, alive: true, walkPhase: 0 };
      G.enemies.push(en);
      G.camYaw = Math.atan2(en.x - G.player.x, en.z - G.player.z);
      updateCamera();
      G.player.shootCd = 0;
      doShoot();
      t('9 on-foot combat works', en.hp < 60, 'enemyHp=' + en.hp);
      scene.remove(en.mesh);
      G.enemies = G.enemies.filter(function (e) { return e !== en; });
      setWanted(0);
      G.missionIndex = 0;
      setupMission(0);
      var cashBefore = G.cash;
      G.player.x = 87; G.player.z = 116;
      playerMesh.position.set(87, 0, 116);
      if (G.player.inCar) { G.player.inCar.kind = 'parked'; G.player.inCar = null; playerMesh.visible = true; }
      steps(3);
      t('10 mission 1 can be completed', G.missionIndex === 1 && G.cash > cashBefore,
        'missionIndex=' + G.missionIndex + ' cash=' + G.cash);
      updateHUD(); drawMinimap();
      var cashTxt = $('cash').textContent;
      var mm = $('minimap').getContext('2d').getImageData(0, 0, 190, 190).data;
      var seen = {};
      for (var i = 0; i < mm.length; i += 400) seen[mm[i] + ',' + mm[i + 1] + ',' + mm[i + 2]] = 1;
      t('11 HUD + minimap update', cashTxt.indexOf('$') === 0 && Object.keys(seen).length > 8,
        'cashTxt=' + cashTxt + ' minimapColors=' + Object.keys(seen).length);
      var savedCash = G.cash, savedMission = G.missionIndex;
      saveGame();
      G.cash = 999999; G.missionIndex = 0;
      var sv = loadSave();
      if (sv) applySave(sv);
      t('12 save/load keeps cash + mission progress', G.cash === savedCash && G.missionIndex === savedMission,
        'cash=' + G.cash + ' mission=' + G.missionIndex);
      pauseGame();
      var px = G.player.x, pz = G.player.z;
      steps(60);
      var frozen = G.player.x === px && G.player.z === pz;
      t('13 pause works', G.mode === 'paused' && frozen, 'mode=' + G.mode + ' frozen=' + frozen);
      resumeGame();
      G.player.health = 5; G.player.invuln = 0;
      damagePlayer(10);
      var wastedOk = G.mode === 'wasted';
      if (endCb) endCb();
      G.player.health = 100; G.player.invuln = 0;
      setWanted(2);
      var cop = spawnCop();
      cop.x = G.player.x + 1; cop.z = G.player.z;
      steps(200);
      var bustedOk = G.mode === 'busted';
      if (endCb) endCb();
      t('14 busted/wasted flows work', wastedOk && bustedOk, 'wasted=' + wastedOk + ' busted=' + bustedOk);
    } catch (err) {
      R.push({ name: 'exception', pass: false, info: String(err && err.stack || err) });
    }
    $('test-results').textContent = JSON.stringify(R);
    window.__testDone = true;
    window.__testResults = R;
  }

  // ------------------------------------------------------------------ boot
  function frame(now) {
    requestAnimationFrame(frame);
    var dtMs = now - clockLast;
    clockLast = now;
    if (G.mode === 'play' || G.mode === 'title') {
      var acc = Math.min(dtMs / 1000, 0.25), n = 0;
      while (acc >= STEP && n < 6) { step(STEP); acc -= STEP; n++; }
    }
    updateCamera();
    renderer.render(scene, camera);
  }

  function boot() {
    buildWorld();
    G._camera = camera; G._scene = scene; // debug handles for scripted probes
    bindInput();
    var s = loadSave();
    if (s) $('btn-continue').style.display = 'inline-block';
    updateHUD();
    if (SELFTEST) {
      runSelfTest();
      return;
    }
    if (shotName) { runShot(shotName); return; }
    // title screen: slow orbit over the city
    G.camYaw = 0.8; G.camPitch = 0.45;
    requestAnimationFrame(frame);
  }

  try { boot(); } catch (e) {
    window.__errors.push(String(e && e.message || e));
    throw e;
  }
})();
