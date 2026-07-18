/* ORBO — work page: live lab previews.
   Five tiny 2D-canvas scenes, one per lab card — each a real-time echo of
   the full experiment it links to (aurora ribbons, particle galaxy,
   refracting prism, flow field, terrain ridges). All procedural, no assets.
   Tiers: reduced-motion / no-canvas → the cards' CSS gradient stands alone.
   Offscreen cards don't animate (IntersectionObserver). DPR-aware, capped
   at 2 to keep phones cool. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var canvases = document.querySelectorAll('.lab-canvas');
  if (!canvases.length) return;

  /* one shared clock; each scene draws only while visible */
  var scenes = [];

  function makeScene(canvas) {
    var kind = canvas.getAttribute('data-lab');
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var s = { canvas: canvas, ctx: ctx, kind: kind, visible: false, w: 0, h: 0, t: Math.random() * 100, seed: [] };

    /* per-kind particle/geometry setup, re-run on resize */
    s.init = function () {
      var dpr = Math.min(devicePixelRatio || 1, 2);
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.w = r.width;
      s.h = r.height;
      s.seed = [];
      var i, n;
      if (kind === 'nebula') {
        n = 260;
        for (i = 0; i < n; i++) {
          var arm = i % 3;
          var d = Math.pow(Math.random(), 0.6);
          s.seed.push({ d: d, a: arm * (Math.PI * 2 / 3) + d * 3.2 + (Math.random() - 0.5) * 0.5, sz: Math.random() < 0.12 ? 1.8 : 1, tw: Math.random() * Math.PI * 2 });
        }
      } else if (kind === 'flux') {
        n = 110;
        for (i = 0; i < n; i++) s.seed.push({ x: Math.random() * s.w, y: Math.random() * s.h, px: 0, py: 0 });
      } else if (kind === 'terra') {
        /* three ridge layers of fixed random phases */
        for (i = 0; i < 3; i++) s.seed.push({ p1: Math.random() * 9, p2: Math.random() * 9, p3: Math.random() * 9 });
      }
    };

    s.init();
    return s;
  }

  /* value noise — cheap, good enough for ribbons/ridges/fields */
  function n2(x, y) {
    var n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }
  function smooth(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return n2(xi, yi) * (1 - u) * (1 - v) + n2(xi + 1, yi) * u * (1 - v) + n2(xi, yi + 1) * (1 - u) * v + n2(xi + 1, yi + 1) * u * v;
  }

  var draw = {
    /* AURORA — three luminous ribbons breathing across the frame */
    aurora: function (s) {
      var c = s.ctx, w = s.w, h = s.h, t = s.t;
      c.clearRect(0, 0, w, h);
      var bands = [
        { hue: 'rgba(157, 140, 255, ', amp: 0.16, y: 0.34, sp: 0.9 },
        { hue: 'rgba(255, 176, 128, ', amp: 0.12, y: 0.52, sp: 1.25 },
        { hue: 'rgba(120, 170, 255, ', amp: 0.14, y: 0.68, sp: 0.7 }
      ];
      c.globalCompositeOperation = 'lighter';
      for (var b = 0; b < bands.length; b++) {
        var bd = bands[b];
        for (var layer = 0; layer < 3; layer++) {
          c.beginPath();
          for (var x = -10; x <= w + 10; x += 8) {
            var ny = smooth(x * 0.006 + t * 0.12 * bd.sp + b * 7, layer * 3.1) - 0.5;
            var y = h * bd.y + ny * h * bd.amp * 2 + Math.sin(x * 0.012 + t * bd.sp) * h * 0.05;
            if (x === -10) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.strokeStyle = bd.hue + (0.16 - layer * 0.04) + ')';
          c.lineWidth = 14 - layer * 4;
          c.lineCap = 'round';
          c.stroke();
        }
      }
      c.globalCompositeOperation = 'source-over';
    },

    /* NEBULA — a slowly rotating spiral of glowing points */
    nebula: function (s) {
      var c = s.ctx, w = s.w, h = s.h, t = s.t;
      c.clearRect(0, 0, w, h);
      var cx = w * 0.5, cy = h * 0.52, R = Math.min(w, h) * 0.44;
      c.globalCompositeOperation = 'lighter';
      for (var i = 0; i < s.seed.length; i++) {
        var p = s.seed[i];
        /* differential rotation: inner stars orbit faster */
        var a = p.a + t * 0.14 * (1.6 - p.d);
        var x = cx + Math.cos(a) * p.d * R * 1.18;
        var y = cy + Math.sin(a) * p.d * R * 0.55;
        var tw = 0.55 + 0.45 * Math.sin(t * 2 + p.tw);
        var alpha = (1 - p.d * 0.6) * 0.7 * tw;
        c.fillStyle = p.sz > 1 ? 'rgba(201, 175, 255, ' + alpha + ')' : 'rgba(157, 140, 255, ' + alpha + ')';
        c.beginPath();
        c.arc(x, y, p.sz, 0, 6.284);
        c.fill();
      }
      /* core glow */
      var g = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
      g.addColorStop(0, 'rgba(201, 175, 255, 0.5)');
      g.addColorStop(1, 'rgba(201, 175, 255, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'source-over';
    },

    /* PRISM — a refracting triangle splitting a beam into spectra */
    prism: function (s) {
      var c = s.ctx, w = s.w, h = s.h, t = s.t;
      c.clearRect(0, 0, w, h);
      var cx = w * 0.5, cy = h * 0.54, r = Math.min(w, h) * 0.27;
      var rot = Math.sin(t * 0.4) * 0.12;
      var pts = [];
      for (var i = 0; i < 3; i++) {
        var a = -Math.PI / 2 + i * (Math.PI * 2 / 3) + rot;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      /* incoming beam */
      c.strokeStyle = 'rgba(250, 250, 249, 0.5)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-4, cy - r * 0.1);
      c.lineTo(cx - r * 0.28, cy - r * 0.1);
      c.stroke();
      /* dispersed spectrum */
      var hues = ['rgba(157, 140, 255, ', 'rgba(255, 176, 128, ', 'rgba(120, 170, 255, ', 'rgba(201, 175, 255, '];
      c.globalCompositeOperation = 'lighter';
      for (var j = 0; j < hues.length; j++) {
        var spread = (j - 1.5) * 0.16 + Math.sin(t * 0.6 + j) * 0.02;
        c.strokeStyle = hues[j] + '0.55)';
        c.lineWidth = 2.4;
        c.beginPath();
        c.moveTo(cx + r * 0.2, cy - r * 0.05);
        c.lineTo(w + 4, cy - r * 0.05 + spread * h);
        c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
      /* the prism itself */
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      c.lineTo(pts[1][0], pts[1][1]);
      c.lineTo(pts[2][0], pts[2][1]);
      c.closePath();
      var g = c.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
      g.addColorStop(0, 'rgba(157, 140, 255, 0.30)');
      g.addColorStop(1, 'rgba(90, 70, 214, 0.12)');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(201, 175, 255, 0.85)';
      c.lineWidth = 1.4;
      c.stroke();
    },

    /* FLUX — particles surfing a curling noise field, fading trails */
    flux: function (s) {
      var c = s.ctx, w = s.w, h = s.h, t = s.t;
      /* translucent wipe = trails (dark card base painted by CSS) */
      c.fillStyle = 'rgba(15, 13, 24, 0.10)';
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'lighter';
      for (var i = 0; i < s.seed.length; i++) {
        var p = s.seed[i];
        var a = smooth(p.x * 0.008 + t * 0.06, p.y * 0.008) * Math.PI * 4;
        p.px = p.x; p.py = p.y;
        p.x += Math.cos(a) * 1.4;
        p.y += Math.sin(a) * 1.4;
        if (p.x < -6 || p.x > w + 6 || p.y < -6 || p.y > h + 6) {
          p.x = Math.random() * w; p.y = Math.random() * h;
          p.px = p.x; p.py = p.y;
        }
        c.strokeStyle = i % 4 === 0 ? 'rgba(255, 176, 128, 0.5)' : 'rgba(157, 140, 255, 0.45)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(p.px, p.py);
        c.lineTo(p.x, p.y);
        c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    },

    /* TERRA — layered procedural ridgelines drifting under a low sun */
    terra: function (s) {
      var c = s.ctx, w = s.w, h = s.h, t = s.t;
      c.clearRect(0, 0, w, h);
      /* sun */
      var sx = w * 0.72, sy = h * 0.30 + Math.sin(t * 0.2) * h * 0.03;
      var g = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.34);
      g.addColorStop(0, 'rgba(255, 176, 128, 0.55)');
      g.addColorStop(1, 'rgba(255, 176, 128, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      var cols = ['rgba(157, 140, 255, 0.30)', 'rgba(120, 100, 230, 0.45)', 'rgba(80, 64, 180, 0.62)'];
      for (var l = 0; l < 3; l++) {
        var sd = s.seed[l] || { p1: 0, p2: 3, p3: 6 };
        var base = h * (0.52 + l * 0.16);
        var amp = h * (0.16 - l * 0.03);
        var drift = t * (0.05 + l * 0.05);
        c.beginPath();
        c.moveTo(-4, h + 4);
        for (var x = -4; x <= w + 4; x += 6) {
          var u = x * 0.008 + drift;
          var y = base
            + Math.sin(u * 1.7 + sd.p1) * amp * 0.5
            + Math.sin(u * 3.3 + sd.p2) * amp * 0.3
            + smooth(u * 2.1 + sd.p3, l * 5) * amp * 0.6 - amp * 0.3;
          c.lineTo(x, y);
        }
        c.lineTo(w + 4, h + 4);
        c.closePath();
        c.fillStyle = cols[l];
        c.fill();
      }
    }
  };

  for (var i = 0; i < canvases.length; i++) {
    var sc = makeScene(canvases[i]);
    if (sc && draw[sc.kind]) scenes.push(sc);
  }
  if (!scenes.length) return;

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        for (var k = 0; k < scenes.length; k++) {
          if (scenes[k].canvas === entries[i].target) scenes[k].visible = entries[i].isIntersecting;
        }
      }
    }, { rootMargin: '60px' });
    for (var m = 0; m < scenes.length; m++) io.observe(scenes[m].canvas);
  } else {
    for (var v = 0; v < scenes.length; v++) scenes[v].visible = true;
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!document.hidden) {
      for (var i = 0; i < scenes.length; i++) {
        var s = scenes[i];
        if (!s.visible) continue;
        s.t += dt;
        draw[s.kind](s);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      for (var i = 0; i < scenes.length; i++) scenes[i].init();
    }, 150);
  });
})();
