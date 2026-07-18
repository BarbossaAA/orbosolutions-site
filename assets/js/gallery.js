/* ORBO — the museum.
   A grand, walkable night-museum for the studio, built on three.js.
   One monumental hall: veined marble floor, pilaster columns, a coffered
   glowing ceiling with a starfield skylight, emissive trim lines, and
   light everywhere it matters. The collection: two live sites and the
   brand piece as backlit posters, five LIVING lab paintings repainted
   every frame by the shared ORBO_LAB engine, three generative artworks
   computed at the door, four capability pedestals carrying interactive
   HOLOGRAMS, and a great hologram star floating in the atrium.
   Desktop: pointer-lock + WASD. Touch: joystick + drag-look + tap.
   No assets — every texture, artwork and hologram is drawn in code. */
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
  renderer.toneMappingExposure = 1.3;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0916);
  scene.fog = new THREE.Fog(0x0b0916, 30, 84);

  var camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 120);
  camera.rotation.order = 'YXZ';

  /* ---------- hall dimensions ---------- */
  var HALL = { w: 18, l: 62, h: 8 };       /* x: ±9, z: ±31 */
  var EYE = 1.65;
  var BOUND = { x: 7.6, zMin: -29.4, zMax: 29.4 };
  var LX = -HALL.w / 2 + 0.05, RX = HALL.w / 2 - 0.05;

  /* ---------- environment reflections ---------- */
  (function buildEnv() {
    var env = new THREE.Scene();
    var mk = function (color, w, h, x, y, z, ry) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.y = ry || 0;
      env.add(m);
    };
    env.background = new THREE.Color(0x04030a);
    mk(0x7a68e8, 18, 2.4, 0, 7, -8);
    mk(0x322a52, 26, 4, 0, 8, 10, Math.PI);
    mk(0xffb080, 4, 1.6, -9, 4, 0, Math.PI / 2);
    mk(0x58c8f0, 4, 1.6, 9, 4, 0, -Math.PI / 2);
    mk(0x18122a, 40, 40, 0, -5, 0);
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
  })();

  /* ---------- canvas helpers ---------- */
  function ctx2d(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c.getContext('2d');
  }
  function asTexture(canvasEl) {
    var t = new THREE.CanvasTexture(canvasEl);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  var noise = (window.ORBO_LAB && ORBO_LAB.noise) || function (x, y) {
    var n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };

  /* dark marble: veins wandered across a deep slab */
  function marbleTexture() {
    var S = 512;
    var c = ctx2d(S, S);
    var g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#17131f');
    g.addColorStop(0.5, '#1b1626');
    g.addColorStop(1, '#151020');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    for (var v = 0; v < 26; v++) {
      var x = Math.random() * S, y = Math.random() * S;
      var a = Math.random() * Math.PI * 2;
      c.beginPath();
      c.moveTo(x, y);
      var light = Math.random() < 0.3;
      for (var s = 0; s < 60; s++) {
        a += (noise(x * 0.02, y * 0.02) - 0.5) * 1.1;
        x += Math.cos(a) * 7;
        y += Math.sin(a) * 7;
        c.lineTo(x, y);
      }
      c.strokeStyle = light ? 'rgba(170, 150, 220, 0.10)' : 'rgba(8, 6, 14, 0.5)';
      c.lineWidth = light ? 1.6 : 2.6;
      c.stroke();
    }
    /* faint speckle */
    c.fillStyle = 'rgba(190, 175, 235, 0.05)';
    for (var i = 0; i < 500; i++) {
      c.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4);
    }
    var t = asTexture(c.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 10);
    return t;
  }

  /* coffered ceiling: recessed squares with glowing seams */
  function cofferTexture() {
    var S = 256;
    var c = ctx2d(S, S);
    c.fillStyle = '#151020';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#0e0a18';
    c.fillRect(22, 22, S - 44, S - 44);
    c.strokeStyle = 'rgba(122, 104, 232, 0.55)';
    c.lineWidth = 5;
    c.strokeRect(11, 11, S - 22, S - 22);
    c.strokeStyle = 'rgba(122, 104, 232, 0.18)';
    c.lineWidth = 2;
    c.strokeRect(30, 30, S - 60, S - 60);
    var t = asTexture(c.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 17);
    return t;
  }

  /* night sky for the skylight */
  function starfieldTexture() {
    var W = 512, H = 2048;
    var c = ctx2d(W, H);
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07050f');
    g.addColorStop(0.5, '#0b0718');
    g.addColorStop(1, '#07050f');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    /* nebula wisps */
    for (var n = 0; n < 22; n++) {
      var x = Math.random() * W, y = Math.random() * H, r = 60 + Math.random() * 140;
      var rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, n % 3 ? 'rgba(110, 90, 220, 0.10)' : 'rgba(255, 170, 120, 0.05)');
      rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = rg;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    /* stars */
    for (var i = 0; i < 700; i++) {
      var sx = Math.random() * W, sy = Math.random() * H;
      var s = Math.random();
      c.fillStyle = 'rgba(235, 230, 255, ' + (0.25 + s * 0.7) + ')';
      c.fillRect(sx, sy, s < 0.92 ? 1 : 2, s < 0.92 ? 1 : 2);
    }
    return asTexture(c.canvas);
  }

  function plasterTexture() {
    var c = ctx2d(256, 256);
    c.fillStyle = '#221d31';
    c.fillRect(0, 0, 256, 256);
    var img = c.getImageData(0, 0, 256, 256);
    for (var i = 0; i < img.data.length; i += 4) {
      var n = (Math.random() - 0.5) * 11;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n + 2;
    }
    c.putImageData(img, 0, 0);
    var t = asTexture(c.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(8, 3);
    return t;
  }

  function radialTexture(inner, outer) {
    var c = ctx2d(256, 256);
    var g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    return asTexture(c.canvas);
  }

  /* vertical fade for light cones */
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
        c.fillStyle = '#FAF9F5';
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
      c.fillStyle = 'rgba(178, 160, 255, 0.55)';
      c.font = '850 150px ' + FONT;
      c.fillText(text, 512, 178);
    };
    redraw();
    var t = asTexture(c.canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { redraw(); t.needsUpdate = true; });
    return t;
  }

  /* floating hologram label */
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

  /* ---------- generative artworks (computed at the door) ---------- */
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

  /* ---------- the hall ---------- */
  var wallMat = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.93, metalness: 0.0 });
  var floorMat = new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.17, metalness: 0.55, envMapIntensity: 1.35 });
  var trimMat = new THREE.MeshStandardMaterial({ color: 0x0b0913, roughness: 0.55, metalness: 0.35 });
  var glowLineMat = new THREE.MeshBasicMaterial({ color: 0x8474e8 });
  var columnMat = new THREE.MeshStandardMaterial({ color: 0x191426, roughness: 0.42, metalness: 0.6, envMapIntensity: 1.1 });

  var floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.l), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  /* coffered ceiling with a starfield skylight down the spine */
  var ceilMat = new THREE.MeshStandardMaterial({ map: cofferTexture(), roughness: 0.9, metalness: 0.0, emissive: 0x2c2452, emissiveMap: cofferTexture(), emissiveIntensity: 0.55 });
  [[-(HALL.w / 4 + 1.25), HALL.w / 2 - 2.5], [HALL.w / 4 + 1.25, HALL.w / 2 - 2.5]].forEach(function (s) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(s[1], HALL.l), ceilMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(s[0], HALL.h, 0);
    scene.add(m);
  });
  var sky = new THREE.Mesh(new THREE.PlaneGeometry(5, HALL.l), new THREE.MeshBasicMaterial({ map: starfieldTexture() }));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(0, HALL.h + 0.01, 0);
  scene.add(sky);
  /* glowing skylight frame */
  [-2.6, 2.6].forEach(function (x) {
    var rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, HALL.l - 2), glowLineMat);
    rail.position.set(x, HALL.h - 0.05, 0);
    scene.add(rail);
  });

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
    /* glowing accent line low on the wall + cornice line high */
    [0.26, HALL.h - 0.5].forEach(function (yy) {
      var line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.02), glowLineMat);
      line.position.set(x, yy, z);
      line.rotation.y = ry;
      line.translateZ(0.05);
      scene.add(line);
    });
  }
  wall(HALL.l, HALL.h, -HALL.w / 2, HALL.h / 2, 0, Math.PI / 2);
  wall(HALL.l, HALL.h, HALL.w / 2, HALL.h / 2, 0, -Math.PI / 2);
  wall(HALL.w, HALL.h, 0, HALL.h / 2, -HALL.l / 2, 0);
  wall(HALL.w, HALL.h, 0, HALL.h / 2, HALL.l / 2, Math.PI);

  /* pilaster columns with lit edges */
  for (var cz = -24; cz <= 24; cz += 8) {
    [-1, 1].forEach(function (side) {
      var col = new THREE.Mesh(new THREE.BoxGeometry(0.7, HALL.h, 0.7), columnMat);
      col.position.set(side * (HALL.w / 2 - 0.3), HALL.h / 2, cz);
      scene.add(col);
      [-0.36, 0.36].forEach(function (o) {
        var strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, HALL.h - 0.6, 0.02), glowLineMat);
        strip.position.set(side * (HALL.w / 2 - 0.66), HALL.h / 2 - 0.1, cz + o);
        scene.add(strip);
      });
      /* capital */
      var cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.9), trimMat);
      cap.position.set(side * (HALL.w / 2 - 0.3), HALL.h - 0.35, cz);
      scene.add(cap);
    });
  }

  /* the doorway you came in through */
  var doorGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 5),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(157, 140, 255, 0.5)', 'rgba(157, 140, 255, 0)'), transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  doorGlow.position.set(0, 2.4, HALL.l / 2 - 0.06);
  doorGlow.rotation.y = Math.PI;
  scene.add(doorGlow);
  var brandWall = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.75),
    new THREE.MeshBasicMaterial({ map: wingTexture('ORBO·GALLERY', true), transparent: true, depthWrite: false })
  );
  brandWall.position.set(0, 6.1, HALL.l / 2 - 0.07);
  brandWall.rotation.y = Math.PI;
  scene.add(brandWall);

  /* base lights — a bright night, not a dark one */
  scene.add(new THREE.AmbientLight(0xa89ede, 0.5));
  scene.add(new THREE.HemisphereLight(0x7a6ec2, 0x141020, 0.55));
  [24, 12, 0, -12, -24].forEach(function (z, i) {
    var p = new THREE.PointLight(i % 2 ? 0xb7a6ff : 0xffd9bd, 34, 24, 1.6);
    p.position.set(0, HALL.h - 0.7, z);
    scene.add(p);
  });
  /* warm washes along the walls so the bays read clearly */
  [18, 0, -18].forEach(function (z) {
    [-1, 1].forEach(function (side) {
      var w = new THREE.PointLight(0xf5e6ff, 10, 12, 1.8);
      w.position.set(side * 5.4, HALL.h - 1.4, z);
      scene.add(w);
    });
  });

  /* light benches */
  var blobTex = radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
  var benches = [];
  [12, -12].forEach(function (z) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.62), new THREE.MeshStandardMaterial({ color: 0x1d1830, roughness: 0.4, metalness: 0.3, envMapIntensity: 1 }));
    b.position.set(0, 0.21, z);
    scene.add(b);
    var edge = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 0.02), glowLineMat);
    edge.position.set(0, 0.43, z + 0.3);
    scene.add(edge);
    var s = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(0, 0.012, z);
    scene.add(s);
    benches.push({ x: 0, z: z, hx: 1.5, hz: 0.7 });
  });

  /* floating dust */
  var dust = null;
  (function () {
    var N = 320;
    var pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (HALL.w - 2);
      pos[i * 3 + 1] = Math.random() * (HALL.h - 1) + 0.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * (HALL.l - 3);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xa79aff, size: 0.022, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(dust);
  })();

  /* a soft ring of light follows the visitor across the marble */
  var playerHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(157, 140, 255, 0.20)', 'rgba(157, 140, 255, 0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  playerHalo.rotation.x = -Math.PI / 2;
  playerHalo.position.y = 0.015;
  scene.add(playerHalo);

  /* an aurora river flows beneath the skylight, painted live by the lab engine */
  var auroraRiver = null;
  if (window.ORBO_LAB) {
    var arW = 1024, arH = 192;
    var arCtx = ctx2d(arW, arH);
    var arTex = asTexture(arCtx.canvas);
    auroraRiver = {
      ctx: arCtx, tex: arTex, w: arW, h: arH, t: Math.random() * 40,
      mesh: new THREE.Mesh(
        new THREE.PlaneGeometry(HALL.l - 6, 4.4),
        new THREE.MeshBasicMaterial({ map: arTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      )
    };
    auroraRiver.mesh.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    auroraRiver.mesh.position.set(0, HALL.h - 0.18, 0);
    scene.add(auroraRiver.mesh);
  }

  /* comets circling the atrium star */
  var comets = [];
  (function () {
    var cometTex = radialTexture('rgba(201, 175, 255, 0.9)', 'rgba(201, 175, 255, 0)');
    for (var i = 0; i < 3; i++) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.55),
        new THREE.MeshBasicMaterial({ map: cometTex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      scene.add(m);
      comets.push({ mesh: m, r: 2.6 + i * 0.5, sp: 0.5 + i * 0.17, ph: i * 2.1, tilt: 0.35 + i * 0.22 });
    }
  })();

  /* wing titles */
  function wingTitle(text, x, z, ry) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.25),
      new THREE.MeshBasicMaterial({ map: wingTexture(text), transparent: true, depthWrite: false })
    );
    m.position.set(x, 5.6, z);
    m.rotation.y = ry;
    scene.add(m);
  }
  /* titles float off the wall, centered on bays between the pilasters
     (columns stand at z = ±8, ±16, ±24 — bay centers at 20 / -12 clear them) */
  wingTitle('העבודות', LX + 0.55, 20, Math.PI / 2);
  wingTitle('אמנות בקוד', RX - 0.55, 20, -Math.PI / 2);
  wingTitle('המעבדה', LX + 0.55, -12, Math.PI / 2);
  wingTitle('המעבדה', RX - 0.55, -12, -Math.PI / 2);

  /* ---------- holograms ---------- */
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
    var core = new THREE.Group();
    g.add(core);
    var i, m;

    if (kind === 'globe') {
      core.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(0.52, 18, 12)), holoLineMat(0x8fd8ff)));
      m = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 12), holoFillMat(0x5b8cf5));
      core.add(m);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.008, 6, 48), new THREE.MeshBasicMaterial({ color: 0xa08bff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = Math.PI / 2.4;
      core.add(ring);
    } else if (kind === 'device') {
      core.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.44, 0.84, 0.05)), holoLineMat(0x9fe8d8)));
      m = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.84, 0.05), holoFillMat(0x5bd8b0));
      core.add(m);
      for (i = 0; i < 3; i++) {
        var card = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), holoFillMat(0x9fe8d8));
        card.userData.orbit = { r: 0.62, sp: 0.7 + i * 0.25, ph: i * 2.1, y: -0.15 + i * 0.16 };
        var cardLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.3, 0.18)), holoLineMat(0x9fe8d8));
        card.add(cardLine);
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
      m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48), holoFillMat(0xff9a5b));
      core.add(m);
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

    /* scan rings riding up the beam */
    var rings = [];
    for (i = 0; i < 2; i++) {
      var r = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.006, 5, 40), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      r.rotation.x = Math.PI / 2;
      r.userData.phase = i * 0.5;
      rings.push(r);
      g.add(r);
    }

    g.scale.setScalar(scale || 1);
    g.userData = { core: core, rings: rings, excite: 0, spin: 0.5 + Math.random() * 0.2 };
    return g;
  }

  var holograms = [];

  /* ---------- pedestals ---------- */
  var coneTex = coneTexture();
  var pedestalDefs = [
    { id: 'cap-web', holo: 'globe', x: -3.2, z: 16, label: 'אתרים וחוויות', tag: 'מה אנחנו בונים', accent: '#8fd8ff',
      body: 'אתרים שמרגישים כמו מקום, לא כמו דף. האולם שאתם עומדים בו עכשיו נבנה באותם כלים בדיוק — ורץ בדפדפן, בלי להתקין כלום.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-sys', holo: 'device', x: 3.2, z: 8, label: 'אפליקציות ומערכות', tag: 'מה אנחנו בונים', accent: '#9fe8d8',
      body: 'מהרעיון ועד מוצר שרץ בענן: אפליקציות, מערכות ניהול וכלים פנימיים שנתפרים בדיוק לצורת העבודה של העסק.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-ai', holo: 'neural', x: -3.2, z: -8, label: 'AI ואוטומציה', tag: 'מה אנחנו בונים', accent: '#c9afff',
      body: 'תהליכים שקורים מעצמם: מיון פניות, טיוטות מסמכים, חיבורים בין מערכות — עם בקרה אנושית בנקודות שחשוב.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-play', holo: 'game', x: 3.2, z: -16, label: 'משחקים וחוויות', tag: 'מה אנחנו בונים', accent: '#ffc79a',
      body: 'הדרך הכי טובה להבין מוצר היא לשחק בו: סימולטורים, קונפיגורטורים וחוויות אינטראקטיביות שהופכות סקרנות להחלטה.', link: 'services.html', linkText: 'לעמוד השירותים' }
  ];

  var pickables = [];
  var liveArts = [];
  var billboards = [];

  pedestalDefs.forEach(function (def) {
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.95, 24), columnMat);
    base.position.set(def.x, 0.475, def.z);
    scene.add(base);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(def.accent) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(def.x, 0.96, def.z);
    scene.add(ring);

    /* beam of light */
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

    /* soft violet point light at the pedestal */
    var pl = new THREE.PointLight(new THREE.Color(def.accent), 5, 6, 1.8);
    pl.position.set(def.x, 2.1, def.z);
    scene.add(pl);

    /* floating label, always facing the visitor */
    var label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.375),
      new THREE.MeshBasicMaterial({ map: holoLabelTexture(def.label), transparent: true, depthWrite: false })
    );
    label.position.set(def.x, 2.95, def.z);
    scene.add(label);
    billboards.push(label);

    /* invisible hit cylinder */
    var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.4, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(def.x, 1.7, def.z);
    hit.userData.art = { title: def.label, tag: def.tag, body: def.body, link: def.link, self: true, linkText: def.linkText, _holo: holo, _glow: null };
    scene.add(hit);
    pickables.push(hit);
  });

  /* the great atrium star */
  var atriumStar = makeHologram('star', 2.3);
  atriumStar.position.set(0, 4.9, 0);
  scene.add(atriumStar);
  holograms.push(atriumStar);
  var atriumHit = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  atriumHit.position.copy(atriumStar.position);
  atriumHit.userData.art = {
    title: 'ORBO', tag: 'הסטודיו', _holo: atriumStar, _glow: null, self: true,
    body: 'הכוכב של אורבו. כל מה שבמוזיאון הזה — האולם, ההולוגרמות, הציורים החיים — נבנה אצלנו, בקוד, בלי אף קובץ מוכן. ככה אנחנו ניגשים לכל פרויקט.',
    link: 'studio.html', linkText: 'להכיר אותנו'
  };
  scene.add(atriumHit);
  pickables.push(atriumHit);

  /* ---------- the collection (wall pieces) ---------- */
  var ART = [
    { id: 'bisomna', wall: 'L', z: 20, title: 'BISOMNA', tag: 'אתר · באוויר', style: 'light', sub: 'אתר למיזם שינה ישראלי', domain: 'bisomna.com', link: 'https://bisomna.com',
      body: 'אתר רחב למיזם בתחום השינה — מוצר, מדע, חנות ומשקיעים. וידאו שנע יחד עם הגלילה ותצוגת מוצר שנפתחת לשכבות, והכול נשאר מהיר גם בנייד.' },
    { id: 'orbo', wall: 'L', z: 10, title: 'orbosolutions.com', tag: 'הבית שלנו', style: 'dark', sub: 'דף הבית של הסטודיו', domain: 'orbosolutions.com', link: 'index.html', self: true,
      body: 'דף הבית שלנו הוא מסע: גוללים, והמצלמה עפה דרך עולם של חלקיקים שמתגבשים לצורות. בנוי כולו בקוד, בלי אף קובץ תמונה.' },
    { id: 'aurora', wall: 'L', z: -2, live: 'aurora', title: 'AURORA', tag: 'ציור חי · המעבדה', accent: '#c6f24e', link: 'lab/01-aurora-gsap/',
      body: 'סרטי אור שנעים בזרם. הציור שעל הקיר נצבע מחדש עשרות פעמים בשנייה, ממש עכשיו — כמו כל ציורי המעבדה באגף הזה.' },
    { id: 'nebula', wall: 'L', z: -12, live: 'nebula', title: 'NEBULA', tag: 'ציור חי · המעבדה', accent: '#4dd8ff', link: 'lab/02-nebula-three/',
      body: 'גלקסיה של חלקיקים שמסתחררת לאט. בגרסה המלאה גוללים אל תוך מרכז הגלקסיה.' },
    { id: 'prism', wall: 'L', z: -22, live: 'prism', title: 'PRISM', tag: 'ציור חי · המעבדה', accent: '#9d6bff', link: 'lab/03-prism-r3f/',
      body: 'אלומת אור שנשברת דרך גאומטריה ומתפצלת לספקטרום. בגרסה המלאה — חדר חומרים תלת־ממדי שלם.' },
    { id: 'genesis', wall: 'R', z: 20, gen: genesisTexture, title: 'GENESIS', tag: 'אמנות גנרטיבית', accent: '#ffb080',
      body: 'שלוש מאות קווים ששוחררו לשדה זרימה מתמטי. אף אחד לא צייר את היצירה הזאת — היא חושבה, קו אחרי קו, ברגע שנכנסתם למוזיאון.' },
    { id: 'mosaic', wall: 'R', z: 10, gen: mosaicTexture, title: 'MOSAIC', tag: 'אמנות גנרטיבית', accent: '#9d8cff',
      body: 'פסיפס שנבנה מחלוקת המרחב בין ארבעים ושש נקודות אקראיות. כל ריצה מייצרת פסיפס שלא היה קיים מעולם.' },
    { id: 'flux', wall: 'R', z: -2, live: 'flux', title: 'FLUX', tag: 'ציור חי · המעבדה', accent: '#ff4b3e', link: 'lab/04-flux-shaders/',
      body: 'שדות צבע שזורמים על המסך לפי כללים מתמטיים. בגרסה המלאה — שישה שדות שונים, ישר מול המעבד הגרפי.' },
    { id: 'terra', wall: 'R', z: -12, live: 'terra', title: 'TERRA', tag: 'ציור חי · המעבדה', accent: '#e0c08c', link: 'lab/05-terra-webgl/',
      body: 'רכסי הרים שמחושבים מרעש מתמטי טהור, תחת שמש נמוכה. בגרסה המלאה גולשים בין נופים שלמים.' },
    { id: 'fractal', wall: 'R', z: -22, gen: fractalTexture, title: 'JULIA', tag: 'אמנות גנרטיבית', accent: '#c9afff',
      body: 'קבוצת ז׳וליה — נוסחה אחת קצרה שמכילה אינסוף. ככל שמתקרבים, מתגלים עוד ועוד עולמות. חושבה פיקסל־פיקסל בכניסתכם.' },
    { id: 'star', wall: 'F', z: -HALL.l / 2, title: 'ORBO', tag: 'הסטודיו', style: 'dark', big: true, sub: 'רעיונות יש לכולם. אנחנו הופכים אותם למציאות.',
      body: 'תודה שביקרתם. אם משהו כאן הדליק לכם רעיון — נשמח לשמוע עליו.', contact: true }
  ];

  var glowTexNeutral = radialTexture('rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0)');
  var poolTex = radialTexture('rgba(255, 225, 195, 0.15)', 'rgba(255, 225, 195, 0)');
  var frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.32, metalness: 0.8, envMapIntensity: 1.2 });

  ART.forEach(function (art) {
    var group = new THREE.Group();
    /* the finale screen is a wide cinema wall — same 8:5 aspect as its
       texture, so the type never squashes */
    var W = art.big ? 4.8 : 2.7, H = art.big ? 3.0 : 1.69;
    var AY = art.big ? 2.55 : 2.15;   /* artwork center height */

    if (art.wall === 'L') { group.position.set(LX, 0, art.z); group.rotation.y = Math.PI / 2; }
    else if (art.wall === 'R') { group.position.set(RX, 0, art.z); group.rotation.y = -Math.PI / 2; }
    else { group.position.set(0, 0, -HALL.l / 2 + 0.05); }

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
    var pWorld = new THREE.Vector3(0, 0, 0).applyEuler(group.rotation).add(group.position);
    pool.position.set(pWorld.x + (art.wall === 'L' ? 1.2 : art.wall === 'R' ? -1.2 : 0), 0.013, pWorld.z + (art.wall === 'F' ? 1.2 : 0));
    scene.add(pool);

    if (!isTouch) {
      var sp = new THREE.SpotLight(0xffe9d6, 34, 12, 0.55, 0.65, 1.4);
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
    hoverArt = art;   /* glow itself is driven by the proximity system */
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
    if (art._holo) art._holo.userData.excite = 1;   /* the hologram flares */
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
    pos.addScaledVector(vel, dt);

    pos.x = Math.max(-BOUND.x, Math.min(BOUND.x, pos.x));
    pos.z = Math.max(BOUND.zMin, Math.min(BOUND.zMax, pos.z));
    var i, b, dx, dz;
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
      var dd = Math.hypot(dx, dz);
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
      /* paintings paint faster as you approach — the room notices you */
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
      /* holograms wake up as you walk toward them */
      var prox = Math.max(0, 1 - h.position.distanceTo(pos) / 6);
      var ex = Math.min(1, u.excite + prox * 0.55);
      u.core.rotation.y += dt * (u.spin + ex * 3.2);
      u.core.position.y = Math.sin(t * 0.9 + i * 1.7) * 0.05;
      var flick = 1 + ex * 0.28 + (reduced ? 0 : Math.sin(t * 13 + i * 3) * 0.02);
      u.core.scale.setScalar(flick);
      /* orbiting bits */
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
      /* scan rings climb */
      for (var r = 0; r < u.rings.length; r++) {
        var ring = u.rings[r];
        var ph = ((t * 0.35 + ring.userData.phase) % 1);
        ring.position.y = -0.7 + ph * 1.5;
        ring.material.opacity = 0.32 * (1 - ph) + ex * 0.3;
      }
    }
  }

  /* every piece breathes toward whoever stands in front of it */
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
    playerHalo.material.opacity = 0.75 + (reduced ? 0 : Math.sin(t * 1.6) * 0.2);
    if (auroraRiver && !reduced && liveTick % 2 === 0) {
      auroraRiver.t = (auroraRiver.t || 0) + dt * 2.4;
      ORBO_LAB.draw.aurora({ ctx: auroraRiver.ctx, w: auroraRiver.w, h: auroraRiver.h, t: auroraRiver.t, seed: [] });
      auroraRiver.tex.needsUpdate = true;
    }
    for (var k = 0; k < comets.length; k++) {
      var cm = comets[k];
      var a2 = t * cm.sp + cm.ph;
      cm.mesh.position.set(
        Math.cos(a2) * cm.r,
        4.9 + Math.sin(a2 * 1.3) * Math.sin(cm.tilt) * 1.1,
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

    /* labels face the visitor */
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
