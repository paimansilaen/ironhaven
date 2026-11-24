// Synthesised sound only: every effect is built with WebAudio oscillators and
// filtered noise, so the game ships no audio files and makes no network request.
// The context is created on the first user gesture (browsers block audio before
// that); every call is guarded so headless runs without audio still work.
var SFX = (function () {
  var ctx = null, master = null, engineOsc = null, engineGain = null,
      sirenOsc = null, sirenGain = null, muted = false, sirenOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine hum: a low sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
      // Police siren: two alternating tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      setInterval(function () {
        if (sirenOsc) sirenOsc.frequency.value = sirenOsc.frequency.value > 800 ? 660 : 950;
      }, 420);
    } catch (e) { ctx = null; return false; }
    return true;
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch (e) { /* audio is cosmetic */ }
  }
  function noise(dur, vol, freq) {
    if (!ensure() || muted) return;
    try {
      var len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1800;
      var g = ctx.createGain(); g.gain.value = vol || 0.3;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    } catch (e) { /* audio is cosmetic */ }
  }
  return {
    unlock: function () { ensure(); resume(); },
    toggleMute: function () { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    setEngine: function (speed01, on) {
      if (!ensure()) return;
      try {
        engineGain.gain.value = on ? 0.03 + speed01 * 0.05 : 0;
        engineOsc.frequency.value = 50 + speed01 * 130;
      } catch (e) {}
    },
    setSiren: function (on) {
      sirenOn = on;
      if (!ensure()) return;
      try { sirenGain.gain.value = on && !muted ? 0.045 : 0; } catch (e) {}
    },
    gunshot: function () { noise(0.14, 0.5, 2600); tone(160, 0.08, 'square', 0.18, 60); },
    punch: function () { noise(0.08, 0.25, 900); },
    pickup: function () { tone(660, 0.12, 'sine', 0.22); tone(990, 0.16, 'sine', 0.18); },
    sting: function () { // mission passed: rising arpeggio
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.22, 'triangle', 0.22); }, i * 110);
      });
    },
    fail: function () { tone(220, 0.5, 'sawtooth', 0.2, 110); },
    click: function () { tone(880, 0.05, 'square', 0.1); },
    busted: function () { tone(440, 0.3, 'square', 0.2, 330); tone(330, 0.5, 'square', 0.2, 220); },
  };
})();
