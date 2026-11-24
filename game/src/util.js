// Ironhaven — shared helpers and the IH namespace. Every game module attaches here.
window.IH = window.IH || {};

(function () {
  // Deterministic RNG (mulberry32) so ?seed= gives the same city and the same shots.
  IH.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  IH.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  IH.lerp = (a, b, t) => a + (b - a) * t;
  IH.rand = (rng, lo, hi) => lo + rng() * (hi - lo);
  IH.pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  IH.dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  // Shortest signed angle from a to b, in (-PI, PI].
  IH.angleDiff = function (a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d <= -Math.PI) d += Math.PI * 2;
    return d;
  };

  // A canvas texture drawn once by `draw(ctx, w, h)`.
  IH.canvasTexture = function (w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };

  // Push a circle (x,z,r) out of an axis-aligned box; returns true if it touched.
  IH.pushOutAABB = function (pos, r, box) {
    const cx = IH.clamp(pos.x, box.minX, box.maxX);
    const cz = IH.clamp(pos.z, box.minZ, box.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    } else {
      // Centre inside the box: shove out along the smallest penetration axis.
      const pl = pos.x - box.minX, pr = box.maxX - pos.x;
      const pt = pos.z - box.minZ, pb = box.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = box.minX - r;
      else if (m === pr) pos.x = box.maxX + r;
      else if (m === pt) pos.z = box.minZ - r;
      else pos.z = box.maxZ + r;
    }
    return true;
  };

  IH.fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
  IH.fmtTime = (s) => {
    const m = Math.floor(s / 60), ss = Math.ceil(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  };
})();
