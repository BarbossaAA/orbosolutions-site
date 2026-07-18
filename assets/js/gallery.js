/* ORBO — the museum, adrift.
   A dark marble palace floating alone in deep space. Through the great
   arch: an observation deck over the void, the Milky Way vast and close,
   the stream pouring off the edge into starlight. At the far end the
   hall grows out of an asteroid cave — the water's source. Inside:
   backlit posters, five LIVING lab paintings, generative artworks,
   hologram pedestals and the great atrium star.
   Textures are drawn at high resolution with bump and roughness maps —
   veined marble, worn plaster, cratered rock — all procedural.
   Desktop: pointer-lock + WASD, real shadows. Touch: joystick +
   drag-look + tap, lean rendering. No assets. */
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
  renderer.toneMappingExposure = 1.18;
  if (!isTouch) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05040c);
  scene.fog = new THREE.Fog(0x07060f, 42, 170);

  var camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 400);
  camera.rotation.order = 'YXZ';

  /* ---------- hall dimensions ---------- */
  var HALL = { w: 18, l: 62, h: 8 };       /* x: ±9, z: ±31; the deck continues past +31 */
  var EYE = 1.65;
  var TERRACE = { zEnd: 40.6 };
  var BOUND = { x: 7.6, zMin: -28.6, zMax: 40.2 };
  var LX = -HALL.w / 2 + 0.05, RX = HALL.w / 2 - 0.05;

  /* ---------- environment reflections (night hall) ---------- */
  (function buildEnv() {
    var env = new THREE.Scene();
    var mk = function (color, w, h, x, y, z, ry) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.y = ry || 0;
      env.add(m);
    };
    env.background = new THREE.Color(0x030309);
    mk(0x7a68e8, 18, 2.4, 0, 7, -8);
    mk(0x342b58, 26, 4, 0, 8, 10, Math.PI);
    mk(0xffb080, 4, 1.6, -9, 4, 0, Math.PI / 2);
    mk(0x58c8f0, 4, 1.6, 9, 4, 0, -Math.PI / 2);
    mk(0x161226, 40, 40, 0, -5, 0);
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.035).texture;
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
  /* fractal noise — the workhorse behind every "expensive-looking" surface */
  function fbm(x, y, oct) {
    var v = 0, a = 0.5, f = 1;
    for (var i = 0; i < oct; i++) {
      v += a * noise(x * f, y * f);
      f *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  /* ---------- material-quality suite: dark marble with matching maps ---------- */
  function marbleSuite() {
    var S = 1024;
    var col = ctx2d(S, S), bmp = ctx2d(S, S), rgh = ctx2d(S, S);
    /* base slab: deep blue-violet stone with large tonal drift */
    var img = col.createImageData(S, S);
    var bimg = bmp.createImageData(S, S);
    var rimg = rgh.createImageData(S, S);
    for (var y = 0; y < S; y += 1) {
      for (var x = 0; x < S; x += 1) {
        var u = x / S * 6, v = y / S * 6;
        var base = fbm(u, v, 4);                        /* slow tonal drift */
        /* veins: folded fbm produces branching bright threads */
        var w = fbm(u * 2.2 + 13.7, v * 2.2 + 5.1, 5);
        var vein = Math.pow(1 - Math.abs(Math.sin(w * 9.4 + base * 3)), 14);
        var vein2 = Math.pow(1 - Math.abs(Math.sin(w * 4.1 + 2.2)), 22) * 0.6;
        var vn = Math.min(1, vein + vein2);
        var r = 18 + base * 14 + vn * 96;
        var g = 15 + base * 12 + vn * 88;
        var b = 30 + base * 20 + vn * 122;
        var o = (y * S + x) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
        var h = 128 + vn * 70 - base * 26;              /* veins ride slightly proud */
        bimg.data[o] = h; bimg.data[o + 1] = h; bimg.data[o + 2] = h; bimg.data[o + 3] = 255;
        var ro = 70 + base * 60 - vn * 45;              /* veins polish brighter */
        rimg.data[o] = ro; rimg.data[o + 1] = ro; rimg.data[o + 2] = ro; rimg.data[o + 3] = 255;
      }
    }
    col.putImageData(img, 0, 0);
    bmp.putImageData(bimg, 0, 0);
    rgh.putImageData(rimg, 0, 0);
    var map = asTexture(col.canvas);
    var bump = asTexture(bmp.canvas, true);
    var rough = asTexture(rgh.canvas, true);
    [map, bump, rough].forEach(function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 10); });
    return { map: map, bump: bump, rough: rough };
  }

  function plasterSuite() {
    var S = 512;
    var col = ctx2d(S, S), bmp = ctx2d(S, S);
    var img = col.createImageData(S, S);
    var bimg = bmp.createImageData(S, S);
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var u = x / S * 5, v = y / S * 5;
        var p = fbm(u, v, 4);
        var fine = noise(x * 0.7, y * 0.7) * 0.5;
        var o = (y * S + x) * 4;
        var r = 26 + p * 16 + fine * 6;
        img.data[o] = r; img.data[o + 1] = r - 2; img.data[o + 2] = r + 8; img.data[o + 3] = 255;
        var h = 120 + p * 30 + fine * 40;
        bimg.data[o] = h; bimg.data[o + 1] = h; bimg.data[o + 2] = h; bimg.data[o + 3] = 255;
      }
    }
    col.putImageData(img, 0, 0);
    bmp.putImageData(bimg, 0, 0);
    var map = asTexture(col.canvas);
    var bump = asTexture(bmp.canvas, true);
    [map, bump].forEach(function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 3); });
    return { map: map, bump: bump };
  }

  function cofferTexture() {
    var S = 512;
    var c = ctx2d(S, S);
    c.fillStyle = '#141020';
    c.fillRect(0, 0, S, S);
    /* recessed panel with fake depth shading */
    var g = c.createLinearGradient(0, 40, 0, S - 40);
    g.addColorStop(0, '#0a0814');
    g.addColorStop(0.5, '#0e0b1a');
    g.addColorStop(1, '#080610');
    c.fillStyle = g;
    c.fillRect(44, 44, S - 88, S - 88);
    c.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    c.lineWidth = 8;
    c.strokeRect(48, 48, S - 96, S - 96);
    c.strokeStyle = 'rgba(132, 116, 232, 0.6)';
    c.lineWidth = 7;
    c.strokeRect(22, 22, S - 44, S - 44);
    c.strokeStyle = 'rgba(132, 116, 232, 0.14)';
    c.lineWidth = 3;
    c.strokeRect(60, 60, S - 120, S - 120);
    var t = asTexture(c.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 17);
    return t;
  }

  /* ---------- the sky: deep space and the Milky Way ---------- */
  function galaxyTexture() {
    var W = 2048, H = 1024;
    var c = ctx2d(W, H);
    /* void gradient — never pure black */
    var bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05040d');
    bg.addColorStop(0.5, '#080614');
    bg.addColorStop(1, '#04030b');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    /* the galactic band runs diagonally: y = band(x) */
    function bandY(x) { return H * 0.52 + Math.sin(x / W * Math.PI * 1.1 + 0.4) * H * 0.16; }

    /* far starfield — thousands, weighted small */
    for (var i = 0; i < 3200; i++) {
      var sx = Math.random() * W, sy = Math.random() * H;
      var m = Math.random();
      var near = Math.exp(-Math.pow((sy - bandY(sx)) / (H * 0.16), 2));
      if (Math.random() > 0.35 + near * 0.65) continue;     /* stars crowd the band */
      var s = m < 0.85 ? 1 : m < 0.97 ? 1.6 : 2.4;
      var tint = Math.random();
      var base = tint < 0.72 ? '226, 226, 255' : tint < 0.88 ? '255, 226, 196' : '178, 206, 255';
      c.fillStyle = 'rgba(' + base + ', ' + (0.25 + m * 0.7) + ')';
      c.fillRect(sx, sy, s, s);
    }

    /* nebula glow: thousands of soft blobs breathing along the band */
    c.globalCompositeOperation = 'lighter';
    for (var n = 0; n < 2400; n++) {
      var x = Math.random() * W;
      var spread = (Math.random() + Math.random() + Math.random() - 1.5) * H * 0.13;
      var y = bandY(x) + spread;
      var r = 8 + Math.random() * 46;
      var dCore = Math.abs(x - W * 0.56) / (W * 0.5);
      var pick = Math.random();
      var colr = pick < 0.42 ? [126, 106, 240] : pick < 0.72 ? [92, 130, 235] : dCore < 0.3 ? [255, 205, 150] : [180, 150, 255];
      var a = (0.012 + Math.random() * 0.02) * (1 - Math.abs(spread) / (H * 0.15));
      if (a <= 0) continue;
      var rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(' + colr[0] + ',' + colr[1] + ',' + colr[2] + ',' + a + ')');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    /* the bright core */
    var core = c.createRadialGradient(W * 0.56, bandY(W * 0.56), 0, W * 0.56, bandY(W * 0.56), 260);
    core.addColorStop(0, 'rgba(255, 226, 186, 0.30)');
    core.addColorStop(0.4, 'rgba(214, 178, 255, 0.14)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = core;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';

    /* dust lanes tear dark rifts through the band */
    for (var d = 0; d < 700; d++) {
      var dx = Math.random() * W;
      var dy = bandY(dx) + (Math.random() - 0.5) * H * 0.07;
      var dr = 10 + Math.random() * 34;
      var da = 0.05 + Math.random() * 0.10;
      var dg = c.createRadialGradient(dx, dy, 0, dx, dy, dr);
      dg.addColorStop(0, 'rgba(4, 3, 10, ' + da + ')');
      dg.addColorStop(1, 'rgba(4, 3, 10, 0)');
      c.fillStyle = dg;
      c.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
    }

    /* hero stars with four-point flares */
    c.globalCompositeOperation = 'lighter';
    for (var h = 0; h < 26; h++) {
      var hx = Math.random() * W, hy = Math.random() * H;
      var hr = 1.6 + Math.random() * 1.8;
      var warm = Math.random() < 0.3;
      var hcol = warm ? '255, 224, 190' : '224, 228, 255';
      var hg = c.createRadialGradient(hx, hy, 0, hx, hy, hr * 7);
      hg.addColorStop(0, 'rgba(' + hcol + ', 0.9)');
      hg.addColorStop(0.25, 'rgba(' + hcol + ', 0.28)');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = hg;
      c.fillRect(hx - hr * 7, hy - hr * 7, hr * 14, hr * 14);
      c.strokeStyle = 'rgba(' + hcol + ', 0.5)';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(hx - hr * 9, hy); c.lineTo(hx + hr * 9, hy);
      c.moveTo(hx, hy - hr * 9); c.lineTo(hx, hy + hr * 9);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    return asTexture(c.canvas);
  }

  var dome = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 20),
    new THREE.MeshBasicMaterial({ map: galaxyTexture(), side: THREE.BackSide, fog: false })
  );
  dome.rotation.set(0.35, Math.PI * 0.85, 0.2);   /* the band sweeps over the deck view */
  scene.add(dome);

  /* drifting asteroids far off the deck */
  var asteroids = [];

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
    g.addColorStop(0, 'rgba(150, 130, 255, 0.55)');
    g.addColorStop(1, 'rgba(150, 130, 255, 0)');
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
      c.font = '850 ' + (art.big ? 120 : 88) + 'px ' + FONT;
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

  function plaqueTexture(art) {
    var W = 512, H = 256;
    var c = ctx2d(W, H);
    var accent = art.accent || '#c9afff';
    var redraw = function () {
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#141022';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = accent;
      c.globalAlpha = 0.5;
      c.lineWidth = 3;
      c.strokeRect(8, 8, W - 16, H - 16);
      c.globalAlpha = 1;
      c.textAlign = 'right';
      c.direction = 'rtl';
      c.fillStyle = '#F4F2FA';
      c.font = '700 44px ' + FONT;
      c.fillText(art.title, W - 42, 96, W - 84);
      c.fillStyle = accent;
      c.globalAlpha = 0.9;
      c.font = '500 30px ' + FONT;
      c.fillText(art.tag, W - 42, 158, W - 84);
      c.globalAlpha = 1;
    };
    redraw();
    var t = asTexture(c.canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { redraw(); t.needsUpdate = true; });
    return t;
  }

  function wingTexture(text, ltr) {
    var c = ctx2d(1024, 256);
    var redraw = function () {
      c.clearRect(0, 0, 1024, 256);
      c.textAlign = 'center';
      c.direction = ltr ? 'ltr' : 'rtl';
      c.fillStyle = 'rgba(184, 164, 255, 0.5)';
      c.font = '850 150px ' + FONT;
      c.fillText(text, 512, 178);
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
      c.shadowColor = 'rgba(140, 120, 255, 0.9)';
      c.shadowBlur = 46;
      var g = c.createLinearGradient(0, 60, 0, 320);
      g.addColorStop(0, '#BCA8FF');
      g.addColorStop(1, '#7A5CFF');
      c.fillStyle = g;
      c.font = '850 210px ' + FONT;
      c.fillText('ORBO·GALLERY', W / 2, 272, W - 100);
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
      c.textAlign = 'center';
      c.direction = 'rtl';
      c.fillStyle = 'rgba(178, 225, 255, 0.95)';
      c.font = '700 56px ' + FONT;
      c.shadowColor = 'rgba(120, 200, 255, 0.9)';
      c.shadowBlur = 22;
      c.fillText(text, 256, 82, 470);
      c.shadowBlur = 0;
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

  /* ---------- the hall: a star-plan palace ----------
     no more single box. An octagonal ROTUNDA rises at the center under an
     open oculus; three gallery WINGS (east: the works, west: code art,
     north: the lab, ending in the asteroid cave) radiate from it through
     arched passages; a south corridor leads out to the observation deck. */
  var marble = marbleSuite();
  var plaster = plasterSuite();
  var wallMat = new THREE.MeshStandardMaterial({ map: plaster.map, bumpMap: plaster.bump, bumpScale: 0.6, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
  var floorMat = new THREE.MeshStandardMaterial({ map: marble.map, bumpMap: marble.bump, bumpScale: 0.35, roughnessMap: marble.rough, roughness: 1.0, metalness: 0.5, envMapIntensity: 1.25 });
  var stoneMat = new THREE.MeshStandardMaterial({ color: 0x211b33, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.9 });
  var trimMat = new THREE.MeshStandardMaterial({ color: 0x0c0a13, roughness: 0.5, metalness: 0.35 });
  var glowLineMat = new THREE.MeshBasicMaterial({ color: 0x8474e8 });
  var frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.32, metalness: 0.8, envMapIntensity: 1.2 });

  /* one marble ground under the whole plan */
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(58, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  function wall(w, h, x, y, z, ry) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    var base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 0.08), trimMat);
    base.position.set(x, 0.11, z);
    base.rotation.y = ry;
    base.translateZ(0.03);
    scene.add(base);
    [0.26, h - 0.5].forEach(function (yy) {
      var line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.02), glowLineMat);
      line.position.set(x, yy, z);
      line.rotation.y = ry;
      line.translateZ(0.05);
      scene.add(line);
    });
  }

  /* — the rotunda: four diagonal octagon walls between the passages — */
  var ROT_R = 10, APO = ROT_R * Math.cos(Math.PI / 8);
  [45, 135, 225, 315].forEach(function (deg) {
    var a = deg * Math.PI / 180;
    var cx = Math.sin(a) * APO, cz = -Math.cos(a) * APO;
    wall(7.6, HALL.h, cx, HALL.h / 2, cz, a + Math.PI);
  });
  /* the drum above and its ring ceiling with an open oculus */
  var drum = new THREE.Mesh(new THREE.CylinderGeometry(ROT_R + 0.2, ROT_R + 0.2, 3.2, 32, 1, true), wallMat);
  drum.position.set(0, HALL.h + 1.6, 0);
  scene.add(drum);
  var drumGlow = new THREE.Mesh(new THREE.TorusGeometry(ROT_R + 0.05, 0.035, 6, 48), glowLineMat);
  drumGlow.rotation.x = Math.PI / 2;
  drumGlow.position.y = HALL.h + 0.15;
  scene.add(drumGlow);
  var ring = new THREE.Mesh(new THREE.RingGeometry(4.5, ROT_R + 0.45, 48), new THREE.MeshStandardMaterial({ color: 0x120f1c, roughness: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = HALL.h + 3.2;
  scene.add(ring);
  var oculusGlow = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.05, 8, 48), glowLineMat);
  oculusGlow.rotation.x = Math.PI / 2;
  oculusGlow.position.y = HALL.h + 3.14;
  scene.add(oculusGlow);

  /* — passages: pylons + glowing arch at each of the four mouths — */
  function passage(px, pz, ry, span) {
    [-1, 1].forEach(function (side) {
      var pyl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.4, 0.6), stoneMat);
      pyl.position.set(px + Math.cos(ry) * side * span / 2, 3.2, pz - Math.sin(ry) * side * span / 2);
      pyl.castShadow = !isTouch;
      scene.add(pyl);
    });
    var arch = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 0.15, 10, 24, Math.PI), stoneMat);
    arch.position.set(px, 0, pz);
    arch.rotation.y = ry;
    arch.scale.y = 1.28;
    scene.add(arch);
    var archGlow = new THREE.Mesh(new THREE.TorusGeometry(span / 2 - 0.18, 0.03, 6, 24, Math.PI), glowLineMat);
    archGlow.position.set(px, 0, pz);
    archGlow.rotation.y = ry;
    archGlow.scale.y = 1.28;
    scene.add(archGlow);
  }
  passage(0, -7.6, 0, 9.6);            /* north — the lab */
  passage(0, 7.6, 0, 9.0);             /* south — the corridor out */
  passage(7.6, 0, Math.PI / 2, 9.6);   /* east — the works */
  passage(-7.6, 0, Math.PI / 2, 9.6);  /* west — code art */

  /* — wings — */
  var ceilMat = new THREE.MeshStandardMaterial({ map: cofferTexture(), roughness: 0.9, metalness: 0.0, emissive: 0x2c2452, emissiveMap: cofferTexture(), emissiveIntensity: 0.5, side: THREE.DoubleSide });
  function wingCeil(w, l, x, z) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), ceilMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, HALL.h, z);
    scene.add(m);
  }
  /* north wing (the lab) */
  wall(24, HALL.h, -5, HALL.h / 2, -18, Math.PI / 2);
  wall(24, HALL.h, 5, HALL.h / 2, -18, -Math.PI / 2);
  wingCeil(10, 24.5, 0, -18);
  /* east wing (the works) */
  wall(21.5, HALL.h, 17, HALL.h / 2, -5, 0);
  wall(21.5, HALL.h, 17, HALL.h / 2, 5, Math.PI);
  wall(10, HALL.h, 28, HALL.h / 2, 0, -Math.PI / 2);
  wingCeil(22, 10, 17, 0);
  /* west wing (code art) */
  wall(21.5, HALL.h, -17, HALL.h / 2, -5, 0);
  wall(21.5, HALL.h, -17, HALL.h / 2, 5, Math.PI);
  wall(10, HALL.h, -28, HALL.h / 2, 0, Math.PI / 2);
  wingCeil(22, 10, -17, 0);
  /* south corridor to the deck */
  wall(23, HALL.h, -4.5, HALL.h / 2, 19.5, Math.PI / 2);
  wall(23, HALL.h, 4.5, HALL.h / 2, 19.5, -Math.PI / 2);
  wingCeil(9, 23.5, 0, 19.5);

  /* the door arch at the corridor's end */
  var header = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 3), wallMat);
  header.position.set(0, HALL.h - 1.5, HALL.l / 2);
  scene.add(header);
  var archRib = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.16, 10, 26, Math.PI), stoneMat);
  archRib.position.set(0, 0, HALL.l / 2);
  archRib.scale.y = 1.11;
  scene.add(archRib);
  var archLine = new THREE.Mesh(new THREE.TorusGeometry(4.32, 0.03, 6, 26, Math.PI), glowLineMat);
  archLine.position.set(0, 0, HALL.l / 2);
  archLine.scale.y = 1.11;
  scene.add(archLine);
  /* stubs closing the deck side of the arch */
  var portalWalls = [{ x: -5.6, hx: 1.15, z: HALL.l / 2, hz: 0.32 }, { x: 5.6, hx: 1.15, z: HALL.l / 2, hz: 0.32 }];
  [-1, 1].forEach(function (side) {
    var stub = new THREE.Mesh(new THREE.PlaneGeometry(2.3, HALL.h), wallMat);
    stub.position.set(side * 5.6, HALL.h / 2, HALL.l / 2);
    scene.add(stub);
  });

  /* the glowing brand sign rides the arch — both faces */
  var brandTex = brandTexture();
  [[HALL.l / 2 - 0.09, Math.PI], [HALL.l / 2 + 0.09, 0]].forEach(function (s) {
    var sign = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 2),
      new THREE.MeshBasicMaterial({ map: brandTex, transparent: true, depthWrite: false })
    );
    sign.position.set(0, 6.55, s[0]);
    sign.rotation.y = s[1];
    scene.add(sign);
  });

  /* night lights — a warm heart in every room, one cool key from the stars */
  scene.add(new THREE.AmbientLight(0x9a8ecf, 0.34));
  scene.add(new THREE.HemisphereLight(0x6a5fae, 0x0d0b14, 0.42));
  var key = new THREE.DirectionalLight(0xcfd6ff, 0.85);
  key.position.set(18, 34, 50);
  if (!isTouch) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -34;
    key.shadow.camera.right = 34;
    key.shadow.camera.top = 48;
    key.shadow.camera.bottom = -48;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 170;
    key.shadow.bias = -0.0004;
  }
  scene.add(key);
  scene.add(key.target);
  /* rotunda crown light + one warm point per wing */
  var crown = new THREE.PointLight(0xd9ccff, 44, 30, 1.6);
  crown.position.set(0, HALL.h + 2.4, 0);
  scene.add(crown);
  [[0, -18, 0xffd9bd], [12, 0, 0xb7a6ff], [22, 0, 0xffd9bd], [-12, 0, 0xb7a6ff], [-22, 0, 0xffd9bd], [0, 19.5, 0xffd9bd]].forEach(function (L) {
    var p = new THREE.PointLight(L[2], 34, 22, 1.7);
    p.position.set(L[0], HALL.h - 0.8, L[1]);
    scene.add(p);
  });

  /* ---------- the observation deck ---------- */
  var terraceLen = TERRACE.zEnd - HALL.l / 2 + 0.6;
  var deck = new THREE.Mesh(new THREE.PlaneGeometry(13, terraceLen + 1), new THREE.MeshStandardMaterial({ map: marble.map, bumpMap: marble.bump, bumpScale: 0.35, roughnessMap: marble.rough, roughness: 1.0, metalness: 0.45, envMapIntensity: 1.1 }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.001, HALL.l / 2 + terraceLen / 2);
  deck.receiveShadow = true;
  scene.add(deck);
  function rail(w, x, z, ry) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.05, 0.16), stoneMat);
    m.position.set(x, 0.525, z);
    m.rotation.y = ry;
    scene.add(m);
    var line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.03), glowLineMat);
    line.position.set(x, 1.07, z);
    line.rotation.y = ry;
    scene.add(line);
  }
  rail(13.4, 0, TERRACE.zEnd + 0.35, 0);
  rail(terraceLen, -6.55, HALL.l / 2 + terraceLen / 2, Math.PI / 2);
  rail(terraceLen, 6.55, HALL.l / 2 + terraceLen / 2, Math.PI / 2);

  /* the island's underside — hewn rock, seen over the rail */
  var under = new THREE.Mesh(new THREE.CylinderGeometry(34, 18, 13, 14, 3), null);
  (function () {
    var p = under.geometry.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      var n = fbm(vx * 0.18, vz * 0.18 + vy, 3) - 0.5;
      p.setXYZ(i, vx * (1 + n * 0.4), vy, vz * (1 + n * 0.4));
    }
    under.geometry.computeVertexNormals();
  })();
  under.material = new THREE.MeshStandardMaterial({ color: 0x191428, roughness: 0.95, flatShading: true });
  under.position.set(0, -6.6, 2);
  scene.add(under);

  /* ---------- the asteroid cave (north end) ---------- */
  var rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3350, roughness: 0.96, metalness: 0.0, flatShading: true, vertexColors: true });
  function makeRock(x, y, z, s) {
    var geo = new THREE.IcosahedronGeometry(1, 3);
    var p = geo.attributes.position;
    var colors = new Float32Array(p.count * 3);
    for (var i = 0; i < p.count; i++) {
      var vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      var n = fbm(vx * 1.3 + x, vy * 1.3 + z, 3) - 0.5;
      var n2 = fbm(vx * 3.4 + z, vz * 3.4 + x, 2) - 0.5;
      var k = 1 + n * 0.55 + n2 * 0.18;
      p.setXYZ(i, vx * k, vy * k * 0.82, vz * k);
      var shade = 0.62 + n * 0.7;
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade * 0.96;
      colors[i * 3 + 2] = Math.min(1, shade * 1.18);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var m = new THREE.Mesh(geo, rockMat);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    m.rotation.y = Math.random() * 6.28;
    scene.add(m);
    return m;
  }
  [
    [-4.9, 1.6, -29.6, 3.0], [-3.4, 1.0, -31.2, 2.8], [-4.2, 4.8, -30.4, 2.8], [-2.2, 5.6, -32.4, 3.0],
    [4.9, 1.6, -29.6, 3.0], [3.4, 1.0, -31.2, 2.8], [4.2, 4.8, -30.4, 2.8], [2.2, 5.6, -32.4, 3.0],
    [0, 8.0, -32.4, 3.4], [-1.2, 7.2, -32.6, 2.4], [1.2, 7.2, -32.6, 2.4]
  ].forEach(function (r) { makeRock(r[0], r[1], r[2], r[3]); });
  var caveBack = new THREE.Mesh(new THREE.PlaneGeometry(22, 18), new THREE.MeshBasicMaterial({ color: 0x0d0a18 }));
  caveBack.position.set(0, 5, -36);
  scene.add(caveBack);
  [[-3.0, 1.1, -30.2, 0.5], [3.2, 0.8, -30.6, 0.4], [-1.2, 6.2, -30.9, 0.45], [2.0, 5.8, -31.2, 0.35]].forEach(function (cr) {
    var c = new THREE.Mesh(new THREE.IcosahedronGeometry(cr[3], 0), new THREE.MeshBasicMaterial({ color: 0x9d8cff }));
    c.position.set(cr[0], cr[1], cr[2]);
    c.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(c);
  });
  var caveLight = new THREE.PointLight(0x9d8cff, 16, 18, 1.6);
  caveLight.position.set(0, 3.4, -29.5);
  scene.add(caveLight);
  makeRock(0, 0.6, -30.6, 1.6);

  /* far rocks drifting in the black */
  [[-42, 9, 74, 5], [38, 16, 92, 7], [-26, 26, 110, 9], [52, 4, 60, 3.4], [-58, -6, 88, 6]].forEach(function (a) {
    var r = makeRock(a[0], a[1], a[2], a[3]);
    r.userData.drift = { sp: 0.02 + Math.random() * 0.03, ph: Math.random() * 6.28, base: a[1] };
    asteroids.push(r);
  });

  /* benches face the star across the rotunda */
  var blobTex = radialTexture('rgba(0, 0, 0, 0.55)', 'rgba(0, 0, 0, 0)');
  var benches = [];
  [[-6.4, 0], [6.4, 0]].forEach(function (bz) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 2.2), stoneMat);
    b.position.set(bz[0], 0.21, bz[1]);
    b.castShadow = !isTouch;
    scene.add(b);
    var edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 2.2), glowLineMat);
    edge.position.set(bz[0] + (bz[0] > 0 ? -0.29 : 0.29), 0.43, bz[1]);
    scene.add(edge);
    if (isTouch) {
      var s = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.0), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.6, depthWrite: false }));
      s.rotation.x = -Math.PI / 2;
      s.position.set(bz[0], 0.013, bz[1]);
      scene.add(s);
    }
    benches.push({ x: bz[0], z: bz[1], hx: 0.65, hz: 1.35 });
  });

  /* floating dust motes across the whole plan */
  var dust = null;
  (function () {
    var N = 340;
    var pos0 = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos0[i * 3] = (Math.random() - 0.5) * 52;
      pos0[i * 3 + 1] = Math.random() * (HALL.h - 1) + 0.4;
      pos0[i * 3 + 2] = (Math.random() - 0.5) * 58;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos0, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xa79aff, size: 0.022, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(dust);
  })();

  /* a soft ring of light follows the visitor */
  var playerHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 3.2),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(140, 120, 255, 0.35)', 'rgba(140, 120, 255, 0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  playerHalo.rotation.x = -Math.PI / 2;
  playerHalo.position.y = 0.016;
  scene.add(playerHalo);

  var plantCollide = [];

  /* wing names crown their passages */
  function wingTitle(text, x, y, z, ry) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.25),
      new THREE.MeshBasicMaterial({ map: wingTexture(text), transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
  }
  wingTitle('המעבדה', 0, 7.0, -7.9, 0);
  wingTitle('העבודות', 7.9, 7.0, 0, -Math.PI / 2);
  wingTitle('אמנות בקוד', -7.9, 7.0, 0, Math.PI / 2);

  /* ---------- holograms (additive — they burn in the dark) ---------- */
  var holoLineMat = function (color) {
    return new THREE.LineBasicMaterial({ color: color || 0x8fd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  };
  var holoFillMat = function (color) {
    return new THREE.MeshBasicMaterial({ color: color || 0x5b8cf5, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
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
      core.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(0.52, 18, 12)), holoLineMat(0x8fd8ff)));
      core.add(new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 12), holoFillMat(0x5b8cf5)));
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.008, 6, 48), new THREE.MeshBasicMaterial({ color: 0xa08bff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = Math.PI / 2.4;
      core.add(ring);
    } else if (kind === 'device') {
      core.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.44, 0.84, 0.05)), holoLineMat(0x9fe8d8)));
      core.add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.84, 0.05), holoFillMat(0x5bd8b0)));
      for (i = 0; i < 3; i++) {
        var card = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), holoFillMat(0x9fe8d8));
        card.userData.orbit = { r: 0.62, sp: 0.7 + i * 0.25, ph: i * 2.1, y: -0.15 + i * 0.16 };
        card.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.3, 0.18)), holoLineMat(0x9fe8d8)));
        core.add(card);
      }
    } else if (kind === 'neural') {
      var nodes = [];
      for (i = 0; i < 15; i++) {
        var v = new THREE.Vector3((Math.random() - 0.5) * 1.15, (Math.random() - 0.5) * 0.95, (Math.random() - 0.5) * 1.15);
        nodes.push(v);
        var nm = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), new THREE.MeshBasicMaterial({ color: 0xc9afff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
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
      core.add(new THREE.LineSegments(lg, holoLineMat(0xa08bff)));
    } else if (kind === 'game') {
      core.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.48)), holoLineMat(0xffc79a)));
      core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.48), holoFillMat(0xff9a5b)));
      for (i = 0; i < 4; i++) {
        var cube = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.09, 0.09, 0.09)), holoLineMat(0xffc79a));
        cube.userData.orbit = { r: 0.78, sp: 0.9 + i * 0.3, ph: i * 1.57, y: 0 };
        core.add(cube);
      }
    } else { /* star */
      var shape = starShape(0.62);
      core.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ShapeGeometry(shape)), holoLineMat(0xc9afff)));
      m = new THREE.Mesh(new THREE.ShapeGeometry(shape), holoFillMat(0x9d8cff));
      m.material.opacity = 0.12;
      core.add(m);
      var halo = [];
      for (i = 0; i < 60; i++) {
        var a = Math.random() * 6.28, rr = 0.75 + Math.random() * 0.35;
        halo.push(new THREE.Vector3(Math.cos(a) * rr, (Math.random() - 0.5) * 0.5, Math.sin(a) * rr));
      }
      var hg = new THREE.BufferGeometry().setFromPoints(halo);
      core.add(new THREE.Points(hg, new THREE.PointsMaterial({ color: 0xc9afff, size: 0.02, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
    }

    var rings = [];
    for (i = 0; i < 2; i++) {
      var r = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.006, 5, 40), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
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

  /* ---------- pedestals ---------- */
  var coneTex = coneTexture();
  var pedestalDefs = [
    { id: 'cap-web', holo: 'globe', x: -4.6, z: 4.6, label: 'אתרים וחוויות', tag: 'מה אנחנו בונים', accent: '#8fd8ff',
      body: 'אתרים שמרגישים כמו מקום, לא כמו דף. האולם שאתם עומדים בו עכשיו נבנה באותם כלים בדיוק — ורץ בדפדפן, בלי להתקין כלום.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-sys', holo: 'device', x: 4.6, z: 4.6, label: 'אפליקציות ומערכות', tag: 'מה אנחנו בונים', accent: '#9fe8d8',
      body: 'מהרעיון ועד מוצר שרץ בענן: אפליקציות, מערכות ניהול וכלים פנימיים שנתפרים בדיוק לצורת העבודה של העסק.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-ai', holo: 'neural', x: -4.6, z: -4.6, label: 'AI ואוטומציה', tag: 'מה אנחנו בונים', accent: '#c9afff',
      body: 'תהליכים שקורים מעצמם: מיון פניות, טיוטות מסמכים, חיבורים בין מערכות — עם בקרה אנושית בנקודות שחשוב.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-play', holo: 'game', x: 4.6, z: -4.6, label: 'משחקים וחוויות', tag: 'מה אנחנו בונים', accent: '#ffc79a',
      body: 'הדרך הכי טובה להבין מוצר היא לשחק בו: סימולטורים, קונפיגורטורים וחוויות אינטראקטיביות שהופכות סקרנות להחלטה.', link: 'services.html', linkText: 'לעמוד השירותים' }
  ];

  var pickables = [];
  var liveArts = [];
  var billboards = [];

  pedestalDefs.forEach(function (def) {
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.95, 24), stoneMat);
    base.position.set(def.x, 0.475, def.z);
    base.castShadow = !isTouch;
    scene.add(base);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(def.accent) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(def.x, 0.96, def.z);
    scene.add(ring);

    var cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.85, 2.6, 20, 1, true),
      new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    cone.position.set(def.x, 2.35, def.z);
    scene.add(cone);

    var holo = makeHologram(def.holo, 1);
    holo.position.set(def.x, 1.85, def.z);
    scene.add(holo);
    holograms.push(holo);
    def._holo = holo;

    var pl = new THREE.PointLight(new THREE.Color(def.accent), 5, 6, 1.8);
    pl.position.set(def.x, 2.1, def.z);
    scene.add(pl);

    var label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.375),
      new THREE.MeshBasicMaterial({ map: holoLabelTexture(def.label), transparent: true, depthWrite: false })
    );
    label.position.set(def.x, 2.95, def.z);
    scene.add(label);
    billboards.push(label);

    var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.4, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(def.x, 1.7, def.z);
    hit.userData.art = { title: def.label, tag: def.tag, body: def.body, link: def.link, self: true, linkText: def.linkText, _holo: holo, _glow: null };
    scene.add(hit);
    pickables.push(hit);
  });

  /* the great atrium star */
  var atriumStar = makeHologram('star', 2.6);
  atriumStar.position.set(0, 6.4, 0);
  scene.add(atriumStar);
  holograms.push(atriumStar);
  var atriumHit = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  atriumHit.position.copy(atriumStar.position);
  atriumHit.userData.art = {
    title: 'ORBO', tag: 'הסטודיו', _holo: atriumStar, _glow: null, self: true,
    body: 'הכוכב של אורבו. כל מה שסביבכם — האולם, שביל החלב וההולוגרמות — נבנה כאן, בקוד, בלי אף קובץ מוכן. ככה נראית אצלנו גישה לפרויקט.',
    link: 'studio.html', linkText: 'להכיר אותנו'
  };
  scene.add(atriumHit);
  pickables.push(atriumHit);

  /* comets circling the star */
  var comets = [];
  (function () {
    var cometTex = radialTexture('rgba(201, 175, 255, 0.9)', 'rgba(201, 175, 255, 0)');
    for (var i = 0; i < 3; i++) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.55),
        new THREE.MeshBasicMaterial({ map: cometTex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      scene.add(m);
      comets.push({ mesh: m, r: 3.1 + i * 0.5, sp: 0.5 + i * 0.17, ph: i * 2.1, tilt: 0.35 + i * 0.22 });
    }
  })();

  /* ---------- the collection ---------- */
  var ART = [
    { id: 'bisomna', px: 12, pz: -4.94, ry: 0, title: 'BISOMNA', tag: 'אתר · באוויר', style: 'light', sub: 'אתר למיזם שינה ישראלי', domain: 'bisomna.com', link: 'https://bisomna.com', accent: '#9d8cff',
      body: 'אתר רחב למיזם בתחום השינה — מוצר, מדע, חנות ומשקיעים. וידאו שנע יחד עם הגלילה ותצוגת מוצר שנפתחת לשכבות, והכול נשאר מהיר גם בנייד.' },
    { id: 'orbo', px: 27.94, pz: 0, ry: -Math.PI / 2, title: 'orbosolutions.com', tag: 'הבית שלנו', style: 'dark', sub: 'דף הבית של הסטודיו', domain: 'orbosolutions.com', link: 'index.html', self: true, accent: '#8c78ff',
      body: 'דף הבית שלנו הוא מסע: גוללים, והמצלמה עפה דרך עולם של חלקיקים שמתגבשים לצורות. בנוי כולו בקוד, בלי אף קובץ תמונה.' },
    { id: 'aurora', px: 4.94, pz: -12, ry: -Math.PI / 2, live: 'aurora', title: 'AURORA', tag: 'ציור חי · המעבדה', accent: '#c6f24e', link: 'lab/01-aurora-gsap/',
      body: 'סרטי אור שנעים בזרם. הציור שעל הקיר נצבע מחדש עשרות פעמים בשנייה, ממש עכשיו — כמו כל ציורי המעבדה באגף הזה.' },
    { id: 'nebula', px: 4.94, pz: -19, ry: -Math.PI / 2, live: 'nebula', title: 'NEBULA', tag: 'ציור חי · המעבדה', accent: '#4dd8ff', link: 'lab/02-nebula-three/',
      body: 'גלקסיה של חלקיקים שמסתחררת לאט. בגרסה המלאה גוללים אל תוך מרכז הגלקסיה.' },
    { id: 'prism', px: 4.94, pz: -26, ry: -Math.PI / 2, live: 'prism', title: 'PRISM', tag: 'ציור חי · המעבדה', accent: '#9d6bff', link: 'lab/03-prism-r3f/',
      body: 'אלומת אור שנשברת דרך גאומטריה ומתפצלת לספקטרום. בגרסה המלאה — חדר חומרים תלת־ממדי שלם.' },
    { id: 'genesis', px: -12, pz: -4.94, ry: 0, gen: genesisTexture, title: 'GENESIS', tag: 'אמנות גנרטיבית', accent: '#ffb080',
      body: 'שלוש מאות קווים ששוחררו לשדה זרימה מתמטי. אף אחד לא צייר את היצירה הזאת — היא חושבה, קו אחרי קו, ברגע שנכנסתם למוזיאון.' },
    { id: 'mosaic', px: -17, pz: 4.94, ry: Math.PI, gen: mosaicTexture, title: 'MOSAIC', tag: 'אמנות גנרטיבית', accent: '#9d8cff',
      body: 'פסיפס שנבנה מחלוקת המרחב בין ארבעים ושש נקודות אקראיות. כל ריצה מייצרת פסיפס שלא היה קיים מעולם.' },
    { id: 'flux', px: -4.94, pz: -12, ry: Math.PI / 2, live: 'flux', title: 'FLUX', tag: 'ציור חי · המעבדה', accent: '#ff4b3e', link: 'lab/04-flux-shaders/',
      body: 'שדות צבע שזורמים על המסך לפי כללים מתמטיים. בגרסה המלאה — שישה שדות שונים, ישר מול המעבד הגרפי.' },
    { id: 'terra', px: -4.94, pz: -19, ry: Math.PI / 2, live: 'terra', title: 'TERRA', tag: 'ציור חי · המעבדה', accent: '#e0c08c', link: 'lab/05-terra-webgl/',
      body: 'רכסי הרים שמחושבים מרעש מתמטי טהור, תחת שמש נמוכה. בגרסה המלאה גולשים בין נופים שלמים.' },
    { id: 'fractal', px: -27.94, pz: 0, ry: Math.PI / 2, gen: fractalTexture, title: 'JULIA', tag: 'אמנות גנרטיבית', accent: '#c9afff',
      body: 'קבוצת ז׳וליה — נוסחה אחת קצרה שמכילה אינסוף. ככל שמתקרבים, מתגלים עוד ועוד עולמות. חושבה פיקסל־פיקסל בכניסתכם.' },
    { id: 'star', px: 0, pz: -29.6, ry: 0, title: 'ORBO', tag: 'הסטודיו', style: 'dark', big: true, sub: 'רעיונות יש לכולם. אנחנו הופכים אותם למציאות.', accent: '#8c78ff',
      body: 'תודה שביקרתם. אם משהו כאן הדליק לכם רעיון — נשמח לשמוע עליו.', contact: true }
  ];

  var glowTexNeutral = radialTexture('rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0)');
  var poolTex = radialTexture('rgba(255, 225, 195, 0.16)', 'rgba(255, 225, 195, 0)');

  ART.forEach(function (art) {
    var group = new THREE.Group();
    var W = art.big ? 4.8 : 2.7, H = art.big ? 3.0 : 1.69;
    var AY = art.big ? 4.0 : 2.15;

    group.position.set(art.px, 0, art.pz);
    group.rotation.y = art.ry;

    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 1.55, H * 1.75),
      new THREE.MeshBasicMaterial({ map: glowTexNeutral, color: new THREE.Color(art.accent || '#8c78ff'), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.position.set(0, AY, 0.015);
    group.add(glow);

    var d = 0.07, th = 0.08, off = 0.1;
    [[0, AY + H / 2 + th / 2, W + th * 2, th], [0, AY - H / 2 - th / 2, W + th * 2, th]].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(s[2], s[3], d), frameMat);
      m.position.set(s[0], s[1], off - d / 2);
      group.add(m);
    });
    [[-W / 2 - th / 2, AY], [W / 2 + th / 2, AY]].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(th, H, d), frameMat);
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
        new THREE.PlaneGeometry(0.66, 0.33),
        new THREE.MeshBasicMaterial({ map: plaqueTexture(art) })
      );
      plq.position.set(W / 2 + 0.66, 1.4, 0.02);
      group.add(plq);
    }

    var pool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.3), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(group.position.x + Math.sin(group.rotation.y) * 1.2, 0.013, group.position.z + Math.cos(group.rotation.y) * 1.2);
    scene.add(pool);

    if (!isTouch) {
      var sp = new THREE.SpotLight(0xffe9d6, 30, 12, 0.55, 0.65, 1.4);
      var sWorld = new THREE.Vector3(0, HALL.h - 0.5, 2.1).applyEuler(group.rotation).add(group.position);
      sp.position.copy(sWorld);
      var tWorld = new THREE.Vector3(0, AY, 0).applyEuler(group.rotation).add(group.position);
      sp.target.position.copy(tWorld);
      scene.add(sp);
      scene.add(sp.target);
      var hs = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.18, 10), trimMat);
      hs.position.copy(sWorld);
      hs.position.y = HALL.h - 0.12;
      scene.add(hs);
    }

    scene.add(group);
  });

  /* ---------- player ---------- */
  var yaw = 0;
  var pitch = 0;
  var pos = new THREE.Vector3(0, EYE, 27.6);
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
  pos.set(0, 3.1, 30.4);
  pitch = -0.06;
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
      pos.set(0, EYE, 27.6);
      pitch = 0;
    } else {
      glide = { t: 0, dur: 2.1, fromP: pos.clone(), toP: new THREE.Vector3(0, EYE, 27.6), fromPitch: pitch, toPitch: 0 };
    }
    requestLock();
    setTimeout(function () {
      showHint(isTouch ? 'ג׳ויסטיק בצד — תנועה · גרירה — להסתכל' : 'W A S D — תנועה · עכבר — להסתכל', 4200);
    }, reduced ? 300 : 2300);
  });

  /* ---------- movement & collisions ---------- */
  var fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), wish = new THREE.Vector3();
  var pedCollide = pedestalDefs.map(function (d) { return { x: d.x, z: d.z, r: 1.0 }; });

function walkable(x, z) {
    if (x * x + z * z < 98) return true;                              /* rotunda */
    if (x > -4.5 && x < 4.5 && z > 6 && z < 31) return true;          /* south corridor */
    if (x > -6.4 && x < 6.4 && z >= 31 && z < 40.2) return true;      /* deck */
    if (x > -4.75 && x < 4.75 && z > -28.6 && z < -6) return true;    /* north wing */
    if (x > 6 && x < 27.6 && z > -4.6 && z < 4.6) return true;        /* east wing */
    if (x < -6 && x > -27.6 && z > -4.6 && z < 4.6) return true;      /* west wing */
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
    var speed = running ? 4.4 : 2.6;
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
    var boxes = benches.concat(portalWalls);
    for (i = 0; i < boxes.length; i++) {
      b = boxes[i];
      dx = pos.x - b.x; dz = pos.z - b.z;
      if (Math.abs(dx) < b.hx && Math.abs(dz) < b.hz) {
        if (b.hx - Math.abs(dx) < b.hz - Math.abs(dz)) pos.x = b.x + (dx > 0 ? b.hx : -b.hx);
        else pos.z = b.z + (dz > 0 ? b.hz : -b.hz);
      }
    }
    var circles = pedCollide.concat(plantCollide);
    for (i = 0; i < circles.length; i++) {
      b = circles[i];
      dx = pos.x - b.x; dz = pos.z - b.z;
      dd = Math.hypot(dx, dz);
      if (dd < b.r && dd > 0.0001) {
        pos.x = b.x + dx / dd * b.r;
        pos.z = b.z + dz / dd * b.r;
      }
    }

    var sp2 = vel.length();
    if (!reduced && sp2 > 0.4) bobPhase += dt * sp2 * 3.4;
    pos.y = EYE + (reduced ? 0 : Math.sin(bobPhase * 2) * 0.028 * Math.min(sp2 / 2.6, 1));

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
      if (wp.distanceTo(pos) > 17) continue;
      var near = Math.max(0, 1 - wp.distanceTo(pos) / 10);
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
        ring.material.opacity = 0.32 * (1 - ph) + ex * 0.3;
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
      if (d > 22) continue;
      var prox = Math.max(0, Math.min(1, 1 - (d - 2) / 5));
      a._glow.material.opacity = 0.3 + prox * 0.3 + (a === hoverArt ? 0.18 : 0);
      var sc = 1 + prox * 0.035;
      a._plane.scale.set(sc, sc, 1);
    }
    playerHalo.position.x = pos.x;
    playerHalo.position.z = pos.z;
    playerHalo.material.opacity = 0.8 + (reduced ? 0 : Math.sin(t * 1.6) * 0.2);
    /* asteroids drift and the galaxy breathes past them */
    for (var ai = 0; ai < asteroids.length; ai++) {
      var ast = asteroids[ai];
      ast.rotation.y += dt * ast.userData.drift.sp;
      ast.rotation.x += dt * ast.userData.drift.sp * 0.6;
      ast.position.y = ast.userData.drift.base + Math.sin(t * 0.1 + ast.userData.drift.ph) * 1.6;
    }
    if (!reduced) dome.rotation.y += dt * 0.0016;
    for (var k = 0; k < comets.length; k++) {
      var cm = comets[k];
      var a2 = t * cm.sp + cm.ph;
      cm.mesh.position.set(
        Math.cos(a2) * cm.r,
        6.4 + Math.sin(a2 * 1.3) * Math.sin(cm.tilt) * 1.1,
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
      dust.rotation.y += dt * 0.005;
      dust.position.y = Math.sin(t * 0.16) * 0.06;
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
  /* a tab restored from the background can report 0x0 at init — heal once */
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
