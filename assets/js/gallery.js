/* ORBO — the museum, third light.
   A bright futuristic palace in the site's own palette: ivory marble,
   soft daylight pouring through a sky-window, arched ribs spanning the
   hall, a glowing stream running its length with plants along the banks.
   The collection: backlit posters, five LIVING lab paintings, three
   generative artworks computed at the door, four capability pedestals
   carrying interactive holograms, and a great hologram star over the
   atrium. Everything reacts to the visitor. Desktop: pointer-lock +
   WASD. Touch: joystick + drag-look + tap. No assets — every texture,
   artwork, plant and hologram is drawn in code. */
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
  renderer.toneMappingExposure = 1.08;
  /* real shadows carry the depth on desktop; phones keep soft blob shadows */
  if (!isTouch) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xEDEBF5);
  scene.fog = new THREE.Fog(0xE9E8F2, 42, 150);

  var camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 240);
  camera.rotation.order = 'YXZ';

  /* ---------- hall dimensions ---------- */
  var HALL = { w: 18, l: 62, h: 8 };       /* x: ±9, z: ±31; a terrace continues past +31 */
  var EYE = 1.65;
  var TERRACE = { zEnd: 40.6 };
  var BOUND = { x: 7.6, zMin: -28.6, zMax: 40.2 };
  var LX = -HALL.w / 2 + 0.05, RX = HALL.w / 2 - 0.05;

  /* ---------- environment reflections (bright ivory room) ---------- */
  (function buildEnv() {
    var env = new THREE.Scene();
    var mk = function (color, w, h, x, y, z, ry) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.y = ry || 0;
      env.add(m);
    };
    env.background = new THREE.Color(0xE8E5F2);
    mk(0xffffff, 22, 6, 0, 9, -10);                 /* bright sky ahead */
    mk(0xcfd4ff, 26, 5, 0, 9, 12, Math.PI);
    mk(0x8474e8, 5, 1.6, -10, 4, 0, Math.PI / 2);   /* violet accents */
    mk(0xffd9bd, 5, 1.6, 10, 4, 0, -Math.PI / 2);   /* warm accents */
    mk(0xf3f0ea, 44, 44, 0, -5, 0);                 /* ivory floor bounce */
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

  /* bright ivory marble with soft violet-gray veins */
  function marbleTexture() {
    var S = 512;
    var c = ctx2d(S, S);
    var g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#F6F4F9');
    g.addColorStop(0.5, '#EFEDF6');
    g.addColorStop(1, '#F4F1F7');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    for (var v = 0; v < 24; v++) {
      var x = Math.random() * S, y = Math.random() * S;
      var a = Math.random() * Math.PI * 2;
      c.beginPath();
      c.moveTo(x, y);
      var strong = Math.random() < 0.3;
      for (var s = 0; s < 60; s++) {
        a += (noise(x * 0.02, y * 0.02) - 0.5) * 1.1;
        x += Math.cos(a) * 7;
        y += Math.sin(a) * 7;
        c.lineTo(x, y);
      }
      c.strokeStyle = strong ? 'rgba(122, 110, 168, 0.14)' : 'rgba(160, 152, 190, 0.09)';
      c.lineWidth = strong ? 2.2 : 1.4;
      c.stroke();
    }
    c.fillStyle = 'rgba(122, 110, 168, 0.05)';
    for (var i = 0; i < 400; i++) c.fillRect(Math.random() * S, Math.random() * S, 1.3, 1.3);
    var t = asTexture(c.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 10);
    return t;
  }

  /* light coffered ceiling with violet seams */
  function cofferTexture() {
    var S = 256;
    var c = ctx2d(S, S);
    c.fillStyle = '#F2F0F8';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#EAE7F3';
    c.fillRect(22, 22, S - 44, S - 44);
    c.strokeStyle = 'rgba(122, 104, 232, 0.5)';
    c.lineWidth = 4;
    c.strokeRect(11, 11, S - 22, S - 22);
    c.strokeStyle = 'rgba(122, 104, 232, 0.16)';
    c.lineWidth = 2;
    c.strokeRect(30, 30, S - 60, S - 60);
    var t = asTexture(c.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 17);
    return t;
  }

  /* soft day sky for the long sky-window */
  function dayskyTexture() {
    var W = 512, H = 2048;
    var c = ctx2d(W, H);
    var g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#C9D2FF');
    g.addColorStop(0.5, '#E3E9FF');
    g.addColorStop(1, '#D5DCFF');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    /* sun */
    var sun = c.createRadialGradient(W * 0.68, H * 0.24, 0, W * 0.68, H * 0.24, 260);
    sun.addColorStop(0, 'rgba(255, 240, 214, 0.95)');
    sun.addColorStop(0.35, 'rgba(255, 226, 188, 0.45)');
    sun.addColorStop(1, 'rgba(255, 226, 188, 0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, W, H);
    /* soft clouds */
    for (var n = 0; n < 26; n++) {
      var x = Math.random() * W, y = Math.random() * H, r = 50 + Math.random() * 120;
      var cl = c.createRadialGradient(x, y, 0, x, y, r);
      cl.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
      cl.addColorStop(1, 'rgba(255, 255, 255, 0)');
      c.fillStyle = cl;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return asTexture(c.canvas);
  }

  /* warm light plaster */
  function plasterTexture() {
    var c = ctx2d(256, 256);
    c.fillStyle = '#F3F0EA';
    c.fillRect(0, 0, 256, 256);
    var img = c.getImageData(0, 0, 256, 256);
    for (var i = 0; i < img.data.length; i += 4) {
      var n = (Math.random() - 0.5) * 8;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
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

  /* rippling water: streaks that tile and scroll */
  function rippleTexture() {
    var S = 256;
    var c = ctx2d(S, S);
    for (var i = 0; i < 46; i++) {
      var y = Math.random() * S;
      c.beginPath();
      for (var x = 0; x <= S; x += 8) {
        var yy = y + Math.sin((x / S) * Math.PI * 2 * (1 + i % 3)) * 6;
        if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.strokeStyle = i % 5 === 0 ? 'rgba(201, 175, 255, 0.32)' : 'rgba(255, 255, 255, ' + (0.10 + Math.random() * 0.16) + ')';
      c.lineWidth = 1 + Math.random() * 1.6;
      c.stroke();
    }
    var t = asTexture(c.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function coneTexture() {
    var c = ctx2d(64, 256);
    var g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(108, 92, 255, 0.5)');
    g.addColorStop(1, 'rgba(108, 92, 255, 0)');
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

  /* light card plaques, like the site's own cards */
  function plaqueTexture(art) {
    var W = 512, H = 256;
    var c = ctx2d(W, H);
    var accent = art.accent || '#5B4CF5';
    var redraw = function () {
      c.fillStyle = '#FFFFFF';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(20, 18, 31, 0.12)';
      c.lineWidth = 2;
      c.strokeRect(4, 4, W - 8, H - 8);
      c.fillStyle = accent;
      c.fillRect(W - 12, 16, 4, H - 32);
      c.textAlign = 'right';
      c.direction = 'rtl';
      c.fillStyle = '#14121F';
      c.font = '700 44px ' + FONT;
      c.fillText(art.title, W - 40, 100, W - 80);
      c.fillStyle = accent;
      c.font = '500 30px ' + FONT;
      c.fillText(art.tag, W - 40, 162, W - 80);
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
      c.fillStyle = 'rgba(91, 76, 245, 0.55)';
      c.font = '850 150px ' + FONT;
      c.fillText(text, 512, 178);
    };
    redraw();
    var t = asTexture(c.canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { redraw(); t.needsUpdate = true; });
    return t;
  }

  /* the big glowing brand sign over the door */
  function brandTexture() {
    var W = 1600, H = 400;
    var c = ctx2d(W, H);
    var redraw = function () {
      c.clearRect(0, 0, W, H);
      c.textAlign = 'center';
      c.direction = 'ltr';
      c.shadowColor = 'rgba(108, 92, 255, 0.65)';
      c.shadowBlur = 44;
      var g = c.createLinearGradient(0, 60, 0, 320);
      g.addColorStop(0, '#8F74FF');
      g.addColorStop(1, '#5B4CF5');
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

  /* floating hologram labels: ink on a soft white pill */
  function holoLabelTexture(text) {
    var c = ctx2d(512, 128);
    var redraw = function () {
      c.clearRect(0, 0, 512, 128);
      c.fillStyle = 'rgba(255, 255, 255, 0.85)';
      c.beginPath();
      if (c.roundRect) c.roundRect(36, 22, 440, 84, 42); else c.rect(36, 22, 440, 84);
      c.fill();
      c.strokeStyle = 'rgba(91, 76, 245, 0.4)';
      c.lineWidth = 3;
      c.stroke();
      c.textAlign = 'center';
      c.direction = 'rtl';
      c.fillStyle = '#14121F';
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

  /* ---------- the hall ---------- */
  var wallMat = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.92, metalness: 0.0 });
  var floorMat = new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.16, metalness: 0.06, envMapIntensity: 1.25 });
  var stoneMat = new THREE.MeshStandardMaterial({ color: 0xE9E5F2, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.9 });
  var trimMat = new THREE.MeshStandardMaterial({ color: 0xD8D3E6, roughness: 0.45, metalness: 0.2 });
  var glowLineMat = new THREE.MeshBasicMaterial({ color: 0x7a68e8 });
  var frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.32, metalness: 0.8, envMapIntensity: 1.1 });

  var floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.l), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  /* light coffered ceiling flanking a long sky-window */
  var ceilMat = new THREE.MeshStandardMaterial({ map: cofferTexture(), roughness: 0.9, metalness: 0.0 });
  [[-(HALL.w / 4 + 1.25), HALL.w / 2 - 2.5], [HALL.w / 4 + 1.25, HALL.w / 2 - 2.5]].forEach(function (s) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(s[1], HALL.l), ceilMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(s[0], HALL.h, 0);
    scene.add(m);
  });
  var sky = new THREE.Mesh(new THREE.PlaneGeometry(5, HALL.l), new THREE.MeshBasicMaterial({ map: dayskyTexture() }));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(0, HALL.h + 0.01, 0);
  scene.add(sky);
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
  /* the far end is no wall at all — the hall grows out of a cave (built below).
     the entry end opens through a grand arch onto an outdoor terrace. */
  var portalMat = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
  var portalWalls = [];
  [-1, 1].forEach(function (side) {
    var seg = new THREE.Mesh(new THREE.PlaneGeometry(4.5, HALL.h), portalMat);
    seg.position.set(side * 6.75, HALL.h / 2, HALL.l / 2);
    scene.add(seg);
    portalWalls.push({ x: side * 6.75, hx: 2.25, z: HALL.l / 2, hz: 0.45 });
  });
  var header = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), portalMat);
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

  /* arched ribs span the hall — the box becomes a vault */
  for (var az = -24; az <= 24; az += 8) {
    var rib = new THREE.Mesh(new THREE.TorusGeometry(9, 0.16, 10, 30, Math.PI), stoneMat);
    rib.position.set(0, 0, az);
    rib.scale.y = 0.84;
    scene.add(rib);
    var ribLine = new THREE.Mesh(new THREE.TorusGeometry(8.8, 0.03, 6, 30, Math.PI), glowLineMat);
    ribLine.position.set(0, 0, az);
    ribLine.scale.y = 0.84;
    scene.add(ribLine);
    /* pilaster feet under each rib */
    [-1, 1].forEach(function (side) {
      var col = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.2, 0.7), stoneMat);
      col.position.set(side * (HALL.w / 2 - 0.3), 2.6, az);
      scene.add(col);
      var cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.9), trimMat);
      cap.position.set(side * (HALL.w / 2 - 0.3), 5.28, az);
      scene.add(cap);
    });
  }

  /* the glowing brand sign rides the arch — readable from both sides */
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

  /* base lights — soft daylight, one true sun */
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  scene.add(new THREE.HemisphereLight(0xdfe4ff, 0xf3ece0, 0.8));
  var sun = new THREE.DirectionalLight(0xfff1dd, 1.7);
  sun.position.set(16, 30, 52);
  if (!isTouch) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 46;
    sun.shadow.camera.bottom = -46;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0004;
  }
  scene.add(sun);
  scene.add(sun.target);
  floor.receiveShadow = true;
  [24, 12, 0, -12, -24].forEach(function (z, i) {
    var p = new THREE.PointLight(i % 2 ? 0xcfc4ff : 0xffe6cf, 16, 22, 1.7);
    p.position.set(0, HALL.h - 0.8, z);
    scene.add(p);
  });

  /* ---------- the stream: born in the cave, lost over the terrace edge ---------- */
  var STREAM = { half: 0.85, zTop: 40, zBot: -28.6 };
  var BRIDGES = [35, 26, 12, -4, -20];   /* walkable crossings */
  (function buildStream() {
    var len = STREAM.zTop - STREAM.zBot;
    /* dark bed gives the water depth on the bright floor */
    var bed = new THREE.Mesh(new THREE.PlaneGeometry(STREAM.half * 2, len), new THREE.MeshBasicMaterial({ color: 0x322c66 }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, 0.012, (STREAM.zTop + STREAM.zBot) / 2);
    scene.add(bed);
    /* two scrolling ripple sheets */
    var rip = rippleTexture();
    rip.repeat.set(2, 22);
    var rip2 = rippleTexture();
    rip2.repeat.set(3, 30);
    var w1 = new THREE.Mesh(new THREE.PlaneGeometry(STREAM.half * 2, len), new THREE.MeshBasicMaterial({ map: rip, transparent: true, opacity: 0.5, depthWrite: false }));
    w1.rotation.x = -Math.PI / 2;
    w1.position.set(0, 0.03, bed.position.z);
    scene.add(w1);
    var w2 = new THREE.Mesh(new THREE.PlaneGeometry(STREAM.half * 2, len), new THREE.MeshBasicMaterial({ map: rip2, transparent: true, opacity: 0.3, depthWrite: false }));
    w2.rotation.x = -Math.PI / 2;
    w2.position.set(0, 0.04, bed.position.z);
    scene.add(w2);
    window.__streamMaps = [rip, rip2];
    /* stone curbs with a glowing thread */
    [-1, 1].forEach(function (side) {
      var curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, len), stoneMat);
      curb.position.set(side * (STREAM.half + 0.11), 0.06, bed.position.z);
      scene.add(curb);
      var thread = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, len), glowLineMat);
      thread.position.set(side * (STREAM.half + 0.11), 0.125, bed.position.z);
      scene.add(thread);
    });
    /* bridges */
    BRIDGES.forEach(function (bz) {
      var slab = new THREE.Mesh(new THREE.BoxGeometry(STREAM.half * 2 + 0.9, 0.09, 1.9), stoneMat);
      slab.position.set(0, 0.045, bz);
      scene.add(slab);
      [-1, 1].forEach(function (s) {
        var edge = new THREE.Mesh(new THREE.BoxGeometry(STREAM.half * 2 + 0.9, 0.02, 0.03), glowLineMat);
        edge.position.set(0, 0.095, bz + s * 0.93);
        scene.add(edge);
      });
    });
  })();

  /* the aurora shimmer flows down the water */
  var auroraRiver = null;
  if (window.ORBO_LAB) {
    var arW = 256, arH = 1024;
    var arCtx = ctx2d(arW, arH);
    var arTex = asTexture(arCtx.canvas);
    auroraRiver = {
      ctx: arCtx, tex: arTex, w: arW, h: arH, t: Math.random() * 40,
      mesh: new THREE.Mesh(
        new THREE.PlaneGeometry(STREAM.half * 2, STREAM.zTop - STREAM.zBot),
        new THREE.MeshBasicMaterial({ map: arTex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
      )
    };
    auroraRiver.mesh.rotation.x = -Math.PI / 2;
    auroraRiver.mesh.position.set(0, 0.05, (STREAM.zTop + STREAM.zBot) / 2);
    scene.add(auroraRiver.mesh);
  }

  /* ---------- the world outside ---------- */
  function skyDomeTexture() {
    var W = 1024, H = 512;
    var c = ctx2d(W, H);
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#AFC4FF');
    g.addColorStop(0.42, '#DCE5FF');
    g.addColorStop(0.58, '#FFE9D8');
    g.addColorStop(0.72, '#F2EEF6');
    g.addColorStop(1, '#EDEBF5');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    /* the sun sits over the valley */
    var sx = W * 0.5, sy = H * 0.40;
    var sg = c.createRadialGradient(sx, sy, 0, sx, sy, 150);
    sg.addColorStop(0, 'rgba(255, 248, 230, 1)');
    sg.addColorStop(0.2, 'rgba(255, 236, 200, 0.75)');
    sg.addColorStop(1, 'rgba(255, 236, 200, 0)');
    c.fillStyle = sg;
    c.fillRect(0, 0, W, H);
    for (var n = 0; n < 20; n++) {
      var x = Math.random() * W, y = H * (0.15 + Math.random() * 0.35), r = 40 + Math.random() * 90;
      var cl = c.createRadialGradient(x, y, 0, x, y, r);
      cl.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      cl.addColorStop(1, 'rgba(255, 255, 255, 0)');
      c.fillStyle = cl;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return asTexture(c.canvas);
  }
  var dome = new THREE.Mesh(
    new THREE.SphereGeometry(110, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyDomeTexture(), side: THREE.BackSide, fog: false })
  );
  dome.rotation.y = Math.PI;   /* sun band faces the terrace view (+z) */
  scene.add(dome);

  /* painted ridge lines fading into the haze */
  function ridgeTexture(tint, alpha) {
    var W = 1024, H = 256;
    var c = ctx2d(W, H);
    c.clearRect(0, 0, W, H);
    c.beginPath();
    c.moveTo(0, H);
    var ph = Math.random() * 9;
    for (var x = 0; x <= W; x += 8) {
      var u = x * 0.006 + ph;
      var y = H * 0.62 - Math.abs(Math.sin(u * 0.9) * 60 + noise(u * 1.4, ph) * 70 - 35);
      c.lineTo(x, y);
    }
    c.lineTo(W, H);
    c.closePath();
    c.fillStyle = tint;
    c.globalAlpha = alpha;
    c.fill();
    c.globalAlpha = 1;
    return asTexture(c.canvas);
  }
  [
    { z: 62, w: 170, h: 22, y: 2, tint: '#B9B2D8', a: 0.95 },
    { z: 78, w: 220, h: 28, y: 5, tint: '#C8C2E2', a: 0.9 },
    { z: 96, w: 280, h: 36, y: 8, tint: '#D8D3EA', a: 0.85 }
  ].forEach(function (r) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(r.w, r.h),
      new THREE.MeshBasicMaterial({ map: ridgeTexture(r.tint, r.a), transparent: true, depthWrite: false })
    );
    m.position.set(0, r.y, r.z);
    m.rotation.y = Math.PI;
    scene.add(m);
  });
  /* the valley floor far below */
  var valley = new THREE.Mesh(new THREE.PlaneGeometry(320, 200), new THREE.MeshBasicMaterial({ color: 0xC9CBBE }));
  valley.rotation.x = -Math.PI / 2;
  valley.position.set(0, -13, 110);
  scene.add(valley);

  /* the terrace: an open stone deck past the arch */
  var terraceLen = TERRACE.zEnd - HALL.l / 2 + 0.6;
  var deck = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, terraceLen + 1), new THREE.MeshStandardMaterial({ color: 0xE8E4DB, roughness: 0.7, metalness: 0.02 }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.001, HALL.l / 2 + terraceLen / 2);
  deck.receiveShadow = true;
  scene.add(deck);
  /* railing: low stone parapet with a light thread */
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
  rail(HALL.w + 0.4, 0, TERRACE.zEnd + 0.35, 0);
  rail(terraceLen, -(HALL.w / 2 - 0.08), HALL.l / 2 + terraceLen / 2, Math.PI / 2);
  rail(terraceLen, HALL.w / 2 - 0.08, HALL.l / 2 + terraceLen / 2, Math.PI / 2);

  /* the stream leaves the terrace as a waterfall into the valley */
  var fallMaps = [];
  function waterfall(w, h, x, y, z, ry) {
    var t = rippleTexture();
    t.repeat.set(1, h / 2);
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.rotation.y = ry || 0;
    scene.add(m);
    fallMaps.push(t);
    return m;
  }
  waterfall(STREAM.half * 2, 12, 0, -5.9, TERRACE.zEnd + 0.55, 0);
  var lipFoam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false }));
  lipFoam.rotation.x = -Math.PI / 2;
  lipFoam.position.set(0, 0.06, TERRACE.zEnd - 0.4);
  scene.add(lipFoam);

  /* ---------- the cave the stream is born in ---------- */
  var rockMat = new THREE.MeshStandardMaterial({ color: 0xBAB2C8, roughness: 0.96, metalness: 0.0, flatShading: true });
  function makeRock(x, y, z, s) {
    var geo = new THREE.IcosahedronGeometry(1, 2);
    var p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      var n = noise(vx * 1.6 + x, vy * 1.6 + z) - 0.5;
      var k = 1 + n * 0.55;
      p.setXYZ(i, vx * k, vy * k * 0.82, vz * k);
    }
    geo.computeVertexNormals();
    var m = new THREE.Mesh(geo, rockMat);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    m.rotation.y = Math.random() * 6.28;
    scene.add(m);
    return m;
  }
  /* the mouth: rock masses closing the far end, an opening at the center */
  [
    [-8.2, 1.6, -29.6, 3.4], [-5.6, 1.0, -31.2, 3.0], [-6.8, 4.8, -30.4, 3.0], [-3.6, 5.6, -32.4, 3.1],
    [8.2, 1.6, -29.6, 3.4], [5.6, 1.0, -31.2, 3.0], [6.8, 4.8, -30.4, 3.0], [3.6, 5.6, -32.4, 3.1],
    [0, 8.3, -32.4, 3.6], [-1.8, 7.4, -32.6, 2.6], [1.8, 7.4, -32.6, 2.6],
    [-8.4, 6.4, -29.8, 2.8], [8.4, 6.4, -29.8, 2.8]
  ].forEach(function (r) { makeRock(r[0], r[1], r[2], r[3]); });
  /* cave depth behind everything */
  var caveBack = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), new THREE.MeshBasicMaterial({ color: 0x2B2542 }));
  caveBack.position.set(0, 5, -36);
  scene.add(caveBack);
  /* glowing crystals + a soft cave light */
  [[-3.2, 1.1, -30.2, 0.5], [3.6, 0.8, -30.6, 0.4], [-1.2, 6.2, -30.9, 0.45], [2.2, 5.8, -31.2, 0.35]].forEach(function (cr) {
    var c = new THREE.Mesh(new THREE.IcosahedronGeometry(cr[3], 0), new THREE.MeshBasicMaterial({ color: 0x9d8cff }));
    c.position.set(cr[0], cr[1], cr[2]);
    c.rotation.set(Math.random(), Math.random(), Math.random());
    scene.add(c);
  });
  var caveLight = new THREE.PointLight(0x9d8cff, 14, 16, 1.6);
  caveLight.position.set(0, 3.4, -29.5);
  scene.add(caveLight);

  /* the source: water slips out of the rock into the channel */
  var sourceRock = makeRock(0, 0.6, -30.6, 1.8);
  waterfall(1.5, 1.7, 0, 0.8, -28.9);
  var sourceFoam = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false }));
  sourceFoam.rotation.x = -Math.PI / 2;
  sourceFoam.position.set(0, 0.055, -27.9);
  scene.add(sourceFoam);
  /* mist motes drifting at the source */
  (function () {
    var N = 40;
    var mp = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      mp[i * 3] = (Math.random() - 0.5) * 2.2;
      mp[i * 3 + 1] = Math.random() * 2.2;
      mp[i * 3 + 2] = -28.4 + (Math.random() - 0.5) * 1.6;
    }
    var mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    var mist = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false }));
    scene.add(mist);
  })();

  /* ---------- plants ---------- */
  var plantCollide = [];
  var foliage = [];
  function makeTree(x, z, s) {
    var g = new THREE.Group();
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.6 * s, 0.5 * s, 18), stoneMat);
    pot.position.y = 0.25 * s;
    g.add(pot);
    var potLine = new THREE.Mesh(new THREE.TorusGeometry(0.5 * s, 0.015, 6, 24), glowLineMat);
    potLine.rotation.x = Math.PI / 2;
    potLine.position.y = 0.5 * s;
    g.add(potLine);
    var soil = new THREE.Mesh(new THREE.CylinderGeometry(0.46 * s, 0.46 * s, 0.04, 18), new THREE.MeshStandardMaterial({ color: 0x3d3448, roughness: 1 }));
    soil.position.y = 0.5 * s;
    g.add(soil);
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 1.15 * s, 8), new THREE.MeshStandardMaterial({ color: 0x8a755f, roughness: 0.9 }));
    trunk.position.y = 1.0 * s;
    trunk.castShadow = !isTouch;
    g.add(trunk);
    var greens = [0x7fa578, 0x6f9670, 0x93b58a];
    for (var i = 0; i < 3; i++) {
      var leaf = new THREE.Mesh(
        new THREE.IcosahedronGeometry((0.42 - i * 0.07) * s, 1),
        new THREE.MeshStandardMaterial({ color: greens[i], roughness: 0.85, flatShading: true })
      );
      leaf.position.set((Math.random() - 0.5) * 0.3 * s, (1.55 + i * 0.36) * s, (Math.random() - 0.5) * 0.3 * s);
      leaf.castShadow = !isTouch;
      g.add(leaf);
      foliage.push(leaf);
    }
    /* a few violet blossoms — the museum's signature in the greenery */
    for (var b = 0; b < 4; b++) {
      var bl = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 6, 6), new THREE.MeshBasicMaterial({ color: 0x9d8cff }));
      bl.position.set((Math.random() - 0.5) * 0.7 * s, (1.6 + Math.random() * 0.8) * s, (Math.random() - 0.5) * 0.7 * s);
      g.add(bl);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    /* fake contact shadow only where the real sun can't draw one */
    if (isTouch) {
      var sh = new THREE.Mesh(new THREE.PlaneGeometry(1.9 * s, 1.9 * s), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.5, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(x, 0.014, z);
      scene.add(sh);
    }
    plantCollide.push({ x: x, z: z, r: 0.85 * s });
  }
  var blobTex = radialTexture('rgba(40, 34, 66, 0.5)', 'rgba(40, 34, 66, 0)');
  /* wall-side trees between the bays */
  makeTree(-7.3, 25, 1.15);
  makeTree(7.3, 25, 1.05);
  makeTree(-7.3, 4, 1.1);
  makeTree(7.3, 4, 1.15);
  makeTree(-7.3, -17, 1.05);
  makeTree(7.3, -17, 1.1);
  /* smaller shrubs by the water, on the terrace and at the cave mouth */
  makeTree(-1.9, 18, 0.62);
  makeTree(1.9, 2, 0.6);
  makeTree(-1.9, -12, 0.64);
  makeTree(-6.6, 36, 1.0);
  makeTree(6.6, 36, 0.95);
  makeTree(-4.6, -26.2, 0.72);
  makeTree(4.4, -27.0, 0.75);
  /* grass along the banks — one instanced draw call for every blade */
  (function () {
    var blade = new THREE.ConeGeometry(0.035, 0.3, 5);
    var mats = [
      new THREE.MeshStandardMaterial({ color: 0x86a781, roughness: 0.9, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x74997a, roughness: 0.9, flatShading: true })
    ];
    var perMat = 110;
    var dummy = new THREE.Object3D();
    mats.forEach(function (mat, mi) {
      var inst = new THREE.InstancedMesh(blade, mat, perMat);
      var n = 0, guard = 0;
      while (n < perMat && guard++ < 800) {
        var gz = STREAM.zBot + 1.5 + Math.random() * (STREAM.zTop - STREAM.zBot - 3);
        if (BRIDGES.some(function (b) { return Math.abs(gz - b) < 1.5; })) continue;
        var gx = (Math.random() < 0.5 ? -1 : 1) * (STREAM.half + 0.32 + Math.random() * 0.3);
        dummy.position.set(gx + (Math.random() - 0.5) * 0.2, 0.12 + Math.random() * 0.04, gz);
        dummy.rotation.set(0, Math.random() * 6.28, (Math.random() - 0.5) * 0.4);
        dummy.scale.setScalar(0.7 + Math.random() * 0.8);
        dummy.updateMatrix();
        inst.setMatrixAt(n++, dummy.matrix);
      }
      inst.count = n;
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    });
  })();

  /* benches — two, not a furniture store */
  var benches = [];
  [[-3.4, 16], [3.4, -8]].forEach(function (bz) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.6), stoneMat);
    b.position.set(bz[0], 0.21, bz[1]);
    b.castShadow = !isTouch;
    scene.add(b);
    var edge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.02), glowLineMat);
    edge.position.set(bz[0], 0.43, bz[1] + 0.29);
    scene.add(edge);
    if (isTouch) {
      var s = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.6, depthWrite: false }));
      s.rotation.x = -Math.PI / 2;
      s.position.set(bz[0], 0.013, bz[1]);
      scene.add(s);
    }
    benches.push({ x: bz[0], z: bz[1], hx: 1.35, hz: 0.65 });
  });

  /* floating dust — visible as soft violet motes in the light */
  var dust = null;
  (function () {
    var N = 260;
    var pos0 = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos0[i * 3] = (Math.random() - 0.5) * (HALL.w - 2);
      pos0[i * 3 + 1] = Math.random() * (HALL.h - 1) + 0.4;
      pos0[i * 3 + 2] = (Math.random() - 0.5) * (HALL.l - 3);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos0, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x8f7bff, size: 0.028, transparent: true, opacity: 0.4, depthWrite: false
    }));
    scene.add(dust);
  })();

  /* a soft ring of light follows the visitor */
  var playerHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 3.2),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(91, 76, 245, 0.16)', 'rgba(91, 76, 245, 0)'), transparent: true, depthWrite: false })
  );
  playerHalo.rotation.x = -Math.PI / 2;
  playerHalo.position.y = 0.016;
  scene.add(playerHalo);

  /* wing titles float off the wall at bay centers */
  function wingTitle(text, x, z, ry) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.25),
      new THREE.MeshBasicMaterial({ map: wingTexture(text), transparent: true, depthWrite: false })
    );
    m.position.set(x, 5.6, z);
    m.rotation.y = ry;
    scene.add(m);
  }
  wingTitle('העבודות', LX + 0.55, 20, Math.PI / 2);
  wingTitle('אמנות בקוד', RX - 0.55, 20, -Math.PI / 2);
  wingTitle('המעבדה', LX + 0.55, -12, Math.PI / 2);
  wingTitle('המעבדה', RX - 0.55, -12, -Math.PI / 2);

  /* ---------- holograms (saturated for daylight) ---------- */
  var holoLineMat = function (color) {
    return new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.92, depthWrite: false });
  };
  var holoFillMat = function (color) {
    return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide });
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
    /* a soft violet backdrop keeps holograms present against the light hall */
    var aura = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(108, 92, 255, 0.30)', 'rgba(108, 92, 255, 0)'), transparent: true, depthWrite: false, side: THREE.DoubleSide })
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

  /* ---------- pedestals ---------- */
  var coneTex = coneTexture();
  var pedestalDefs = [
    { id: 'cap-web', holo: 'globe', x: -3.2, z: 16, label: 'אתרים וחוויות', tag: 'מה אנחנו בונים', accent: '#1F8FD8',
      body: 'אתרים שמרגישים כמו מקום, לא כמו דף. האולם שאתם עומדים בו עכשיו נבנה באותם כלים בדיוק — ורץ בדפדפן, בלי להתקין כלום.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-sys', holo: 'device', x: 3.2, z: 8, label: 'אפליקציות ומערכות', tag: 'מה אנחנו בונים', accent: '#0FA88C',
      body: 'מהרעיון ועד מוצר שרץ בענן: אפליקציות, מערכות ניהול וכלים פנימיים שנתפרים בדיוק לצורת העבודה של העסק.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-ai', holo: 'neural', x: -3.2, z: -8, label: 'AI ואוטומציה', tag: 'מה אנחנו בונים', accent: '#6C5CFF',
      body: 'תהליכים שקורים מעצמם: מיון פניות, טיוטות מסמכים, חיבורים בין מערכות — עם בקרה אנושית בנקודות שחשוב.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-play', holo: 'game', x: 3.2, z: -16, label: 'משחקים וחוויות', tag: 'מה אנחנו בונים', accent: '#E8722E',
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
      new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })
    );
    cone.position.set(def.x, 2.35, def.z);
    scene.add(cone);

    var holo = makeHologram(def.holo, 1);
    holo.position.set(def.x, 1.85, def.z);
    scene.add(holo);
    holograms.push(holo);
    def._holo = holo;

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
  var atriumStar = makeHologram('star', 2.3);
  atriumStar.position.set(0, 4.9, 0);
  scene.add(atriumStar);
  holograms.push(atriumStar);
  var atriumHit = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  atriumHit.position.copy(atriumStar.position);
  atriumHit.userData.art = {
    title: 'ORBO', tag: 'הסטודיו', _holo: atriumStar, _glow: null, self: true,
    body: 'הכוכב של אורבו. כל מה שבמוזיאון — האולם, הנחל, ההולוגרמות והציורים החיים — נבנה כאן, בקוד, בלי אף קובץ מוכן. ככה נראית אצלנו גישה לפרויקט.',
    link: 'studio.html', linkText: 'להכיר אותנו'
  };
  scene.add(atriumHit);
  pickables.push(atriumHit);

  /* comets circling the star */
  var comets = [];
  (function () {
    var cometTex = radialTexture('rgba(108, 92, 255, 0.85)', 'rgba(108, 92, 255, 0)');
    for (var i = 0; i < 3; i++) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.5),
        new THREE.MeshBasicMaterial({ map: cometTex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
      );
      scene.add(m);
      comets.push({ mesh: m, r: 2.6 + i * 0.5, sp: 0.5 + i * 0.17, ph: i * 2.1, tilt: 0.35 + i * 0.22 });
    }
  })();

  /* ---------- the collection (wall pieces) ---------- */
  var ART = [
    { id: 'bisomna', wall: 'L', z: 20, title: 'BISOMNA', tag: 'אתר · באוויר', style: 'light', sub: 'אתר למיזם שינה ישראלי', domain: 'bisomna.com', link: 'https://bisomna.com', accent: '#5B4CF5',
      body: 'אתר רחב למיזם בתחום השינה — מוצר, מדע, חנות ומשקיעים. וידאו שנע יחד עם הגלילה ותצוגת מוצר שנפתחת לשכבות, והכול נשאר מהיר גם בנייד.' },
    { id: 'orbo', wall: 'L', z: 10, title: 'orbosolutions.com', tag: 'הבית שלנו', style: 'dark', sub: 'דף הבית של הסטודיו', domain: 'orbosolutions.com', link: 'index.html', self: true, accent: '#6C5CFF',
      body: 'דף הבית שלנו הוא מסע: גוללים, והמצלמה עפה דרך עולם של חלקיקים שמתגבשים לצורות. בנוי כולו בקוד, בלי אף קובץ תמונה.' },
    { id: 'aurora', wall: 'L', z: -2, live: 'aurora', title: 'AURORA', tag: 'ציור חי · המעבדה', accent: '#86B32B', link: 'lab/01-aurora-gsap/',
      body: 'סרטי אור שנעים בזרם. הציור שעל הקיר נצבע מחדש עשרות פעמים בשנייה, ממש עכשיו — כמו כל ציורי המעבדה באגף הזה.' },
    { id: 'nebula', wall: 'L', z: -12, live: 'nebula', title: 'NEBULA', tag: 'ציור חי · המעבדה', accent: '#1F8FD8', link: 'lab/02-nebula-three/',
      body: 'גלקסיה של חלקיקים שמסתחררת לאט. בגרסה המלאה גוללים אל תוך מרכז הגלקסיה.' },
    { id: 'prism', wall: 'L', z: -22, live: 'prism', title: 'PRISM', tag: 'ציור חי · המעבדה', accent: '#7A5CFF', link: 'lab/03-prism-r3f/',
      body: 'אלומת אור שנשברת דרך גאומטריה ומתפצלת לספקטרום. בגרסה המלאה — חדר חומרים תלת־ממדי שלם.' },
    { id: 'genesis', wall: 'R', z: 20, gen: genesisTexture, title: 'GENESIS', tag: 'אמנות גנרטיבית', accent: '#E8722E',
      body: 'שלוש מאות קווים ששוחררו לשדה זרימה מתמטי. אף אחד לא צייר את היצירה הזאת — היא חושבה, קו אחרי קו, ברגע שנכנסתם למוזיאון.' },
    { id: 'mosaic', wall: 'R', z: 10, gen: mosaicTexture, title: 'MOSAIC', tag: 'אמנות גנרטיבית', accent: '#6C5CFF',
      body: 'פסיפס שנבנה מחלוקת המרחב בין ארבעים ושש נקודות אקראיות. כל ריצה מייצרת פסיפס שלא היה קיים מעולם.' },
    { id: 'flux', wall: 'R', z: -2, live: 'flux', title: 'FLUX', tag: 'ציור חי · המעבדה', accent: '#E0402F', link: 'lab/04-flux-shaders/',
      body: 'שדות צבע שזורמים על המסך לפי כללים מתמטיים. בגרסה המלאה — שישה שדות שונים, ישר מול המעבד הגרפי.' },
    { id: 'terra', wall: 'R', z: -12, live: 'terra', title: 'TERRA', tag: 'ציור חי · המעבדה', accent: '#C9A05C', link: 'lab/05-terra-webgl/',
      body: 'רכסי הרים שמחושבים מרעש מתמטי טהור, תחת שמש נמוכה. בגרסה המלאה גולשים בין נופים שלמים.' },
    { id: 'fractal', wall: 'R', z: -22, gen: fractalTexture, title: 'JULIA', tag: 'אמנות גנרטיבית', accent: '#7A5CFF',
      body: 'קבוצת ז׳וליה — נוסחה אחת קצרה שמכילה אינסוף. ככל שמתקרבים, מתגלים עוד ועוד עולמות. חושבה פיקסל־פיקסל בכניסתכם.' },
    { id: 'star', wall: 'F', z: -HALL.l / 2, title: 'ORBO', tag: 'הסטודיו', style: 'dark', big: true, sub: 'רעיונות יש לכולם. אנחנו הופכים אותם למציאות.', accent: '#6C5CFF',
      body: 'תודה שביקרתם. אם משהו כאן הדליק לכם רעיון — נשמח לשמוע עליו.', contact: true }
  ];

  var glowTexNeutral = radialTexture('rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0)');
  var poolTex = radialTexture('rgba(91, 76, 245, 0.10)', 'rgba(91, 76, 245, 0)');

  ART.forEach(function (art) {
    var group = new THREE.Group();
    var W = art.big ? 4.8 : 2.7, H = art.big ? 3.0 : 1.69;
    var AY = art.big ? 4.0 : 2.15;   /* the cave screen hangs high over the source */

    if (art.wall === 'L') { group.position.set(LX, 0, art.z); group.rotation.y = Math.PI / 2; }
    else if (art.wall === 'R') { group.position.set(RX, 0, art.z); group.rotation.y = -Math.PI / 2; }
    else { group.position.set(0, 0, -29.6); }   /* the finale floats in the cave mouth */

    /* colored aura behind the frame (normal blending — reads on light walls) */
    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 1.5, H * 1.7),
      new THREE.MeshBasicMaterial({ map: glowTexNeutral, color: new THREE.Color(art.accent || '#6C5CFF'), transparent: true, opacity: 0.28, depthWrite: false })
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

    var pool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.3), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    var pWorld = new THREE.Vector3(0, 0, 0).applyEuler(group.rotation).add(group.position);
    pool.position.set(pWorld.x + (art.wall === 'L' ? 1.2 : art.wall === 'R' ? -1.2 : 0), 0.013, pWorld.z + (art.wall === 'F' ? 1.2 : 0));
    scene.add(pool);

    if (!isTouch) {
      var sp = new THREE.SpotLight(0xfff3e4, 20, 12, 0.55, 0.65, 1.4);
      var sWorld = new THREE.Vector3(0, HALL.h - 0.5, 2.1).applyEuler(group.rotation).add(group.position);
      sp.position.copy(sWorld);
      var tWorld = new THREE.Vector3(0, AY, 0).applyEuler(group.rotation).add(group.position);
      sp.target.position.copy(tWorld);
      scene.add(sp);
      scene.add(sp.target);
      var hs = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.18, 10), frameMat);
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

  function nearBridge(z) {
    for (var i = 0; i < BRIDGES.length; i++) if (Math.abs(z - BRIDGES[i]) < 1.05) return true;
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
    pos.addScaledVector(vel, dt);

    pos.x = Math.max(-BOUND.x, Math.min(BOUND.x, pos.x));
    pos.z = Math.max(BOUND.zMin, Math.min(BOUND.zMax, pos.z));

    var i, b, dx, dz, dd;
    /* the stream blocks passage except at the bridges */
    if (Math.abs(pos.x) < STREAM.half + 0.25 && pos.z < STREAM.zTop && pos.z > STREAM.zBot && !nearBridge(pos.z)) {
      pos.x = (pos.x >= 0 ? 1 : -1) * (STREAM.half + 0.25);
    }
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
      if (d > 22) continue;
      var prox = Math.max(0, Math.min(1, 1 - (d - 2) / 5));
      a._glow.material.opacity = 0.24 + prox * 0.3 + (a === hoverArt ? 0.16 : 0);
      var sc = 1 + prox * 0.035;
      a._plane.scale.set(sc, sc, 1);
    }
    playerHalo.position.x = pos.x;
    playerHalo.position.z = pos.z;
    playerHalo.material.opacity = 0.8 + (reduced ? 0 : Math.sin(t * 1.6) * 0.2);
    /* the water flows — down the channel and over both falls */
    if (window.__streamMaps && !reduced) {
      window.__streamMaps[0].offset.y -= dt * 0.10;
      window.__streamMaps[1].offset.y -= dt * 0.16;
      for (var wf = 0; wf < fallMaps.length; wf++) fallMaps[wf].offset.y += dt * 0.55;
    }
    if (auroraRiver && !reduced && liveTick % 2 === 0) {
      auroraRiver.t += dt * 1.8;
      ORBO_LAB.draw.aurora({ ctx: auroraRiver.ctx, w: auroraRiver.w, h: auroraRiver.h, t: auroraRiver.t, seed: [] });
      auroraRiver.tex.needsUpdate = true;
    }
    /* leaves breathe */
    if (!reduced) {
      for (var f = 0; f < foliage.length; f++) {
        var lf = foliage[f];
        lf.rotation.y = Math.sin(t * 0.4 + f * 1.3) * 0.12;
        lf.rotation.z = Math.sin(t * 0.55 + f * 2.1) * 0.05;
      }
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
