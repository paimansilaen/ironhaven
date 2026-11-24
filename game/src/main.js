// Ironhaven — boot, the frame loop, the player, the camera, saves, and the self-test.
(function () {
  const params = new URLSearchParams(window.location.search);
  const shotName = params.get('shot');
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
  const selftest = params.get('selftest') === '1';
  const SAVE_KEY = 'ironhaven-save-v1';

  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const G = {
    scene: null, camera: new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900),
    time: 0, screen: 'title', seed,
    player: null, playerCar: null, headlight: null, beacon: null,
    traffic: [], peds: [], policeCars: [], footCops: [], thugs: [], pickups: [], allCars: [],
    wanted: 0, wantedTimer: 0, spawnCd: 0, copSpawnCd: 0, hitPoliceCd: 0,
    cash: 0, debt: IH.totalDebt, missionIndex: 0, mission: null, missionState: null, missionTimer: null,
    camYaw: 0, camPitch: 0.32, camDist: 9, lastShotAt: null, lastShotTime: -99,
    missionCar: null, tailCar: null, grabCash: false, simulate: false,
    city: null,
  };
  window.__game = G;
  G.renderer = renderer;

  // HUD helpers live on IH; the other modules call them through G.
  G.hudToast = (m) => IH.hudToast(m);
  G.hudObjective = (t) => IH.hudObjective(t);

  // --- save / load ----------------------------------------------------------
  G.saveGame = function () {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: G.cash, debt: G.debt, mission: G.missionIndex }));
    } catch (e) { /* storage off: progress lasts this visit only */ }
  };
  G.loadSave = function () {
    try {
      const s = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
      return s && typeof s.cash === 'number' ? s : null;
    } catch (e) { return null; }
  };
  G.clearSave = function () { try { window.localStorage.removeItem(SAVE_KEY); } catch (e) {} };

  // --- world setup ----------------------------------------------------------
  G.resetWorld = function (sd) {
    G.scene = new THREE.Scene();
    G.time = 0;
    G.traffic = []; G.peds = []; G.policeCars = []; G.footCops = []; G.thugs = [];
    G.pickups = []; G.allCars = [];
    G.wanted = 0; G.wantedTimer = 0; G.spawnCd = 0; G.copSpawnCd = 0; G.hitPoliceCd = 0;
    G.cash = 0; G.debt = IH.totalDebt; G.missionIndex = 0;
    G.mission = null; G.missionState = null; G.missionTimer = null;
    G.playerCar = null; G.missionCar = null; G.tailCar = null; G.grabCash = false;
    IH.cityBuild(G, sd);
    const rng = IH.mulberry32(sd + 7);
    IH.spawnTraffic(G, rng, 14);
    IH.spawnPedestrians(G, rng, 18);
    IH.spawnPickups(G, rng);
    G.beacon = IH.makeBeacon(G);
    // Mara Voss, on foot on the road outside Voss Auto.
    const p = IH.makePerson(G, 0, 120, { shirt: 0xc22e3a, pants: 0x1e2a3a });
    G.player = {
      mesh: p.mesh, heading: Math.PI, speed: 0, health: 100,
      ammo: IH.MAG_SIZE, reserveAmmo: 48, punchCd: 0, fireCd: 0, reloadT: 0,
      inCar: false, punchAnim: 0,
    };
    // Her own sedan, parked by the garage — taking it costs no wanted level.
    const own = IH.makeCar(G, 'sedan', 8, 120, Math.PI);
    own.owned = true;
    G.allCars.push(own);
    // One headlight spotlight, following the player's car.
    const spot = new THREE.SpotLight(0xffe9a8, 90, 48, 0.55, 0.5, 1.2);
    G.scene.add(spot); G.scene.add(spot.target);
    G.headlight = spot;
    G.camYaw = Math.PI;
    G.screen = 'title';
  };

  G.startNewGame = function () {
    G.cash = 0; G.debt = IH.totalDebt; G.missionIndex = 0;
    G.player.health = 100; G.player.ammo = IH.MAG_SIZE; G.player.reserveAmmo = 48;
    G.player.mesh.position.set(0, 0, 120);
    G.player.heading = Math.PI;
    G.wanted = 0;
    G.screen = 'play';
    IH.startMission(G, 0);
    IH.hudShow(G, 'play');
  };

  G.startContinue = function () {
    const s = G.loadSave();
    if (!s) { G.startNewGame(); return; }
    G.cash = s.cash; G.debt = s.debt; G.missionIndex = Math.min(s.mission, IH.missionDefs.length - 1);
    G.player.health = 100; G.player.ammo = IH.MAG_SIZE; G.player.reserveAmmo = 48;
    G.player.mesh.position.set(0, 0, 120);
    G.player.heading = Math.PI;
    G.wanted = 0;
    G.screen = 'play';
    IH.startMission(G, G.missionIndex);
    IH.hudShow(G, 'play');
    IH.hudToast('Welcome back, Mara. Debt left: ' + IH.fmtMoney(G.debt));
  };

  G.busted = function () {
    if (G.screen !== 'play') return;
    G.screen = 'busted';
    IH.audio.fail();
    IH.hudShow(G, 'busted');
  };

  G.wasted = function () {
    if (G.screen !== 'play') return;
    G.screen = 'wasted';
    IH.audio.fail();
    IH.hudShow(G, 'wasted');
  };

  G.storyComplete = function () {
    G.screen = 'complete';
    G.beacon.visible = false;
    IH.audio.sting();
    G.clearSave();
    IH.hudShow(G, 'complete');
  };

  G.retry = function () {
    G.player.health = 100;
    G.player.ammo = IH.MAG_SIZE;
    G.player.reserveAmmo = 48;
    if (G.playerCar) { G.playerCar = null; G.player.inCar = false; G.player.mesh.visible = true; }
    // Clear the heat entirely: every cop and patrol car leaves the scene.
    for (const c of G.footCops) G.scene.remove(c.mesh);
    G.footCops = [];
    for (const c of G.policeCars) { G.scene.remove(c.mesh); G.allCars.splice(G.allCars.indexOf(c), 1); }
    G.policeCars = [];
    G.player.mesh.position.set(0, 0, 120);
    G.player.heading = Math.PI;
    IH.setWanted(G, 0);
    G.screen = 'play';
    IH.startMission(G, G.missionIndex);
    IH.hudShow(G, 'play');
  };

  // --- entering and leaving cars --------------------------------------------
  G.enterCar = function (car) {
    if (car.isTraffic) {
      IH.raiseWanted(G, 'car stolen');
      const i = G.traffic.indexOf(car);
      if (i >= 0) G.traffic.splice(i, 1);
      car.isTraffic = false;
    } else if (car.isPolice || car.marked) {
      IH.raiseWanted(G, 'car stolen');
    }
    car.stolen = true;
    G.playerCar = car;
    G.player.inCar = true;
    G.player.mesh.visible = false;
    G.camYaw = car.heading;
    IH.audio.blip(330, 0.1, 'triangle', 0.1);
  };

  G.exitCar = function () {
    const car = G.playerCar;
    if (!car) return;
    const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
    G.player.mesh.position.set(car.mesh.position.x + rx * 2.4, 0, car.mesh.position.z + rz * 2.4);
    G.player.heading = car.heading;
    G.player.mesh.visible = true;
    G.player.inCar = false;
    G.playerCar = null;
  };

  G.nearestCar = function () {
    const pp = G.player.mesh.position;
    let best = null, bestD = 4.5;
    for (const car of G.allCars) {
      const d = IH.dist2d(pp.x, pp.z, car.mesh.position.x, car.mesh.position.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  };

  // --- the world step (logic only; rendering is separate) -------------------
  IH.updateWorld = function (dt, input) {
    G.time += dt;
    IH.cityUpdate(G, dt);
    IH.updateTraffic(G, dt);
    IH.updatePedestrians(G, dt);
    IH.updatePickups(G, dt);
    if (G.screen !== 'play') return;
    const p = G.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.punchAnim = Math.max(0, p.punchAnim - dt);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        const need = IH.MAG_SIZE - p.ammo;
        const take = Math.min(need, p.reserveAmmo);
        p.ammo += take; p.reserveAmmo -= take;
      }
    }
    if (input.punch) IH.punch(G);
    if (input.shoot) IH.shoot(G);
    if (input.reload && p.reloadT <= 0 && p.ammo < IH.MAG_SIZE && p.reserveAmmo > 0) p.reloadT = 1.2;

    if (G.playerCar) {
      const car = G.playerCar;
      IH.driveCar(G, car, {
        accel: !!input.fwd, brake: !!input.back,
        steer: input.steer != null ? input.steer : (input.left ? 1 : 0) + (input.right ? -1 : 0),
        handbrake: !!input.handbrake,
      }, dt);
      // Hitting a pedestrian with the car.
      for (const ped of G.peds) {
        if (ped.dead) continue;
        if (Math.abs(car.speed) > 3 &&
          IH.dist2d(car.mesh.position.x, car.mesh.position.z, ped.mesh.position.x, ped.mesh.position.z) < 2.2) {
          ped.dead = true;
          ped.mesh.rotation.x = -Math.PI / 2;
          ped.mesh.position.y = 0.35;
          car.speed *= 0.7;
          IH.raiseWanted(G, 'pedestrian hit');
        }
      }
      // Ramming a police car raises the heat (once per 3 s).
      G.hitPoliceCd -= dt;
      for (const pc of G.policeCars) {
        if (pc.retire) continue;
        if (G.hitPoliceCd <= 0 && Math.abs(car.speed) > 5 &&
          IH.dist2d(car.mesh.position.x, car.mesh.position.z, pc.mesh.position.x, pc.mesh.position.z) < 4.2) {
          G.hitPoliceCd = 3;
          IH.raiseWanted(G, 'you hit a police car');
        }
      }
    } else {
      // On foot: WASD relative to the camera.
      const fx = Math.sin(G.camYaw), fz = Math.cos(G.camYaw);
      const rx = -Math.cos(G.camYaw), rz = Math.sin(G.camYaw);
      let mx = fx * ((input.fwd ? 1 : 0) - (input.back ? 1 : 0)) + rx * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
      let mz = fz * ((input.fwd ? 1 : 0) - (input.back ? 1 : 0)) + rz * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        mx /= len; mz /= len;
        p.heading = Math.atan2(mx, mz);
        p.speed = input.sprint ? 7 : 4;
        p.mesh.position.x += mx * p.speed * dt;
        p.mesh.position.z += mz * p.speed * dt;
      } else p.speed = 0;
      p.mesh.rotation.y = p.heading;
      IH.cityCollide(G, p.mesh.position, 0.5);
      // Punch swing: lean the body forward briefly.
      p.mesh.rotation.x = p.punchAnim > 0 ? -0.25 : 0;
      p.mesh.position.y = len > 0.01 ? Math.abs(Math.sin(G.time * 9)) * 0.06 : 0;
    }

    IH.updateThugs(G, dt);
    IH.updatePolice(G, dt);
    IH.updateMissions(G, dt);
    if (G.missionTimer != null && G.missionIndex !== 0) G.missionTimer = null;

    if (p.health <= 0) { G.wasted(); return; }

    // Audio follows the action.
    IH.audio.engine(G.playerCar ? G.playerCar.speed : 0, !!G.playerCar);
    const policeNear = G.policeCars.some((c) => !c.retire &&
      IH.dist2d(c.mesh.position.x, c.mesh.position.z, p.mesh.position.x, p.mesh.position.z) < 70);
    IH.audio.siren(G.wanted > 0 && policeNear, dt);
  };

  // --- camera ----------------------------------------------------------------
  function updateCamera(dt, snap) {
    const target = G.playerCar ? G.playerCar.mesh.position : G.player.mesh.position;
    const dist = G.playerCar ? 12 : G.camDist;
    const height = G.playerCar ? 5 : 3.2;
    if (G.screen === 'title') {
      // Slow orbit around the garage for the title screen.
      const a = G.time * 0.08;
      G.camera.position.set(Math.sin(a) * 26, 10, 120 + Math.cos(a) * 26);
      G.camera.lookAt(0, 3, 120);
      return;
    }
    const cx = target.x - Math.sin(G.camYaw) * dist;
    const cz = target.z - Math.cos(G.camYaw) * dist;
    if (snap) {
      G.camera.position.set(cx, height, cz);
    } else {
      G.camera.position.x = IH.lerp(G.camera.position.x, cx, Math.min(1, dt * 8));
      G.camera.position.y = IH.lerp(G.camera.position.y, height, Math.min(1, dt * 8));
      G.camera.position.z = IH.lerp(G.camera.position.z, cz, Math.min(1, dt * 8));
    }
    G.camera.lookAt(target.x, target.y + 1.6, target.z);
  }

  function render() {
    updateCamera(1 / 60);
    renderer.render(G.scene, G.camera);
    if (G.screen === 'play') IH.hudUpdate(G);
  }

  // --- input -----------------------------------------------------------------
  const keys = {};
  const edge = {};
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    edge[e.code] = true;
    if (e.code === 'Escape') {
      if (G.screen === 'play') { G.screen = 'pause'; IH.hudShow(G, 'pause'); }
      else if (G.screen === 'pause') { G.screen = 'play'; IH.hudShow(G, 'play'); }
    }
    if (e.code === 'KeyE' && G.screen === 'play') {
      if (G.playerCar) G.exitCar();
      else {
        const car = G.nearestCar();
        if (car) G.enterCar(car);
        else if (G.missionIndex === 7 && G.missionState && G.missionState.phase === 1) G.grabCash = true;
      }
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  let dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = downX = e.clientX; lastY = downY = e.clientY;
    IH.audio.init();
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    G.camYaw -= (e.clientX - lastX) * 0.005;
    G.camPitch = IH.clamp(G.camPitch + (e.clientY - lastY) * 0.003, 0.12, 0.9);
    lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('pointerup', (e) => {
    if (dragging && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) {
      edge.mouse = true; // a click, not a drag: fire the pistol
    }
    dragging = false;
  });
  canvas.addEventListener('wheel', (e) => {
    G.camDist = IH.clamp(G.camDist + Math.sign(e.deltaY), 5, 15);
    e.preventDefault();
  }, { passive: false });

  function readInput() {
    const input = {
      fwd: keys.KeyW || keys.ArrowUp, back: keys.KeyS || keys.ArrowDown,
      left: keys.KeyA || keys.ArrowLeft, right: keys.KeyD || keys.ArrowRight,
      sprint: keys.ShiftLeft || keys.ShiftRight, handbrake: keys.Space,
      punch: !!edge.KeyF, shoot: !!edge.mouse, reload: !!edge.KeyR,
    };
    for (const k in edge) edge[k] = false;
    return input;
  }

  // --- buttons ---------------------------------------------------------------
  function wire(id, fn) { const b = document.getElementById(id); if (b) b.addEventListener('click', () => { IH.audio.init(); fn(); }); }
  wire('btn-start', () => G.startNewGame());
  wire('btn-continue', () => G.startContinue());
  wire('btn-resume', () => { G.screen = 'play'; IH.hudShow(G, 'play'); });
  wire('btn-restart', () => { G.screen = 'play'; IH.hudShow(G, 'play'); IH.startMission(G, G.missionIndex); });
  wire('btn-retry-busted', () => G.retry());
  wire('btn-retry-wasted', () => G.retry());
  wire('btn-again', () => { G.resetWorld(G.seed); G.startNewGame(); });
  wire('btn-title-busted', () => { G.resetWorld(G.seed); G.screen = 'title'; IH.hudShow(G, 'title'); });
  wire('btn-title-wasted', () => { G.resetWorld(G.seed); G.screen = 'title'; IH.hudShow(G, 'title'); });

  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- the frame loop --------------------------------------------------------
  // One tick: advance the world only on play/title screens; paused, busted,
  // wasted and complete are frozen. The self-test calls this directly.
  G.frameTick = function (dt) {
    if (G.screen === 'play') IH.updateWorld(dt, readInput());
    else if (G.screen === 'title') IH.updateWorld(dt, {});
    render();
    const dmg = document.getElementById('damage');
    if (dmg) dmg.style.opacity = String(Math.max(0, parseFloat(dmg.style.opacity || '0') - dt * 1.5));
  };
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    G.frameTick(dt);
  }
  G.hudFlash = function () {
    const dmg = document.getElementById('damage');
    if (dmg) dmg.style.opacity = '0.45';
  };

  // --- boot ------------------------------------------------------------------
  G.resetWorld(seed);
  IH.hudShow(G, 'title');

  if (shotName) {
    G.simulate = true;
    const screen = IH.stageShot(G, shotName);
    G.simulate = false;
    G.screen = screen === 'title' ? 'title' : 'play';
    IH.hudShow(G, G.screen);
    updateCamera(1 / 60, true); // snap the camera into place before painting
    let painted = 0;
    (function paint() {
      render();
      painted += 1;
      if (painted < 2) requestAnimationFrame(paint);
      else window.__shotReady = true;
    })();
  } else {
    requestAnimationFrame(frame);
    if (selftest) setTimeout(runSelftest, 300);
  }

  // --- self-test -------------------------------------------------------------
  function runSelftest() {
    const results = [];
    function check(name, fn) {
      try { const r = fn(); results.push({ name, pass: !!r, note: typeof r === 'string' ? r : '' }); }
      catch (e) { results.push({ name, pass: false, note: String(e.message || e) }); }
    }
    const step = (n, input) => { for (let i = 0; i < n; i++) IH.updateWorld(1 / 30, input || {}); };
    check('1 loads offline, zero console errors', () => window.__errors.length === 0 && !!G.scene);
    G.startNewGame();
    check('2 title -> start', () => G.screen === 'play' && G.missionIndex === 0);
    const px0 = G.player.mesh.position.x, pz0 = G.player.mesh.position.z;
    step(30, { fwd: true });
    check('3 walk on foot', () => IH.dist2d(px0, pz0, G.player.mesh.position.x, G.player.mesh.position.z) > 1);
    const car = IH.makeCar(G, 'sedan', G.player.mesh.position.x + 2, G.player.mesh.position.z, 0);
    car.owned = true; G.allCars.push(car);
    G.enterCar(car);
    const cx0 = car.mesh.position.x, cz0 = car.mesh.position.z;
    step(60, { fwd: true });
    check('4 enter + drive a car', () => Math.abs(car.speed) > 5 && IH.dist2d(cx0, cz0, car.mesh.position.x, car.mesh.position.z) > 5);
    const t0 = G.traffic[0].mesh.position.clone();
    step(30, { fwd: true });
    check('5 traffic moves', () => t0.distanceTo(G.traffic[0].mesh.position) > 0.5);
    const p0 = G.peds[0].mesh.position.clone();
    step(30, {});
    check('6 pedestrians move', () => p0.distanceTo(G.peds[0].mesh.position) > 0.2);
    G.exitCar();
    const tc = IH.makeCar(G, 'taxi', G.player.mesh.position.x + 2, G.player.mesh.position.z, 0);
    tc.isTraffic = true;
    tc.waypoints = [{ x: 0, z: 120 }, { x: 0, z: -120 }];
    tc.wpIndex = 0;
    G.allCars.push(tc); G.traffic.push(tc);
    const w0 = G.wanted;
    G.enterCar(tc);
    check('7 stealing raises wanted', () => G.wanted > w0);
    step(150, { fwd: true });
    check('8 police chase at wanted >= 1', () => {
      const live = G.policeCars.filter((c) => !c.retire);
      if (live.length === 0) return 'no police car spawned';
      const d = IH.dist2d(live[0].mesh.position.x, live[0].mesh.position.z,
        G.playerCar.mesh.position.x, G.playerCar.mesh.position.z);
      return d < 120 || 'police too far: ' + Math.round(d) + 'm';
    });
    G.exitCar();
    const thug = IH.makePerson(G, G.player.mesh.position.x + 1.5, G.player.mesh.position.z + 1, { thug: true, health: 100 });
    thug.shootCd = 99;
    G.thugs.push(thug);
    G.player.heading = Math.atan2(
      thug.mesh.position.x - G.player.mesh.position.x,
      thug.mesh.position.z - G.player.mesh.position.z);
    const hp0 = thug.health;
    IH.punch(G);
    check('9 on-foot combat damages an enemy', () => thug.health < hp0);
    // Mission 1: teleport the player to the docks marker and let the check fire.
    G.missionIndex = 0;
    IH.startMission(G, 0);
    const cash0 = G.cash;
    G.player.mesh.position.set(G.city.places.docks.x, 0, G.city.places.docks.z);
    step(3, {});
    check('10 mission 1 completable with cash reward', () => G.missionIndex === 1 && G.cash === cash0 + 1850);
    IH.hudUpdate(G);
    check('11 HUD + minimap update', () => {
      const cashEl = document.getElementById('cash');
      return cashEl && cashEl.textContent === IH.fmtMoney(G.cash);
    });
    G.saveGame();
    const s = G.loadSave();
    check('12 save/load restores cash + mission', () => s && s.cash === G.cash && s.mission === G.missionIndex);
    G.screen = 'pause';
    const tp = G.traffic[0].mesh.position.clone();
    G.frameTick(0.5); // a tick while paused must not move anything
    check('13 pause freezes', () => {
      const still = tp.distanceTo(G.traffic[0].mesh.position) < 0.001;
      G.screen = 'play';
      return still || 'traffic moved while paused';
    });
    // Busted: a cop touches the slow on-foot player.
    G.screen = 'play';
    const cop = IH.makePerson(G, G.player.mesh.position.x + 0.5, G.player.mesh.position.z, { cop: true });
    G.footCops.push(cop);
    G.player.speed = 0;
    step(3, {});
    const busted = G.screen === 'busted';
    if (busted) G.retry();
    G.player.health = 1;
    G.player.health = 0;
    step(1, {});
    const wasted = G.screen === 'wasted';
    check('14 busted AND wasted flows', () => (busted && wasted) || ('busted=' + busted + ' wasted=' + wasted));
    window.__selftest = { pass: results.filter((r) => r.pass).length, total: results.length, results };
    window.__selftestDone = true;
  }
  IH.runSelftest = runSelftest;
})();
