/* ORBO — the museum, seventh cut: the jewel box.
   One compact, warm, luminous hall — a stadium-shaped room with no
   corners and no columns — built from materials that read as real:
   honed stone tiles with veining and grout, troweled limewash walls,
   bronze rails and frames, dark linen panels behind every piece.
   Above, an oval skylight and clerestory windows open onto a glittering
   night of thousands of stars. The collection: backlit posters, five
   LIVING lab paintings, generative artworks, four hologram pedestals
   and the atrium star. Small footprint, high finish, light on the GPU:
   no shadow maps, no fog, few lights, low geometry.
   Desktop: pointer-lock + WASD. Touch: joystick + drag-look + tap.
   No assets — everything is drawn in code. */
(function () {
  'use strict';

  if (!window.THREE) return;

  var canvas = document.getElementById('glCanvas');
  var enterEl = document.getElementById('enter');
  var enterBtn = document.getElementById('enterBtn');
  var hud = document.getElementById('hud');
  var crosshair = document.getElementById('crosshair');
  var hintWrap = document.getElementById('hudHint');
  var hintText = document.getElementById('hudHintText');
  var panel = document.getElementById('panel');
  var panelTag = document.getElementById('panelTag');
  var panelTitle = document.getElementById('panelTitle');
  var panelBody = document.getElementById('panelBody');
  var panelLink = document.getElementById('panelLink');
  var panelResume = document.getElementById('panelResume');
  var panelClose = document.getElementById('panelClose');
  var stickEl = document.getElementById('stick');
  var stickThumb = document.getElementById('stickThumb');

  var isTouch = document.documentElement.classList.contains('touch');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (isTouch) {
    var ek = document.getElementById('enterKeys');
    if (ek) ek.innerHTML = '<span><b>ג׳ויסטיק</b> בצד — תנועה</span><span><b>גרירה</b> — להסתכל</span><span><b>הקשה</b> על מוצג — פרטים</span>';
  }

  if (document.fonts && document.fonts.load) {
    document.fonts.load("850 100px 'Noto Sans Hebrew'", 'אב');
    document.fonts.load("700 44px 'Noto Sans Hebrew'", 'אב');
  }

  /* ---------- renderer ---------- */
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { renderer = null; }
  if (!renderer || !renderer.getContext()) {
    enterEl.classList.add('no-gl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0916);

  var camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.08, 160);
  camera.rotation.order = 'YXZ';

  /* ---------- room dimensions: a stadium (no corners anywhere) ---------- */
  var ROOM = { hw: 7.5, straight: 7, h: 6.5 };   /* half-width; straight walls span z ±7; rounded ends beyond */
  var EYE = 1.65;
  var R_IN = ROOM.hw - 0.4;                       /* walkable radius at the rounded ends */

  /* ---------- environment reflections (warm gallery light) ---------- */
  (function buildEnv() {
    var env = new THREE.Scene();
    var mk = function (color, w, h, x, y, z, ry) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.y = ry || 0;
      env.add(m);
    };
    env.background = new THREE.Color(0x030309);
    mk(0x7a68e8, 16, 3, 0, 7, -8);                 /* violet cove ahead */
    mk(0x342b58, 20, 3, 0, 8, 8, Math.PI);
    mk(0xffb080, 4, 1.6, -9, 4, 0, Math.PI / 2);
    mk(0x58c8f0, 4, 1.6, 9, 4, 0, -Math.PI / 2);
    mk(0x161226, 30, 30, 0, -4, 0);                /* dark floor bounce */
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.04).texture;
    pmrem.dispose();
  })();

  /* ---------- canvas + noise helpers ---------- */
  function ctx2d(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c.getContext('2d');
  }
  function asTexture(canvasEl, linear) {
    var t = new THREE.CanvasTexture(canvasEl);
    if (!linear) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  var noise = (window.ORBO_LAB && ORBO_LAB.noise) || function (x, y) {
    var n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  function fbm(x, y, oct) {
    var v = 0, a = 0.5, f = 1;
    for (var i = 0; i < oct; i++) {
      v += a * noise(x * f, y * f);
      f *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  /* ---------- material suites: stone, limewash, linen, bronze ---------- */

  /* honed stone tiles: warm large-format slabs, veined, with grout lines */
  function stoneFloorSuite() {
    var S = 1024, TILES = 4;
    var col = ctx2d(S, S), rgh = ctx2d(S, S);
    var img = col.createImageData(S, S);
    var rimg = rgh.createImageData(S, S);
    var tileSz = S / TILES;
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var tx = Math.floor(x / tileSz), ty = Math.floor(y / tileSz);
        var seed = tx * 7.13 + ty * 3.71;
        var u = x / S * 5, v = y / S * 5;
        var tone = fbm(u + seed, v + seed * 2, 3);                 /* per-tile drift */
        var w = fbm(u * 2.0 + seed * 9, v * 2.0 + 4.2, 5);
        var vein = Math.pow(1 - Math.abs(Math.sin(w * 7.2 + tone * 2.4)), 16);
        /* deep night stone, silver-violet veins */
        var r = 30 + tone * 12 + vein * 74;
        var g = 27 + tone * 11 + vein * 66;
        var b = 44 + tone * 16 + vein * 96;
        /* grout: darker seams between slabs */
        var gx = x % tileSz, gy = y % tileSz;
        var gd = Math.min(gx, tileSz - gx, gy, tileSz - gy);
        if (gd < 3) { var k = 0.45 + gd * 0.12; r *= k; g *= k; b *= k; }
        var o = (y * S + x) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
        var ro = 95 + tone * 55 - vein * 35 + (gd < 3 ? 70 : 0);   /* veins polished, grout matte */
        rimg.data[o] = ro; rimg.data[o + 1] = ro; rimg.data[o + 2] = ro; rimg.data[o + 3] = 255;
      }
    }
    col.putImageData(img, 0, 0);
    rgh.putImageData(rimg, 0, 0);
    var map = asTexture(col.canvas);
    var rough = asTexture(rgh.canvas, true);
    [map, rough].forEach(function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 6); });
    return { map: map, rough: rough };
  }

  /* troweled limewash: soft directional strokes, darker toward the base */
  function limewashSuite() {
    var S = 512;
    var col = ctx2d(S, S), bmp = ctx2d(S, S);
    var img = col.createImageData(S, S);
    var bimg = bmp.createImageData(S, S);
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var u = x / S, v = y / S;
        /* strokes stretched horizontally — a trowel's memory */
        var p = fbm(u * 3.2, v * 9, 4);
        var drift = fbm(u * 1.1 + 7, v * 1.1, 3);
        var base = 40 + p * 13 + drift * 9 - v * 7;   /* gently darker downward */
        var o = (y * S + x) * 4;
        img.data[o] = base; img.data[o + 1] = base - 3; img.data[o + 2] = base + 10; img.data[o + 3] = 255;
        var h = 116 + p * 46 + drift * 22;
        bimg.data[o] = h; bimg.data[o + 1] = h; bimg.data[o + 2] = h; bimg.data[o + 3] = 255;
      }
    }
    col.putImageData(img, 0, 0);
    bmp.putImageData(bimg, 0, 0);
    var map = asTexture(col.canvas);
    var bump = asTexture(bmp.canvas, true);
    [map, bump].forEach(function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 2); });
    return { map: map, bump: bump };
  }

  /* dark linen: the panels each artwork hangs on */
  function linenTexture() {
    var S = 512;
    var c = ctx2d(S, S);
    var img = c.createImageData(S, S);
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var weave = (noise(x * 0.9, y * 0.13) + noise(x * 0.13, y * 0.9)) * 0.5;
        var drift = fbm(x / S * 3, y / S * 3, 3);
        var base = 24 + weave * 10 + drift * 6;
        var o = (y * S + x) * 4;
        img.data[o] = base; img.data[o + 1] = base - 3; img.data[o + 2] = base - 6; img.data[o + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    var t = asTexture(c.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* ---------- the glittering night ---------- */
  function starsTexture(count, sizeMax, glints) {
    var W = 1024, H = 512;
    var c = ctx2d(W, H);
    /* not black — a deep blue night with faint breath */
    var bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0918');
    bg.addColorStop(0.5, '#0d0b1d');
    bg.addColorStop(1, '#090815');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    for (var n = 0; n < 8; n++) {
      var nx = Math.random() * W, ny = Math.random() * H, nr = 90 + Math.random() * 150;
      var ng = c.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, 'rgba(120, 105, 220, 0.05)');
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ng;
      c.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }
    for (var i = 0; i < count; i++) {
      var x = Math.random() * W, y = Math.random() * H;
      var m = Math.random();
      var s = m < 0.8 ? 1 : m < 0.96 ? 1.5 + Math.random() * (sizeMax - 1.5) * 0.4 : 1.5 + Math.random() * (sizeMax - 1.5);
      var tint = Math.random();
      var col = tint < 0.68 ? '228, 228, 255' : tint < 0.86 ? '255, 232, 200' : '186, 210, 255';
      c.fillStyle = 'rgba(' + col + ', ' + (0.35 + m * 0.62) + ')';
      c.beginPath();
      c.arc(x, y, s * 0.5, 0, 6.284);
      c.fill();
    }
    /* a few brilliant ones with glints */
    c.globalCompositeOperation = 'lighter';
    for (var h = 0; h < glints; h++) {
      var hx = Math.random() * W, hy = Math.random() * H;
      var hr = 1.4 + Math.random() * 1.4;
      var warm = Math.random() < 0.3;
      var hc = warm ? '255, 226, 190' : '226, 230, 255';
      var hg = c.createRadialGradient(hx, hy, 0, hx, hy, hr * 6);
      hg.addColorStop(0, 'rgba(' + hc + ', 0.95)');
      hg.addColorStop(0.3, 'rgba(' + hc + ', 0.25)');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = hg;
      c.fillRect(hx - hr * 6, hy - hr * 6, hr * 12, hr * 12);
      c.strokeStyle = 'rgba(' + hc + ', 0.45)';
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(hx - hr * 7, hy); c.lineTo(hx + hr * 7, hy);
      c.moveTo(hx, hy - hr * 7); c.lineTo(hx, hy + hr * 7);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    return asTexture(c.canvas);
  }
  /* two counter-rotating domes make the sky shimmer */
  var skyA = new THREE.Mesh(
    new THREE.SphereGeometry(70, 24, 14),
    new THREE.MeshBasicMaterial({ map: starsTexture(1500, 3.2, 22), side: THREE.BackSide })
  );
  scene.add(skyA);
  var skyB = new THREE.Mesh(
    new THREE.SphereGeometry(66, 24, 14),
    new THREE.MeshBasicMaterial({ map: starsTexture(2200, 2.2, 0), side: THREE.BackSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  scene.add(skyB);

  function radialTexture(inner, outer) {
    var c = ctx2d(256, 256);
    var g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    return asTexture(c.canvas);
  }

  function coneTexture() {
    var c = ctx2d(64, 256);
    var g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(120, 100, 240, 0.4)');
    g.addColorStop(1, 'rgba(120, 100, 240, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 256);
    return asTexture(c.canvas);
  }

  function drawStar(c, x, y, r, fill, glow) {
    if (glow) {
      var g = c.createRadialGradient(x, y, 0, x, y, r * 2.4);
      g.addColorStop(0, glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    }
    c.beginPath();
    c.moveTo(x, y - r);
    c.lineTo(x + r * 0.2, y - r * 0.2);
    c.lineTo(x + r, y);
    c.lineTo(x + r * 0.2, y + r * 0.2);
    c.lineTo(x, y + r);
    c.lineTo(x - r * 0.2, y + r * 0.2);
    c.lineTo(x - r, y);
    c.lineTo(x - r * 0.2, y - r * 0.2);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  var FONT = "'Noto Sans Hebrew', system-ui, sans-serif";

  function posterTexture(art) {
    var W = 1024, H = 640;
    var c = ctx2d(W, H);
    var dark = art.style === 'dark';
    var redraw = function () {
      if (dark) {
        var bg = c.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#191527');
        bg.addColorStop(1, '#100d1c');
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);
        var rg = c.createRadialGradient(W / 2, H * 0.86, 0, W / 2, H * 0.86, W * 0.55);
        rg.addColorStop(0, 'rgba(108, 92, 255, 0.30)');
        rg.addColorStop(1, 'rgba(108, 92, 255, 0)');
        c.fillStyle = rg;
        c.fillRect(0, 0, W, H);
      } else {
        c.fillStyle = '#FCFBF8';
        c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(20, 18, 31, 0.05)';
        for (var i = 0; i < 60; i++) {
          c.beginPath();
          c.arc(Math.random() * W, Math.random() * H, Math.random() * 1.6 + 0.4, 0, 6.284);
          c.fill();
        }
      }
      var ink = dark ? '#F4F2FA' : '#14121F';
      var soft = dark ? 'rgba(244, 242, 250, 0.6)' : '#5A5668';
      drawStar(c, W / 2, 132, 34, dark ? '#9D8CFF' : '#5B4CF5', dark ? 'rgba(157, 140, 255, 0.35)' : null);
      c.textAlign = 'center';
      c.direction = 'rtl';
      c.fillStyle = ink;
      c.font = '850 ' + (art.big ? 108 : 88) + 'px ' + FONT;
      c.fillText(art.title, W / 2, art.sub ? 350 : 380, W - 120);
      if (art.sub) {
        c.fillStyle = soft;
        c.font = '400 40px ' + FONT;
        c.fillText(art.sub, W / 2, 432, W - 160);
      }
      if (art.domain) {
        c.direction = 'ltr';
        c.fillStyle = dark ? '#C9AFFF' : '#5B4CF5';
        c.font = '600 34px ' + FONT;
        c.fillText(art.domain, W / 2, 540);
        c.direction = 'rtl';
      }
    };
    redraw();
    var t = asTexture(c.canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { redraw(); t.needsUpdate = true; });
    return t;
  }

  /* gallery card: warm white, ink text, bronze pin line */
  function plaqueTexture(art) {
    var W = 512, H = 256;
    var c = ctx2d(W, H);
    var accent = art.accent || '#5B4CF5';
    var redraw = function () {
      c.fillStyle = '#FBFAF6';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(20, 18, 31, 0.14)';
      c.lineWidth = 2;
      c.strokeRect(4, 4, W - 8, H - 8);
      c.fillStyle = '#9a7b52';
      c.fillRect(W - 14, 18, 4, H - 36);
      c.textAlign = 'right';
      c.direction = 'rtl';
      c.fillStyle = '#17141F';
      c.font = '700 44px ' + FONT;
      c.fillText(art.title, W - 42, 100, W - 80);
      c.fillStyle = accent;
      c.font = '500 30px ' + FONT;
      c.fillText(art.tag, W - 42, 162, W - 80);
    };
    redraw();
    var t = asTexture(c.canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { redraw(); t.needsUpdate = true; });
    return t;
  }

  function brandTexture() {
    var W = 1600, H = 400;
    var c = ctx2d(W, H);
    var redraw = function () {
      c.clearRect(0, 0, W, H);
      c.textAlign = 'center';
      c.direction = 'ltr';
      c.shadowColor = 'rgba(108, 92, 255, 0.55)';
      c.shadowBlur = 38;
      var g = c.createLinearGradient(0, 60, 0, 320);
      g.addColorStop(0, '#8F74FF');
      g.addColorStop(1, '#5B4CF5');
      c.fillStyle = g;
      c.font = '850 190px ' + FONT;
      c.fillText('ORBO·GALLERY', W / 2, 262, W - 100);
      c.shadowBlur = 0;
    };
    redraw();
    var t = asTexture(c.canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { redraw(); t.needsUpdate = true; });
    return t;
  }

  function holoLabelTexture(text) {
    var c = ctx2d(512, 128);
    var redraw = function () {
      c.clearRect(0, 0, 512, 128);
      c.fillStyle = 'rgba(255, 255, 255, 0.88)';
      c.beginPath();
      if (c.roundRect) c.roundRect(36, 22, 440, 84, 42); else c.rect(36, 22, 440, 84);
      c.fill();
      c.strokeStyle = 'rgba(91, 76, 245, 0.4)';
      c.lineWidth = 3;
      c.stroke();
      c.textAlign = 'center';
      c.direction = 'rtl';
      c.fillStyle = '#17141F';
      c.font = '700 50px ' + FONT;
      c.fillText(text, 256, 86, 400);
    };
    redraw();
    var t = asTexture(c.canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { redraw(); t.needsUpdate = true; });
    return t;
  }

  /* ---------- generative artworks ---------- */
  function genesisTexture() {
    var W = 640, H = 400;
    var c = ctx2d(W, H);
    c.fillStyle = '#0e0a18';
    c.fillRect(0, 0, W, H);
    var cols = ['rgba(157, 140, 255,', 'rgba(255, 176, 128,', 'rgba(120, 170, 255,', 'rgba(201, 175, 255,'];
    for (var p = 0; p < 300; p++) {
      var x = Math.random() * W, y = Math.random() * H;
      var col = cols[p % 4];
      c.beginPath();
      c.moveTo(x, y);
      for (var s = 0; s < 80; s++) {
        var a = noise(x * 0.006, y * 0.006) * Math.PI * 4;
        x += Math.cos(a) * 3;
        y += Math.sin(a) * 3;
        c.lineTo(x, y);
      }
      c.strokeStyle = col + (0.05 + Math.random() * 0.1) + ')';
      c.lineWidth = 0.8;
      c.stroke();
    }
    return asTexture(c.canvas);
  }

  function mosaicTexture() {
    var W = 640, H = 400;
    var c = ctx2d(W, H);
    var N = 46, pts = [];
    var palette = [[26, 20, 44], [40, 30, 70], [58, 44, 108], [91, 76, 245], [157, 140, 255], [255, 176, 128], [22, 17, 36]];
    for (var i = 0; i < N; i++) pts.push([Math.random() * W, Math.random() * H, palette[i % palette.length]]);
    var img = c.createImageData(W, H);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var d1 = 1e9, d2 = 1e9, col = null;
        for (var k = 0; k < N; k++) {
          var dx = x - pts[k][0], dy = y - pts[k][1];
          var d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; col = pts[k][2]; }
          else if (d < d2) { d2 = d; }
        }
        var edge = Math.min((Math.sqrt(d2) - Math.sqrt(d1)) / 7, 1);
        var o = (y * W + x) * 4;
        img.data[o] = col[0] * edge;
        img.data[o + 1] = col[1] * edge;
        img.data[o + 2] = col[2] * edge;
        img.data[o + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    return asTexture(c.canvas);
  }

  function fractalTexture() {
    var W = 640, H = 400;
    var c = ctx2d(W, H);
    var img = c.createImageData(W, H);
    var cr = -0.79, ci = 0.15;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var zr = (x - W / 2) / (H * 0.42), zi = (y - H / 2) / (H * 0.42);
        var it = 0, max = 70;
        while (it < max && zr * zr + zi * zi < 4) {
          var t = zr * zr - zi * zi + cr;
          zi = 2 * zr * zi + ci;
          zr = t;
          it++;
        }
        var o = (y * W + x) * 4;
        if (it === max) { img.data[o] = 12; img.data[o + 1] = 9; img.data[o + 2] = 22; }
        else {
          var f = it / max;
          img.data[o] = 20 + 200 * Math.pow(f, 1.6);
          img.data[o + 1] = 14 + 130 * Math.pow(f, 2.1);
          img.data[o + 2] = 40 + 215 * Math.pow(f, 0.9);
        }
        img.data[o + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    return asTexture(c.canvas);
  }

  /* ---------- the room ---------- */
  var stone = stoneFloorSuite();
  var lime = limewashSuite();
  var floorMat = new THREE.MeshStandardMaterial({ map: stone.map, roughnessMap: stone.rough, roughness: 1.0, metalness: 0.06, envMapIntensity: 1.1 });
  var wallMat = new THREE.MeshStandardMaterial({ map: lime.map, bumpMap: lime.bump, bumpScale: 0.5, roughness: 0.94, metalness: 0.0 });
  var wallMatIn = new THREE.MeshStandardMaterial({ map: lime.map, bumpMap: lime.bump, bumpScale: 0.5, roughness: 0.94, metalness: 0.0, side: THREE.BackSide });
  var bronzeMat = new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 0.34, metalness: 0.85, envMapIntensity: 1.15 });
  var darkBronze = new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 0.4, metalness: 0.7, envMapIntensity: 1.0 });
  var linenMat = new THREE.MeshStandardMaterial({ map: linenTexture(), roughness: 0.92, metalness: 0.02 });
  var ceilMat = new THREE.MeshStandardMaterial({ color: 0x14111d, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
  var warmLineMat = new THREE.MeshBasicMaterial({ color: 0x8474e8 });

  /* stadium floor: rectangle + two half-discs */
  var floorGroup = new THREE.Group();
  var f1 = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.hw * 2, ROOM.straight * 2), floorMat);
  f1.rotation.x = -Math.PI / 2;
  floorGroup.add(f1);
  [1, -1].forEach(function (side) {
    var half = new THREE.Mesh(new THREE.CircleGeometry(ROOM.hw, 40, side > 0 ? 0 : Math.PI, Math.PI), floorMat);
    half.rotation.x = -Math.PI / 2;
    half.position.z = side * ROOM.straight;
    floorGroup.add(half);
  });
  scene.add(floorGroup);

  /* walls: two straight planes + two half-cylinders, seamless */
  [-1, 1].forEach(function (side) {
    var w = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.straight * 2, ROOM.h), wallMat);
    w.position.set(side * ROOM.hw, ROOM.h / 2, 0);
    w.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(w);
  });
  [1, -1].forEach(function (side) {
    var cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(ROOM.hw, ROOM.hw, ROOM.h, 40, 1, true, side > 0 ? 0 : Math.PI, Math.PI),
      wallMatIn
    );
    cyl.position.set(0, ROOM.h / 2, side * ROOM.straight);
    scene.add(cyl);
  });

  /* bronze wainscot rail + warm cove line, all the way around */
  function beltRing(y, mat, tube) {
    /* straight segments */
    [-1, 1].forEach(function (side) {
      var seg = new THREE.Mesh(new THREE.CylinderGeometry(tube, tube, ROOM.straight * 2, 6), mat);
      seg.rotation.x = Math.PI / 2;
      seg.position.set(side * (ROOM.hw - 0.04), y, 0);
      scene.add(seg);
    });
    /* curved segments */
    [1, -1].forEach(function (side) {
      var arc = new THREE.Mesh(new THREE.TorusGeometry(ROOM.hw - 0.04, tube, 6, 30, Math.PI), mat);
      arc.rotation.x = -Math.PI / 2;
      arc.rotation.z = side > 0 ? 0 : Math.PI;
      arc.position.set(0, y, side * ROOM.straight);
      scene.add(arc);
    });
  }
  beltRing(0.95, bronzeMat, 0.03);            /* wainscot rail */
  beltRing(ROOM.h - 0.55, warmLineMat, 0.022); /* warm cove light line */
  /* stone base skirting */
  beltRing(0.12, darkBronze, 0.05);

  /* ceiling: a warm plane with a great oval opening to the stars */
  (function () {
    var shape = new THREE.Shape();
    var W2 = ROOM.hw + 0.6, L2 = ROOM.straight + ROOM.hw + 0.6;
    shape.moveTo(-W2, -L2);
    shape.lineTo(W2, -L2);
    shape.lineTo(W2, L2);
    shape.lineTo(-W2, L2);
    shape.closePath();
    var hole = new THREE.Path();
    hole.moveTo(-2.2, -10);
    hole.lineTo(2.2, -10);
    hole.lineTo(2.2, 10);
    hole.lineTo(-2.2, 10);
    hole.closePath();
    shape.holes.push(hole);
    var geo = new THREE.ShapeGeometry(shape, 36);
    var ceil = new THREE.Mesh(geo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = ROOM.h;
    scene.add(ceil);
    /* bronze rim on the strip's edges + the two violet rails of the original */
    [[-2.24, 20.2, 0.055], [2.24, 20.2, 0.055]].forEach(function (r) {
      var edge = new THREE.Mesh(new THREE.CylinderGeometry(r[2], r[2], r[1], 8), bronzeMat);
      edge.rotation.x = Math.PI / 2;
      edge.position.set(r[0], ROOM.h - 0.02, 0);
      scene.add(edge);
    });
    [[-10.05], [10.05]].forEach(function (r) {
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 4.5, 8), bronzeMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(0, ROOM.h - 0.02, r[0]);
      scene.add(cap);
    });
    [-2.05, 2.05].forEach(function (x) {
      var railGlow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 19.6), warmLineMat);
      railGlow.position.set(x, ROOM.h - 0.05, 0);
      scene.add(railGlow);
    });
  })();

  /* the entry: a bronze-arched door on the near curve, brand sign above */
  (function () {
    var doorR = 6.95;
    var door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.6), new THREE.MeshStandardMaterial({ color: 0x241d2e, roughness: 0.5, metalness: 0.3 }));
    door.position.set(0, 1.8, ROOM.straight + doorR);
    door.rotation.y = Math.PI;
    scene.add(door);
    var arch = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.07, 8, 24, Math.PI), bronzeMat);
    arch.position.set(0, 3.6, ROOM.straight + doorR - 0.02);
    arch.rotation.y = Math.PI;
    scene.add(arch);
    var sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 1.15),
      new THREE.MeshBasicMaterial({ map: brandTexture(), transparent: true, depthWrite: false })
    );
    sign.position.set(0, 5.35, ROOM.straight + doorR - 0.04);
    sign.rotation.y = Math.PI;
    scene.add(sign);
  })();

  /* light: warm, layered, cheap */
  scene.add(new THREE.AmbientLight(0x9a8ecf, 0.36));
  scene.add(new THREE.HemisphereLight(0x6a5fae, 0x0d0b14, 0.44));
  [[0, -4.5], [0, 0], [0, 4.5]].forEach(function (p, i) {
    var pt = new THREE.PointLight(i % 2 ? 0xffe9cc : 0xfff2dd, 20, 16, 1.8);
    pt.position.set(p[0], ROOM.h - 0.7, p[1]);
    scene.add(pt);
  });
  /* starlight breath through the oval */
  var moon = new THREE.PointLight(0xcdd4f2, 16, 20, 1.7);
  moon.position.set(0, ROOM.h + 1.2, 0);
  scene.add(moon);

  /* benches: dark bronze legs, warm stone tops, soft contact shadows */
  var blobTex = radialTexture('rgba(30, 24, 18, 0.5)', 'rgba(30, 24, 18, 0)');
  var benches = [];
  [[-3.1, 0], [3.1, 0]].forEach(function (bz) {
    var top = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 2.0), new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.55, metalness: 0.1 }));
    top.position.set(bz[0], 0.44, bz[1]);
    scene.add(top);
    [[-0.8], [0.8]].forEach(function (lz) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), darkBronze);
      leg.position.set(bz[0], 0.21, bz[1] + lz[0]);
      scene.add(leg);
    });
    var sh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.7, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(bz[0], 0.012, bz[1]);
    scene.add(sh);
    benches.push({ x: bz[0], z: bz[1], hx: 0.5, hz: 1.2 });
  });

  /* dust motes catching the lamplight */
  var dust = null;
  (function () {
    var N = 160;
    var pos0 = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos0[i * 3] = (Math.random() - 0.5) * 13;
      pos0[i * 3 + 1] = Math.random() * (ROOM.h - 1) + 0.4;
      pos0[i * 3 + 2] = (Math.random() - 0.5) * 26;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos0, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xa79aff, size: 0.02, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(dust);
  })();

  /* a soft pool of light follows the visitor across the stone */
  var playerHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 2.8),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(140, 120, 255, 0.30)', 'rgba(140, 120, 255, 0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  playerHalo.rotation.x = -Math.PI / 2;
  playerHalo.position.y = 0.014;
  scene.add(playerHalo);

  /* ---------- holograms (saturated — they read in daylight) ---------- */
  var holoLineMat = function (color) {
    return new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false });
  };
  var holoFillMat = function (color) {
    return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  };

  function starShape(r) {
    var s = new THREE.Shape();
    s.moveTo(0, r);
    s.lineTo(r * 0.2, r * 0.2);
    s.lineTo(r, 0);
    s.lineTo(r * 0.2, -r * 0.2);
    s.lineTo(0, -r);
    s.lineTo(-r * 0.2, -r * 0.2);
    s.lineTo(-r, 0);
    s.lineTo(-r * 0.2, r * 0.2);
    s.closePath();
    return s;
  }

  function makeHologram(kind, scale) {
    var g = new THREE.Group();
    var aura = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(108, 92, 255, 0.30)', 'rgba(108, 92, 255, 0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    g.add(aura);
    var core = new THREE.Group();
    g.add(core);
    var i, m;

    if (kind === 'globe') {
      core.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(0.52, 18, 12)), holoLineMat(0x1F8FD8)));
      core.add(new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 12), holoFillMat(0x1F8FD8)));
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.01, 6, 48), new THREE.MeshBasicMaterial({ color: 0x5B4CF5, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = Math.PI / 2.4;
      core.add(ring);
    } else if (kind === 'device') {
      core.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.44, 0.84, 0.05)), holoLineMat(0x0FA88C)));
      core.add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.84, 0.05), holoFillMat(0x0FA88C)));
      for (i = 0; i < 3; i++) {
        var card = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), holoFillMat(0x0FA88C));
        card.userData.orbit = { r: 0.62, sp: 0.7 + i * 0.25, ph: i * 2.1, y: -0.15 + i * 0.16 };
        card.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.3, 0.18)), holoLineMat(0x0FA88C)));
        core.add(card);
      }
    } else if (kind === 'neural') {
      var nodes = [];
      for (i = 0; i < 15; i++) {
        var v = new THREE.Vector3((Math.random() - 0.5) * 1.15, (Math.random() - 0.5) * 0.95, (Math.random() - 0.5) * 1.15);
        nodes.push(v);
        var nm = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), new THREE.MeshBasicMaterial({ color: 0x6C5CFF, transparent: true, opacity: 0.95, depthWrite: false }));
        nm.position.copy(v);
        nm.userData.pulse = Math.random() * 6.28;
        core.add(nm);
      }
      var pts = [];
      for (i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          if (nodes[i].distanceTo(nodes[j]) < 0.62) { pts.push(nodes[i].clone(), nodes[j].clone()); }
        }
      }
      var lg = new THREE.BufferGeometry().setFromPoints(pts);
      core.add(new THREE.LineSegments(lg, holoLineMat(0x6C5CFF)));
    } else if (kind === 'game') {
      core.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.48)), holoLineMat(0xE8722E)));
      core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.48), holoFillMat(0xE8722E)));
      for (i = 0; i < 4; i++) {
        var cube = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.09, 0.09, 0.09)), holoLineMat(0xE8722E));
        cube.userData.orbit = { r: 0.78, sp: 0.9 + i * 0.3, ph: i * 1.57, y: 0 };
        core.add(cube);
      }
    } else { /* star */
      var shape = starShape(0.62);
      core.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ShapeGeometry(shape)), holoLineMat(0x5B4CF5)));
      m = new THREE.Mesh(new THREE.ShapeGeometry(shape), holoFillMat(0x6C5CFF));
      m.material.opacity = 0.16;
      core.add(m);
      var halo = [];
      for (i = 0; i < 60; i++) {
        var a = Math.random() * 6.28, rr = 0.75 + Math.random() * 0.35;
        halo.push(new THREE.Vector3(Math.cos(a) * rr, (Math.random() - 0.5) * 0.5, Math.sin(a) * rr));
      }
      var hg = new THREE.BufferGeometry().setFromPoints(halo);
      core.add(new THREE.Points(hg, new THREE.PointsMaterial({ color: 0x6C5CFF, size: 0.022, transparent: true, opacity: 0.8, depthWrite: false })));
    }

    var rings = [];
    for (i = 0; i < 2; i++) {
      var r = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.008, 5, 40), new THREE.MeshBasicMaterial({ color: 0x5B4CF5, transparent: true, opacity: 0.4, depthWrite: false }));
      r.rotation.x = Math.PI / 2;
      r.userData.phase = i * 0.5;
      rings.push(r);
      g.add(r);
    }

    g.scale.setScalar(scale || 1);
    g.userData = { core: core, rings: rings, aura: aura, excite: 0, spin: 0.5 + Math.random() * 0.2 };
    return g;
  }

  var holograms = [];

  /* ---------- pedestals: a quiet ring around the star ---------- */
  var coneTex = coneTexture();
  var pedestalDefs = [
    { id: 'cap-web', holo: 'globe', x: -3.3, z: -2.5, label: 'אתרים וחוויות', tag: 'מה אנחנו בונים', accent: '#1F8FD8',
      body: 'אתרים שמרגישים כמו מקום, לא כמו דף. האולם שאתם עומדים בו עכשיו נבנה באותם כלים בדיוק — ורץ בדפדפן, בלי להתקין כלום.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-sys', holo: 'device', x: 3.3, z: -2.5, label: 'אפליקציות ומערכות', tag: 'מה אנחנו בונים', accent: '#0FA88C',
      body: 'מהרעיון ועד מוצר שרץ בענן: אפליקציות, מערכות ניהול וכלים פנימיים שנתפרים בדיוק לצורת העבודה של העסק.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-ai', holo: 'neural', x: -3.3, z: 2.5, label: 'AI ואוטומציה', tag: 'מה אנחנו בונים', accent: '#6C5CFF',
      body: 'תהליכים שקורים מעצמם: מיון פניות, טיוטות מסמכים, חיבורים בין מערכות — עם בקרה אנושית בנקודות שחשוב.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-play', holo: 'game', x: 3.3, z: 2.5, label: 'משחקים וחוויות', tag: 'מה אנחנו בונים', accent: '#E8722E',
      body: 'הדרך הכי טובה להבין מוצר היא לשחק בו: סימולטורים, קונפיגורטורים וחוויות אינטראקטיביות שהופכות סקרנות להחלטה.', link: 'services.html', linkText: 'לעמוד השירותים' }
  ];

  var pickables = [];
  var liveArts = [];
  var billboards = [];

  pedestalDefs.forEach(function (def) {
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.95, 24), new THREE.MeshStandardMaterial({ color: 0xE3DCCB, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.9 }));
    base.position.set(def.x, 0.475, def.z);
    scene.add(base);
    var collar = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.02, 8, 40), bronzeMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(def.x, 0.96, def.z);
    scene.add(collar);
    var bshadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.7, depthWrite: false }));
    bshadow.rotation.x = -Math.PI / 2;
    bshadow.position.set(def.x, 0.011, def.z);
    scene.add(bshadow);

    var cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.8, 2.4, 20, 1, true),
      new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    cone.position.set(def.x, 2.25, def.z);
    scene.add(cone);

    var holo = makeHologram(def.holo, 0.92);
    holo.position.set(def.x, 1.8, def.z);
    scene.add(holo);
    holograms.push(holo);
    def._holo = holo;

    var label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.35),
      new THREE.MeshBasicMaterial({ map: holoLabelTexture(def.label), transparent: true, depthWrite: false })
    );
    label.position.set(def.x, 2.8, def.z);
    scene.add(label);
    billboards.push(label);

    var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(def.x, 1.6, def.z);
    hit.userData.art = { title: def.label, tag: def.tag, body: def.body, link: def.link, self: true, linkText: def.linkText, _holo: holo, _glow: null };
    scene.add(hit);
    pickables.push(hit);
  });

  /* the atrium star floats beneath the oval of stars */
  var atriumStar = makeHologram('star', 2.1);
  atriumStar.position.set(0, 4.5, 0);
  scene.add(atriumStar);
  holograms.push(atriumStar);
  var atriumHit = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  atriumHit.position.copy(atriumStar.position);
  atriumHit.userData.art = {
    title: 'ORBO', tag: 'הסטודיו', _holo: atriumStar, _glow: null, self: true,
    body: 'הכוכב של אורבו. כל מה שסביבכם — האולם, השמיים, ההולוגרמות והציורים החיים — נבנה כאן, בקוד, בלי אף קובץ מוכן. ככה נראית אצלנו גישה לפרויקט.',
    link: 'studio.html', linkText: 'להכיר אותנו'
  };
  scene.add(atriumHit);
  pickables.push(atriumHit);

  var comets = [];
  (function () {
    var cometTex = radialTexture('rgba(108, 92, 255, 0.8)', 'rgba(108, 92, 255, 0)');
    for (var i = 0; i < 3; i++) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.45),
        new THREE.MeshBasicMaterial({ map: cometTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      scene.add(m);
      comets.push({ mesh: m, r: 2.4 + i * 0.4, sp: 0.5 + i * 0.17, ph: i * 2.1, tilt: 0.35 + i * 0.22 });
    }
  })();

  /* ---------- the collection ----------
     every piece hangs on a dark linen panel in a bronze frame; the
     curved-end pieces sit at an effective radius so nothing embeds. */
  var CURVE_R = 6.9;
  function curvePos(endSide, deg) {
    /* phi is the signed angle around the end's half-circle; the piece
       faces the circle's center so nothing embeds in the curve */
    var phi = deg * Math.PI / 180;
    return {
      px: Math.sin(phi) * CURVE_R,
      pz: endSide * (ROOM.straight + Math.cos(phi) * CURVE_R),
      ry: endSide > 0 ? Math.PI + phi : -phi
    };
  }
  var farL = curvePos(-1, -38), farR = curvePos(-1, 38);
  var nearL = curvePos(1, -42), nearR = curvePos(1, 42);

  var ART = [
    /* left straight wall */
    { id: 'bisomna', px: -(ROOM.hw - 0.06), pz: -4.6, ry: Math.PI / 2, title: 'BISOMNA', tag: 'אתר · באוויר', style: 'light', sub: 'אתר למיזם שינה ישראלי', domain: 'bisomna.com', link: 'https://bisomna.com', accent: '#5B4CF5',
      body: 'אתר רחב למיזם בתחום השינה — מוצר, מדע, חנות ומשקיעים. וידאו שנע יחד עם הגלילה ותצוגת מוצר שנפתחת לשכבות, והכול נשאר מהיר גם בנייד.' },
    { id: 'orbo', px: -(ROOM.hw - 0.06), pz: 0, ry: Math.PI / 2, title: 'orbosolutions.com', tag: 'הבית שלנו', style: 'dark', sub: 'דף הבית של הסטודיו', domain: 'orbosolutions.com', link: 'index.html', self: true, accent: '#6C5CFF',
      body: 'דף הבית שלנו הוא מסע: גוללים, והמצלמה עפה דרך עולם של חלקיקים שמתגבשים לצורות. בנוי כולו בקוד, בלי אף קובץ תמונה.' },
    { id: 'aurora', px: -(ROOM.hw - 0.06), pz: 4.6, ry: Math.PI / 2, live: 'aurora', title: 'AURORA', tag: 'ציור חי · המעבדה', accent: '#86B32B', link: 'lab/01-aurora-gsap/',
      body: 'סרטי אור שנעים בזרם. הציור שעל הקיר נצבע מחדש עשרות פעמים בשנייה, ממש עכשיו — כמו כל ציורי המעבדה כאן.' },
    /* right straight wall */
    { id: 'genesis', px: ROOM.hw - 0.06, pz: -4.6, ry: -Math.PI / 2, gen: genesisTexture, title: 'GENESIS', tag: 'אמנות גנרטיבית', accent: '#E8722E',
      body: 'שלוש מאות קווים ששוחררו לשדה זרימה מתמטי. אף אחד לא צייר את היצירה הזאת — היא חושבה, קו אחרי קו, ברגע שנכנסתם למוזיאון.' },
    { id: 'mosaic', px: ROOM.hw - 0.06, pz: 0, ry: -Math.PI / 2, gen: mosaicTexture, title: 'MOSAIC', tag: 'אמנות גנרטיבית', accent: '#6C5CFF',
      body: 'פסיפס שנבנה מחלוקת המרחב בין ארבעים ושש נקודות אקראיות. כל ריצה מייצרת פסיפס שלא היה קיים מעולם.' },
    { id: 'flux', px: ROOM.hw - 0.06, pz: 4.6, ry: -Math.PI / 2, live: 'flux', title: 'FLUX', tag: 'ציור חי · המעבדה', accent: '#E0402F', link: 'lab/04-flux-shaders/',
      body: 'שדות צבע שזורמים על המסך לפי כללים מתמטיים. בגרסה המלאה — שישה שדות שונים, ישר מול המעבד הגרפי.' },
    /* far curve: the finale flanked by two living paintings */
    { id: 'nebula', px: farL.px, pz: farL.pz, ry: farL.ry, live: 'nebula', title: 'NEBULA', tag: 'ציור חי · המעבדה', accent: '#1F8FD8', link: 'lab/02-nebula-three/',
      body: 'גלקסיה של חלקיקים שמסתחררת לאט. בגרסה המלאה גוללים אל תוך מרכז הגלקסיה.' },
    { id: 'star', px: 0, pz: -(ROOM.straight + CURVE_R), ry: 0, title: 'ORBO', tag: 'הסטודיו', style: 'dark', big: true, sub: 'רעיונות יש לכולם. אנחנו הופכים אותם למציאות.', accent: '#6C5CFF',
      body: 'תודה שביקרתם. אם משהו כאן הדליק לכם רעיון — נשמח לשמוע עליו.', contact: true },
    { id: 'terra', px: farR.px, pz: farR.pz, ry: farR.ry, live: 'terra', title: 'TERRA', tag: 'ציור חי · המעבדה', accent: '#C9A05C', link: 'lab/05-terra-webgl/',
      body: 'רכסי הרים שמחושבים מרעש מתמטי טהור, תחת שמש נמוכה. בגרסה המלאה גולשים בין נופים שלמים.' },
    /* near curve, flanking the door */
    { id: 'prism', px: nearL.px, pz: nearL.pz, ry: nearL.ry, live: 'prism', title: 'PRISM', tag: 'ציור חי · המעבדה', accent: '#7A5CFF', link: 'lab/03-prism-r3f/',
      body: 'אלומת אור שנשברת דרך גאומטריה ומתפצלת לספקטרום. בגרסה המלאה — חדר חומרים תלת־ממדי שלם.' },
    { id: 'fractal', px: nearR.px, pz: nearR.pz, ry: nearR.ry, gen: fractalTexture, title: 'JULIA', tag: 'אמנות גנרטיבית', accent: '#7A5CFF',
      body: 'קבוצת ז׳וליה — נוסחה אחת קצרה שמכילה אינסוף. ככל שמתקרבים, מתגלים עוד ועוד עולמות. חושבה פיקסל־פיקסל בכניסתכם.' }
  ];

  var glowTexNeutral = radialTexture('rgba(255, 255, 255, 0.7)', 'rgba(255, 255, 255, 0)');

  ART.forEach(function (art) {
    var group = new THREE.Group();
    var W = art.big ? 3.6 : 2.2, H = art.big ? 2.25 : 1.375;
    var AY = art.big ? 2.6 : 2.1;

    group.position.set(art.px, 0, art.pz);
    group.rotation.y = art.ry;

    /* the dark linen panel the piece hangs on */
    var panelM = new THREE.Mesh(new THREE.BoxGeometry(W + 1.0, H + 1.0, 0.05), linenMat);
    panelM.position.set(0, AY, 0.028);
    group.add(panelM);
    /* bronze edge around the panel */
    var edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.022, 6, 4), bronzeMat);
    edge.rotation.z = Math.PI / 4;
    edge.scale.set((W + 1.0) / 1.414, (H + 1.0) / 1.414, 1);
    edge.position.set(0, AY, 0.055);
    group.add(edge);

    /* soft accent glow on the linen */
    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 1.35, H * 1.5),
      new THREE.MeshBasicMaterial({ map: glowTexNeutral, color: new THREE.Color(art.accent || '#6C5CFF'), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.position.set(0, AY, 0.06);
    group.add(glow);

    /* bronze frame */
    var d = 0.06, th = 0.07, off = 0.1;
    [[0, AY + H / 2 + th / 2, W + th * 2, th], [0, AY - H / 2 - th / 2, W + th * 2, th]].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(s[2], s[3], d), darkBronze);
      m.position.set(s[0], s[1], off - d / 2);
      group.add(m);
    });
    [[-W / 2 - th / 2, AY], [W / 2 + th / 2, AY]].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(th, H, d), darkBronze);
      m.position.set(s[0], s[1], off - d / 2);
      group.add(m);
    });

    var tex, liveState = null;
    if (art.live && window.ORBO_LAB) {
      var aw = 640, ah = 400;
      var artC = ctx2d(aw, ah);
      var texC = ctx2d(aw, ah);
      liveState = { kind: art.live, art: artC, tex: texC, w: aw, h: ah, t: Math.random() * 60, seed: ORBO_LAB.makeSeed(art.live, aw, ah) };
      texC.fillStyle = '#0F0D18';
      texC.fillRect(0, 0, aw, ah);
      tex = asTexture(texC.canvas);
    } else if (art.gen) {
      tex = art.gen();
    } else {
      tex = posterTexture(art);
    }
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex }));
    plane.position.set(0, AY, off + 0.001);
    plane.userData.art = art;
    group.add(plane);
    pickables.push(plane);
    art._glow = glow;
    art._plane = plane;

    if (liveState) {
      liveState.texture = tex;
      liveState.plane = plane;
      liveArts.push(liveState);
    }

    if (!art.big) {
      var plq = new THREE.Mesh(
        new THREE.PlaneGeometry(0.56, 0.28),
        new THREE.MeshBasicMaterial({ map: plaqueTexture(art) })
      );
      plq.position.set(W / 2 + 0.95, 1.35, 0.02);
      group.add(plq);
    }

    /* desktop: one warm spot per piece */
    if (!isTouch) {
      var sp = new THREE.SpotLight(0xfff0dc, 16, 9, 0.5, 0.6, 1.5);
      var sWorld = new THREE.Vector3(0, ROOM.h - 0.35, 1.7).applyEuler(group.rotation).add(group.position);
      sp.position.copy(sWorld);
      var tWorld = new THREE.Vector3(0, AY, 0).applyEuler(group.rotation).add(group.position);
      sp.target.position.copy(tWorld);
      scene.add(sp);
      scene.add(sp.target);
      var hs = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.16, 10), darkBronze);
      hs.position.copy(sWorld);
      hs.position.y = ROOM.h - 0.1;
      scene.add(hs);
    }

    scene.add(group);
  });

  /* ---------- player ---------- */
  var yaw = Math.PI;    /* enter facing the hall from the door end */
  var pitch = 0;
  var pos = new THREE.Vector3(0, EYE, 10.6);
  var vel = new THREE.Vector3();
  var keys = {};
  var running = false;
  var bobPhase = 0;
  var started = false;
  var glide = null;

  function applyCamera() {
    camera.position.copy(pos);
    camera.rotation.set(pitch, yaw, 0);
  }
  yaw = Math.PI;
  pos.set(0, 2.7, 12.6);
  pitch = -0.05;
  applyCamera();

  /* ---------- input: desktop ---------- */
  var locked = false;
  function requestLock() {
    if (isTouch) return;
    canvas.requestPointerLock && canvas.requestPointerLock();
  }
  document.addEventListener('pointerlockchange', function () {
    locked = document.pointerLockElement === canvas;
    crosshair.style.opacity = locked ? 1 : 0.25;
    if (started && !locked && !panelOpen) showHint('לחצו על המסך כדי להמשיך בסיור', 2600);
  });
  document.addEventListener('mousemove', function (e) {
    if (!locked || glide) return;
    yaw -= e.movementX * 0.0021;
    pitch -= e.movementY * 0.0021;
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
  });
  addEventListener('keydown', function (e) { keys[e.code] = true; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') running = true; });
  addEventListener('keyup', function (e) { keys[e.code] = false; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') running = false; });
  canvas.addEventListener('click', function () {
    if (!started || isTouch || panelOpen) return;
    if (!locked) { requestLock(); return; }
    if (hoverArt) openPanel(hoverArt);
  });

  /* ---------- input: touch ---------- */
  var moveVec = { x: 0, y: 0 };
  var moveTouch = null, lookTouch = null, lookLast = null, tapStart = null;
  if (isTouch) {
    addEventListener('touchstart', function (e) {
      if (!started || panelOpen) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.clientX < innerWidth * 0.45 && moveTouch === null) {
          moveTouch = t.identifier;
          stickEl.style.left = (t.clientX - 55) + 'px';
          stickEl.style.top = (t.clientY - 55) + 'px';
          stickEl.classList.add('show');
        } else if (lookTouch === null) {
          lookTouch = t.identifier;
          lookLast = { x: t.clientX, y: t.clientY };
          tapStart = { x: t.clientX, y: t.clientY, t: performance.now() };
        }
      }
      e.preventDefault();
    }, { passive: false });
    addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === moveTouch) {
          var r = stickEl.getBoundingClientRect();
          var cx = r.left + 55, cy = r.top + 55;
          var dx = (t.clientX - cx) / 44, dy = (t.clientY - cy) / 44;
          var len = Math.hypot(dx, dy);
          if (len > 1) { dx /= len; dy /= len; }
          moveVec.x = dx; moveVec.y = dy;
          stickThumb.style.transform = 'translate(' + dx * 30 + 'px,' + dy * 30 + 'px)';
        } else if (t.identifier === lookTouch && lookLast) {
          yaw -= (t.clientX - lookLast.x) * 0.0042;
          pitch -= (t.clientY - lookLast.y) * 0.0042;
          pitch = Math.max(-1.35, Math.min(1.35, pitch));
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });
    addEventListener('touchend', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === moveTouch) {
          moveTouch = null;
          moveVec.x = moveVec.y = 0;
          stickThumb.style.transform = '';
          stickEl.classList.remove('show');
        } else if (t.identifier === lookTouch) {
          if (tapStart && performance.now() - tapStart.t < 260 && Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) < 12) {
            tapPick(t.clientX, t.clientY);
          }
          lookTouch = null; lookLast = null; tapStart = null;
        }
      }
    });
  }

  /* ---------- interaction ---------- */
  var raycaster = new THREE.Raycaster();
  raycaster.far = 8;
  var hoverArt = null;
  var panelOpen = false;
  var hintTimer = null;

  function showHint(text, ms) {
    hintText.textContent = text;
    hintWrap.classList.add('show');
    clearTimeout(hintTimer);
    if (ms) hintTimer = setTimeout(function () { hintWrap.classList.remove('show'); }, ms);
  }

  function setHover(art) {
    if (art === hoverArt) return;
    hoverArt = art;
    if (art) {
      crosshair.classList.add('hot');
      showHint(isTouch ? 'הקישו לפרטים' : '״' + art.title + '״ — לחצו לפרטים');
    } else {
      crosshair.classList.remove('hot');
      hintWrap.classList.remove('show');
    }
  }

  function pickCenter() {
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    var hits = raycaster.intersectObjects(pickables, false);
    setHover(hits.length && hits[0].distance < 6 ? hits[0].object.userData.art : null);
  }

  function tapPick(x, y) {
    var ndc = { x: (x / innerWidth) * 2 - 1, y: -(y / innerHeight) * 2 + 1 };
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(pickables, false);
    if (hits.length && hits[0].distance < 8) openPanel(hits[0].object.userData.art);
  }

  function openPanel(art) {
    panelOpen = true;
    panelTag.textContent = art.tag;
    panelTitle.textContent = art.title;
    panelBody.textContent = art.body;
    if (art.contact) {
      panelLink.hidden = false;
      panelLink.textContent = 'דברו איתנו';
      panelLink.removeAttribute('target');
      panelLink.href = 'contact.html';
    } else if (art.link) {
      panelLink.hidden = false;
      panelLink.textContent = art.linkText || (art.self ? 'לדף הבית' : 'לצפייה חיה');
      if (art.self) panelLink.removeAttribute('target'); else panelLink.setAttribute('target', '_blank');
      panelLink.href = art.link;
    } else {
      panelLink.hidden = true;
    }
    if (art._holo) art._holo.userData.excite = 1;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    if (locked && document.exitPointerLock) document.exitPointerLock();
  }
  function closePanel(relock) {
    panelOpen = false;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    if (relock && !isTouch) requestLock();
  }
  panelResume.addEventListener('click', function () { closePanel(true); });
  panelClose.addEventListener('click', function () { closePanel(true); });
  addEventListener('keydown', function (e) { if (e.code === 'Escape' && panelOpen) closePanel(false); });

  /* ---------- entry ---------- */
  enterBtn.addEventListener('click', function () {
    enterEl.classList.add('gone');
    hud.classList.add('on');
    hud.setAttribute('aria-hidden', 'false');
    started = true;
    if (reduced) {
      pos.set(0, EYE, 10.6);
      pitch = 0;
    } else {
      glide = { t: 0, dur: 2.0, fromP: pos.clone(), toP: new THREE.Vector3(0, EYE, 10.6), fromPitch: pitch, toPitch: 0 };
    }
    requestLock();
    setTimeout(function () {
      showHint(isTouch ? 'ג׳ויסטיק בצד — תנועה · גרירה — להסתכל' : 'W A S D — תנועה · עכבר — להסתכל', 4200);
    }, reduced ? 300 : 2200);
  });

  /* ---------- movement & collisions ---------- */
  var fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), wish = new THREE.Vector3();
  var pedCollide = pedestalDefs.map(function (d) { return { x: d.x, z: d.z, r: 0.92 }; });

  /* the stadium: a rectangle capped by two discs */
  function walkable(x, z) {
    if (Math.abs(x) < R_IN && Math.abs(z) <= ROOM.straight) return true;
    var dz = Math.abs(z) - ROOM.straight;
    if (dz > 0 && x * x + dz * dz < R_IN * R_IN) return true;
    return false;
  }

  function step(dt) {
    if (glide) {
      glide.t += dt;
      var k = Math.min(glide.t / glide.dur, 1);
      k = 1 - Math.pow(1 - k, 3);
      pos.lerpVectors(glide.fromP, glide.toP, k);
      pitch = glide.fromPitch + (glide.toPitch - glide.fromPitch) * k;
      if (glide.t >= glide.dur) glide = null;
      applyCamera();
      return;
    }
    if (!started) { applyCamera(); return; }

    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    rgt.set(Math.cos(yaw), 0, -Math.sin(yaw));
    wish.set(0, 0, 0);
    if (!panelOpen) {
      if (keys.KeyW || keys.ArrowUp) wish.add(fwd);
      if (keys.KeyS || keys.ArrowDown) wish.sub(fwd);
      if (keys.KeyD || keys.ArrowRight) wish.add(rgt);
      if (keys.KeyA || keys.ArrowLeft) wish.sub(rgt);
      if (isTouch) {
        wish.add(fwd.clone().multiplyScalar(-moveVec.y));
        wish.add(rgt.clone().multiplyScalar(moveVec.x));
      }
    }
    if (wish.lengthSq() > 1) wish.normalize();
    var speed = running ? 4.2 : 2.5;
    wish.multiplyScalar(speed);
    var s = 1 - Math.exp(-10 * dt);
    vel.lerp(wish, s);
    var px0 = pos.x, pz0 = pos.z;
    pos.addScaledVector(vel, dt);
    if (!walkable(pos.x, pos.z)) {
      if (walkable(px0, pos.z)) pos.x = px0;
      else if (walkable(pos.x, pz0)) pos.z = pz0;
      else { pos.x = px0; pos.z = pz0; }
    }

    var i, b, dx, dz, dd;
    for (i = 0; i < benches.length; i++) {
      b = benches[i];
      dx = pos.x - b.x; dz = pos.z - b.z;
      if (Math.abs(dx) < b.hx && Math.abs(dz) < b.hz) {
        if (b.hx - Math.abs(dx) < b.hz - Math.abs(dz)) pos.x = b.x + (dx > 0 ? b.hx : -b.hx);
        else pos.z = b.z + (dz > 0 ? b.hz : -b.hz);
      }
    }
    for (i = 0; i < pedCollide.length; i++) {
      b = pedCollide[i];
      dx = pos.x - b.x; dz = pos.z - b.z;
      dd = Math.hypot(dx, dz);
      if (dd < b.r && dd > 0.0001) {
        pos.x = b.x + dx / dd * b.r;
        pos.z = b.z + dz / dd * b.r;
      }
    }

    var sp2 = vel.length();
    if (!reduced && sp2 > 0.4) bobPhase += dt * sp2 * 3.4;
    pos.y = EYE + (reduced ? 0 : Math.sin(bobPhase * 2) * 0.026 * Math.min(sp2 / 2.5, 1));

    applyCamera();
  }

  /* ---------- living paintings ---------- */
  var liveTick = 0;
  function paintLive(dt) {
    liveTick++;
    if (liveTick % 2) return;
    for (var i = 0; i < liveArts.length; i++) {
      var L = liveArts[i];
      var wp = L.plane.getWorldPosition(new THREE.Vector3());
      if (wp.distanceTo(pos) > 15) continue;
      var near = Math.max(0, 1 - wp.distanceTo(pos) / 9);
      L.t += dt * (2 + near * 2.5);
      ORBO_LAB.draw[L.kind]({ ctx: L.art, w: L.w, h: L.h, t: L.t, seed: L.seed });
      var g = L.tex;
      g.fillStyle = '#0F0D18';
      g.fillRect(0, 0, L.w, L.h);
      var rg = g.createRadialGradient(L.w / 2, L.h * 1.05, 0, L.w / 2, L.h * 1.05, L.w * 0.6);
      rg.addColorStop(0, 'rgba(108, 92, 255, 0.18)');
      rg.addColorStop(1, 'rgba(108, 92, 255, 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, L.w, L.h);
      g.drawImage(L.art.canvas, 0, 0);
      L.texture.needsUpdate = true;
    }
  }

  /* ---------- holograms tick ---------- */
  function tickHolograms(t, dt) {
    for (var i = 0; i < holograms.length; i++) {
      var h = holograms[i];
      var u = h.userData;
      u.excite = Math.max(0, u.excite - dt * 0.8);
      var prox = Math.max(0, 1 - h.position.distanceTo(pos) / 6);
      var ex = Math.min(1, u.excite + prox * 0.55);
      u.core.rotation.y += dt * (u.spin + ex * 3.2);
      u.core.position.y = Math.sin(t * 0.9 + i * 1.7) * 0.05;
      var flick = 1 + ex * 0.28 + (reduced ? 0 : Math.sin(t * 13 + i * 3) * 0.02);
      u.core.scale.setScalar(flick);
      u.aura.lookAt(pos.x, h.position.y, pos.z);
      u.aura.material.opacity = 0.5 + ex * 0.4;
      for (var k = 0; k < u.core.children.length; k++) {
        var ch = u.core.children[k];
        if (ch.userData.orbit) {
          var o = ch.userData.orbit;
          var a = t * o.sp + o.ph;
          ch.position.set(Math.cos(a) * o.r, o.y, Math.sin(a) * o.r);
          ch.lookAt(0, ch.position.y, 0);
        }
        if (ch.userData.pulse !== undefined) {
          ch.scale.setScalar(1 + Math.sin(t * 3 + ch.userData.pulse) * 0.35);
        }
      }
      for (var r = 0; r < u.rings.length; r++) {
        var ring = u.rings[r];
        var ph = ((t * 0.35 + ring.userData.phase) % 1);
        ring.position.y = -0.7 + ph * 1.5;
        ring.material.opacity = 0.4 * (1 - ph) + ex * 0.3;
      }
    }
  }

  /* ---------- reactive world ---------- */
  var tmpV = new THREE.Vector3();
  function tickReactive(t, dt) {
    for (var i = 0; i < ART.length; i++) {
      var a = ART[i];
      if (!a._plane) continue;
      a._plane.getWorldPosition(tmpV);
      var d = tmpV.distanceTo(pos);
      if (d > 18) continue;
      var prox = Math.max(0, Math.min(1, 1 - (d - 2) / 5));
      a._glow.material.opacity = 0.26 + prox * 0.3 + (a === hoverArt ? 0.16 : 0);
      var sc = 1 + prox * 0.03;
      a._plane.scale.set(sc, sc, 1);
    }
    playerHalo.position.x = pos.x;
    playerHalo.position.z = pos.z;
    playerHalo.material.opacity = 0.8 + (reduced ? 0 : Math.sin(t * 1.6) * 0.2);
    /* the sky shimmers: two star shells breathe against each other */
    if (!reduced) {
      skyA.rotation.y += dt * 0.0022;
      skyB.rotation.y -= dt * 0.0014;
      skyB.material.opacity = 0.72 + Math.sin(t * 0.8) * 0.18;
    }
    for (var k = 0; k < comets.length; k++) {
      var cm = comets[k];
      var a2 = t * cm.sp + cm.ph;
      cm.mesh.position.set(
        Math.cos(a2) * cm.r,
        4.5 + Math.sin(a2 * 1.3) * Math.sin(cm.tilt) * 0.9,
        Math.sin(a2) * cm.r * 0.8
      );
      cm.mesh.lookAt(pos.x, pos.y, pos.z);
    }
  }

  /* ---------- loop ---------- */
  var clock = new THREE.Clock();
  var pickTick = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    step(dt);
    paintLive(dt);
    tickHolograms(t, dt);
    tickReactive(t, dt);

    for (var i = 0; i < billboards.length; i++) {
      billboards[i].lookAt(pos.x, billboards[i].position.y, pos.z);
    }

    if (dust && !reduced) {
      dust.rotation.y += dt * 0.004;
      dust.position.y = Math.sin(t * 0.16) * 0.05;
    }

    pickTick++;
    if (started && !panelOpen && pickTick % 5 === 0) pickCenter();

    renderer.render(scene, camera);
  }
  frame();

  addEventListener('resize', function () {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  setTimeout(function () {
    if (!renderer.domElement.width && innerWidth) {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    }
  }, 600);

  /* QA handle — read-only peek at the world */
  window.__GALLERY = {
    renderer: renderer, scene: scene, camera: camera,
    pickables: pickables, liveArts: liveArts, holograms: holograms,
    pos: pos,
    state: function () {
      return {
        started: started, locked: locked, panelOpen: panelOpen,
        pos: { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2) },
        yaw: +yaw.toFixed(2), artworks: pickables.length, living: liveArts.length,
        holograms: holograms.length,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles
      };
    }
  };
})();
