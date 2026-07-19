/* ORBO - the museum's sound. Two layers, all procedural WebAudio:
   1. AMBIENCE - the site's own generative score (the breathing sus2
      pad, air, sub-bass line and pentatonic motif from audio.js),
      auto-started by the enter gesture. A HUD chip mutes it; the
      choice persists separately from the main site's toggle.
   2. SFX - MMORPG-grade interface chimes: cold crystalline bell tones
      (sine partials + a whisper of noise) through a soft feedback
      delay, so every interaction rings like glass in a stone hall.
   No files, no libraries - the hall stays cold, mystic and clean. */
(function () {
  'use strict';

  var KEY = 'orbo-museum-audio';
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { window.ORBO_SOUND = { start: function () {}, sfx: function () {}, toggle: function () {}, isOn: function () { return false; } }; return; }

  var ctx = null;
  var musicGain = null, sfxBus = null;
  var musicOn = false, built = false;
  var MUSIC_LEVEL = 0.042;

  /* ---------- shared context + buses ---------- */
  function ensureCtx() {
    if (ctx) return;
    ctx = new AC();
    /* sfx bus: chimes -> soft feedback delay -> gentle compressor */
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.5;
    var delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.26;
    var fb = ctx.createGain();
    fb.gain.value = 0.24;
    var wet = ctx.createGain();
    wet.gain.value = 0.16;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    delay.connect(fb);
    fb.connect(delay);
    sfxBus.connect(lp);
    lp.connect(ctx.destination);
    sfxBus.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);
  }

  /* ---------- the ambience (the site's score, verbatim spirit) ---------- */
  function buildMusic() {
    if (built) return;
    built = true;
    var out = ctx.createBiquadFilter();
    out.type = 'lowpass';
    out.frequency.value = 1150;
    out.Q.value = 0.4;
    var lfoOsc = ctx.createOscillator();
    lfoOsc.type = 'sine';
    lfoOsc.frequency.value = 0.031;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfoOsc.connect(lfoGain);
    lfoGain.connect(out.frequency);
    lfoOsc.start();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -28;
    comp.ratio.value = 4;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    out.connect(comp);
    comp.connect(musicGain);
    musicGain.connect(ctx.destination);

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
    }
    var freqs = [110, 164.81, 220, 246.94, 329.63];
    var gains = [0.24, 0.19, 0.14, 0.10, 0.07];
    for (var i = 0; i < freqs.length; i++) {
      var vg = ctx.createGain();
      lfo(0.02 + i * 0.011, gains[i] * 0.35, vg.gain, gains[i]);
      for (var d = -1; d <= 1; d += 2) {
        var o = ctx.createOscillator();
        o.type = i < 2 ? 'triangle' : 'sine';
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
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(out);
    noise.start(t0);
    var shf = [659.26, 987.77];
    for (var s = 0; s < 2; s++) {
      var sh = ctx.createOscillator();
      sh.type = 'sine';
      sh.frequency.value = shf[s];
      var sg = ctx.createGain();
      lfo(0.09 + s * 0.037, 0.005, sg.gain, 0.009 - s * 0.003);
      sh.connect(sg);
      sg.connect(out);
      sh.start(t0);
    }
    var BASS = [55, 55, 43.65, 49];
    var MEL = [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63];
    var bassOsc = ctx.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.value = BASS[0];
    var bassG = ctx.createGain();
    bassG.gain.value = 0;
    bassOsc.connect(bassG);
    bassG.connect(out);
    bassOsc.start(t0);
    var step = 0, nextT = ctx.currentTime + 0.15;
    setInterval(function () {
      if (!ctx || ctx.state !== 'running' || !musicOn) return;
      while (nextT < ctx.currentTime + 3.5) {
        bassOsc.frequency.setTargetAtTime(BASS[step % BASS.length], nextT, 0.18);
        bassG.gain.setTargetAtTime(0.55, nextT, 0.4);
        bassG.gain.setTargetAtTime(0.07, nextT + 1.7, 0.85);
        for (var k = 0; k < 2; k++) {
          var nt = nextT + k * 1.6 + 0.25;
          var mo = ctx.createOscillator();
          mo.type = 'sine';
          mo.frequency.value = MEL[(step * 2 + k) % MEL.length];
          var mg = ctx.createGain();
          mg.gain.value = 0;
          mg.gain.setTargetAtTime(0.11, nt, 0.5);
          mg.gain.setTargetAtTime(0, nt + 1.05, 0.6);
          mo.connect(mg);
          mg.connect(out);
          mo.start(nt);
          mo.stop(nt + 3.4);
        }
        step++;
        nextT += 3.2;
      }
    }, 700);
  }

  function setMusic(next, persist) {
    musicOn = next;
    if (persist) { try { localStorage.setItem(KEY, next ? '1' : '0'); } catch (e) {} }
    var chip = document.getElementById('audioChip');
    if (chip) chip.setAttribute('aria-pressed', next ? 'true' : 'false');
    if (next) {
      ensureCtx();
      buildMusic();
      if (ctx.state === 'suspended') ctx.resume();
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 0.8);
    } else if (musicGain) {
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    }
  }

  /* ---------- the chimes ---------- */
  function bell(freq, at, dur, vol, panV) {
    /* a cold glass bell: fundamental + a 2.76x partial + whisper of air */
    var t = ctx.currentTime + (at || 0);
    [[1, 1], [2.76, 0.28], [5.4, 0.08]].forEach(function (P) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * P[0];
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * P[1], t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (P[0] === 1 ? 1 : 0.6));
      o.connect(g);
      var dest = g;
      if (panV && ctx.createStereoPanner) {
        var pn = ctx.createStereoPanner();
        pn.pan.value = panV;
        g.connect(pn);
        dest = pn;
      }
      dest.connect(sfxBus);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
  }
  function swell(freq, at, dur, vol) {
    var t = ctx.currentTime + (at || 0);
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  var lastSfx = {};
  var SFX = {
    /* the faintest glass tick when the crosshair finds a piece */
    hover: function () { bell(1975.5, 0, 0.16, 0.045, (Math.random() - 0.5) * 0.4); },
    /* a two-note crystal rise as a panel opens */
    open: function () { bell(659.26, 0, 0.5, 0.10); bell(1318.5, 0.07, 0.7, 0.075); },
    /* and its mirror falling shut */
    close: function () { bell(1318.5, 0, 0.35, 0.06); bell(659.26, 0.06, 0.55, 0.08); },
    /* entering the hall: a deep breath and three stars lighting up */
    enter: function () {
      swell(110, 0, 2.4, 0.16);
      swell(220, 0.1, 2.0, 0.07);
      bell(880, 0.5, 1.1, 0.06);
      bell(1318.5, 0.72, 1.2, 0.05);
      bell(1760, 0.94, 1.6, 0.045);
    },
    /* a screen unlocking - the real site waking in its frame */
    browse: function () { bell(523.25, 0, 0.4, 0.09); bell(783.99, 0.08, 0.45, 0.08); bell(1174.7, 0.16, 0.8, 0.07); },
    browseExit: function () { bell(1174.7, 0, 0.3, 0.06); bell(783.99, 0.07, 0.35, 0.06); bell(523.25, 0.14, 0.6, 0.07); }
  };

  window.ORBO_SOUND = {
    start: function () {
      ensureCtx();
      if (ctx.state === 'suspended') ctx.resume();
      var saved = null;
      try { saved = localStorage.getItem(KEY); } catch (e) {}
      setMusic(saved !== '0', false);   /* auto ON unless explicitly muted before */
    },
    sfx: function (name) {
      if (!ctx || !SFX[name]) return;
      var now = performance.now();
      if (lastSfx[name] && now - lastSfx[name] < 90) return;
      lastSfx[name] = now;
      if (ctx.state === 'suspended') return;
      try { SFX[name](); } catch (e) {}
    },
    toggle: function () { setMusic(!musicOn, true); },
    isOn: function () { return musicOn; }
  };

  var chip = document.getElementById('audioChip');
  if (chip) chip.addEventListener('click', function () { window.ORBO_SOUND.toggle(); });

  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
})();
