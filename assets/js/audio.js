/* Orbo Solutions — background ambience toggle (original procedural WebAudio).
   A quiet studio pad: five detuned oscillator voices breathing on slow LFOs,
   a wash of band-passed noise for air, everything under a gentle lowpass and
   compressor. No external assets. Autoplay policy respected: sound starts
   only after a user gesture; default is OFF; the choice persists.

   To swap in a licensed track later: drop the file at assets/audio/ambient.mp3,
   replace buildSource() below with an <audio loop> element piped through
   ctx.createMediaElementSource(el), and keep the master chain as-is. */
(function () {
  'use strict';

  /* V5.19 (owner: "a bit louder, fits the site better"): level up
     0.06 -> 0.105, a 55Hz sub drone under the pad (cosmic floor), the
     filter opened 850 -> 1150 (glassier air), noise-air and shimmer
     more present, a second high sparkle voice. */
  var KEY = 'lumen-audio';
  var LEVEL = 0.105;
  var btns = [].slice.call(document.querySelectorAll('[data-audio-toggle]'));
  if (!btns.length) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { btns.forEach(function (b) { b.hidden = true; }); return; }

  var ctx = null, master = null, on = false, offT = null;

  /* the procedural pad — everything below connects into `out` */
  function buildSource(out) {
    var t0 = ctx.currentTime;
    function lfo(freq, depth, target, base) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      var g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g);
      g.connect(target);
      if (base != null) target.value = base;
      o.start(t0);
      return o;
    }
    /* a deep floor + five voices on an airy sus2 stack
       (A1 | A2 E3 A3 B3 E4), each a detuned pair */
    var freqs = [55, 110, 164.81, 220, 246.94, 329.63];
    var gains = [0.26, 0.30, 0.24, 0.18, 0.13, 0.09];
    for (var i = 0; i < freqs.length; i++) {
      var vg = ctx.createGain();
      /* slow independent breathing per voice */
      lfo(0.02 + i * 0.011, gains[i] * 0.35, vg.gain, gains[i]);
      for (var d = -1; d <= 1; d += 2) {
        var o = ctx.createOscillator();
        o.type = (i > 0 && i < 3) ? 'triangle' : 'sine';
        o.frequency.value = freqs[i];
        o.detune.value = d * (2 + i);
        o.connect(vg);
        o.start(t0);
      }
      if (ctx.createStereoPanner) {
        var pan = ctx.createStereoPanner();
        pan.pan.value = (i % 2 ? 1 : -1) * 0.25;
        vg.connect(pan);
        pan.connect(out);
      } else {
        vg.connect(out);
      }
    }
    /* air: looped noise through a bandpass, barely there */
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var n = 0; n < len; n++) data[n] = Math.random() * 2 - 1;
    var noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 0.9;
    var ng = ctx.createGain();
    lfo(0.043, 0.013, ng.gain, 0.021);
    noise.connect(bp); bp.connect(ng); ng.connect(out);
    noise.start(t0);
    /* two distant shimmers breathing in alternation — starlight */
    var shf = [659.26, 987.77];
    for (var s = 0; s < 2; s++) {
      var sh = ctx.createOscillator();
      sh.type = 'sine';
      sh.frequency.value = shf[s];
      var sg = ctx.createGain();
      lfo(0.09 + s * 0.037, 0.005, sg.gain, 0.009 - s * 0.003);
      sh.connect(sg); sg.connect(out);
      sh.start(t0);
    }
  }

  function build() {
    ctx = new AC();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1150;
    lp.Q.value = 0.4;
    var lfoOsc = ctx.createOscillator();
    lfoOsc.type = 'sine';
    lfoOsc.frequency.value = 0.031;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfoOsc.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfoOsc.start();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -28;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0;
    lp.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    buildSource(lp);
  }

  function setOn(next, persist) {
    on = next;
    btns.forEach(function (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (persist) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { } }
    clearTimeout(offT);
    if (on) {
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.5);
    } else if (ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.22);
      offT = setTimeout(function () { if (!on && ctx) ctx.suspend(); }, 1400);
    }
  }

  btns.forEach(function (b) {
    b.addEventListener('click', function () { setOn(!on, true); });
  });

  /* saved ON: reflect the state, start on the first gesture (autoplay policy) */
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { }
  if (saved === '1') {
    btns.forEach(function (b) { b.setAttribute('aria-pressed', 'true'); });
    on = true;
    /* pointerup (not pointerdown) — pointerdown does not carry user
       activation on iOS Safari, and resume() would be rejected there.
       An aborted gesture on the toggle keeps the arm alive: the toggle's
       own click handler decides, and only a real start disarms. */
    var arm = function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-audio-toggle]')) return;
      window.removeEventListener('pointerup', arm);
      window.removeEventListener('keydown', arm);
      if (on && !ctx) setOn(true, false);
    };
    window.addEventListener('pointerup', arm);
    window.addEventListener('keydown', arm);
  }

  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (on) ctx.resume();
  });
})();
