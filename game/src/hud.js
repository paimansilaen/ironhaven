// Ironhaven — the HUD: health, cash, debt, stars, objective, speed, minimap, menus, toasts.
(function () {
  function el(id) { return document.getElementById(id); }

  function drawMinimap(G) {
    const c = el('minimap');
    if (!c) return;
    const ctx = c.getContext('2d');
    const S = c.width, HALF = 200, scale = S / (HALF * 2 + 40);
    const toX = (x) => (x + HALF + 20) * scale;
    const toY = (z) => (z + HALF + 20) * scale;
    ctx.fillStyle = '#12101a';
    ctx.fillRect(0, 0, S, S);
    // Roads.
    ctx.strokeStyle = '#3a3542';
    ctx.lineWidth = 3;
    for (let g = -200; g <= 200; g += 40) {
      ctx.beginPath(); ctx.moveTo(toX(g), 0); ctx.lineTo(toX(g), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toY(g)); ctx.lineTo(S, toY(g)); ctx.stroke();
    }
    // Harbor water.
    ctx.fillStyle = '#0e2a3d';
    ctx.fillRect(toX(200), 0, S - toX(200), S);
    // Mission blip.
    const st = G.missionState;
    if (st && st.marker) {
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(toX(st.marker.x), toY(st.marker.z), 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(toX(st.marker.x), toY(st.marker.z), 8 + Math.sin(G.time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic grey, police red.
    ctx.fillStyle = '#9a9aa2';
    for (const car of G.traffic) {
      ctx.fillRect(toX(car.mesh.position.x) - 1.5, toY(car.mesh.position.z) - 1.5, 3, 3);
    }
    ctx.fillStyle = '#ff2a2a';
    for (const car of G.policeCars) {
      if (car.retire) continue;
      ctx.beginPath(); ctx.arc(toX(car.mesh.position.x), toY(car.mesh.position.z), 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const pp = G.playerCar ? G.playerCar.mesh.position : G.player.mesh.position;
    const heading = G.playerCar ? G.playerCar.heading : G.player.heading;
    ctx.save();
    ctx.translate(toX(pp.x), toY(pp.z));
    ctx.rotate(-heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function update(G) {
    const p = G.player;
    el('health-fill').style.width = Math.max(0, p.health) + '%';
    el('health-fill').style.background = p.health > 50 ? '#2fd35a' : p.health > 25 ? '#ffb347' : '#ff3b30';
    el('ammo').textContent = p.inCar ? '—' : p.ammo + ' / ' + p.reserveAmmo + (p.reloadT > 0 ? ' …' : '');
    el('cash').textContent = IH.fmtMoney(G.cash);
    el('debt').textContent = IH.fmtMoney(G.debt);
    el('stars').textContent = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
    el('stars').style.color = G.wanted >= 3 ? '#ff3b30' : '#ffd23e';
    const speed = G.playerCar ? Math.abs(G.playerCar.speed) * 3.6 : Math.abs(p.speed) * 3.6;
    el('speed').textContent = Math.round(speed) + ' km/h';
    if (G.missionTimer != null && G.missionIndex === 0) {
      el('timer').textContent = '⏱ ' + IH.fmtTime(Math.max(0, G.missionTimer));
      el('timer').style.display = 'block';
    } else el('timer').style.display = 'none';
    drawMinimap(G);
  }

  let toastTimer = null;
  function toast(msg) {
    const t = el('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 3400);
  }

  function objective(text) {
    const o = el('objective');
    if (o) o.textContent = text;
  }

  function showScreen(G, name) {
    for (const s of ['title', 'pause', 'busted', 'wasted', 'complete']) {
      const n = el('screen-' + s);
      if (n) n.style.display = s === name ? 'flex' : 'none';
    }
    el('hud').style.display = name === 'play' ? 'block' : 'none';
    if (name === 'title') {
      const save = G.loadSave();
      el('btn-continue').style.display = save ? 'inline-block' : 'none';
      if (save) el('save-line').textContent = 'Continue: ' + IH.fmtMoney(save.cash) + ' earned, ' + (save.mission + 1) + '/8 jobs done, debt ' + IH.fmtMoney(save.debt) + ' left.';
      else el('save-line').textContent = '';
    }
    if (name === 'complete') {
      el('complete-stats').textContent = 'All eight jobs done. Debt paid: ' + IH.fmtMoney(IH.totalDebt) +
        ' — Voss Auto is free, and Mara is done running.';
    }
  }

  IH.hudUpdate = update;
  IH.hudToast = toast;
  IH.hudObjective = objective;
  IH.hudShow = showScreen;
})();
