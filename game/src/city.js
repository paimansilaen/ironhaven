// Ironhaven: a rain-slicked industrial port city at dusk, built from a seeded
// RNG so ?seed=N always lays out the same streets. A 7x7 road grid (pitch 58),
// container yards and cranes by the harbor to the south, a rust-belt downtown,
// Voss Auto garage, a safehouse, the Meridian tower vault and the docks.
// Exports buildCity(scene, rng) -> { colliders, places, roadLines, P, bounds }.
var CITY = (function () {
  var P = 58;                 // road pitch
  var ROAD_HALF = 7;          // half road width
  var LINES = [-3, -2, -1, 0, 1, 2, 3].map(function (k) { return k * P; });
  var BOUND = 200;            // playable half-extent (land)
  var HARBOR_Z = 205;         // water starts here (south edge)

  function facadeTexture(rng, base, lit) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (var y = 10; y < 246; y += 22) {
      for (var x = 10; x < 118; x += 18) {
        var on = rng() < 0.42;
        g.fillStyle = on ? lit : 'rgba(8,10,16,0.9)';
        g.fillRect(x, y, 11, 14);
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function groundTexture() {
    var S = 1024, W = 420; // world span mapped to the canvas
    var c = document.createElement('canvas'); c.width = S; c.height = S;
    var g = c.getContext('2d');
    function wx(x) { return (x + W / 2) / W * S; }
    function wz(z) { return (z + W / 2) / W * S; }
    g.fillStyle = '#262a33'; g.fillRect(0, 0, S, S);           // sidewalk base
    // blocks
    g.fillStyle = '#2f333d';
    for (var bi = -3; bi <= 2; bi++) for (var bj = -3; bj <= 2; bj++) {
      g.fillRect(wx(bi * P + ROAD_HALF), wz(bj * P + ROAD_HALF), (P - 2 * ROAD_HALF) / W * S, (P - 2 * ROAD_HALF) / W * S);
    }
    // roads
    g.fillStyle = '#171a20';
    LINES.forEach(function (v) {
      g.fillRect(0, wz(v - ROAD_HALF), S, ROAD_HALF * 2 / W * S);
      g.fillRect(wx(v - ROAD_HALF), 0, ROAD_HALF * 2 / W * S, S);
    });
    // centre dashes
    g.fillStyle = '#c9a227';
    LINES.forEach(function (v) {
      for (var t = -200; t < 200; t += 16) {
        g.fillRect(wx(t), wz(v) - 1, 8 / W * S, 2);
        g.fillRect(wx(v) - 1, wz(t), 2, 8 / W * S);
      }
    });
    // crosswalks at intersections
    g.fillStyle = 'rgba(220,220,210,0.5)';
    LINES.forEach(function (a) { LINES.forEach(function (b) {
      for (var i = -2; i <= 2; i++) {
        g.fillRect(wx(a + i * 2.4) - 1, wz(b - ROAD_HALF), 2, 3);
        g.fillRect(wx(a - ROAD_HALF), wz(b + i * 2.4) - 1, 3, 2);
      }
    }); });
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  function buildCity(scene, rng) {
    var colliders = [];
    var group = new THREE.Group();
    scene.add(group);

    var facadeA = facadeTexture(rng, '#3a3f4a', '#ffd28a');
    var facadeB = facadeTexture(rng, '#4a3b32', '#ffb36b');
    var facadeC = facadeTexture(rng, '#2e3a44', '#9fd8ff');
    var mats = [facadeA, facadeB, facadeC].map(function (t) {
      return new THREE.MeshLambertMaterial({ map: t });
    });
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x1c1f26 });
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);

    // Ground + water
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 415),
      new THREE.MeshLambertMaterial({ map: groundTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -2.5);
    group.add(ground);
    var water = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 130),
      new THREE.MeshLambertMaterial({ color: 0x0d2836 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.4, HARBOR_Z + 62);
    group.add(water);

    function addBox(x, z, w, h, d, mat, collide) {
      var m = new THREE.Mesh(boxGeo, mat || roofMat);
      m.scale.set(w, h, d);
      m.position.set(x, h / 2, z);
      group.add(m);
      if (collide !== false) colliders.push({ x: x, z: z, hx: w / 2, hz: d / 2 });
      return m;
    }

    // Special places (named once, reused by missions).
    var places = {
      garage: { x: -87, z: 29 },      // Voss Auto, block (-2, 0)
      safehouse: { x: 145, z: -87 },  // block (2, -2)
      vault: { x: 29, z: 29 },        // Meridian tower, block (0, 0)
      warehouse: { x: -29, z: 145 },  // block (-1, 2)
      yard: { x: 87, z: 145 },        // container yard, block (1, 2)
      docks: { x: 0, z: 192 },        // pier at the harbor
      downtown: { x: 29, z: -29 },
    };

    // Ordinary blocks: 1-3 buildings each; taller near the centre.
    var special = { '-2,0': 1, '2,-2': 1, '0,0': 1, '-1,2': 1, '1,2': 1, '2,2': 1, '0,2': 1, '-3,-3': 1 };
    for (var bi = -3; bi <= 2; bi++) for (var bj = -3; bj <= 2; bj++) {
      if (special[bi + ',' + bj]) continue;
      var cx = (bi + 0.5) * P, cz = (bj + 0.5) * P;
      var distC = Math.abs(cx) + Math.abs(cz);
      var n = rng() < 0.5 ? 2 : 1;
      for (var k = 0; k < n; k++) {
        var w = 14 + rng() * 18, d = 14 + rng() * 18;
        var h = 8 + rng() * (distC < 90 ? 30 : 14);
        var ox = n === 1 ? 0 : (k === 0 ? -9 : 9);
        var oz = n === 1 ? 0 : (k === 0 ? -8 : 8);
        var mat = pick(rng, mats);
        var b = addBox(cx + ox, cz + oz, w, h, d, mat, true);
        b.material = mat;
        // rooftop box for silhouette variety
        if (rng() < 0.5) addBox(cx + ox, cz + oz, w * 0.4, 2, d * 0.4, roofMat, false).position.y = h + 1;
      }
    }

    // Voss Auto garage: low wide building + sign board.
    addBox(places.garage.x, places.garage.z, 34, 7, 24, new THREE.MeshLambertMaterial({ color: 0x5a4632 }), true);
    var sign = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffd75e }));
    sign.scale.set(20, 2.2, 0.6); sign.position.set(places.garage.x, 8.2, places.garage.z - 11);
    group.add(sign);

    // Safehouse: small house with a warm porch light.
    addBox(places.safehouse.x, places.safehouse.z, 16, 7, 14, new THREE.MeshLambertMaterial({ color: 0x44503e }), true);
    var porch = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
    porch.position.set(places.safehouse.x, 4, places.safehouse.z - 7.5);
    group.add(porch);

    // Meridian Development tower (the vault): tall glass slab.
    addBox(places.vault.x, places.vault.z, 26, 64, 26, mats[2], true);
    addBox(places.vault.x, places.vault.z, 30, 2, 30, roofMat, false).position.y = 65;

    // Warehouse (mission 6): long rust-red shed.
    addBox(places.warehouse.x, places.warehouse.z, 36, 10, 22, new THREE.MeshLambertMaterial({ color: 0x6e3a2e }), true);

    // Container yard: stacks of coloured shipping containers.
    var contCols = [0x9e3b2e, 0x2e5d8a, 0x3f7a3a, 0xc7a23a, 0x6b4a8a];
    [[87, 145], [145, 145], [29, 145]].forEach(function (c) {
      for (var i = 0; i < 5; i++) {
        var sx = c[0] - 14 + (i % 3) * 13, sz = c[1] - 8 + Math.floor(i / 3) * 13;
        var stack = 1 + Math.floor(rng() * 3);
        for (var s = 0; s < stack; s++) {
          var cm = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: pick(rng, contCols) }));
          cm.scale.set(11, 2.6, 5.5);
          cm.position.set(sx, 1.3 + s * 2.6, sz);
          group.add(cm);
        }
        colliders.push({ x: sx, z: sz, hx: 5.5, hz: 2.8 });
      }
    });

    // Harbor cranes (gantry): legs + beam + hook cable.
    var craneMat = new THREE.MeshLambertMaterial({ color: 0xc7a23a });
    [-120, 0, 120].forEach(function (x) {
      addBox(x - 6, 186, 2, 26, 2, craneMat, true);
      addBox(x + 6, 186, 2, 26, 2, craneMat, true);
      var beam = new THREE.Mesh(boxGeo, craneMat);
      beam.scale.set(26, 2, 3); beam.position.set(x, 26, 186);
      group.add(beam);
      var cable = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
      cable.scale.set(0.3, 10, 0.3); cable.position.set(x + 8, 20, 186);
      group.add(cable);
    });

    // Harbor bridge over the water at x = 0, with two towers.
    var deck = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
    deck.scale.set(16, 1.5, 110); deck.position.set(0, 3, HARBOR_Z + 52);
    group.add(deck);
    addBox(-9, HARBOR_Z + 40, 2, 22, 2, craneMat, true);
    addBox(9, HARBOR_Z + 40, 2, 22, 2, craneMat, true);
    addBox(-9, HARBOR_Z + 80, 2, 22, 2, craneMat, true);
    addBox(9, HARBOR_Z + 80, 2, 22, 2, craneMat, true);

    // Docks pier.
    var pier = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x4a3b28 }));
    pier.scale.set(46, 1.2, 16); pier.position.set(0, 0.6, 198);
    group.add(pier);

    // Park in the north-west corner: trees + benches.
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3524 });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x2e5230 });
    for (var t = 0; t < 8; t++) {
      var tx = -160 + (t % 4) * 12, tz = -160 + Math.floor(t / 4) * 14;
      var trunk = new THREE.Mesh(boxGeo, trunkMat);
      trunk.scale.set(0.8, 3, 0.8); trunk.position.set(tx, 1.5, tz);
      group.add(trunk);
      var leaf = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), leafMat);
      leaf.position.set(tx, 4.6, tz);
      group.add(leaf);
      colliders.push({ x: tx, z: tz, hx: 0.6, hz: 0.6 });
    }

    // Street lamps along the roads (emissive heads, no extra lights).
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    LINES.forEach(function (v) { LINES.forEach(function (w) {
      if ((Math.abs(v) + Math.abs(w)) % 116 !== 0) return;
      var pole = new THREE.Mesh(boxGeo, poleMat);
      pole.scale.set(0.3, 6, 0.3); pole.position.set(v + 8.5, 3, w + 8.5);
      group.add(pole);
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
      lamp.position.set(v + 8.5, 6.2, w + 8.5);
      group.add(lamp);
    }); });

    // Collision helpers -------------------------------------------------
    function collideCircle(x, z, r) {
      // Push a circle out of every AABB it overlaps; returns corrected {x, z}.
      for (var i = 0; i < colliders.length; i++) {
        var c = colliders[i];
        var nx = clamp(x, c.x - c.hx, c.x + c.hx);
        var nz = clamp(z, c.z - c.hz, c.z + c.hz);
        var dx = x - nx, dz = z - nz;
        var d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 < 1e-6) { x = c.x + c.hx + r; continue; }
          var d = Math.sqrt(d2);
          x = nx + dx / d * r; z = nz + dz / d * r;
        }
      }
      x = clamp(x, -BOUND, BOUND);
      z = clamp(z, -BOUND, 196);
      return { x: x, z: z };
    }
    function nearestRoadPoint(x, z) {
      var best = null, bd = 1e9;
      LINES.forEach(function (v) {
        var d = Math.abs(x - v); if (d < bd) { bd = d; best = { x: v, z: clamp(z, -BOUND, BOUND) }; }
        d = Math.abs(z - v); if (d < bd) { bd = d; best = { x: clamp(x, -BOUND, BOUND), z: v }; }
      });
      return best;
    }
    function randomRoadPoint(rng2) {
      var v = pick(rng2, LINES);
      var along = -BOUND + rng2() * BOUND * 2;
      if (rng2() < 0.5) return { x: v + (rng2() < 0.5 ? -3.5 : 3.5), z: along, axis: 'z', dir: rng2() < 0.5 ? 1 : -1 };
      return { x: along, z: v + (rng2() < 0.5 ? -3.5 : 3.5), axis: 'x', dir: rng2() < 0.5 ? 1 : -1 };
    }
    function isOnRoad(x, z) {
      for (var i = 0; i < LINES.length; i++) {
        if (Math.abs(x - LINES[i]) < ROAD_HALF + 1) return true;
        if (Math.abs(z - LINES[i]) < ROAD_HALF + 1) return true;
      }
      return false;
    }

    return {
      colliders: colliders, places: places, roadLines: LINES, P: P,
      bounds: BOUND, harborZ: HARBOR_Z,
      collideCircle: collideCircle, nearestRoadPoint: nearestRoadPoint,
      randomRoadPoint: randomRoadPoint, isOnRoad: isOnRoad,
    };
  }

  return { buildCity: buildCity, P: P, roadLines: LINES, BOUND: BOUND };
})();
