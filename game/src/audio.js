// Ironhaven — all sound is synthesised with WebAudio. No audio files, no network.
(function () {
  const A = {
    ctx: null, master: null, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, sirenTimer: 0, rainSrc: null, started: false,
  };

  A.init = function () {
    if (A.started) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.5;
      A.master.connect(A.ctx.destination);
      // Engine: a low sawtooth whose pitch follows speed.
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc.frequency.value = 55;
      const filt = A.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      A.engineOsc.connect(filt); filt.connect(A.engineGain); A.engineGain.connect(A.master);
      A.engineOsc.start();
      // Siren: a square wave flipping between two tones.
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'square';
      A.sirenOsc.frequency.value = 700;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain); A.sirenGain.connect(A.master);
      A.sirenOsc.start();
      // Rain: looped filtered noise, kept quiet.
      const len = A.ctx.sampleRate * 2;
      const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = A.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const rf = A.ctx.createBiquadFilter();
      rf.type = 'bandpass'; rf.frequency.value = 2400; rf.Q.value = 0.4;
      const rg = A.ctx.createGain(); rg.gain.value = 0.035;
      src.connect(rf); rf.connect(rg); rg.connect(A.master);
      src.start();
      A.rainSrc = src;
      A.started = true;
    } catch (e) { /* audio is optional; the game plays silent */ }
  };

  A.engine = function (speed, driving) {
    if (!A.started) return;
    const t = A.ctx.currentTime;
    A.engineGain.gain.setTargetAtTime(driving ? 0.05 + Math.min(0.09, Math.abs(speed) * 0.004) : 0, t, 0.1);
    A.engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 6, t, 0.1);
  };

  A.siren = function (on, dt) {
    if (!A.started) return;
    const t = A.ctx.currentTime;
    A.sirenGain.gain.setTargetAtTime(on ? 0.028 : 0, t, 0.15);
    if (on) {
      A.sirenTimer += dt;
      A.sirenOsc.frequency.setTargetAtTime((Math.floor(A.sirenTimer * 2.4) % 2 === 0) ? 720 : 980, t, 0.05);
    }
  };

  A.blip = function (freq, dur, type, vol) {
    if (!A.started) return;
    const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 1.6), t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  A.shot = function () {
    if (!A.started) return;
    const t = A.ctx.currentTime;
    const len = Math.floor(A.ctx.sampleRate * 0.12);
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource(); src.buffer = buf;
    const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = A.ctx.createGain(); g.gain.value = 0.4;
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t);
  };

  A.pickup = function () { A.blip(880, 0.12, 'sine', 0.14); setTimeout(() => A.blip(1318, 0.16, 'sine', 0.14), 70); };
  A.sting = function () {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => A.blip(f, 0.22, 'triangle', 0.14), i * 110));
  };
  A.fail = function () { A.blip(220, 0.3, 'sawtooth', 0.1); setTimeout(() => A.blip(165, 0.4, 'sawtooth', 0.1), 160); };

  IH.audio = A;
})();
