/* ORBO - the museum, seventh cut: the jewel box.
   One compact, warm, luminous hall - a stadium-shaped room with no
   corners and no columns - built from materials that read as real:
   honed stone tiles with veining and grout, troweled limewash walls,
   bronze rails and frames, dark linen panels behind every piece.
   Above, an oval skylight and clerestory windows open onto a glittering
   night of thousands of stars. The collection: backlit posters, five
   LIVING lab paintings, generative artworks, four hologram pedestals
   and the atrium star. Small footprint, high finish, light on the GPU:
   no shadow maps, no fog, few lights, low geometry.
   Desktop: pointer-lock + WASD. Touch: joystick + drag-look + tap.
   No assets - everything is drawn in code. */
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
    if (ek) ek.innerHTML = '<span><b>ג׳ויסטיק</b> בצד - תנועה</span><span><b>גרירה</b> - להסתכל</span><span><b>הקשה</b> על מוצג - פרטים</span>';
  }

  if (document.fonts && document.fonts.load) {
    document.fonts.load("850 100px 'Noto Sans Hebrew'", 'אב');
    document.fonts.load("700 44px 'Noto Sans Hebrew'", 'אב');
  }

  /* ---------- renderer ---------- */
  var renderer;
  try {
    /* alpha canvas: where the hall punches a screen hole, the real
       site (an iframe on the layer below) shows through */
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { renderer = null; }
  if (!renderer || !renderer.getContext()) {
    enterEl.classList.add('no-gl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.35 : 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x0a0916, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  /* no opaque background - the twin star shells cover every direction,
     so the view is identical, but cleared pixels stay transparent */
  var scene = new THREE.Scene();

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

  /* honed stone tiles: warm large-format slabs, veined, with grout lines.
     the megapixel of fbm used to block load for ~0.5s - now an instant
     stand-in (base tone + grout) ships first and the veined surface is
     computed in row bands between frames, done long before the visitor
     clicks through the entry overlay. */
  function stoneFloorSuite() {
    var S = 1024, TILES = 4;
    var col = ctx2d(S, S), rgh = ctx2d(S, S);
    var tileSz = S / TILES;
    col.fillStyle = '#232031';
    col.fillRect(0, 0, S, S);
    col.fillStyle = 'rgba(0, 0, 0, 0.45)';
    for (var g0 = 0; g0 <= TILES; g0++) {
      col.fillRect(g0 * tileSz - 2, 0, 4, S);
      col.fillRect(0, g0 * tileSz - 2, S, 4);
    }
    rgh.fillStyle = 'rgb(122, 122, 122)';
    rgh.fillRect(0, 0, S, S);
    var map = asTexture(col.canvas);
    var rough = asTexture(rgh.canvas, true);
    [map, rough].forEach(function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.125, 0.125); });
    var img = col.createImageData(S, S);
    var rimg = rgh.createImageData(S, S);
    var band = 0, BANDS = 8, rowsPerBand = S / BANDS;
    function renderBand() {
      var y1 = band * rowsPerBand + rowsPerBand;
      for (var y = y1 - rowsPerBand; y < y1; y++) {
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
      band++;
      if (band < BANDS) { setTimeout(renderBand, 25); return; }
      col.putImageData(img, 0, 0);
      rgh.putImageData(rimg, 0, 0);
      map.needsUpdate = true;
      rough.needsUpdate = true;
    }
    setTimeout(renderBand, 25);
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
        /* strokes stretched horizontally - a trowel's memory */
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
    /* not black - a deep blue night with faint breath */
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

  /* museum label: a wide warm-white card that hangs UNDER each piece -
     bronze station numeral, title, wing line, what it proves, and a
     short curator's description. under the art there is always room,
     so no label can ever be swallowed by a neighboring panel again. */
  function plaqueTexture(art) {
    var W = 768, H = 396;
    var c = ctx2d(W, H);
    var accent = art.accent || '#5B4CF5';
    var wrap = function (text, maxW, font) {
      c.font = font;
      var words = text.split(' ');
      var lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var t2 = cur ? cur + ' ' + words[i] : words[i];
        if (c.measureText(t2).width > maxW && cur) { lines.push(cur); cur = words[i]; }
        else cur = t2;
      }
      if (cur) lines.push(cur);
      return lines.slice(0, 2);
    };
    var redraw = function () {
      c.fillStyle = '#FBFAF6';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(20, 18, 31, 0.14)';
      c.lineWidth = 2;
      c.strokeRect(4, 4, W - 8, H - 8);
      c.fillStyle = '#9a7b52';
      c.fillRect(W - 12, 18, 4, H - 36);
      if (art.num) {
        c.textAlign = 'left';
        c.direction = 'ltr';
        var ng = c.createLinearGradient(0, 40, 0, 130);
        ng.addColorStop(0, '#c9a05c');
        ng.addColorStop(1, '#9a7b52');
        c.fillStyle = ng;
        c.font = '800 86px ' + FONT;
        c.fillText(art.num, 42, 130);
        c.fillStyle = 'rgba(154, 123, 82, 0.55)';
        c.fillRect(44, 152, 110, 3);
        c.fillStyle = 'rgba(90, 86, 104, 0.8)';
        c.font = '500 24px ' + FONT;
        c.fillText('תחנה', 46, 192);
      }
      var RX = W - 44, TXW = W - 260;
      c.textAlign = 'right';
      c.direction = 'rtl';
      c.fillStyle = '#17141F';
      c.font = '700 48px ' + FONT;
      c.fillText(art.title, RX, 84, TXW);
      c.fillStyle = accent;
      c.font = '500 27px ' + FONT;
      c.fillText(art.tag, RX, 134, TXW);
      if (art.demo) {
        c.fillStyle = '#6b657a';
        c.font = '500 24px ' + FONT;
        c.fillText(art.demo, RX, 186, TXW);
      }
      if (art.desc) {
        c.fillStyle = 'rgba(154, 123, 82, 0.4)';
        c.fillRect(W - 44 - 150, 216, 150, 2);
        c.fillStyle = '#4a4658';
        var lines = wrap(art.desc, W - 110, '400 26px ' + FONT);
        for (var li = 0; li < lines.length; li++) {
          c.fillText(lines[li], RX, 268 + li * 42, W - 100);
        }
      }
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

  /* the welcome board: warm ivory, the mark, three lines that explain
     the whole idea of this place */
  function introTexture() {
    var W = 1024, H = 720;
    var c = ctx2d(W, H);
    var redraw = function () {
      c.fillStyle = '#FBFAF6';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(20, 18, 31, 0.16)';
      c.lineWidth = 3;
      c.strokeRect(8, 8, W - 16, H - 16);
      c.strokeStyle = 'rgba(154, 123, 82, 0.5)';
      c.lineWidth = 2;
      c.strokeRect(22, 22, W - 44, H - 44);
      drawStar(c, W / 2, 118, 44, '#5B4CF5', 'rgba(108, 92, 255, 0.25)');
      c.textAlign = 'center';
      c.direction = 'rtl';
      c.fillStyle = '#14121F';
      c.font = '850 92px ' + FONT;
      c.fillText('ברוכים הבאים', W / 2, 292, W - 140);
      c.fillStyle = '#3d3950';
      c.font = '500 44px ' + FONT;
      c.fillText('במקום תיק עבודות - בנינו מקום.', W / 2, 392, W - 160);
      c.fillText('כל מה שסביבכם נוצר אצלנו, בקוד.', W / 2, 458, W - 160);
      c.fillStyle = 'rgba(154, 123, 82, 0.65)';
      c.fillRect(W / 2 - 60, 512, 120, 3);
      c.fillStyle = '#5A5668';
      c.font = '400 33px ' + FONT;
      c.fillText('במרכז - ארבע עמדות של מה אנחנו בונים.', W / 2, 578, W - 150);
      c.fillText('על הקירות - תחנות 01-14. לחצו על כל מוצג לפרטים.', W / 2, 632, W - 150);
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

  /* ---------- generative artworks ----------
     each draws into a ctx it is handed; the ART loop ships a dark
     placeholder texture instantly and schedules these off the critical
     path, so load never blocks on a megapixel of math. */
  function genesisArt(c) {
    var W = 640, H = 400;
    c.fillStyle = '#0e0a18';
    c.fillRect(0, 0, W, H);
    var cols = ['rgba(157, 140, 255,', 'rgba(255, 176, 128,', 'rgba(120, 170, 255,', 'rgba(201, 175, 255,'];
    for (var p = 0; p < 340; p++) {
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
      /* bright enough to read across the hall - the piece used to vanish
         into the linen from a few meters away */
      c.strokeStyle = col + (0.14 + Math.random() * 0.16) + ')';
      c.lineWidth = 1.1;
      c.stroke();
    }
  }

  function mosaicArt(c) {
    var W = 640, H = 400;
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
  }

  function fractalArt(c) {
    var W = 640, H = 400;
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
  }

  /* one-time art renders that stream in behind the entry overlay */
  var deferredArt = [];
  function runDeferredArt() {
    deferredArt.forEach(function (d, i) {
      setTimeout(function () { d.run(); d.tex.needsUpdate = true; }, 80 + i * 90);
    });
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
  var pedestalStoneMat = new THREE.MeshStandardMaterial({ color: 0xE3DCCB, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.9 });

  /* ---------- static-geometry collectors ----------
     every fixed bronze bar, frame, belt, collar and housing lands in a
     bucket and is baked into ONE mesh per material - the hall's ~120
     pieces of hardware cost five draw calls instead of five score. */
  var staticParts = { bronze: [], dark: [], warm: [], linen: [], stone: [] };
  var _collectEuler = new THREE.Euler();
  function collect(bucket, geo, x, y, z, rx, ry, rz) {
    var m = new THREE.Matrix4().makeRotationFromEuler(_collectEuler.set(rx || 0, ry || 0, rz || 0));
    m.setPosition(x, y, z);
    staticParts[bucket].push({ geo: geo, matrix: m });
  }
  function collectM(bucket, geo, matrix) {
    staticParts[bucket].push({ geo: geo, matrix: matrix });
  }
  function bakeStatic() {
    var mats = { bronze: bronzeMat, dark: darkBronze, warm: warmLineMat, linen: linenMat, stone: pedestalStoneMat };
    Object.keys(staticParts).forEach(function (key) {
      var list = staticParts[key];
      if (!list.length) return;
      var posA = [], norA = [], uvA = [];
      var v = new THREE.Vector3();
      var nm = new THREE.Matrix3();
      list.forEach(function (it) {
        var g = it.geo.index ? it.geo.toNonIndexed() : it.geo;
        var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
        nm.getNormalMatrix(it.matrix);
        for (var i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(it.matrix);
          posA.push(v.x, v.y, v.z);
          v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
          norA.push(v.x, v.y, v.z);
          uvA.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
        }
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norA, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
      scene.add(new THREE.Mesh(geo, mats[key]));
      staticParts[key] = [];
    });
  }

  /* one seamless stadium floor - a single shape, nothing to fight over */
  (function () {
    var sh = new THREE.Shape();
    sh.absarc(0, -ROOM.straight, ROOM.hw, Math.PI, Math.PI * 2, false);
    sh.absarc(0, ROOM.straight, ROOM.hw, 0, Math.PI, false);
    sh.closePath();
    var geo = new THREE.ShapeGeometry(sh, 40);
    var f = new THREE.Mesh(geo, floorMat);
    f.rotation.x = -Math.PI / 2;
    scene.add(f);
  })();

  /* walls: two straight planes + two half-cylinders, seamless */
  [-1, 1].forEach(function (side) {
    var w = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.straight * 2, ROOM.h), wallMat);
    w.position.set(side * ROOM.hw, ROOM.h / 2, 0);
    w.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(w);
  });
  [1, -1].forEach(function (side) {
    var cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(ROOM.hw, ROOM.hw, ROOM.h, 40, 1, true, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI),
      wallMatIn
    );
    cyl.position.set(0, ROOM.h / 2, side * ROOM.straight);
    scene.add(cyl);
  });

  /* bronze wainscot rail + warm cove line, all the way around */
  function beltRing(y, bucket, tube) {
    /* straight segments */
    [-1, 1].forEach(function (side) {
      collect(bucket, new THREE.CylinderGeometry(tube, tube, ROOM.straight * 2, 6), side * (ROOM.hw - 0.04), y, 0, Math.PI / 2, 0, 0);
    });
    /* curved segments */
    [1, -1].forEach(function (side) {
      collect(bucket, new THREE.TorusGeometry(ROOM.hw - 0.04, tube, 6, 30, Math.PI), 0, y, side * ROOM.straight, -Math.PI / 2, 0, side > 0 ? Math.PI : 0);
    });
  }
  beltRing(0.95, 'bronze', 0.03);            /* wainscot rail */
  beltRing(ROOM.h - 0.55, 'warm', 0.022);    /* warm cove light line */
  /* stone base skirting */
  beltRing(0.12, 'dark', 0.05);

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
      collect('bronze', new THREE.CylinderGeometry(r[2], r[2], r[1], 8), r[0], ROOM.h - 0.02, 0, Math.PI / 2, 0, 0);
    });
    [[-10.05], [10.05]].forEach(function (r) {
      collect('bronze', new THREE.CylinderGeometry(0.055, 0.055, 4.5, 8), 0, ROOM.h - 0.02, r[0], 0, 0, Math.PI / 2);
    });
    [-2.05, 2.05].forEach(function (x) {
      collect('warm', new THREE.BoxGeometry(0.1, 0.05, 19.6), x, ROOM.h - 0.05, 0);
    });
  })();

  /* the entry: a great double door of brushed night-metal in a bronze
     frame, a violet light breathing in its seam - a door worth a museum */
  function doorSuite() {
    var W = 512, H = 704;
    var col = ctx2d(W, H), bmp = ctx2d(W, H);
    /* base: cold dark metal, lit faintly from above */
    var g = col.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b2440');
    g.addColorStop(0.35, '#201a31');
    g.addColorStop(1, '#141020');
    col.fillStyle = g;
    col.fillRect(0, 0, W, H);
    /* vertical brushing */
    for (var i = 0; i < 340; i++) {
      var bx = Math.random() * W;
      var by = Math.random() * H;
      var bl = 40 + Math.random() * 180;
      col.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '120,110,170') + ',' + (0.012 + Math.random() * 0.03).toFixed(3) + ')';
      col.lineWidth = 1;
      col.beginPath();
      col.moveTo(bx, by);
      col.lineTo(bx, by + bl);
      col.stroke();
    }
    bmp.fillStyle = 'rgb(128,128,128)';
    bmp.fillRect(0, 0, W, H);
    /* two leaves, each with two recessed panels */
    function panel(x, y, w2, h2) {
      col.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      col.lineWidth = 5;
      col.strokeRect(x, y, w2, h2);
      col.strokeStyle = 'rgba(201, 168, 110, 0.5)';
      col.lineWidth = 1.6;
      col.strokeRect(x + 4, y + 4, w2 - 8, h2 - 8);
      var pg = col.createLinearGradient(0, y, 0, y + h2);
      pg.addColorStop(0, 'rgba(255, 255, 255, 0.045)');
      pg.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
      col.fillStyle = pg;
      col.fillRect(x + 6, y + 6, w2 - 12, h2 - 12);
      bmp.fillStyle = 'rgb(70,70,70)';
      bmp.fillRect(x, y, w2, h2);
      bmp.fillStyle = 'rgb(150,150,150)';
      bmp.fillRect(x + 6, y + 6, w2 - 12, h2 - 12);
    }
    [[26], [W / 2 + 14]].forEach(function (lx) {
      panel(lx[0], 40, W / 2 - 40, 300);
      panel(lx[0], 372, W / 2 - 40, 292);
    });
    /* the luminous seam between the leaves */
    var sg = col.createLinearGradient(W / 2 - 7, 0, W / 2 + 7, 0);
    sg.addColorStop(0, 'rgba(108, 92, 255, 0)');
    sg.addColorStop(0.5, 'rgba(160, 140, 255, 0.85)');
    sg.addColorStop(1, 'rgba(108, 92, 255, 0)');
    col.fillStyle = sg;
    col.fillRect(W / 2 - 7, 14, 14, H - 28);
    /* bronze handle bars flanking the seam */
    [[W / 2 - 34], [W / 2 + 26]].forEach(function (hx) {
      var hg = col.createLinearGradient(hx[0], 0, hx[0] + 9, 0);
      hg.addColorStop(0, '#8a6d46');
      hg.addColorStop(0.5, '#d9b87e');
      hg.addColorStop(1, '#6b5233');
      col.fillStyle = hg;
      if (col.roundRect) {
        col.beginPath();
        col.roundRect(hx[0], 280, 9, 150, 4.5);
        col.fill();
      } else {
        col.fillRect(hx[0], 280, 9, 150);
      }
      bmp.fillStyle = 'rgb(230,230,230)';
      bmp.fillRect(hx[0], 280, 9, 150);
    });
    /* corner studs */
    [[40, 54], [W / 2 - 28, 54], [W / 2 + 28, 54], [W - 40, 54], [40, H - 54], [W / 2 - 28, H - 54], [W / 2 + 28, H - 54], [W - 40, H - 54]].forEach(function (sxy) {
      var rg2 = col.createRadialGradient(sxy[0] - 1, sxy[1] - 1, 0, sxy[0], sxy[1], 6);
      rg2.addColorStop(0, '#cfa972');
      rg2.addColorStop(1, '#4a3a24');
      col.fillStyle = rg2;
      col.beginPath();
      col.arc(sxy[0], sxy[1], 5, 0, 6.284);
      col.fill();
      bmp.fillStyle = 'rgb(255,255,255)';
      bmp.beginPath();
      bmp.arc(sxy[0], sxy[1], 5, 0, 6.284);
      bmp.fill();
    });
    return { map: asTexture(col.canvas), bump: asTexture(bmp.canvas, true) };
  }
  var doorGlowMat = null;
  (function () {
    var doorR = 6.95;
    var doorZ = ROOM.straight + doorR;
    var ds = doorSuite();
    var door = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 3.6),
      new THREE.MeshStandardMaterial({ map: ds.map, bumpMap: ds.bump, bumpScale: 0.9, roughness: 0.42, metalness: 0.62, envMapIntensity: 1.35 })
    );
    door.position.set(0, 1.8, doorZ);
    door.rotation.y = Math.PI;
    scene.add(door);
    /* bronze frame: jambs + lintel */
    collect('bronze', new THREE.BoxGeometry(0.14, 3.76, 0.16), -1.37, 1.88, doorZ - 0.01);
    collect('bronze', new THREE.BoxGeometry(0.14, 3.76, 0.16), 1.37, 1.88, doorZ - 0.01);
    collect('bronze', new THREE.BoxGeometry(2.96, 0.15, 0.16), 0, 3.72, doorZ - 0.01);
    /* the seam breathes violet into the hall */
    doorGlowMat = new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(150, 130, 255, 0.5)', 'rgba(150, 130, 255, 0)'),
      transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false
    });
    var seamGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.4), doorGlowMat);
    seamGlow.position.set(0, 1.8, doorZ - 0.05);
    seamGlow.rotation.y = Math.PI;
    scene.add(seamGlow);
    /* a warm wash pooling on the threshold */
    var pool = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 2.2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255, 214, 160, 0.22)', 'rgba(255, 214, 160, 0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.016, doorZ - 1.1);
    scene.add(pool);
    collect('bronze', new THREE.TorusGeometry(1.32, 0.07, 8, 24, Math.PI), 0, 3.6, doorZ - 0.02, 0, Math.PI, 0);
    var sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 1.15),
      new THREE.MeshBasicMaterial({ map: brandTexture(), transparent: true, depthWrite: false })
    );
    sign.position.set(0, 5.35, ROOM.straight + doorR - 0.04);
    sign.rotation.y = Math.PI;
    scene.add(sign);
  })();

  /* light: warm, layered, cheap */
  scene.add(new THREE.AmbientLight(0x9a8ecf, 0.42));
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
  var benchTopMat = new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.55, metalness: 0.1 });
  [[-3.1, 0], [3.1, 0]].forEach(function (bz) {
    var top = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 2.0), benchTopMat);
    top.position.set(bz[0], 0.44, bz[1]);
    scene.add(top);
    [[-0.8], [0.8]].forEach(function (lz) {
      collect('dark', new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), bz[0], 0.21, bz[1] + lz[0]);
    });
    var sh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.7, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(bz[0], 0.012, bz[1]);
    scene.add(sh);
    benches.push({ x: bz[0], z: bz[1], hx: 0.5, hz: 1.2 });
  });

  /* ground mist: three thin veils drifting just above the stone -
     cold, mystic, and low enough to leave the veined floor readable */
  var fogLayers = [];
  (function () {
    function mistTexture() {
      var S = 512;
      var c = ctx2d(S, S);
      c.clearRect(0, 0, S, S);
      for (var i = 0; i < 15; i++) {
        var x = Math.random() * S, y = Math.random() * S, r = 70 + Math.random() * 130;
        var g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(185, 195, 255, ' + (0.05 + Math.random() * 0.06).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(185, 195, 255, 0)');
        c.fillStyle = g;
        c.fillRect(0, 0, S, S);
      }
      var t = asTexture(c.canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    }
    [[0.22, 34, 0.05, 0.0016, 0.0006], [0.42, 28, 0.07, -0.0011, 0.0014], [0.68, 38, 0.04, 0.0008, -0.001]].forEach(function (lyr) {
      var tex = mistTexture();
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(lyr[1], lyr[1] * 0.62),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: lyr[2], depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = lyr[0];
      scene.add(m);
      fogLayers.push({ mesh: m, tex: tex, sx: lyr[3], sy: lyr[4], base: lyr[2] });
    });
  })();

  /* a soft pool of light follows the visitor across the stone */
  var playerHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 2.8),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(140, 120, 255, 0.30)', 'rgba(140, 120, 255, 0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  playerHalo.rotation.x = -Math.PI / 2;
  playerHalo.position.y = 0.014;
  scene.add(playerHalo);

  /* ---------- holograms (saturated - they read in daylight) ---------- */
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

  /* ---------- the atrium star: the ORBO mark itself, floating ----------
     built straight off the site logo - the eight-vertex star with the
     #9d8bff -> #5a46d6 gradient, a bright core, a soft halo - raised to
     three dimensions: two crossed star planes, gradient edge tubes,
     precessing halo rings and an orbiting dust of particles. */
  function makeBrandStar(scale) {
    var g = new THREE.Group();
    var topC = new THREE.Color('#9d8bff'), botC = new THREE.Color('#5a46d6');
    var gradAt = function (y) {
      return topC.clone().lerp(botC, (0.62 - y) / 1.24);
    };

    /* star outline vertices (starShape order, r=0.62) */
    var R0 = 0.62, R1 = 0.124;
    var pts = [
      [0, R0], [R1, R1], [R0, 0], [R1, -R1],
      [0, -R0], [-R1, -R1], [-R0, 0], [-R1, R1]
    ];

    /* merge helper: vertex-colored local-space geometry */
    function mergeColored(parts) {
      var posA = [], colA = [];
      var v = new THREE.Vector3();
      parts.forEach(function (it) {
        var geo = it.geo.index ? it.geo.toNonIndexed() : it.geo;
        var p = geo.attributes.position;
        for (var i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i);
          var cc = it.grad ? gradAt(v.y * (it.gradScale || 1)) : it.color;
          if (it.matrix) v.applyMatrix4(it.matrix);
          posA.push(v.x, v.y, v.z);
          colA.push(cc.r, cc.g, cc.b);
        }
      });
      var geo2 = new THREE.BufferGeometry();
      geo2.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
      geo2.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
      return geo2;
    }

    /* crisp edges: one thin tube per outline segment, on two crossed
       planes, all merged into a single vertex-colored mesh */
    var edgeParts = [];
    var crossRot = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    [null, crossRot].forEach(function (planeM) {
      for (var i = 0; i < 8; i++) {
        var a = pts[i], b = pts[(i + 1) % 8];
        var ax = a[0], ay = a[1], bx = b[0], by = b[1];
        var len = Math.hypot(bx - ax, by - ay);
        var cyl = new THREE.CylinderGeometry(0.013, 0.013, len, 6);
        var mid = new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, 0);
        var dir = new THREE.Vector3(bx - ax, by - ay, 0).normalize();
        var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        var m4 = new THREE.Matrix4().makeRotationFromQuaternion(q);
        m4.setPosition(mid.x, mid.y, mid.z);
        if (planeM) m4.premultiply(planeM);
        edgeParts.push({ geo: cyl, matrix: m4, color: gradAt((ay + by) / 2) });
      }
    });
    var edges = new THREE.Mesh(mergeColored(edgeParts), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
    }));

    /* translucent gradient fill on both planes */
    var fillGeoA = new THREE.ShapeGeometry(starShape(R0));
    var fillMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    var fill = new THREE.Mesh(mergeColored([
      { geo: fillGeoA, grad: true },
      { geo: fillGeoA, grad: true, matrix: crossRot }
    ]), fillMat);

    var core = new THREE.Group();
    core.add(edges);
    core.add(fill);

    /* the bright heart: a small white orb inside sprite glows */
    var orb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.add(orb);
    var coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255, 255, 255, 0.9)', 'rgba(230, 222, 255, 0)'),
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    coreGlow.scale.setScalar(0.62);
    core.add(coreGlow);
    var innerHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(143, 123, 255, 0.5)', 'rgba(143, 123, 255, 0)'),
      transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    innerHalo.scale.setScalar(1.55);
    core.add(innerHalo);
    g.add(core);

    /* wide soft halo, billboarded to the visitor by the hologram tick */
    var aura = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 3.1),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(126, 99, 255, 0.22)', 'rgba(126, 99, 255, 0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    g.add(aura);

    /* halo rings: one calm equator, two slowly precessing tilted rings */
    var ringMat = function (op) {
      return new THREE.MeshBasicMaterial({ color: 0x7e63ff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    };
    var eq = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.007, 5, 48), ringMat(0.5));
    eq.rotation.x = Math.PI / 2;
    g.add(eq);
    var tilts = [];
    [[0.95, -0.45, 0.34], [1.08, 0.6, 0.26]].forEach(function (td) {
      var holder = new THREE.Group();
      var ring = new THREE.Mesh(new THREE.TorusGeometry(td[0], 0.006, 5, 48), ringMat(td[2]));
      ring.rotation.x = Math.PI / 2 + td[1];
      holder.add(ring);
      g.add(holder);
      tilts.push(holder);
    });

    /* orbiting particle dust: a bright ecliptic band + a sparse shell */
    var particles = [];
    [[95, 0.88, 1.18, 0.16, 0xb9a6ff, 0.028], [55, 1.2, 1.5, 0.55, 0x8f74ff, 0.02]].forEach(function (pd) {
      var arr = [];
      for (var i = 0; i < pd[0]; i++) {
        var a = Math.random() * 6.284, rr = pd[1] + Math.random() * (pd[2] - pd[1]);
        arr.push(new THREE.Vector3(Math.cos(a) * rr, (Math.random() - 0.5) * 2 * pd[3], Math.sin(a) * rr));
      }
      var pg = new THREE.BufferGeometry().setFromPoints(arr);
      var pm = new THREE.Points(pg, new THREE.PointsMaterial({ color: pd[4], size: pd[5], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(pm);
      particles.push(pm);
    });

    g.scale.setScalar(scale || 1);
    g.userData = {
      core: core, rings: [], aura: aura, excite: 0,
      spin: 0.12, exciteSpin: 0.8, flickFreq: 1.1, flickAmp: 0.03,
      tilts: tilts, particles: particles, coreGlow: coreGlow, fillMat: fillMat
    };
    return g;
  }

  var holograms = [];

  /* ---------- pedestals: a quiet ring around the star ---------- */
  var coneTex = coneTexture();
  var pedestalDefs = [
    { id: 'cap-web', holo: 'globe', x: -3.3, z: -2.5, label: 'אתרים וחוויות', tag: 'מה אנחנו בונים', accent: '#1F8FD8',
      body: 'אתרים שמרגישים כמו מקום, לא כמו דף. האולם שאתם עומדים בו עכשיו נבנה באותם כלים בדיוק - ורץ בדפדפן, בלי להתקין כלום. הקייס המלא תלוי על הקיר הסמוך: BISOMNA, תחנה 05.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-sys', holo: 'device', x: 3.3, z: -2.5, label: 'אפליקציות ומערכות', tag: 'מה אנחנו בונים', accent: '#0FA88C',
      body: 'מהרעיון ועד מוצר שרץ בענן: אפליקציות, מערכות ניהול וכלים פנימיים שנתפרים בדיוק לצורת העבודה של העסק. ההדגמה על הקיר הסמוך: חדר הבקרה, תחנה 10.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-ai', holo: 'neural', x: -3.3, z: 2.5, label: 'AI ואוטומציה', tag: 'מה אנחנו בונים', accent: '#6C5CFF',
      body: 'תהליכים שקורים מעצמם: מיון פניות, טיוטות מסמכים, חיבורים בין מערכות - עם בקרה אנושית בנקודות שחשוב. ההדגמה על הקיר הסמוך: העוזר שלא ישן, תחנה 03.', link: 'services.html', linkText: 'לעמוד השירותים' },
    { id: 'cap-play', holo: 'game', x: 3.3, z: 2.5, label: 'משחקים וחוויות', tag: 'מה אנחנו בונים', accent: '#E8722E',
      body: 'הדרך הכי טובה להבין מוצר היא לשחק בו: סימולטורים, קונפיגורטורים וחוויות אינטראקטיביות שהופכות סקרנות להחלטה. ההדגמה על הקיר הסמוך: המגרש, תחנה 12.', link: 'services.html', linkText: 'לעמוד השירותים' }
  ];

  var pickables = [];
  var liveArts = [];
  var billboards = [];

  pedestalDefs.forEach(function (def) {
    collect('stone', new THREE.CylinderGeometry(0.5, 0.6, 0.95, 24), def.x, 0.475, def.z);
    collect('bronze', new THREE.TorusGeometry(0.47, 0.02, 8, 40), def.x, 0.96, def.z, Math.PI / 2, 0, 0);
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

  /* the atrium star floats beneath the strip of stars - the brand mark itself */
  var atriumStar = makeBrandStar(2.6);
  atriumStar.position.set(0, 4.5, 0);
  scene.add(atriumStar);
  holograms.push(atriumStar);
  var atriumHit = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  atriumHit.position.copy(atriumStar.position);
  atriumHit.userData.art = {
    title: 'ORBO', tag: 'הסטודיו', _holo: atriumStar, _glow: null, self: true,
    body: 'הסמל של אורבו, פרוש בתלת־ממד וצף מתחת לפס הכוכבים. כל מה שסביבכם - האולם, השמיים, ההולוגרמות והציורים החיים - נבנה כאן, בקוד, בלי אף קובץ מוכן. ככה נראית אצלנו גישה לפרויקט.',
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
  var farLL = curvePos(-1, -66), farRR = curvePos(-1, 66);
  var nearL = curvePos(1, -40), nearR = curvePos(1, 40);
  var nearLL = curvePos(1, -68), nearRR = curvePos(1, 68);

  /* ---------- case displays: rich product-screen compositions ----------
     six deliberate 1024x640 drawings - real-looking screens, not posters.
     registered here and rendered off the critical path via deferredArt. */
  function drawCaseBisomna(c) {
    function rr(x, y, w, h, r) { c.beginPath(); if (c.roundRect) { c.roundRect(x, y, w, h, r); } else { c.rect(x, y, w, h); } }
    var W = 1024, H = 640, i;
    c.textBaseline = 'middle';

    /* ---- night background + low violet glow ---- */
    c.fillStyle = '#14121F'; c.fillRect(0, 0, W, H);
    var glow = c.createRadialGradient(500, 630, 40, 500, 630, 560);
    glow.addColorStop(0, 'rgba(91,76,245,0.28)');
    glow.addColorStop(0.55, 'rgba(91,76,245,0.10)');
    glow.addColorStop(1, 'rgba(91,76,245,0)');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    for (i = 0; i < 46; i++) {
      c.fillStyle = 'rgba(250,250,249,' + (0.03 + Math.random() * 0.08).toFixed(3) + ')';
      c.fillRect(Math.random() * W, Math.random() * H * 0.5, 1.4, 1.4);
    }
    var vg = c.createRadialGradient(512, 320, 220, 512, 320, 720);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,6,14,0.35)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);

    /* ---- browser window ---- */
    var bx = 44, by = 76, bw = 620, bh = 470, cx = bx + bw / 2;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 36; c.shadowOffsetY = 18;
    c.fillStyle = '#FAFAF9'; rr(bx, by, bw, bh, 16); c.fill();
    c.restore();

    c.save(); rr(bx, by, bw, bh, 16); c.clip();
    /* chrome bar */
    c.fillStyle = '#F1EFE8'; c.fillRect(bx, by, bw, 44);
    c.fillStyle = 'rgba(20,18,31,0.08)'; c.fillRect(bx, by + 44, bw, 1);
    var dots = ['#FF5F57', '#FEBC2E', '#28C840'];
    for (i = 0; i < 3; i++) { c.fillStyle = dots[i]; c.beginPath(); c.arc(bx + 24 + i * 18, by + 22, 5, 0, Math.PI * 2); c.fill(); }
    var uw = 220, ux = bx + (bw - uw) / 2;
    c.fillStyle = '#FBFAF6'; rr(ux, by + 10, uw, 24, 12); c.fill();
    c.strokeStyle = 'rgba(20,18,31,0.10)'; c.lineWidth = 1; rr(ux + 0.5, by + 10.5, uw - 1, 23, 12); c.stroke();
    c.direction = 'ltr'; c.textAlign = 'center';
    c.fillStyle = '#5A5668'; c.font = '500 13px ' + FONT;
    c.fillText('bisomna.com', cx, by + 23);

    /* hero */
    c.direction = 'rtl'; c.textAlign = 'center';
    c.fillStyle = '#14121F'; c.font = '700 36px ' + FONT;
    c.fillText('ישנים טוב. חיים טוב.', cx, by + 96);
    c.fillStyle = '#5A5668'; c.font = '400 15px ' + FONT;
    c.fillText('מזרן מודולרי בארבע שכבות, שנבנה סביב איך שאתם ישנים', cx, by + 130);

    /* product-layers motif */
    var lx = bx + 120, lw = 290, lh = 30, gap = 16, ly0 = by + 168;
    var layers = [
      ['#F2EFE7', 'שכבת נוחות עליונה', '#5A5668'],
      ['#1F8FD8', 'שכבת ג\'ל מצננת', '#1F8FD8'],
      ['#9D8CFF', 'קצף זיכרון אדפטיבי', '#6C5CFF'],
      ['#E7E3D7', 'בסיס תמיכה גבוה', '#5A5668']
    ];
    for (i = 0; i < 4; i++) {
      var ly = ly0 + i * (lh + gap), lyMid = ly + lh / 2;
      c.save(); c.shadowColor = 'rgba(20,18,31,0.18)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
      c.fillStyle = layers[i][0]; rr(lx, ly, lw, lh, 10); c.fill();
      c.restore();
      var lg = c.createLinearGradient(0, ly, 0, ly + lh);
      lg.addColorStop(0, 'rgba(255,255,255,0.35)'); lg.addColorStop(0.4, 'rgba(255,255,255,0)');
      c.fillStyle = lg; rr(lx, ly, lw, lh, 10); c.fill();
      c.strokeStyle = 'rgba(20,18,31,0.12)'; rr(lx + 0.5, ly + 0.5, lw - 1, lh - 1, 10); c.stroke();
      c.strokeStyle = 'rgba(90,86,104,0.45)'; c.beginPath();
      c.moveTo(lx + lw + 6, lyMid); c.lineTo(lx + lw + 44, lyMid); c.stroke();
      c.fillStyle = '#5A5668'; c.beginPath(); c.arc(lx + lw + 6, lyMid, 2, 0, Math.PI * 2); c.fill();
      c.direction = 'rtl'; c.textAlign = 'left';
      c.fillStyle = layers[i][2]; c.font = '500 12px ' + FONT;
      c.fillText(layers[i][1], lx + lw + 50, lyMid);
    }

    /* scroll hint + next-section peek */
    c.strokeStyle = 'rgba(90,86,104,0.6)'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx - 7, by + 356); c.lineTo(cx, by + 363); c.lineTo(cx + 7, by + 356); c.stroke();
    c.lineWidth = 1; c.lineCap = 'butt';
    c.fillStyle = '#191527'; c.fillRect(bx, by + bh - 56, bw, 56);
    c.direction = 'rtl'; c.textAlign = 'center';
    c.fillStyle = '#FAFAF9'; c.font = '600 15px ' + FONT;
    c.fillText('הטכנולוגיה שמאחורי השינה', cx, by + bh - 34);
    c.fillStyle = 'rgba(157,140,255,0.5)'; rr(cx - 22, by + bh - 18, 44, 3, 1.5); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(185,166,255,0.16)'; c.lineWidth = 1; rr(bx + 0.5, by + 0.5, bw - 1, bh - 1, 16); c.stroke();

    /* ---- phone mockup ---- */
    var px = 730, py = 130, pw = 184, ph = 386, pcx = px + pw / 2;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 32; c.shadowOffsetY = 16;
    c.fillStyle = '#0d0b18'; rr(px, py, pw, ph, 28); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(185,166,255,0.22)'; rr(px + 0.5, py + 0.5, pw - 1, ph - 1, 28); c.stroke();
    var sx = px + 9, sy = py + 9, sw = pw - 18, sh = ph - 18;
    c.save(); c.fillStyle = '#FAFAF9'; rr(sx, sy, sw, sh, 20); c.fill(); rr(sx, sy, sw, sh, 20); c.clip();
    c.fillStyle = '#0d0b18'; rr(pcx - 26, sy + 6, 52, 12, 6); c.fill();
    c.direction = 'rtl'; c.textAlign = 'center';
    c.fillStyle = '#14121F'; c.font = '700 19px ' + FONT;
    c.fillText('ישנים טוב.', pcx, sy + 52);
    c.fillText('חיים טוב.', pcx, sy + 76);
    c.fillStyle = '#5A5668'; c.font = '400 10px ' + FONT;
    c.fillText('מזרן מודולרי בארבע שכבות', pcx, sy + 98);
    var mw = 108, mx = pcx - mw / 2, mh = 15, mg = 8, my0 = sy + 118;
    for (i = 0; i < 4; i++) {
      var myy = my0 + i * (mh + mg);
      c.fillStyle = layers[i][0]; rr(mx, myy, mw, mh, 6); c.fill();
      c.strokeStyle = 'rgba(20,18,31,0.12)'; rr(mx + 0.5, myy + 0.5, mw - 1, mh - 1, 6); c.stroke();
    }
    var cy0 = my0 + 4 * (mh + mg) + 12;
    c.fillStyle = '#5B4CF5'; rr(pcx - 46, cy0, 92, 28, 14); c.fill();
    c.fillStyle = '#FAFAF9'; c.font = '600 12px ' + FONT;
    c.fillText('לחנות', pcx, cy0 + 15);
    c.fillStyle = '#191527'; c.fillRect(sx, sy + sh - 40, sw, 40);
    c.fillStyle = 'rgba(250,250,249,0.85)'; c.font = '600 10px ' + FONT;
    c.fillText('הטכנולוגיה שמאחורי השינה', pcx, sy + sh - 20);
    c.restore();

    /* ---- dotted connectors ---- */
    c.setLineDash([2, 6]); c.strokeStyle = 'rgba(31,143,216,0.5)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(786, 72); c.lineTo(668, 108); c.stroke();
    c.beginPath(); c.moveTo(150, 580); c.lineTo(150, 548); c.stroke();
    c.beginPath(); c.moveTo(822, 562); c.lineTo(822, 518); c.stroke();
    c.setLineDash([]);

    /* ---- feature chips ---- */
    function chip(x, y, label) {
      c.direction = 'rtl'; c.font = '600 14px ' + FONT;
      var w = c.measureText(label).width + 38;
      c.save(); c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 14; c.shadowOffsetY = 6;
      c.fillStyle = 'rgba(34,28,56,0.94)'; rr(x - w / 2, y - 17, w, 34, 17); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(31,143,216,0.6)'; c.lineWidth = 1; rr(x - w / 2 + 0.5, y - 16.5, w - 1, 33, 17); c.stroke();
      c.fillStyle = '#1F8FD8'; c.beginPath(); c.arc(x + w / 2 - 15, y, 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#FAFAF9'; c.textAlign = 'center'; c.fillText(label, x - 5, y + 1);
    }
    chip(812, 58, 'וידאו מונע גלילה');
    chip(150, 598, '16 עמודים');
    chip(822, 580, 'חנות מובנית');
  }

  function drawCaseOrbo(c) {
    function rr(x, y, w, h, r) { c.beginPath(); if (c.roundRect) { c.roundRect(x, y, w, h, r); } else { c.rect(x, y, w, h); } }
    var seed = 42;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var i, y;

    /* --- night backdrop, fully painted --- */
    var bg = c.createLinearGradient(0, 0, 0, 640);
    bg.addColorStop(0, '#191527'); bg.addColorStop(0.55, '#14121F'); bg.addColorStop(1, '#100d1c');
    c.fillStyle = bg; c.fillRect(0, 0, 1024, 640);
    var halo = c.createRadialGradient(512, 310, 40, 512, 310, 540);
    halo.addColorStop(0, 'rgba(91,76,245,0.10)'); halo.addColorStop(1, 'rgba(91,76,245,0)');
    c.fillStyle = halo; c.fillRect(0, 0, 1024, 640);
    for (i = 0; i < 70; i++) {
      c.fillStyle = 'rgba(185,166,255,' + (0.03 + rnd() * 0.07).toFixed(3) + ')';
      c.fillRect(rnd() * 1024, rnd() * 640, 1.4, 1.4);
    }

    /* --- browser window shell with violet halo --- */
    var wx = 112, wy = 70, ww = 800, wh = 500, bar = 44;
    c.save();
    c.shadowColor = 'rgba(108,92,255,0.5)'; c.shadowBlur = 44;
    c.fillStyle = '#0d0b16'; rr(wx, wy, ww, wh, 16); c.fill();
    c.restore();

    /* --- viewport scene, clipped to the window --- */
    c.save(); rr(wx, wy, ww, wh, 16); c.clip();
    var vy = wy + bar, vh = wh - bar;
    var sky = c.createLinearGradient(0, vy, 0, vy + vh);
    sky.addColorStop(0, '#14121F'); sky.addColorStop(1, '#0f0c1a');
    c.fillStyle = sky; c.fillRect(wx, vy, ww, vh);

    var cx = 592, cy = 360;
    var amb = c.createRadialGradient(cx, cy, 20, cx, cy, 300);
    amb.addColorStop(0, 'rgba(91,76,245,0.16)'); amb.addColorStop(1, 'rgba(91,76,245,0)');
    c.fillStyle = amb; c.fillRect(wx, vy, ww, vh);

    for (i = 0; i < 90; i++) {
      c.fillStyle = 'rgba(185,166,255,' + (0.04 + rnd() * 0.08).toFixed(3) + ')';
      c.fillRect(wx + rnd() * ww, vy + rnd() * vh, 1.2, 1.2);
    }

    /* three logarithmic spiral arms of particles */
    var arm, th, r0, px, py, jx, jy, a0, p, col, al, sz, th2, r2, qx, qy;
    for (arm = 0; arm < 3; arm++) {
      a0 = arm * 2.094 + 0.5;
      for (i = 0; i < 110; i++) {
        th = 0.6 + i * 0.115;
        r0 = 6 * Math.exp(0.31 * th);
        jx = (rnd() - 0.5) * (5 + r0 * 0.18);
        jy = (rnd() - 0.5) * (4 + r0 * 0.11);
        px = cx + Math.cos(th + a0) * r0 + jx;
        py = cy + Math.sin(th + a0) * r0 * 0.56 + jy;
        p = rnd();
        col = p < 0.42 ? '#9D8CFF' : (p < 0.72 ? '#b9a6ff' : (p < 0.92 ? '#FAFAF9' : '#FFB080'));
        al = Math.max(0.14, 0.85 - r0 * 0.0019) * (0.55 + rnd() * 0.45);
        sz = r0 < 70 ? 1 + rnd() * 2 : 0.8 + rnd() * 1.7;
        if (r0 > 70 && rnd() < 0.24) {
          th2 = th - 0.32; r2 = 6 * Math.exp(0.31 * th2);
          qx = cx + Math.cos(th2 + a0) * r2 + jx * 0.85;
          qy = cy + Math.sin(th2 + a0) * r2 * 0.56 + jy * 0.85;
          c.globalAlpha = al * 0.3; c.strokeStyle = col; c.lineWidth = 1;
          c.beginPath(); c.moveTo(qx, qy); c.lineTo(px, py); c.stroke();
        }
        c.globalAlpha = al; c.fillStyle = col;
        c.beginPath(); c.arc(px, py, sz, 0, 6.2832); c.fill();
      }
    }
    c.globalAlpha = 1;

    /* bright galactic core */
    var core = c.createRadialGradient(cx, cy, 0, cx, cy, 92);
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(0.1, 'rgba(251,250,246,0.7)');
    core.addColorStop(0.3, 'rgba(185,166,255,0.32)');
    core.addColorStop(1, 'rgba(108,92,255,0)');
    c.fillStyle = core; c.beginPath(); c.arc(cx, cy, 92, 0, 6.2832); c.fill();

    /* headline over the galaxy */
    c.direction = 'rtl'; c.textAlign = 'right';
    c.shadowColor = 'rgba(13,11,22,0.85)'; c.shadowBlur = 16;
    c.fillStyle = '#FAFAF9'; c.font = '800 46px ' + FONT;
    c.fillText('רעיונות יש לכולם.', 866, 214);
    c.fillStyle = '#b9a6ff'; c.font = '400 23px ' + FONT;
    c.fillText('אנחנו הופכים אותם למציאות.', 866, 256);
    c.shadowBlur = 0; c.shadowColor = 'rgba(0,0,0,0)';

    /* scroll-progress rail, chapter 2 lit */
    c.strokeStyle = 'rgba(250,250,249,0.10)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(140.5, 150); c.lineTo(140.5, 530); c.stroke();
    for (i = 0; i < 5; i++) {
      y = 160 + i * 88;
      if (i === 1) {
        c.shadowColor = '#6C5CFF'; c.shadowBlur = 10;
        c.fillStyle = '#6C5CFF';
        c.beginPath(); c.arc(140.5, y, 4, 0, 6.2832); c.fill();
        c.shadowBlur = 0; c.shadowColor = 'rgba(0,0,0,0)';
        c.strokeStyle = 'rgba(108,92,255,0.45)';
        c.beginPath(); c.arc(140.5, y, 7.5, 0, 6.2832); c.stroke();
        c.textAlign = 'left'; c.fillStyle = '#b9a6ff'; c.font = '600 12px ' + FONT;
        c.fillText('העולם נבנה', 156, y + 4);
      } else {
        c.fillStyle = 'rgba(250,250,249,0.22)';
        c.beginPath(); c.arc(140.5, y, 2.5, 0, 6.2832); c.fill();
      }
    }

    /* floating glass chips with dotted leaders into the swirl */
    function chip(tx, ty, txt, lx, ly, dot) {
      c.font = '600 16px ' + FONT;
      var tw = c.measureText(txt).width, cw2 = tw + 34;
      c.strokeStyle = 'rgba(157,140,255,0.5)'; c.lineWidth = 1; c.setLineDash([2, 5]);
      c.beginPath(); c.moveTo(tx + cw2 / 2, ty + 19); c.lineTo(lx, ly); c.stroke();
      c.setLineDash([]);
      c.fillStyle = dot; c.beginPath(); c.arc(lx, ly, 2.6, 0, 6.2832); c.fill();
      c.fillStyle = 'rgba(27,23,48,0.9)'; rr(tx, ty, cw2, 38, 10); c.fill();
      c.strokeStyle = 'rgba(108,92,255,0.55)'; rr(tx + 0.5, ty + 0.5, cw2 - 1, 37, 10); c.stroke();
      c.fillStyle = '#FAFAF9'; c.textAlign = 'center';
      c.fillText(txt, tx + cw2 / 2, ty + 24.5);
    }
    chip(176, 158, 'עולם חלקיקים חי', 470, 316, '#FFB080');
    chip(688, 486, 'אפס קובצי גרפיקה', 636, 424, '#b9a6ff');
    c.restore();

    /* chrome bar: sheen, hairline, traffic dots, url pill */
    c.save(); rr(wx, wy, ww, wh, 16); c.clip();
    var sheen = c.createLinearGradient(0, wy, 0, wy + bar);
    sheen.addColorStop(0, 'rgba(250,250,249,0.05)'); sheen.addColorStop(1, 'rgba(250,250,249,0)');
    c.fillStyle = sheen; c.fillRect(wx, wy, ww, bar);
    c.strokeStyle = 'rgba(157,140,255,0.16)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(wx, wy + bar - 0.5); c.lineTo(wx + ww, wy + bar - 0.5); c.stroke();
    var dots = ['#e0655e', '#e0a94f', '#5fb86a'];
    for (i = 0; i < 3; i++) {
      c.fillStyle = dots[i];
      c.beginPath(); c.arc(142 + i * 22, wy + 22, 5.5, 0, 6.2832); c.fill();
    }
    c.fillStyle = '#1b1730'; rr(392, wy + 9, 240, 26, 13); c.fill();
    c.strokeStyle = 'rgba(108,92,255,0.4)'; rr(392.5, wy + 9.5, 239, 25, 13); c.stroke();
    c.strokeStyle = '#9D8CFF'; c.lineWidth = 1.4;
    c.beginPath(); c.arc(410, wy + 20.5, 3.2, Math.PI, 0); c.stroke();
    c.fillStyle = '#9D8CFF'; rr(405.6, wy + 20.5, 8.8, 6.4, 1.5); c.fill();
    c.direction = 'ltr'; c.textAlign = 'center';
    c.font = '600 13px ' + FONT; c.fillStyle = '#9D8CFF';
    c.fillText('orbosolutions.com', 519, wy + 26.5);
    c.restore();

    /* window hairline border over the glow */
    c.strokeStyle = 'rgba(157,140,255,0.35)'; c.lineWidth = 1;
    rr(wx + 0.5, wy + 0.5, ww - 1, wh - 1, 16); c.stroke();

    /* gentle gallery vignette */
    var vig = c.createRadialGradient(512, 320, 260, 512, 320, 620);
    vig.addColorStop(0, 'rgba(9,7,16,0)'); vig.addColorStop(1, 'rgba(9,7,16,0.32)');
    c.fillStyle = vig; c.fillRect(0, 0, 1024, 640);
    c.direction = 'ltr'; c.globalAlpha = 1;
  }

  function drawCaseCrm(c) {
    function rr(x, y, w, h, r) { c.beginPath(); if (c.roundRect) { c.roundRect(x, y, w, h, r); } else { c.rect(x, y, w, h); } }
    function tx(t, x, y, f, col, al, dir) { c.font = f; c.fillStyle = col; c.textAlign = al; c.direction = dir; c.fillText(t, x, y); }
    var TEAL = '#0FA88C', TEALL = '#35C9A8', VIO = '#6C5CFF', VIOL = '#9D8CFF', WARM = '#FFB080';
    var INK = '#FAFAF9', MUT = '#8F88AD', DIM = '#6F6890', LINE = '#2a2344', CARD = '#1b1730';
    var i, k, g, x, y, cy, a;
    c.textBaseline = 'middle'; c.lineWidth = 1;
    // ---- canvas backdrop + app frame ----
    g = c.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, '#171427'); g.addColorStop(1, '#100d1c');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 640);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 34; c.shadowOffsetY = 10;
    c.fillStyle = '#131020'; rr(14, 14, 996, 612, 14); c.fill(); c.restore();
    g = c.createLinearGradient(0, 14, 0, 150); g.addColorStop(0, 'rgba(157,140,255,0.05)'); g.addColorStop(1, 'rgba(157,140,255,0)');
    c.fillStyle = g; rr(15, 15, 994, 130, 14); c.fill();
    c.strokeStyle = LINE; rr(14.5, 14.5, 995, 611, 14); c.stroke();
    c.beginPath(); c.moveTo(15, 66); c.lineTo(1009, 66); c.moveTo(920, 66); c.lineTo(920, 625); c.stroke();
    // ---- top bar: logo + name (right), search (center), avatar (left) ----
    c.save(); c.shadowColor = 'rgba(108,92,255,0.55)'; c.shadowBlur = 10;
    g = c.createRadialGradient(980, 37, 1, 983, 40, 10); g.addColorStop(0, VIOL); g.addColorStop(1, '#5B4CF5');
    c.fillStyle = g; c.beginPath(); c.arc(983, 40, 8, 0, 6.2832); c.fill(); c.restore();
    tx('מרכז', 966, 41, '700 17px ' + FONT, INK, 'right', 'rtl');
    c.fillStyle = CARD; rr(377, 25, 270, 30, 15); c.fill();
    c.strokeStyle = LINE; rr(377.5, 25.5, 269, 29, 15); c.stroke();
    c.strokeStyle = DIM; c.lineWidth = 1.5; c.beginPath(); c.arc(629, 38, 4.5, 0, 6.2832); c.moveTo(625.8, 41.6); c.lineTo(621.5, 46); c.stroke(); c.lineWidth = 1;
    tx('חיפוש לקוח…', 612, 41, '400 12.5px ' + FONT, DIM, 'right', 'rtl');
    c.fillStyle = '#221c38'; rr(386, 31, 42, 18, 5); c.fill();
    tx('Ctrl+K', 407, 41, '600 10px ' + FONT, MUT, 'center', 'ltr');
    g = c.createLinearGradient(33, 27, 59, 53); g.addColorStop(0, VIOL); g.addColorStop(1, '#5B4CF5');
    c.fillStyle = g; c.beginPath(); c.arc(46, 40, 13, 0, 6.2832); c.fill();
    tx('ד', 46, 41, '700 12px ' + FONT, INK, 'center', 'rtl');
    c.fillStyle = TEALL; c.beginPath(); c.arc(56, 31, 4.5, 0, 6.2832); c.fill();
    c.strokeStyle = '#131020'; c.lineWidth = 2; c.beginPath(); c.arc(56, 31, 4.5, 0, 6.2832); c.stroke(); c.lineWidth = 1;
    // ---- right sidebar: 5 nav squares, first active ----
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (i = 0; i < 5; i++) {
      var sy = 90 + i * 58, cx = 965; cy = sy + 22;
      if (i === 0) {
        c.save(); c.shadowColor = 'rgba(15,168,140,0.4)'; c.shadowBlur = 14;
        c.fillStyle = '#221c38'; rr(943, sy, 44, 44, 10); c.fill(); c.restore();
        c.fillStyle = TEAL; rr(941.5, sy + 13, 3, 18, 1.5); c.fill();
      }
      c.strokeStyle = i === 0 ? '#EAE6F7' : DIM; c.lineWidth = 1.6; c.beginPath();
      if (i === 0) { c.moveTo(cx - 8, cy + 1); c.lineTo(cx, cy - 7); c.lineTo(cx + 8, cy + 1); c.moveTo(cx - 5, cy - 1); c.lineTo(cx - 5, cy + 7); c.lineTo(cx + 5, cy + 7); c.lineTo(cx + 5, cy - 1); }
      else if (i === 1) { c.moveTo(cx + 0.4, cy - 4); c.arc(cx - 3, cy - 4, 3.4, 0, 6.2832); c.moveTo(cx - 9, cy + 8); c.quadraticCurveTo(cx - 3, cy + 0.5, cx + 3, cy + 8); c.moveTo(cx + 7.6, cy - 6); c.arc(cx + 5, cy - 6, 2.6, 0, 6.2832); c.moveTo(cx + 4.5, cy + 8); c.quadraticCurveTo(cx + 7, cy + 2.5, cx + 9.5, cy + 8); }
      else if (i === 2) { c.moveTo(cx - 9, cy - 7); c.lineTo(cx - 9, cy + 8); c.lineTo(cx + 9, cy + 8); c.moveTo(cx - 6, cy + 4); c.lineTo(cx - 1, cy - 2); c.lineTo(cx + 3, cy + 1); c.lineTo(cx + 8, cy - 6); }
      else if (i === 3) { c.rect(cx - 6, cy - 8, 12, 16); c.moveTo(cx - 3, cy - 3); c.lineTo(cx + 3, cy - 3); c.moveTo(cx - 3, cy + 1); c.lineTo(cx + 3, cy + 1); c.moveTo(cx - 3, cy + 5); c.lineTo(cx + 1, cy + 5); }
      else { c.moveTo(cx + 5.5, cy); c.arc(cx, cy, 5.5, 0, 6.2832); c.moveTo(cx + 2, cy); c.arc(cx, cy, 2, 0, 6.2832); for (k = 0; k < 8; k++) { a = k * 0.7854; c.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); c.lineTo(cx + Math.cos(a) * 9.2, cy + Math.sin(a) * 9.2); } }
      c.stroke();
    }
    c.lineWidth = 1;
    // ---- KPI row (rtl order: first card on the right) ----
    var kpi = [['פניות החודש', '248', '+12%', 1], ['מחזור חודשי', '₪ 96,400', '+8%', 1], ['לקוחות פעילים', '57', null, 0], ['זמן מענה ממוצע', '1:42', '-6%', -1]];
    for (i = 0; i < 4; i++) {
      x = 30 + (3 - i) * 222;
      c.fillStyle = CARD; rr(x, 82, 208, 92, 12); c.fill();
      c.strokeStyle = LINE; rr(x + 0.5, 82.5, 207, 91, 12); c.stroke();
      tx(kpi[i][0], x + 192, 108, '500 12px ' + FONT, MUT, 'right', 'rtl');
      tx(kpi[i][1], x + 192, 140, '800 27px ' + FONT, INK, 'right', 'ltr');
      if (kpi[i][2]) {
        c.fillStyle = kpi[i][3] > 0 ? TEALL : '#F0705F'; c.beginPath();
        if (kpi[i][3] > 0) { c.moveTo(x + 14, 144); c.lineTo(x + 23, 144); c.lineTo(x + 18.5, 137); }
        else { c.moveTo(x + 14, 138); c.lineTo(x + 23, 138); c.lineTo(x + 18.5, 145); }
        c.closePath(); c.fill();
        tx(kpi[i][2], x + 28, 141, '700 12px ' + FONT, kpi[i][3] > 0 ? TEALL : '#F0705F', 'left', 'ltr');
      }
    }
    // ---- line chart card ----
    c.fillStyle = CARD; rr(344, 188, 560, 200, 12); c.fill();
    c.strokeStyle = LINE; rr(344.5, 188.5, 559, 199, 12); c.stroke();
    tx('מגמת הכנסות', 888, 215, '700 14px ' + FONT, INK, 'right', 'rtl');
    c.fillStyle = TEALL; c.beginPath(); c.arc(470, 214, 3.5, 0, 6.2832); c.fill();
    tx('השנה', 462, 215, '500 11px ' + FONT, MUT, 'right', 'rtl');
    c.fillStyle = VIOL; c.beginPath(); c.arc(404, 214, 3.5, 0, 6.2832); c.fill();
    tx('אשתקד', 396, 215, '500 11px ' + FONT, MUT, 'right', 'rtl');
    var gy = ['96K', '72K', '48K', '24K', '0'];
    c.strokeStyle = 'rgba(42,35,68,0.7)';
    for (k = 0; k < 5; k++) { y = 232 + k * 30; c.beginPath(); c.moveTo(396, y); c.lineTo(884, y); c.stroke(); tx(gy[k], 386, y, '400 9.5px ' + FONT, DIM, 'right', 'ltr'); }
    var vx = [], vt = [40, 56, 48, 64, 72, 86], vv = [28, 36, 32, 44, 50, 58];
    var mon = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני'];
    for (i = 0; i < 6; i++) { vx.push(880 - i * 96.8); tx(mon[i], vx[i], 371, '400 10.5px ' + FONT, DIM, 'center', 'rtl'); }
    c.beginPath();
    for (i = 0; i < 6; i++) { y = 352 - vt[i] * 1.2; if (i) { c.lineTo(vx[i], y); } else { c.moveTo(vx[i], y); } }
    c.lineTo(vx[5], 352); c.lineTo(vx[0], 352); c.closePath();
    g = c.createLinearGradient(0, 240, 0, 352); g.addColorStop(0, 'rgba(15,168,140,0.24)'); g.addColorStop(1, 'rgba(15,168,140,0)');
    c.fillStyle = g; c.fill();
    c.beginPath();
    for (i = 0; i < 6; i++) { y = 352 - vt[i] * 1.2; if (i) { c.lineTo(vx[i], y); } else { c.moveTo(vx[i], y); } }
    c.strokeStyle = TEALL; c.lineWidth = 2.2; c.stroke();
    c.setLineDash([5, 4]); c.beginPath();
    for (i = 0; i < 6; i++) { y = 352 - vv[i] * 1.2; if (i) { c.lineTo(vx[i], y); } else { c.moveTo(vx[i], y); } }
    c.strokeStyle = 'rgba(157,140,255,0.75)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); c.lineWidth = 1;
    c.save(); c.shadowColor = TEALL; c.shadowBlur = 10; c.fillStyle = TEALL; c.beginPath(); c.arc(vx[5], 352 - 86 * 1.2, 4, 0, 6.2832); c.fill(); c.restore();
    c.fillStyle = '#131020'; c.beginPath(); c.arc(vx[5], 352 - 86 * 1.2, 1.7, 0, 6.2832); c.fill();
    // ---- donut card ----
    c.fillStyle = CARD; rr(30, 188, 300, 200, 12); c.fill();
    c.strokeStyle = LINE; rr(30.5, 188.5, 299, 199, 12); c.stroke();
    tx('מקורות לידים', 314, 215, '700 14px ' + FONT, INK, 'right', 'rtl');
    var segs = [[0.45, TEAL], [0.35, VIO], [0.2, WARM]], a0 = -1.5708;
    c.lineWidth = 17;
    for (i = 0; i < 3; i++) { var a1 = a0 + segs[i][0] * 6.2832; c.beginPath(); c.arc(108, 298, 48, a0 + 0.05, a1 - 0.05); c.strokeStyle = segs[i][1]; c.stroke(); a0 = a1; }
    c.lineWidth = 1;
    tx('312', 108, 292, '800 26px ' + FONT, INK, 'center', 'ltr');
    tx('סה״כ לידים', 108, 313, '400 10px ' + FONT, MUT, 'center', 'rtl');
    var leg = [['קמפיינים', '45%', TEAL], ['אתר', '35%', VIO], ['הפניות', '20%', WARM]];
    for (i = 0; i < 3; i++) {
      y = 252 + i * 32;
      c.fillStyle = leg[i][2]; c.beginPath(); c.arc(306, y, 4, 0, 6.2832); c.fill();
      tx(leg[i][0], 296, y + 1, '500 11.5px ' + FONT, '#CFCADF', 'right', 'rtl');
      tx(leg[i][1], 196, y + 1, '700 11.5px ' + FONT, MUT, 'left', 'ltr');
    }
    // ---- table card ----
    c.fillStyle = CARD; rr(30, 402, 874, 208, 12); c.fill();
    c.strokeStyle = LINE; rr(30.5, 402.5, 873, 207, 12); c.stroke();
    tx('לקוחות אחרונים', 886, 429, '700 14px ' + FONT, INK, 'right', 'rtl');
    tx('הצג הכל', 48, 429, '500 12px ' + FONT, VIOL, 'left', 'rtl');
    tx('לקוח', 886, 455, '500 11px ' + FONT, DIM, 'right', 'rtl');
    tx('סטטוס', 660, 455, '500 11px ' + FONT, DIM, 'center', 'rtl');
    tx('סכום', 560, 455, '500 11px ' + FONT, DIM, 'right', 'rtl');
    tx('התקדמות', 46, 455, '500 11px ' + FONT, DIM, 'left', 'rtl');
    c.strokeStyle = LINE; c.beginPath(); c.moveTo(46, 466); c.lineTo(888, 466); c.stroke();
    var tealFg = '#3AD0AF', tealBg = 'rgba(15,168,140,0.15)', vioFg = '#B9A6FF', vioBg = 'rgba(108,92,255,0.16)', wFg = '#FFB080', wBg = 'rgba(255,176,128,0.14)';
    var rows = [
      ['נגריית העמק', 'פעיל', tealFg, tealBg, '₪ 24,800', 0.78, '78%'],
      ['סטודיו אלה', 'בטיפול', vioFg, vioBg, '₪ 12,300', 0.45, '45%'],
      ['מוסך הצפון', 'ממתין', wFg, wBg, '₪ 8,150', 0.22, '22%'],
      ['קפה דיזל', 'פעיל', tealFg, tealBg, '₪ 31,900', 0.88, '88%']
    ];
    for (i = 0; i < 4; i++) {
      cy = 486 + i * 35;
      if (i) { c.strokeStyle = 'rgba(42,35,68,0.55)'; c.beginPath(); c.moveTo(46, cy - 17.5); c.lineTo(888, cy - 17.5); c.stroke(); }
      c.fillStyle = rows[i][3]; rr(862, cy - 12, 24, 24, 7); c.fill();
      tx(rows[i][0].charAt(0), 874, cy + 1, '700 12px ' + FONT, rows[i][2], 'center', 'rtl');
      tx(rows[i][0], 852, cy + 1, '600 13px ' + FONT, '#E9E6F5', 'right', 'rtl');
      c.fillStyle = rows[i][3]; rr(629, cy - 10, 62, 20, 10); c.fill();
      tx(rows[i][1], 660, cy + 1, '600 11px ' + FONT, rows[i][2], 'center', 'rtl');
      tx(rows[i][4], 560, cy + 1, '500 12.5px ' + FONT, '#CFCADF', 'right', 'ltr');
      c.fillStyle = '#262040'; rr(100, cy - 2, 156, 4, 2); c.fill();
      c.fillStyle = rows[i][2]; rr(256 - 156 * rows[i][5], cy - 2, 156 * rows[i][5], 4, 2); c.fill();
      tx(rows[i][6], 46, cy + 1, '500 10.5px ' + FONT, DIM, 'left', 'ltr');
    }
    c.textBaseline = 'alphabetic'; c.direction = 'ltr'; c.textAlign = 'left';
  }

  function drawCaseAi(c) {
    function rr(x, y, w, h, r) { c.beginPath(); if (c.roundRect) { c.roundRect(x, y, w, h, r); } else { c.rect(x, y, w, h); } }
    var W = 1024, H = 640, i, j, x, y;
    c.textBaseline = 'alphabetic';
    // ---- deep night background ----
    var bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#14121F'); bg.addColorStop(0.55, '#100d1c'); bg.addColorStop(1, '#0d0a17');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    // faint dotted grid
    c.fillStyle = '#9D8CFF';
    for (x = 22; x < W; x += 26) { for (y = 22; y < H; y += 26) { c.globalAlpha = 0.025 + Math.random() * 0.035; c.fillRect(x, y, 1.5, 1.5); } }
    c.globalAlpha = 1;
    // ambient violet bloom behind the pipeline + soft vignette
    var amb = c.createRadialGradient(512, 320, 40, 512, 320, 470);
    amb.addColorStop(0, 'rgba(108,92,255,0.10)'); amb.addColorStop(1, 'rgba(108,92,255,0)');
    c.fillStyle = amb; c.fillRect(0, 30, W, 580);
    var vg = c.createRadialGradient(512, 320, 280, 512, 320, 720);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.30)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    // ---- moon badge, top-left ----
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 16; c.shadowOffsetY = 4;
    c.fillStyle = '#1b1730'; rr(40, 34, 100, 40, 20); c.fill();
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.strokeStyle = 'rgba(157,140,255,0.22)'; c.lineWidth = 1; rr(40.5, 34.5, 99, 39, 19.5); c.stroke();
    c.shadowColor = 'rgba(255,176,128,0.55)'; c.shadowBlur = 10;
    c.fillStyle = '#FFB080'; c.beginPath(); c.arc(64, 54, 8.5, 0, Math.PI * 2); c.fill();
    c.shadowColor = 'transparent'; c.shadowBlur = 0;
    c.fillStyle = '#1b1730'; c.beginPath(); c.arc(67.5, 50.8, 7.6, 0, Math.PI * 2); c.fill();
    c.direction = 'ltr'; c.textAlign = 'left'; c.font = '700 15px ' + FONT;
    c.fillStyle = '#FAFAF9'; c.fillText('03:12', 82, 59);
    // ---- header title, top-right + hairline ----
    c.direction = 'rtl'; c.textAlign = 'right'; c.font = '700 20px ' + FONT;
    c.fillStyle = '#FAFAF9'; c.fillText('טיפול אוטומטי בפניות', 984, 60);
    c.strokeStyle = 'rgba(157,140,255,0.14)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(40, 94.5); c.lineTo(984, 94.5); c.stroke();
    // ---- four stage cards, flowing right-to-left ----
    var xs = [779, 541, 303, 65], CW = 180, CY = 200, CH = 240;
    var titles = ['פנייה נכנסת', 'מיון חכם', 'טיוטת מענה', 'אישור אנושי'];
    var subs = ['מייל, טופס או וואטסאפ', '', 'נוסחה תוך 38 שניות', 'ההחלטה תמיד אצלכם'];
    for (i = 0; i < 4; i++) {
      x = xs[i]; var cx = x + CW / 2;
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 22; c.shadowOffsetY = 8;
      var cg = c.createLinearGradient(0, CY, 0, CY + CH);
      cg.addColorStop(0, '#221c38'); cg.addColorStop(1, '#1b1730');
      c.fillStyle = cg; rr(x, CY, CW, CH, 14); c.fill();
      c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
      c.strokeStyle = 'rgba(157,140,255,0.20)'; c.lineWidth = 1; rr(x + 0.5, CY + 0.5, CW - 1, CH - 1, 13.5); c.stroke();
      c.strokeStyle = 'rgba(250,250,249,0.06)'; c.beginPath(); c.moveTo(x + 14, CY + 1.5); c.lineTo(x + CW - 14, CY + 1.5); c.stroke();
      // icon disc
      c.fillStyle = 'rgba(108,92,255,0.12)'; c.beginPath(); c.arc(cx, 262, 28, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(157,140,255,0.30)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, 262, 28, 0, Math.PI * 2); c.stroke();
      // stroked icons
      c.strokeStyle = '#b9a6ff'; c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round';
      if (i === 0) { // envelope
        rr(cx - 17, 250, 34, 24, 4); c.stroke();
        c.beginPath(); c.moveTo(cx - 15, 253); c.lineTo(cx, 265); c.lineTo(cx + 15, 253); c.stroke();
      } else if (i === 1) { // sparkle
        c.beginPath(); c.moveTo(cx, 247);
        c.quadraticCurveTo(cx + 2.5, 258.5, cx + 14, 261); c.quadraticCurveTo(cx + 2.5, 263.5, cx, 275);
        c.quadraticCurveTo(cx - 2.5, 263.5, cx - 14, 261); c.quadraticCurveTo(cx - 2.5, 258.5, cx, 247);
        c.closePath(); c.fillStyle = 'rgba(108,92,255,0.30)'; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(cx + 14, 245); c.lineTo(cx + 14, 253); c.moveTo(cx + 10, 249); c.lineTo(cx + 18, 249); c.stroke();
      } else if (i === 2) { // document with text hairlines
        rr(cx - 13, 244, 26, 36, 4); c.stroke();
        var rx = cx + 7;
        c.strokeStyle = 'rgba(185,166,255,0.5)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(rx, 252); c.lineTo(rx - 14, 252); c.moveTo(rx, 266); c.lineTo(rx - 14, 266); c.moveTo(rx, 273); c.lineTo(rx - 8, 273); c.stroke();
        c.shadowColor = 'rgba(108,92,255,0.8)'; c.shadowBlur = 6;
        c.strokeStyle = '#6C5CFF'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(rx, 259); c.lineTo(rx - 14, 259); c.stroke();
        c.shadowColor = 'transparent'; c.shadowBlur = 0;
      } else { // person + approval check
        c.beginPath(); c.arc(cx - 3, 254, 6.5, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(cx - 3, 275, 10, Math.PI, Math.PI * 2); c.stroke();
        c.shadowColor = 'rgba(108,92,255,0.7)'; c.shadowBlur = 10;
        c.fillStyle = '#6C5CFF'; c.beginPath(); c.arc(cx + 11, 271, 8, 0, Math.PI * 2); c.fill();
        c.shadowColor = 'transparent'; c.shadowBlur = 0;
        c.strokeStyle = '#FAFAF9'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(cx + 7.5, 271); c.lineTo(cx + 10.5, 274); c.lineTo(cx + 15, 267.5); c.stroke();
      }
      // title
      c.direction = 'rtl'; c.textAlign = 'center'; c.font = '700 19px ' + FONT;
      c.fillStyle = '#FAFAF9'; c.fillText(titles[i], cx, 330);
      if (i === 1) { // category chips, middle one lit
        var chips = ['הצעת מחיר', 'תמיכה', 'כללי'], cw = [], tot = 12;
        c.font = '600 11px ' + FONT;
        for (j = 0; j < 3; j++) { cw[j] = Math.ceil(c.measureText(chips[j]).width) + 14; tot += cw[j]; }
        var rEdge = cx + tot / 2;
        for (j = 0; j < 3; j++) {
          var lit = (j === 1);
          if (lit) { c.shadowColor = 'rgba(108,92,255,0.6)'; c.shadowBlur = 8; }
          c.fillStyle = lit ? 'rgba(108,92,255,0.32)' : 'rgba(250,250,249,0.04)';
          rr(rEdge - cw[j], 340, cw[j], 21, 10.5); c.fill();
          c.shadowColor = 'transparent'; c.shadowBlur = 0;
          c.strokeStyle = lit ? 'rgba(157,140,255,0.9)' : 'rgba(157,140,255,0.22)'; c.lineWidth = 1;
          rr(rEdge - cw[j] + 0.5, 340.5, cw[j] - 1, 20, 10); c.stroke();
          c.fillStyle = lit ? '#FAFAF9' : 'rgba(250,250,249,0.55)';
          c.fillText(chips[j], rEdge - cw[j] / 2, 355);
          rEdge -= cw[j] + 6;
        }
      } else {
        c.font = '400 13px ' + FONT; c.fillStyle = 'rgba(250,250,249,0.55)';
        c.fillText(subs[i], cx, 356);
      }
      // bottom hairline + stage number
      c.strokeStyle = 'rgba(157,140,255,0.12)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + 20, 400.5); c.lineTo(x + CW - 20, 400.5); c.stroke();
      c.direction = 'ltr'; c.textAlign = 'center'; c.font = '600 11px ' + FONT;
      c.fillStyle = 'rgba(157,140,255,0.55)'; c.fillText('0' + (i + 1), cx, 424);
    }
    // ---- glowing connectors, right-to-left ----
    for (i = 0; i < 3; i++) {
      var x1 = xs[i], x2 = xs[i + 1] + CW;
      var lg = c.createLinearGradient(x1, 0, x2, 0);
      lg.addColorStop(0, 'rgba(108,92,255,0)'); lg.addColorStop(0.45, 'rgba(108,92,255,0.55)'); lg.addColorStop(1, 'rgba(108,92,255,0.95)');
      c.strokeStyle = lg; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x1 - 1, 262); c.lineTo(x2 + 8, 262); c.stroke();
      c.shadowColor = 'rgba(108,92,255,0.8)'; c.shadowBlur = 8;
      c.fillStyle = '#6C5CFF'; c.beginPath(); c.moveTo(x2, 262); c.lineTo(x2 + 8, 257); c.lineTo(x2 + 8, 267); c.closePath(); c.fill();
      var fr = [0.2, 0.48, 0.76];
      for (j = 0; j < 3; j++) {
        c.globalAlpha = 0.45 + 0.25 * j; c.fillStyle = '#b9a6ff';
        c.beginPath(); c.arc(x1 + (x2 - x1) * fr[j], 262, 1.7 + 0.45 * j, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1; c.shadowColor = 'transparent'; c.shadowBlur = 0;
    }
    // ---- footer ornament + stat line ----
    c.strokeStyle = 'rgba(157,140,255,0.18)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(432, 548.5); c.lineTo(498, 548.5); c.moveTo(526, 548.5); c.lineTo(592, 548.5); c.stroke();
    c.fillStyle = 'rgba(157,140,255,0.5)'; c.beginPath(); c.arc(512, 548.5, 2, 0, Math.PI * 2); c.fill();
    var heb = 'מהפניות מקבלות טיוטה לפני הבוקר';
    c.font = '400 16px ' + FONT; var hw = c.measureText(heb).width;
    c.font = '700 19px ' + FONT; var nw = c.measureText('92%').width;
    var rx2 = 512 + (nw + 9 + hw) / 2;
    c.direction = 'ltr'; c.textAlign = 'right';
    c.shadowColor = 'rgba(108,92,255,0.65)'; c.shadowBlur = 14;
    c.fillStyle = '#9D8CFF'; c.fillText('92%', rx2, 584);
    c.shadowColor = 'transparent'; c.shadowBlur = 0;
    c.direction = 'rtl'; c.textAlign = 'right'; c.font = '400 16px ' + FONT;
    c.fillStyle = 'rgba(250,250,249,0.6)'; c.fillText(heb, rx2 - nw - 9, 584);
  }

  function drawCaseGame(c) {
    function rr(x, y, w, h, r) { c.beginPath(); if (c.roundRect) { c.roundRect(x, y, w, h, r); } else { c.rect(x, y, w, h); } }
    function noShadow() { c.shadowBlur = 0; c.shadowColor = 'rgba(0,0,0,0)'; c.shadowOffsetY = 0; }
    var g, i, a, px, py;
    // backdrop
    g = c.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, '#14121F'); g.addColorStop(1, '#100d1c');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 640);
    // app frame
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 34; c.shadowOffsetY = 10;
    c.fillStyle = '#131020'; rr(26, 22, 972, 596, 14); c.fill(); noShadow();
    c.strokeStyle = 'rgba(157,140,255,0.14)'; c.lineWidth = 1; rr(26.5, 22.5, 971, 595, 14); c.stroke();
    // HUD left: score chip with star
    c.fillStyle = '#221c38'; rr(50, 40, 106, 32, 16); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.07)'; rr(50.5, 40.5, 105, 31, 16); c.stroke();
    c.fillStyle = '#FFB080'; c.beginPath();
    for (i = 0; i < 10; i++) { a = -Math.PI / 2 + i * Math.PI / 5; var sr = (i % 2 === 0) ? 7 : 3; px = 68 + Math.cos(a) * sr; py = 56 + Math.sin(a) * sr; if (i === 0) { c.moveTo(px, py); } else { c.lineTo(px, py); } }
    c.closePath(); c.fill();
    c.direction = 'ltr'; c.textAlign = 'left'; c.fillStyle = '#FAFAF9'; c.font = '700 15px ' + FONT; c.fillText('1,240', 84, 61);
    // HUD right: stage chip
    c.fillStyle = '#221c38'; rr(852, 40, 120, 32, 16); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.07)'; rr(852.5, 40.5, 119, 31, 16); c.stroke();
    c.direction = 'rtl'; c.textAlign = 'center'; c.fillStyle = 'rgba(250,250,249,0.88)'; c.font = '600 14px ' + FONT; c.fillText('שלב 3 / 5', 912, 61);
    // HUD center: progress 60% (RTL fill)
    c.fillStyle = '#221c38'; rr(230, 52, 562, 8, 4); c.fill();
    g = c.createLinearGradient(455, 0, 792, 0); g.addColorStop(0, '#FFB080'); g.addColorStop(1, '#E8722E');
    c.fillStyle = g; rr(455, 52, 337, 8, 4); c.fill();
    c.fillStyle = '#131020'; for (i = 1; i < 5; i++) { c.fillRect(230 + 562 * i / 5 - 1, 52, 2, 8); }
    c.shadowColor = '#E8722E'; c.shadowBlur = 10; c.fillStyle = '#FFB080'; c.beginPath(); c.arc(455, 56, 4.5, 0, Math.PI * 2); c.fill(); noShadow();
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(44, 87, 936, 1);
    // ---- STAGE (clipped) ----
    c.save(); rr(50, 108, 510, 448, 12); c.clip();
    g = c.createLinearGradient(0, 108, 0, 556); g.addColorStop(0, '#0e0b1a'); g.addColorStop(1, '#131022');
    c.fillStyle = g; c.fillRect(50, 108, 510, 448);
    g = c.createRadialGradient(305, 300, 0, 305, 300, 270); g.addColorStop(0, 'rgba(108,92,255,0.17)'); g.addColorStop(1, 'rgba(108,92,255,0)');
    c.fillStyle = g; c.fillRect(50, 108, 510, 448);
    for (i = 0; i < 26; i++) { c.globalAlpha = 0.04 + Math.random() * 0.08; c.fillStyle = '#b9a6ff'; c.beginPath(); c.arc(60 + Math.random() * 490, 118 + Math.random() * 420, 0.6 + Math.random() * 0.9, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    // ground glow
    c.save(); c.translate(305, 452); c.scale(1, 0.26);
    g = c.createRadialGradient(0, 0, 0, 0, 0, 165); g.addColorStop(0, 'rgba(108,92,255,0.34)'); g.addColorStop(0.55, 'rgba(108,92,255,0.12)'); g.addColorStop(1, 'rgba(108,92,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 165, 0, Math.PI * 2); c.fill();
    g = c.createRadialGradient(0, 0, 0, 0, 0, 70); g.addColorStop(0, 'rgba(232,114,46,0.25)'); g.addColorStop(1, 'rgba(232,114,46,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 70, 0, Math.PI * 2); c.fill(); c.restore();
    // dashed hover ring
    c.save(); c.translate(305, 414); c.scale(1, 0.25); c.beginPath(); c.arc(0, 0, 158, 0, Math.PI * 2); c.restore();
    c.setLineDash([6, 9]); c.strokeStyle = 'rgba(157,140,255,0.30)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
    // thruster light cones
    g = c.createLinearGradient(0, 374, 0, 448); g.addColorStop(0, 'rgba(232,114,46,0.30)'); g.addColorStop(1, 'rgba(232,114,46,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(233, 374); c.lineTo(261, 374); c.lineTo(281, 448); c.lineTo(213, 448); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(349, 374); c.lineTo(377, 374); c.lineTo(397, 448); c.lineTo(329, 448); c.closePath(); c.fill();
    // tail fin (behind hull)
    c.fillStyle = '#9D8CFF'; c.beginPath(); c.moveTo(200, 292); c.lineTo(160, 248); c.lineTo(218, 272); c.closePath(); c.fill();
    // nozzles
    c.fillStyle = '#221c38'; rr(237, 344, 20, 18, 4); c.fill(); rr(353, 344, 20, 18, 4); c.fill();
    // hull: dark side face then lit top face
    g = c.createLinearGradient(0, 300, 0, 352); g.addColorStop(0, '#4c40cc'); g.addColorStop(1, '#342b98');
    c.fillStyle = g; rr(189, 300, 250, 52, 24); c.fill();
    g = c.createLinearGradient(0, 272, 0, 330); g.addColorStop(0, '#8F7FFF'); g.addColorStop(1, '#5B4CF5');
    c.fillStyle = g; rr(175, 272, 260, 58, 27); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.16)'; rr(197, 279, 180, 9, 4.5); c.fill();
    // canopy
    c.beginPath(); c.arc(338, 273, 33, Math.PI, 0); c.closePath(); c.fillStyle = '#131020'; c.fill();
    g = c.createLinearGradient(0, 242, 0, 272); g.addColorStop(0, '#FFC9A0'); g.addColorStop(1, '#E8722E');
    c.beginPath(); c.arc(338, 272, 29, Math.PI, 0); c.closePath(); c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(327, 254, 3.5, 0, Math.PI * 2); c.fill();
    // nose lamp
    c.shadowColor = '#FFB080'; c.shadowBlur = 12; c.fillStyle = '#FFB080'; c.beginPath(); c.arc(431, 301, 4, 0, Math.PI * 2); c.fill(); noShadow();
    // thrusters
    var tx = [247, 363]; c.shadowColor = '#E8722E'; c.shadowBlur = 18;
    for (i = 0; i < 2; i++) { g = c.createRadialGradient(tx[i], 368, 1, tx[i], 368, 12); g.addColorStop(0, '#FFE7CF'); g.addColorStop(0.5, '#FFB080'); g.addColorStop(1, '#E8722E'); c.fillStyle = g; c.beginPath(); c.arc(tx[i], 368, 12, 0, Math.PI * 2); c.fill(); }
    noShadow();
    // deliberate sparks
    var sp = [[224, 236, 2, 0.8], [398, 228, 1.5, 0.7], [420, 344, 1.6, 0.55], [192, 330, 1.4, 0.55], [286, 212, 1.2, 0.5], [356, 194, 1.8, 0.75], [168, 284, 1.2, 0.5]];
    for (i = 0; i < sp.length; i++) { c.globalAlpha = sp[i][3]; c.fillStyle = '#FAFAF9'; c.beginPath(); c.arc(sp[i][0], sp[i][1], sp[i][2], 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 0.7; c.fillStyle = '#FFB080';
    c.beginPath(); c.arc(237, 398, 1.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(373, 404, 1.3, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1; c.restore();
    // stage border, viewport brackets, 360 chip
    c.strokeStyle = 'rgba(157,140,255,0.10)'; c.lineWidth = 1; rr(50.5, 108.5, 509, 447, 12); c.stroke();
    var bk = [[64, 122, 1, 1], [546, 122, -1, 1], [64, 542, 1, -1], [546, 542, -1, -1]];
    c.strokeStyle = 'rgba(157,140,255,0.30)'; c.lineWidth = 2;
    for (i = 0; i < 4; i++) { c.beginPath(); c.moveTo(bk[i][0] + 14 * bk[i][2], bk[i][1]); c.lineTo(bk[i][0], bk[i][1]); c.lineTo(bk[i][0], bk[i][1] + 14 * bk[i][3]); c.stroke(); }
    c.fillStyle = 'rgba(34,28,56,0.85)'; rr(70, 510, 54, 24, 12); c.fill();
    c.direction = 'ltr'; c.textAlign = 'center'; c.fillStyle = '#9D8CFF'; c.font = '600 12px ' + FONT; c.fillText('360°', 97, 526);
    // ---- RIGHT PANEL (RTL config) ----
    g = c.createLinearGradient(0, 108, 0, 474); g.addColorStop(0, '#1e1936'); g.addColorStop(1, '#1b1730');
    c.fillStyle = g; rr(584, 108, 390, 366, 12); c.fill();
    c.strokeStyle = 'rgba(157,140,255,0.12)'; c.lineWidth = 1; rr(584.5, 108.5, 389, 365, 12); c.stroke();
    c.direction = 'rtl'; c.textAlign = 'right';
    c.fillStyle = '#FAFAF9'; c.font = '700 22px ' + FONT; c.fillText('הרכיבו את שלכם', 944, 152);
    c.font = '600 13px ' + FONT; c.fillStyle = 'rgba(185,166,255,0.85)'; c.fillText('צבע', 944, 190);
    // swatches (selected = orange, first from right)
    var sw = ['#E8722E', '#6C5CFF', '#9D8CFF', '#FFB080', '#FAFAF9'];
    for (i = 0; i < 5; i++) { c.fillStyle = sw[i]; c.beginPath(); c.arc(926 - 38 * i, 216, 13, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(16,13,28,0.5)'; c.lineWidth = 1; c.stroke(); }
    c.strokeStyle = '#E8722E'; c.lineWidth = 2; c.beginPath(); c.arc(926, 216, 18.5, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(614, 243, 330, 1);
    // engine pills
    c.font = '600 13px ' + FONT; c.fillStyle = 'rgba(185,166,255,0.85)'; c.textAlign = 'right'; c.fillText('מנוע', 944, 272);
    var pills = [{ t: 'שקט', x: 852, lit: false }, { t: 'ספורט', x: 748, lit: true }, { t: 'טורבו', x: 644, lit: false }];
    for (i = 0; i < 3; i++) {
      if (pills[i].lit) {
        c.shadowColor = 'rgba(232,114,46,0.55)'; c.shadowBlur = 14;
        g = c.createLinearGradient(0, 284, 0, 316); g.addColorStop(0, '#F5893B'); g.addColorStop(1, '#DE6524');
        c.fillStyle = g; rr(pills[i].x, 284, 92, 32, 16); c.fill(); noShadow();
        c.fillStyle = '#14121F'; c.font = '700 14px ' + FONT;
      } else {
        c.fillStyle = '#221c38'; rr(pills[i].x, 284, 92, 32, 16); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1; rr(pills[i].x + 0.5, 284.5, 91, 31, 16); c.stroke();
        c.fillStyle = 'rgba(250,250,249,0.72)'; c.font = '600 14px ' + FONT;
      }
      c.textAlign = 'center'; c.fillText(pills[i].t, pills[i].x + 46, 305);
    }
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(614, 332, 330, 1);
    // hover-height slider at 70%
    c.textAlign = 'right'; c.font = '600 13px ' + FONT; c.fillStyle = 'rgba(185,166,255,0.85)'; c.fillText('גובה ריחוף', 944, 360);
    c.direction = 'ltr'; c.textAlign = 'left'; c.font = '700 13px ' + FONT; c.fillStyle = '#b9a6ff'; c.fillText('70%', 614, 360);
    c.fillStyle = '#131020'; rr(614, 374, 330, 6, 3); c.fill();
    g = c.createLinearGradient(713, 0, 944, 0); g.addColorStop(0, '#9D8CFF'); g.addColorStop(1, '#6C5CFF');
    c.fillStyle = g; rr(713, 374, 231, 6, 3); c.fill();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 8; c.shadowOffsetY = 2;
    c.fillStyle = '#FAFAF9'; c.beginPath(); c.arc(713, 377, 10, 0, Math.PI * 2); c.fill(); noShadow();
    c.fillStyle = '#6C5CFF'; c.beginPath(); c.arc(713, 377, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(614, 402, 330, 1);
    // stat readout
    var st = [{ t: 'מהירות', y: 419, w: 179, v: '82' }, { t: 'יציבות', y: 447, w: 140, v: '64' }];
    for (i = 0; i < 2; i++) {
      c.direction = 'rtl'; c.textAlign = 'right'; c.font = '600 13px ' + FONT; c.fillStyle = 'rgba(250,250,249,0.6)'; c.fillText(st[i].t, 944, st[i].y + 9);
      c.fillStyle = '#131020'; rr(636, st[i].y, 218, 8, 4); c.fill();
      g = c.createLinearGradient(636, 0, 854, 0); g.addColorStop(0, '#6C5CFF'); g.addColorStop(1, '#9D8CFF');
      c.fillStyle = g; rr(854 - st[i].w, st[i].y, st[i].w, 8, 4); c.fill();
      c.direction = 'ltr'; c.textAlign = 'left'; c.font = '600 12px ' + FONT; c.fillStyle = '#b9a6ff'; c.fillText(st[i].v, 614, st[i].y + 9);
    }
    // CTA
    c.shadowColor = 'rgba(232,114,46,0.55)'; c.shadowBlur = 30; c.shadowOffsetY = 6;
    g = c.createLinearGradient(0, 492, 0, 556); g.addColorStop(0, '#FFA366'); g.addColorStop(1, '#DE6320');
    c.fillStyle = g; rr(584, 492, 390, 64, 18); c.fill(); noShadow();
    c.fillStyle = 'rgba(255,255,255,0.35)'; rr(600, 497, 358, 2, 1); c.fill();
    c.direction = 'rtl'; c.textAlign = 'center'; c.fillStyle = '#14121F'; c.font = '800 24px ' + FONT; c.fillText('נסו אותי', 779, 533);
    // footer hints
    c.font = '600 13px ' + FONT; c.fillStyle = 'rgba(250,250,249,0.38)'; c.fillText('גררו כדי לסובב את הדגם', 305, 584);
    c.font = '600 12px ' + FONT; c.fillStyle = 'rgba(250,250,249,0.32)'; c.fillText('אפשר לשנות הכל אחר כך', 779, 584);
    c.direction = 'ltr'; c.textAlign = 'left';
  }

  function drawCaseAnatomy(c) {
    function rr(x, y, w, h, r) { c.beginPath(); if (c.roundRect) { c.roundRect(x, y, w, h, r); } else { c.rect(x, y, w, h); } }
    var BLUE = '#1F8FD8', i;

    /* night backdrop + a soft blue breath top-right */
    c.fillStyle = '#14121F';
    c.fillRect(0, 0, 1024, 640);
    var breath = c.createRadialGradient(830, 120, 30, 830, 120, 460);
    breath.addColorStop(0, 'rgba(31, 143, 216, 0.14)');
    breath.addColorStop(1, 'rgba(31, 143, 216, 0)');
    c.fillStyle = breath;
    c.fillRect(0, 0, 1024, 640);
    c.fillStyle = 'rgba(250, 250, 249, 0.04)';
    for (i = 0; i < 40; i++) c.fillRect((i * 173.3) % 1024, (i * 97.7) % 640, 1.3, 1.3);

    /* isometric mapping: plate space (u,v) -> screen; e = elevation */
    var OX = 360, OY = 136, AU = 0.8, AV = 0.38;
    function P(u, v, e) { return [OX + (u - v) * AU, OY + (u + v) * AV - e]; }
    var PW = 300, PD = 190, TH = 14;   /* plate footprint + thickness */

    function plate(e, top, sideL, sideR, inner) {
      var a = P(0, 0, e), b = P(PW, 0, e), d2 = P(PW, PD, e), f = P(0, PD, e);
      /* soft shadow cast on the plate below */
      c.fillStyle = 'rgba(0, 0, 0, 0.30)';
      c.beginPath();
      c.ellipse(P(PW / 2, PD / 2, e)[0], P(PW / 2, PD / 2, e)[1] + 52, 210, 34, 0, 0, Math.PI * 2);
      c.fill();
      /* thickness sides */
      c.fillStyle = sideL;
      c.beginPath(); c.moveTo(f[0], f[1]); c.lineTo(d2[0], d2[1]); c.lineTo(d2[0], d2[1] + TH); c.lineTo(f[0], f[1] + TH); c.closePath(); c.fill();
      c.fillStyle = sideR;
      c.beginPath(); c.moveTo(d2[0], d2[1]); c.lineTo(b[0], b[1]); c.lineTo(b[0], b[1] + TH); c.lineTo(d2[0], d2[1] + TH); c.closePath(); c.fill();
      /* top face */
      c.fillStyle = top;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d2[0], d2[1]); c.lineTo(f[0], f[1]); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(250, 250, 249, 0.10)';
      c.lineWidth = 1;
      c.stroke();
      /* draw the plate's mini-content in plate space */
      c.save();
      c.transform(AU, AV, -AU, AV, OX, OY - e);
      inner();
      c.restore();
    }

    function bar(u, v, w, h, col, r) { c.fillStyle = col; rr(u, v, w, h, r || 3); c.fill(); }

    /* bottom-up so upper plates overlap lower shadows */
    /* 4. code */
    plate(-318, '#100d1c', '#0a0812', '#070510', function () {
      c.strokeStyle = 'rgba(31, 143, 216, 0.8)';
      c.lineWidth = 7;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(64, 66); c.lineTo(40, 92); c.lineTo(64, 118); c.stroke();
      c.beginPath(); c.moveTo(104, 66); c.lineTo(128, 92); c.lineTo(104, 118); c.stroke();
      c.strokeStyle = 'rgba(157, 140, 255, 0.8)';
      c.beginPath(); c.moveTo(90, 60); c.lineTo(78, 124); c.stroke();
      c.lineCap = 'butt';
      bar(160, 56, 96, 8, 'rgba(31, 143, 216, 0.55)');
      bar(176, 76, 80, 8, 'rgba(157, 140, 255, 0.5)');
      bar(176, 96, 64, 8, 'rgba(250, 250, 249, 0.22)');
      bar(160, 116, 90, 8, 'rgba(255, 176, 128, 0.45)');
    });
    /* 3. motion */
    plate(-212, '#1b1730', '#120e22', '#0d0a1c', function () {
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.strokeStyle = BLUE;
      c.beginPath(); c.moveTo(40, 130); c.bezierCurveTo(110, 130, 130, 52, 210, 48); c.stroke();
      c.strokeStyle = '#9D8CFF';
      c.beginPath(); c.moveTo(40, 140); c.bezierCurveTo(160, 140, 120, 66, 250, 62); c.stroke();
      c.lineCap = 'butt';
      c.fillStyle = BLUE;
      c.beginPath(); c.moveTo(210, 40); c.lineTo(222, 48); c.lineTo(210, 56); c.closePath(); c.fill();
      c.fillStyle = '#9D8CFF';
      c.beginPath(); c.moveTo(250, 54); c.lineTo(262, 62); c.lineTo(250, 70); c.closePath(); c.fill();
      c.fillStyle = 'rgba(250, 250, 249, 0.16)';
      c.beginPath(); c.arc(64, 62, 22, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(250, 250, 249, 0.85)';
      c.beginPath(); c.moveTo(57, 50); c.lineTo(75, 62); c.lineTo(57, 74); c.closePath(); c.fill();
    });
    /* 2. design */
    plate(-106, '#2a2153', '#1d1740', '#171233', function () {
      var chips = ['#5B4CF5', '#9D8CFF', '#FFB080', '#FAFAF9'];
      for (var k = 0; k < 4; k++) bar(40 + k * 46, 48, 34, 34, chips[k], 9);
      c.fillStyle = 'rgba(250, 250, 249, 0.92)';
      c.font = '850 74px ' + FONT;
      c.textAlign = 'left';
      c.direction = 'rtl';
      c.fillText('אב', 196, 112);
      c.strokeStyle = 'rgba(250, 250, 249, 0.30)';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(40, 132); c.lineTo(250, 132); c.stroke();
      for (var t = 0; t <= 6; t++) { c.beginPath(); c.moveTo(40 + t * 35, 126); c.lineTo(40 + t * 35, 138); c.stroke(); }
    });
    /* 1. content */
    plate(0, '#FAFAF9', '#d9d5c8', '#c8c3b4', function () {
      bar(40, 44, 150, 20, '#14121F', 6);
      bar(40, 80, 190, 9, 'rgba(90, 86, 104, 0.55)');
      bar(40, 100, 170, 9, 'rgba(90, 86, 104, 0.42)');
      bar(40, 120, 120, 9, 'rgba(90, 86, 104, 0.30)');
      bar(206, 76, 56, 56, 'rgba(108, 92, 255, 0.35)', 8);
      c.strokeStyle = 'rgba(20, 18, 31, 0.25)';
      c.lineWidth = 1.5;
      rr(206, 76, 56, 56, 8);
      c.stroke();
    });

    /* the spine: a hairline through the right-front corners */
    var s0 = P(PW, 0, 40), s1 = P(PW, 0, -358);
    c.strokeStyle = 'rgba(31, 143, 216, 0.35)';
    c.lineWidth = 1;
    c.setLineDash([3, 6]);
    c.beginPath(); c.moveTo(s0[0], s0[1]); c.lineTo(s1[0], s1[1]); c.stroke();
    c.setLineDash([]);

    /* labels with numbered dots + leader lines (rtl side) */
    var labels = [['תוכן', 'מילים שנכתבות ללקוח', 0], ['עיצוב', 'שפה אחת, מכל זווית', -106], ['תנועה', 'החיים שבין המסכים', -212], ['קוד', 'מהיר, יציב, נקי', -318]];
    c.textBaseline = 'middle';
    for (i = 0; i < 4; i++) {
      var e2 = labels[i][2];
      var edge = P(PW, PD * 0.35, e2);
      var lxx = 900, lyy = edge[1] - 8;
      c.strokeStyle = 'rgba(250, 250, 249, 0.28)';
      c.beginPath(); c.moveTo(edge[0] + 8, edge[1]); c.lineTo(lxx - 62, lyy); c.stroke();
      c.fillStyle = 'rgba(31, 143, 216, 0.16)';
      c.beginPath(); c.arc(lxx - 46, lyy, 13, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(31, 143, 216, 0.7)';
      c.beginPath(); c.arc(lxx - 46, lyy, 13, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#FAFAF9';
      c.font = '700 15px ' + FONT;
      c.textAlign = 'center';
      c.direction = 'ltr';
      c.fillText(String(i + 1), lxx - 46, lyy + 1);
      c.textAlign = 'right';
      c.direction = 'rtl';
      c.font = '700 24px ' + FONT;
      c.fillText(labels[i][0], lxx + 88, lyy - 8);
      c.fillStyle = 'rgba(143, 136, 173, 0.9)';
      c.font = '400 15px ' + FONT;
      c.fillText(labels[i][1], lxx + 88, lyy + 15);
    }

    /* heading (top right) + footer */
    c.textAlign = 'right';
    c.direction = 'rtl';
    c.fillStyle = BLUE;
    c.font = '600 20px ' + FONT;
    c.fillText('ככה נבנה אתר', 976, 66);
    c.fillStyle = '#FAFAF9';
    c.font = '800 42px ' + FONT;
    c.fillText('ארבע שכבות, מקשה אחת.', 976, 116);
    c.textAlign = 'center';
    c.fillStyle = 'rgba(143, 136, 173, 0.85)';
    c.font = '400 20px ' + FONT;
    c.fillText('כל שכבה נבנית אצלנו, באותו שולחן.', 512, 606);
    c.textBaseline = 'alphabetic';
    c.direction = 'ltr';
    c.textAlign = 'left';
  }

  var DISPLAYS = {
    bisomna: drawCaseBisomna,
    orbo: drawCaseOrbo,
    crm: drawCaseCrm,
    ai: drawCaseAi,
    game: drawCaseGame,
    anatomy: drawCaseAnatomy
  };

  /* ---------- the displays LIVE ----------
     every case display carries a transparent overlay plane where its
     dynamic life plays: a chart cursor sweeping real data, pipeline
     dots flowing, thrusters flickering - the screens read as working
     products, not stills. plus one pulsing, unmissable CTA each. */
  var liveDisplays = [];
  function rrp(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  }
  var DISP_CTA = {
    bisomna: [500, 596], orbo: [512, 606], crm: [512, 600],
    ai: [512, 484], game: [230, 600], anatomy: [210, 600]
  };
  function ctaPulse(c, x, y, accent, t) {
    var text = 'רוצים כזה? דברו איתנו';
    c.font = '700 30px ' + FONT;
    c.direction = 'rtl';
    c.textBaseline = 'middle';
    var w = c.measureText(text).width + 104, h = 58;
    var pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    c.save();
    c.shadowColor = accent;
    c.shadowBlur = 16 + pulse * 24;
    c.fillStyle = accent;
    rrp(c, x - w / 2, y - h / 2, w, h, 29);
    c.fill();
    c.restore();
    c.fillStyle = 'rgba(255, 255, 255, ' + (0.22 + pulse * 0.18).toFixed(3) + ')';
    rrp(c, x - w / 2 + 12, y - h / 2 + 5, w - 24, 2, 1);
    c.fill();
    c.fillStyle = '#0e0c18';
    c.textAlign = 'center';
    c.fillText(text, x + 17, y + 2);
    var ax = x - w / 2 + 24 - pulse * 5;
    c.strokeStyle = '#0e0c18';
    c.lineWidth = 3.5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(ax + 17, y); c.lineTo(ax, y);
    c.moveTo(ax + 8, y - 7); c.lineTo(ax, y); c.lineTo(ax + 8, y + 7);
    c.stroke();
    c.lineCap = 'butt';
    c.textBaseline = 'alphabetic';
  }
  var DISP_ANIM = {
    crm: function (c, t) {
      /* the revenue chart is being read RIGHT NOW: a scanline + cursor
         dot ride the teal line across real plot coordinates */
      var xs = [396, 493.6, 591.2, 688.8, 786.4, 884];
      var vt = [40, 56, 48, 64, 72, 86];
      var ph = (t * 0.14) % 1;
      var fx = 396 + ph * 488;
      var seg = Math.min(4, Math.floor(ph * 5));
      var k = ph * 5 - seg;
      var fy = 352 - (vt[seg] + (vt[seg + 1] - vt[seg]) * k) * 1.35;
      c.fillStyle = 'rgba(15, 168, 140, 0.08)';
      c.fillRect(fx - 1, 232, 2, 120);
      c.save();
      c.shadowColor = '#3AD0AF';
      c.shadowBlur = 14;
      c.fillStyle = '#3AD0AF';
      c.beginPath(); c.arc(fx, fy, 5, 0, 6.2832); c.fill();
      c.restore();
      /* a live notification blinking by the avatar */
      c.fillStyle = 'rgba(58, 208, 175, ' + (0.35 + 0.55 * Math.max(0, Math.sin(t * 3.1))).toFixed(3) + ')';
      c.beginPath(); c.arc(58, 28, 5, 0, 6.2832); c.fill();
      /* the table is being worked: a row highlight steps through */
      var row = Math.floor(t * 0.55) % 4;
      c.fillStyle = 'rgba(15, 168, 140, 0.07)';
      rrp(c, 40, 470 + row * 35, 850, 33, 6);
      c.fill();
      c.fillStyle = 'rgba(58, 208, 175, 0.7)';
      c.fillRect(886, 472 + row * 35, 3, 29);
      /* one KPI refreshes at a time - soft pulse line under it */
      var kpi = Math.floor(t * 0.8) % 4;
      c.fillStyle = 'rgba(58, 208, 175, ' + (0.2 + 0.3 * Math.sin(t * 4)).toFixed(3) + ')';
      rrp(c, 50 + kpi * 224, 158, 160, 3, 1.5);
      c.fill();
    },
    ai: function (c, t) {
      /* work flows right-to-left through the pipeline, card by card */
      var segs = [[779, 721], [541, 483], [303, 245]];
      c.save();
      c.shadowColor = '#9D8CFF';
      c.shadowBlur = 10;
      for (var s = 0; s < 3; s++) {
        for (var d = 0; d < 3; d++) {
          var ph = (t * 0.45 + d * 0.34 + s * 0.13) % 1;
          var x2 = segs[s][0] - ph * (segs[s][0] - segs[s][1]);
          c.fillStyle = 'rgba(157, 140, 255, ' + (0.85 * Math.sin(ph * Math.PI)).toFixed(3) + ')';
          c.beginPath(); c.arc(x2, 320, 3.6, 0, 6.2832); c.fill();
        }
      }
      c.restore();
      var xs = [779, 541, 303, 65];
      var act = Math.floor(t * 0.7) % 4;
      c.strokeStyle = 'rgba(108, 92, 255, ' + (0.3 + 0.28 * Math.sin(t * 3)).toFixed(3) + ')';
      c.lineWidth = 2.5;
      rrp(c, xs[act] - 3, 197, 186, 246, 16);
      c.stroke();
    },
    game: function (c, t) {
      /* thrusters flicker, sparks drift, the try-me button beckons */
      var fl = 0.2 + 0.16 * Math.abs(Math.sin(t * 11) + Math.sin(t * 17) * 0.5);
      [[233, 261, 213, 281], [349, 377, 329, 397]].forEach(function (T2) {
        var g2 = c.createLinearGradient(0, 374, 0, 452);
        g2.addColorStop(0, 'rgba(255, 163, 102, ' + fl.toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(232, 114, 46, 0)');
        c.fillStyle = g2;
        c.beginPath();
        c.moveTo(T2[0], 374); c.lineTo(T2[1], 374);
        c.lineTo(T2[3], 452); c.lineTo(T2[2], 452);
        c.closePath(); c.fill();
      });
      for (var i = 0; i < 5; i++) {
        var a = t * (0.6 + i * 0.13) + i * 1.9;
        c.fillStyle = 'rgba(255, 200, 150, ' + (0.3 + 0.3 * Math.sin(t * 5 + i)).toFixed(3) + ')';
        c.beginPath();
        c.arc(305 + Math.cos(a) * (95 + i * 9), 315 + Math.sin(a) * (46 + i * 5), 1.8, 0, 6.2832);
        c.fill();
      }
      var p = (t * 0.9) % 1;
      c.strokeStyle = 'rgba(255, 163, 102, ' + (0.55 * (1 - p)).toFixed(3) + ')';
      c.lineWidth = 2.5;
      rrp(c, 584 - p * 16, 492 - p * 12, 390 + p * 32, 64 + p * 24, 18 + p * 12);
      c.stroke();
    },
    bisomna: function (c, t) {
      /* the site scrolls: chevron breathes, a video progress line runs */
      var bob = Math.sin(t * 2.6) * 5;
      c.strokeStyle = 'rgba(31, 143, 216, ' + (0.5 + 0.3 * Math.sin(t * 2.6 + 1)).toFixed(3) + ')';
      c.lineWidth = 2.5;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(347, 446 + bob); c.lineTo(354, 453 + bob); c.lineTo(361, 446 + bob);
      c.stroke();
      c.lineCap = 'butt';
      var vp = (t * 0.18) % 1;
      c.fillStyle = 'rgba(31, 143, 216, 0.55)';
      c.fillRect(44, 542, 620 * vp, 3);
      /* phone sheen sweeping every few seconds */
      var sp = (t * 0.22) % 1;
      if (sp < 0.35) {
        var sx2 = 730 + (sp / 0.35) * 184;
        var g3 = c.createLinearGradient(sx2 - 26, 0, sx2 + 26, 0);
        g3.addColorStop(0, 'rgba(255, 255, 255, 0)');
        g3.addColorStop(0.5, 'rgba(255, 255, 255, 0.10)');
        g3.addColorStop(1, 'rgba(255, 255, 255, 0)');
        c.fillStyle = g3;
        c.fillRect(sx2 - 26, 140, 52, 366);
      }
    },
    orbo: function (c, t) {
      /* the galaxy breathes and twinkles; the scroll rail advances */
      var g4 = c.createRadialGradient(560, 330, 0, 560, 330, 62);
      g4.addColorStop(0, 'rgba(201, 175, 255, ' + (0.18 + 0.14 * Math.sin(t * 1.4)).toFixed(3) + ')');
      g4.addColorStop(1, 'rgba(201, 175, 255, 0)');
      c.fillStyle = g4;
      c.fillRect(498, 268, 124, 124);
      for (var i = 0; i < 8; i++) {
        var tx2 = 190 + (i * 173.7) % 640;
        var ty = 150 + (i * 97.3) % 380;
        c.fillStyle = 'rgba(230, 225, 255, ' + Math.max(0, Math.sin(t * 1.8 + i * 2.3) * 0.8).toFixed(3) + ')';
        c.fillRect(tx2, ty, 2.4, 2.4);
      }
      var rp = (t * 0.1) % 1;
      c.fillStyle = 'rgba(157, 140, 255, 0.8)';
      c.beginPath(); c.arc(132, 150 + rp * 370, 3.4, 0, 6.2832); c.fill();
    },
    anatomy: function (c, t) {
      /* a build-pulse travels down the spine; each layer answers */
      var ph = (t * 0.32) % 1;
      var sy = 202 + ph * 400;
      c.save();
      c.shadowColor = '#1F8FD8';
      c.shadowBlur = 12;
      c.fillStyle = 'rgba(31, 143, 216, ' + (0.9 * Math.sin(ph * Math.PI)).toFixed(3) + ')';
      c.beginPath(); c.arc(600, sy, 4, 0, 6.2832); c.fill();
      c.restore();
      var ys = [267, 373, 479, 585];
      var act = Math.floor(t * 0.7) % 4;
      c.strokeStyle = 'rgba(31, 143, 216, ' + (0.35 + 0.3 * Math.sin(t * 3)).toFixed(3) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.arc(854, ys[act], 17, 0, 6.2832); c.stroke();
    }
  };
  function paintDisplayOverlay(L, adv) {
    L.t += adv;
    var c = L.ctx;
    c.clearRect(0, 0, 1024, 640);
    c.textAlign = 'left';
    c.direction = 'ltr';
    if (DISP_ANIM[L.key]) DISP_ANIM[L.key](c, L.t);
    ctaPulse(c, DISP_CTA[L.key][0], DISP_CTA[L.key][1], L.accent, L.t);
    L.tex.needsUpdate = true;
  }

  /* the collection, curated as a walk: stations 01-14 counterclockwise
     from the door. each straight-wall zone belongs to the pedestal wing
     it faces - websites NW, systems NE, AI SW, games SE - and carries
     that wing's accent. the rich "case displays" (disp:) are drawn at
     1024x640 by the display functions above. */
  var ART = [
    /* near curve, left of the door - the walk begins */
    { id: 'prism', num: '01', desc: 'שבירת אור חיה על גאומטריה מסתובבת, מצוירת בזמן אמת', px: nearL.px, pz: nearL.pz, ry: nearL.ry, live: 'prism', title: 'PRISM', tag: 'ציור חי · המעבדה', demo: 'מדגים: תלת־ממד חי בדפדפן', accent: '#7A5CFF', link: 'lab/03-prism-r3f/',
      body: 'אלומת אור נשברת דרך גאומטריה ומתפצלת לספקטרום - נצבע מחדש עשרות פעמים בשנייה, ממש עכשיו. ככה נראה תלת־ממד שרץ בדפדפן בלי להתקין כלום; בגרסה המלאה מפסלים כרום, זכוכית, הולוגרמה וחימר - חיים.' },
    { id: 'aurora', num: '02', desc: 'סרטי אור נצבעים על הקנבס הזה עשרות פעמים בשנייה', px: nearLL.px, pz: nearLL.pz, ry: nearLL.ry, live: 'aurora', title: 'AURORA', tag: 'ציור חי · המעבדה', demo: 'מדגים: אנימציה ותנועה באתר', accent: '#86B32B', link: 'lab/01-aurora-gsap/',
      body: 'סרטי אור שנעים בזרם, נצבעים בזמן אמת על הקיר הזה. בגרסה המלאה - אתר סטודיו שלם שכולו כוריאוגרפיית גלילה. תנועה כזאת אפשר לשלב גם באתר שלכם, בלי קובצי וידאו כבדים.' },
    /* left straight wall - AI wing (south), websites wing (north) */
    { id: 'ai', num: '03', desc: 'מסלול של פנייה עסקית: מיון חכם, טיוטה, ואישור אנושי בסוף', px: -(ROOM.hw - 0.06), pz: 4.6, ry: Math.PI / 2, disp: 'ai', wide: true, title: 'העוזר שלא ישן', tag: 'תצוגת יכולת · AI', demo: 'מדגים: AI ואוטומציה לעסק', accent: '#6C5CFF', contact: true,
      body: 'ככה נראית אוטומציה חכמה בעסק אמיתי: פנייה נכנסת, ממוינת לפי תוכן, מקבלת טיוטת מענה - ואדם מאשר בסוף. המערכת ערה כל הלילה; ההחלטות נשארות אצלכם. רוצים תהליך כזה אצלכם? דברו איתנו.' },
    { id: 'anatomy', num: '04', desc: 'ארבע השכבות שמהן בנוי כל אתר שיוצא מהסטודיו', px: -(ROOM.hw - 0.06), pz: 0, ry: Math.PI / 2, disp: 'anatomy', wide: true, title: 'אנטומיה של אתר', tag: 'תצוגת יכולת · אתרים', demo: 'מדגים: איך נבנה אתר אצלנו', accent: '#1F8FD8', link: 'services.html', linkText: 'מה עוד אנחנו בונים',
      body: 'ממה עשוי אתר שמרגיש כמו מקום? ארבע שכבות: תוכן שנכתב ללקוח, עיצוב עם שפה אחת, תנועה שמפיחה חיים, וקוד שמחזיק הכול יציב ומהיר. אצלנו כולן נבנות באותו שולחן - ולכן הן נפגשות מדויק.' },
    { id: 'bisomna', num: '05', desc: 'אתר המסחר של מיזם שינה ישראלי - הקייס המרכזי שלנו', px: -(ROOM.hw - 0.06), pz: -4.6, ry: Math.PI / 2, disp: 'bisomna', wide: true, title: 'BISOMNA', tag: 'הקייס המרכזי · באוויר', demo: 'מדגים: אתר תדמית ומסחר', accent: '#1F8FD8', link: 'https://bisomna.com', linkText: 'לאתר החי',
      body: 'הקייס המרכזי שלנו: מיזם שינה ישראלי שנכנס עם רעיון ויצא עם בית שלם - שישה־עשר עמודים, וידאו שנע עם הגלילה, תצוגת מוצר שנפתחת לשכבות וחנות. והכול טס גם בנייד. רוצים סטנדרט כזה? דברו איתנו.' },
    /* far curve: our own home, two living paintings, the finale, a mosaic */
    { id: 'orbo', num: '06', desc: 'דף הבית שלנו: מסע חלקיקים שנבנה כולו בקוד', px: farLL.px, pz: farLL.pz, ry: farLL.ry, disp: 'orbo', title: 'orbosolutions.com', tag: 'הבית שלנו', demo: 'מדגים: אתר כחוויית מסע', accent: '#6C5CFF', link: 'index.html', self: true,
      body: 'דף הבית שלנו הוא מסע: גוללים, והמצלמה עפה דרך עולם חלקיקים שמתגבש לצורות - בלי אף קובץ גרפיקה. כשהבית שלך בנוי ככה, הוא גם תיק העבודות.' },
    { id: 'nebula', num: '07', desc: 'גלקסיה פרוצדורלית - שישים אלף שמשות במסע גלילה', px: farL.px, pz: farL.pz, ry: farL.ry, live: 'nebula', title: 'NEBULA', tag: 'ציור חי · המעבדה', demo: 'מדגים: גרפיקה בזמן אמת', accent: '#1F8FD8', link: 'lab/02-nebula-three/',
      body: 'גלקסיה שמסתחררת לאט, מחושבת חיה מול עיניכם. בגרסה המלאה - מסע גלילה בין שישים אלף שמשות, עד לב הגלקסיה.' },
    { id: 'star', px: 0, pz: -(ROOM.straight + CURVE_R), ry: 0, title: 'ORBO', tag: 'הסטודיו', style: 'dark', big: true, sub: 'רעיונות יש לכולם. אנחנו הופכים אותם למציאות.', accent: '#6C5CFF',
      body: 'תודה שביקרתם. אם משהו כאן הדליק לכם רעיון - נשמח לשמוע עליו.', contact: true },
    { id: 'terra', num: '08', desc: 'נופים מחושבים מרעש טהור: חול, טחב, חימר, קרח ואבן', px: farR.px, pz: farR.pz, ry: farR.ry, live: 'terra', title: 'TERRA', tag: 'ציור חי · המעבדה', demo: 'מדגים: עולמות מקוד טהור', accent: '#C9A05C', link: 'lab/05-terra-webgl/',
      body: 'רכסי הרים שמחושבים מרעש מתמטי טהור, תחת שמש נמוכה. בגרסה המלאה - חמישה מחקרי נוף: חול, טחב, חימר, קרח ואבן.' },
    { id: 'mosaic', num: '09', desc: 'פסיפס וורונוי שנולד מחדש בכל כניסה למוזיאון', px: farRR.px, pz: farRR.pz, ry: farRR.ry, live: 'mosaic', title: 'MOSAIC', tag: 'אמנות גנרטיבית', demo: 'מדגים: אלגוריתם כמעצב', accent: '#6C5CFF',
      body: 'פסיפס שנבנה מחלוקת המרחב בין ארבעים ושש נקודות אקראיות. כל כניסה למוזיאון מייצרת פסיפס שלא היה קיים מעולם.' },
    /* right straight wall - systems wing (north), games wing (south) */
    { id: 'crm', num: '10', desc: 'לוח בקרה עסקי חי - כך נראית מערכת שנתפרת לעסק', px: ROOM.hw - 0.06, pz: -4.6, ry: -Math.PI / 2, disp: 'crm', wide: true, title: 'חדר הבקרה', tag: 'תצוגת יכולת · מערכות', demo: 'מדגים: מערכות ניהול ו־BI', accent: '#0FA88C', contact: true,
      body: 'חדר הבקרה של עסק: לוח מחוונים שמראה בדיוק מה שחשוב הבוקר, לקוחות, גרפים וטבלאות שמתעדכנים לבד. בלי אקסלים אבודים ובלי ״רגע, אבדוק ואחזור אליך״. כל עסק מקבל חדר בקרה משלו - דברו איתנו.' },
    { id: 'genesis', num: '11', desc: 'שלוש מאות קווים בשדה זרימה מתמטי, חושבו בכניסתכם', px: ROOM.hw - 0.06, pz: 0, ry: -Math.PI / 2, live: 'genesis', title: 'GENESIS', tag: 'אמנות גנרטיבית', demo: 'מדגים: אמנות מקוד', accent: '#0FA88C',
      body: 'שלוש מאות קווים ששוחררו לשדה זרימה מתמטי. אף אחד לא צייר את היצירה הזאת - היא חושבה, קו אחרי קו, ברגע שנכנסתם.' },
    { id: 'game', num: '12', desc: 'קונפיגורטור אינטראקטיבי - מוצר שמרכיבים תוך כדי משחק', px: ROOM.hw - 0.06, pz: 4.6, ry: -Math.PI / 2, disp: 'game', wide: true, title: 'המגרש', tag: 'תצוגת יכולת · משחקים', demo: 'מדגים: משחקים וקונפיגורטורים', accent: '#E8722E', contact: true,
      body: 'הדרך הכי מהירה להבין מוצר היא לשחק בו: קונפיגורטור שמרכיב מוצר בלייב, סימולטור שמלמד תהליך, משחק שמשאיר מבקרים עוד דקה. אינטראקציה הופכת סקרנות להחלטה - בואו נבנה אחת לשלכם.' },
    /* near curve, right of the door - the walk ends */
    { id: 'flux', num: '13', desc: 'שמונה תוכניות שיידר, ביניהן נוזל שנצבע עם הסמן', px: nearRR.px, pz: nearRR.pz, ry: nearRR.ry, live: 'flux', title: 'FLUX', tag: 'ציור חי · המעבדה', demo: 'מדגים: שיידרים על ה־GPU', accent: '#E0402F', link: 'lab/04-flux-shaders/',
      body: 'שדות צבע שזורמים לפי כללים מתמטיים, ישר מול המעבד הגרפי. בגרסה המלאה - שמונה יצירות, כולל נוזל שמציירים בו עם הסמן.' },
    { id: 'fractal', num: '14', desc: 'קבוצת ז׳וליה: נוסחה אחת קצרה, אינסוף עולמות', px: nearR.px, pz: nearR.pz, ry: nearR.ry, live: 'julia', title: 'JULIA', tag: 'אמנות גנרטיבית', demo: 'מדגים: מתמטיקה חיה', accent: '#7A5CFF',
      body: 'קבוצת ז׳וליה - נוסחה אחת קצרה שמכילה אינסוף. חושבה פיקסל־פיקסל בכניסתכם. לפעמים הקסם הוא פשוט מתמטיקה עם טעם טוב.' }
  ];

  var glowTexNeutral = radialTexture('rgba(255, 255, 255, 0.7)', 'rgba(255, 255, 255, 0)');

  ART.forEach(function (art) {
    var group = new THREE.Group();
    var W = art.big ? 3.6 : art.wide ? 2.6 : 2.2;
    var H = art.big ? 2.25 : art.wide ? 1.625 : 1.375;
    var AY = art.big ? 2.6 : 2.1;

    group.position.set(art.px, 0, art.pz);
    group.rotation.y = art.ry;

    /* world matrix helper: the group's transform times a local offset */
    var gm = new THREE.Matrix4().makeRotationY(art.ry);
    gm.setPosition(art.px, 0, art.pz);
    var partAt = function (lx, ly, lz) {
      return gm.clone().multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz));
    };

    /* the dark linen panel the piece hangs on */
    collectM('linen', new THREE.BoxGeometry(W + 1.0, H + 1.0, 0.05), partAt(0, AY, 0.028));
    /* bronze border around the panel - four clean bars */
    var PW = W + 1.0, PH = H + 1.0, bt = 0.035;
    [[0, AY + PH / 2, PW + bt * 2, bt], [0, AY - PH / 2, PW + bt * 2, bt]].forEach(function (bb) {
      collectM('bronze', new THREE.BoxGeometry(bb[2], bb[3], 0.03), partAt(bb[0], bb[1], 0.05));
    });
    [[-PW / 2, AY], [PW / 2, AY]].forEach(function (bb) {
      collectM('bronze', new THREE.BoxGeometry(bt, PH, 0.03), partAt(bb[0], bb[1], 0.05));
    });

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
      collectM('dark', new THREE.BoxGeometry(s[2], s[3], d), partAt(s[0], s[1], off - d / 2));
    });
    [[-W / 2 - th / 2, AY], [W / 2 + th / 2, AY]].forEach(function (s) {
      collectM('dark', new THREE.BoxGeometry(th, H, d), partAt(s[0], s[1], off - d / 2));
    });

    var tex, liveState = null;
    if (art.live && window.ORBO_LAB) {
      var aw = 512, ah = 320;   /* uploaded to the GPU while walking - keep it light */
      var artC = ctx2d(aw, ah);
      var texC = ctx2d(aw, ah);
      liveState = { kind: art.live, art: artC, tex: texC, w: aw, h: ah, t: Math.random() * 60, seed: ORBO_LAB.makeSeed(art.live, aw, ah) };
      texC.fillStyle = '#0F0D18';
      texC.fillRect(0, 0, aw, ah);
      tex = asTexture(texC.canvas);
    } else if (art.disp && DISPLAYS[art.disp]) {
      var dispC = ctx2d(1024, 640);
      dispC.fillStyle = '#14121F';
      dispC.fillRect(0, 0, 1024, 640);
      tex = asTexture(dispC.canvas);
      deferredArt.push({ run: DISPLAYS[art.disp].bind(null, dispC), tex: tex });
    } else if (art.gen) {
      var genC = ctx2d(640, 400);
      genC.fillStyle = '#0F0D18';
      genC.fillRect(0, 0, 640, 400);
      tex = asTexture(genC.canvas);
      deferredArt.push({ run: art.gen.bind(null, genC), tex: tex });
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
      liveState.artDef = art;
      art._live = liveState;
      /* lab pieces can host their REAL site inside the frame */
      if (art.link && art.link.indexOf('lab/') === 0) {
        liveState.embedUrl = art.link;
        liveState.embedMatrix = gm.clone().multiply(new THREE.Matrix4().makeTranslation(0, AY, off + 0.002));
        liveState.embedW = W;
        liveState.embedH = H;
      }
      liveArts.push(liveState);
    }

    /* case displays get their transparent life-layer on top */
    if (art.disp && DISPLAYS[art.disp]) {
      var ovC = ctx2d(512, 320);
      ovC.scale(0.5, 0.5);
      var ovTex = asTexture(ovC.canvas);
      var ovPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshBasicMaterial({ map: ovTex, transparent: true, depthWrite: false })
      );
      ovPlane.position.set(0, AY, off + 0.004);
      group.add(ovPlane);
      liveDisplays.push({ key: art.disp, ctx: ovC, tex: ovTex, plane: plane, accent: art.accent || '#6C5CFF', t: Math.random() * 20, _d: 99 });
    }

    if (!art.big) {
      var plq = new THREE.Mesh(
        new THREE.PlaneGeometry(0.66, 0.34),
        new THREE.MeshBasicMaterial({ map: plaqueTexture(art) })
      );
      /* under the artwork, on the linen - like a real museum mount card */
      plq.position.set(0, art.wide ? 1.06 : 1.14, 0.062);
      group.add(plq);
    }

    /* where this piece's warm spot would sit - the shared pool below
       parks the real lights on the nearest pieces only */
    var sWorld = new THREE.Vector3(0, ROOM.h - 0.35, 1.7).applyEuler(group.rotation).add(group.position);
    var tWorld = new THREE.Vector3(0, AY, 0).applyEuler(group.rotation).add(group.position);
    art._spotFrom = sWorld;
    art._spotTo = tWorld;
    collect('dark', new THREE.CylinderGeometry(0.06, 0.09, 0.16, 10), sWorld.x, ROOM.h - 0.1, sWorld.z);

    scene.add(group);
  });

  /* ---------- the welcome stand: a lectern greeting the visitor ---------- */
  var standCollide = null;
  (function () {
    var SX = 1.7, SZ = 8.6, TILT = -0.21;
    var face = Math.atan2(0 - SX, 10.6 - SZ);   /* board normal toward the entry point */
    /* bronze back plate (frame) + two legs join the static bake */
    var bm = new THREE.Matrix4().makeRotationY(face);
    bm.multiply(new THREE.Matrix4().makeRotationX(TILT));
    bm.setPosition(SX, 1.28, SZ);
    var back = bm.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.014));
    collectM('bronze', new THREE.BoxGeometry(1.56, 1.11, 0.02), back);
    [[-0.5], [0.5]].forEach(function (lx) {
      var leg = new THREE.Matrix4().makeRotationY(face);
      leg.setPosition(SX, 0, SZ);
      leg.multiply(new THREE.Matrix4().makeTranslation(lx[0], 0.44, 0.06));
      collectM('dark', new THREE.CylinderGeometry(0.028, 0.034, 0.88, 8), leg);
    });
    /* the ivory board itself - gently backlit so it reads at night */
    var introTex = introTexture();
    var board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.05),
      new THREE.MeshStandardMaterial({ map: introTex, emissive: 0xffffff, emissiveMap: introTex, emissiveIntensity: 0.38, roughness: 0.85, metalness: 0.0 })
    );
    board.rotation.order = 'YXZ';
    board.rotation.set(TILT, face, 0);
    board.position.set(SX, 1.28, SZ);
    scene.add(board);
    /* soft contact shadow */
    var ssh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.6, depthWrite: false }));
    ssh.rotation.x = -Math.PI / 2;
    ssh.position.set(SX, 0.013, SZ);
    scene.add(ssh);
    /* clickable */
    var hit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.1, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(SX, 1.05, SZ);
    hit.rotation.y = face;
    hit.userData.art = {
      title: 'ברוכים הבאים', tag: 'המוזיאון של אורבו', self: true,
      body: 'במקום תיק עבודות - בנינו מקום. כל מה שסביבכם נוצר אצלנו בקוד: האולם, השמיים, הכוכב, והציורים שנצבעים ממש עכשיו בזמן שאתם מסתכלים. ארבע העמדות במרכז מציגות מה אנחנו בונים, ועל הקירות תחנות 01-14 עם קייסים ותצוגות יכולת. לחיצה על כל מוצג פותחת הסבר. סיור נעים.',
      link: null
    };
    scene.add(hit);
    pickables.push(hit);
    standCollide = { x: SX, z: SZ, r: 0.7 };
  })();

  /* a fixed pool of six spots serves whichever pieces are nearest.
     the light COUNT never changes, so the standard materials keep one
     compiled program - and six spots cost roughly half of eleven on
     every lit pixel. beyond ~9m a spot's falloff is spent anyway. */
  var spotPool = [];
  if (!isTouch) {
    for (var spi = 0; spi < 6; spi++) {
      var pooled = new THREE.SpotLight(0xfff0dc, 16, 9, 0.5, 0.6, 1.5);
      scene.add(pooled);
      scene.add(pooled.target);
      spotPool.push(pooled);
    }
  }
  function assignSpots() {
    if (!spotPool.length) return;
    var order = [];
    for (var i = 0; i < ART.length; i++) {
      var a = ART[i];
      if (a._spotFrom) order.push([a._spotTo.distanceToSquared(pos), a]);
    }
    order.sort(function (x, y) { return x[0] - y[0]; });
    for (var k = 0; k < spotPool.length; k++) {
      var s = spotPool[k];
      if (order[k]) {
        s.intensity = 16;
        s.position.copy(order[k][1]._spotFrom);
        s.target.position.copy(order[k][1]._spotTo);
      } else {
        s.intensity = 0;
      }
    }
  }

  /* everything static is now collected - bake it down to one mesh per
     material, and let the heavy one-time art renders stream in */
  bakeStatic();
  runDeferredArt();

  /* ---------- player ---------- */
  var yaw = 0;    /* enter facing down the hall, toward the finale */
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
  yaw = 0;
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
    if (!started || isTouch || panelOpen || browsing) return;
    if (!locked) { requestLock(); return; }
    /* a screen with the real site inside opens for browsing */
    if (hoverArt && hoverArt._live && hoverArt._live.embedActive) { enterBrowse(); return; }
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
      if (window.ORBO_SOUND) ORBO_SOUND.sfx('hover');
      if (art._live && art._live.embedActive) {
        showHint('זה האתר האמיתי, רץ בתוך המסך - לחצו כדי לגלוש בו');
      } else {
        showHint(isTouch ? 'הקישו לפרטים' : '״' + art.title + '״ - לחצו לפרטים');
      }
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
    if (window.ORBO_SOUND) ORBO_SOUND.sfx('open');
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
    if (window.ORBO_SOUND) ORBO_SOUND.sfx('close');
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    if (relock && !isTouch) requestLock();
  }
  panelResume.addEventListener('click', function () { closePanel(true); });
  panelClose.addEventListener('click', function () { closePanel(true); });
  addEventListener('keydown', function (e) {
    if (e.code === 'Escape' && panelOpen) closePanel(false);
    else if (e.code === 'Escape' && browsing) exitBrowse(true);
  });

  /* ---------- entry ---------- */
  enterBtn.addEventListener('click', function () {
    if (window.ORBO_SOUND) {
      ORBO_SOUND.start();      /* the gesture that wakes the hall's score */
      ORBO_SOUND.sfx('enter');
    }
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
      showHint(isTouch ? 'ג׳ויסטיק בצד - תנועה · גרירה - להסתכל' : 'W A S D - תנועה · עכבר - להסתכל', 4200);
    }, reduced ? 300 : 2200);
  });

  /* ---------- movement & collisions ---------- */
  var fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), wish = new THREE.Vector3();
  var pedCollide = pedestalDefs.map(function (d) { return { x: d.x, z: d.z, r: 0.92 }; });
  if (standCollide) pedCollide.push(standCollide);

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
    if (!panelOpen && !browsing) {
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

  /* ---------- living paintings ----------
     a painted frame is a full canvas redraw plus a GPU texture upload,
     so ration them hard: every 3rd frame, only pieces actually inside
     the view frustum and within 12m, and of those the two nearest -
     plus a rotation so nothing ever freezes. every painting watches
     the visitor: the gaze point on the canvas feeds mx/my. */
  var liveTick = 0;
  var liveFrustum = new THREE.Frustum();
  var liveProj = new THREE.Matrix4();
  var liveSphere = new THREE.Sphere(new THREE.Vector3(), 1.8);
  var liveWp = new THREE.Vector3();
  var gazeRay = new THREE.Raycaster();

  /* ---------- GPU painters: FLUX's shaders, hung on the wall ----------
     JULIA and MOSAIC render on a dedicated WebGL2 canvas with the same
     fragment programs that power the FLUX room (orbit-trap julia, true-
     border voronoi), recolored for the hall's violet. the 2D canvases
     become plain blits. CPU versions below remain as fallback. */
  var GLP = (function () {
    var cv2 = document.createElement('canvas');
    cv2.width = 512;
    cv2.height = 320;
    var gl;
    try { gl = cv2.getContext('webgl2', { antialias: false, depth: false, alpha: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    var VERT = [
      '#version 300 es',
      'void main(){',
      '  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);',
      '  gl_Position = vec4(p, 0.0, 1.0);',
      '}'
    ].join('\n');
    var JULIA_FS = [
      '#version 300 es',
      '// FLUX 003 JULIA - escape-time fractal with orbit traps, hall palette',
      'precision highp float;',
      'uniform float u_time;',
      'uniform vec2 u_mouse;',
      'uniform vec2 u_resolution;',
      'out vec4 fragColor;',
      'void main(){',
      '  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);',
      '  vec2 z = uv * 1.4;',
      '  float t = u_time * 0.12;',
      '  vec2 c = vec2(-0.78, 0.155) + vec2(0.095 * cos(t), 0.060 * sin(t * 1.6)) + (u_mouse - 0.5) * 0.06;',
      '  float trapP = 1e5;',
      '  float trapL = 1e5;',
      '  float n = 0.0;',
      '  bool escaped = false;',
      '  for (int i = 0; i < 150; i++){',
      '    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;',
      '    trapP = min(trapP, length(z - vec2(0.0, 0.66)));',
      '    trapL = min(trapL, abs(z.x));',
      '    if (dot(z, z) > 64.0){ escaped = true; break; }',
      '    n += 1.0;',
      '  }',
      '  float sn = escaped ? n - log2(log2(dot(z, z))) + 4.0 : n;',
      '  float g = clamp(sn / 150.0, 0.0, 1.0);',
      '  vec3 col = vec3(0.012, 0.010, 0.026);',
      '  col += vec3(0.78, 0.76, 0.95) * exp(-2.6 * trapL) * 0.45;',
      '  col += vec3(0.56, 0.44, 1.0) * exp(-3.2 * trapP) * 0.95;',
      '  if (escaped){',
      '    col += vec3(0.72, 0.66, 0.92) * pow(g, 1.6);',
      '    col += vec3(0.05, 0.045, 0.08) * (0.5 + 0.5 * cos(6.28318 * sn * 0.35));',
      '  }',
      '  col *= 1.0 - 0.30 * dot(uv, uv);',
      '  fragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');
    var CELLS_FS = [
      '#version 300 es',
      '// FLUX 006 CELLS - animated voronoi with true border distance, hall palette',
      'precision highp float;',
      'uniform float u_time;',
      'uniform vec2 u_mouse;',
      'uniform vec2 u_resolution;',
      'out vec4 fragColor;',
      'vec2 hash2(vec2 p){',
      '  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));',
      '  return fract(sin(p) * 43758.5453);',
      '}',
      'void main(){',
      '  float mn = min(u_resolution.x, u_resolution.y);',
      '  vec2 p = gl_FragCoord.xy / mn * 5.5;',
      '  vec2 mpt = u_mouse * u_resolution / mn * 5.5;',
      '  vec2 n = floor(p), f = fract(p);',
      '  vec2 mg = vec2(0.0), mr = vec2(0.0), mid = vec2(0.0);',
      '  float md = 8.0;',
      '  for (int j = -1; j <= 1; j++)',
      '  for (int i = -1; i <= 1; i++){',
      '    vec2 g = vec2(float(i), float(j));',
      '    vec2 id = n + g;',
      '    vec2 o = 0.5 + 0.42 * sin(u_time * 0.8 + 6.28318 * hash2(id));',
      '    vec2 r = g + o - f;',
      '    float d = dot(r, r);',
      '    if (d < md){ md = d; mr = r; mg = g; mid = id; }',
      '  }',
      '  float ed = 8.0;',
      '  for (int j = -2; j <= 2; j++)',
      '  for (int i = -2; i <= 2; i++){',
      '    vec2 g = mg + vec2(float(i), float(j));',
      '    vec2 id = n + g;',
      '    vec2 o = 0.5 + 0.42 * sin(u_time * 0.8 + 6.28318 * hash2(id));',
      '    vec2 r = g + o - f;',
      '    if (dot(mr - r, mr - r) > 0.00001)',
      '      ed = min(ed, dot(0.5 * (mr + r), normalize(r - mr)));',
      '  }',
      '  float idh = hash2(mid + 31.7).x;',
      '  float pulse = 0.5 + 0.5 * sin(u_time * 1.6 + idh * 6.28318);',
      '  vec3 col = vec3(0.022, 0.019, 0.042) + vec3(0.05, 0.045, 0.09) * pulse;',
      '  float marked = step(0.88, idh);',
      '  col = mix(col, vec3(0.56, 0.44, 1.0) * (0.25 + 0.45 * pulse), marked * 0.85);',
      '  float edge = 1.0 - smoothstep(0.0, 0.045, ed);',
      '  col += vec3(0.88, 0.86, 0.98) * edge;',
      '  col += vec3(0.95) * (1.0 - smoothstep(0.02, 0.05, length(mr))) * 0.9;',
      '  float dm = length(p - mpt);',
      '  col += vec3(0.62, 0.5, 1.0) * edge * exp(-dm * 1.1) * 0.9;',
      '  fragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');
    function prog(src) {
      function sh(type, s2) {
        var s = gl.createShader(type);
        gl.shaderSource(s, s2);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      }
      var v = sh(gl.VERTEX_SHADER, VERT);
      var f = sh(gl.FRAGMENT_SHADER, src);
      if (!v || !f) return null;
      var p = gl.createProgram();
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
      return { p: p, t: gl.getUniformLocation(p, 'u_time'), m: gl.getUniformLocation(p, 'u_mouse'), r: gl.getUniformLocation(p, 'u_resolution') };
    }
    var programs = { julia: prog(JULIA_FS), cells: prog(CELLS_FS) };
    if (!programs.julia || !programs.cells) return null;
    gl.viewport(0, 0, 512, 320);
    return {
      render: function (kind, t, mx, my) {
        var P = programs[kind];
        if (!P) return null;
        gl.useProgram(P.p);
        gl.uniform1f(P.t, t);
        gl.uniform2f(P.m, mx, 1 - my);
        gl.uniform2f(P.r, 512, 320);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return cv2;
      }
    };
  })();

  /* museum-local live painters (kinds ORBO_LAB doesn't know):
     the generative pieces, reborn as slow-breathing living works */
  var LOCAL_LIVE = {
    /* MOSAIC - FLUX's living voronoi: seeds orbit inside their cells,
       true-width walls, walls ignite under the gaze. GPU when we have
       it; the CPU recolor below is the fallback. */
    mosaic: function (s) {
      if (GLP) {
        var srcM = GLP.render('cells', s.t, s.mx === undefined ? 0.5 : s.mx, s.my === undefined ? 0.5 : s.my);
        if (srcM) { s.ctx.drawImage(srcM, 0, 0, s.w, s.h); return; }
      }
      var w = s.w, h = s.h, c = s.ctx;
      if (!s.cache) {
        var N = 46;
        var palette = [[26, 20, 44], [40, 30, 70], [58, 44, 108], [91, 76, 245], [157, 140, 255], [255, 176, 128], [22, 17, 36]];
        var pts = [];
        for (var i = 0; i < N; i++) pts.push([Math.random() * w, Math.random() * h, i % palette.length, Math.random() * 6.28]);
        var idx = new Uint8Array(w * h);
        var edge = new Float32Array(w * h);
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var d1 = 1e9, d2 = 1e9, ki = 0;
            for (var k = 0; k < N; k++) {
              var dx = x - pts[k][0], dy = y - pts[k][1];
              var d = dx * dx + dy * dy;
              if (d < d1) { d2 = d1; d1 = d; ki = k; }
              else if (d < d2) { d2 = d; }
            }
            var o = y * w + x;
            idx[o] = ki;
            edge[o] = Math.min((Math.sqrt(d2) - Math.sqrt(d1)) / 6, 1);
          }
        }
        s.cache = { pts: pts, palette: palette, idx: idx, edge: edge, img: c.createImageData(w, h), cols: new Float32Array(N * 3) };
      }
      var C = s.cache;
      var gx = (s.mx === undefined ? 0.5 : s.mx) * w, gy = (s.my === undefined ? 0.5 : s.my) * h;
      for (var k2 = 0; k2 < C.pts.length; k2++) {
        var P2 = C.palette[C.pts[k2][2]];
        var breathe = 0.72 + 0.3 * Math.sin(s.t * 0.9 + C.pts[k2][3]);
        var gd = 1 - Math.min(1, Math.hypot(C.pts[k2][0] - gx, C.pts[k2][1] - gy) / (w * 0.3));
        var boost = breathe + gd * gd * 0.9;
        C.cols[k2 * 3] = Math.min(255, P2[0] * boost);
        C.cols[k2 * 3 + 1] = Math.min(255, P2[1] * boost);
        C.cols[k2 * 3 + 2] = Math.min(255, P2[2] * boost);
      }
      var dd = C.img.data;
      for (var o2 = 0; o2 < C.idx.length; o2++) {
        var ci = C.idx[o2] * 3, e = C.edge[o2], b = o2 * 4;
        dd[b] = C.cols[ci] * e;
        dd[b + 1] = C.cols[ci + 1] * e;
        dd[b + 2] = C.cols[ci + 2] * e;
        dd[b + 3] = 255;
      }
      c.putImageData(C.img, 0, 0);
    },
    /* GENESIS - the field keeps growing: old strokes sink into the
       linen while fresh lines spring from wherever you look */
    genesis: function (s) {
      var w = s.w, h = s.h, c = s.ctx;
      var cols = ['rgba(157, 140, 255,', 'rgba(255, 176, 128,', 'rgba(120, 170, 255,', 'rgba(201, 175, 255,'];
      if (!s.cache) {
        c.fillStyle = '#0e0a18';
        c.fillRect(0, 0, w, h);
        s.cache = { born: 0 };
      }
      c.fillStyle = 'rgba(14, 10, 24, 0.03)';
      c.fillRect(0, 0, w, h);
      var gx = (s.mx === undefined ? 0.5 : s.mx) * w, gy = (s.my === undefined ? 0.5 : s.my) * h;
      var burst = s.cache.born < 40 ? 12 : 5;   /* thick first growth, then a steady pulse */
      s.cache.born++;
      for (var p = 0; p < burst; p++) {
        var x = gx + (Math.random() - 0.5) * w * 0.5;
        var y = gy + (Math.random() - 0.5) * h * 0.5;
        c.beginPath();
        c.moveTo(x, y);
        for (var seg = 0; seg < 60; seg++) {
          var a = noise(x * 0.008, y * 0.008) * Math.PI * 4;
          x += Math.cos(a) * 3;
          y += Math.sin(a) * 3;
          c.lineTo(x, y);
        }
        c.strokeStyle = cols[(Math.random() * 4) | 0] + (0.15 + Math.random() * 0.18) + ')';
        c.lineWidth = 1.1;
        c.stroke();
      }
    },
    /* JULIA - FLUX's orbit-trap julia: c orbits the seahorse valley so
       the whole set MORPHS, filaments glow, the gaze nudges c. GPU when
       we have it; the cached CPU recolor below is the fallback. */
    julia: function (s) {
      if (GLP) {
        var srcJ = GLP.render('julia', s.t, s.mx === undefined ? 0.5 : s.mx, s.my === undefined ? 0.5 : s.my);
        if (srcJ) { s.ctx.drawImage(srcJ, 0, 0, s.w, s.h); return; }
      }
      var w = s.w, h = s.h, c = s.ctx;
      if (!s.cache) {
        var cr = -0.79, ci2 = 0.15;
        var it = new Float32Array(w * h);
        var br = new Uint8Array(w * h), bgc = new Uint8Array(w * h), bb = new Uint8Array(w * h);
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var zr = (x - w / 2) / (h * 0.42), zi = (y - h / 2) / (h * 0.42);
            var n2 = 0, max = 70;
            while (n2 < max && zr * zr + zi * zi < 4) {
              var tt = zr * zr - zi * zi + cr;
              zi = 2 * zr * zi + ci2;
              zr = tt;
              n2++;
            }
            var o0 = y * w + x;
            if (n2 === max) {
              it[o0] = -1;
            } else {
              var f0 = n2 / max;
              it[o0] = f0;
              br[o0] = 20 + 200 * Math.pow(f0, 1.6);
              bgc[o0] = 14 + 130 * Math.pow(f0, 2.1);
              bb[o0] = 40 + 215 * Math.pow(f0, 0.9);
            }
          }
        }
        s.cache = { it: it, br: br, bg: bgc, bb: bb, img: c.createImageData(w, h) };
      }
      var C = s.cache;
      /* a slow revolve of the palette + a bright wave riding the bands */
      var m1 = 0.5 + 0.5 * Math.sin(s.t * 0.5);
      var m2 = 0.5 + 0.5 * Math.sin(s.t * 0.5 + 2.1);
      var wt = s.t * 2.4;
      var gx = (s.mx === undefined ? 0.5 : s.mx) * w, gy = (s.my === undefined ? 0.5 : s.my) * h;
      var rad2 = (w * 0.3) * (w * 0.3);
      var dd = C.img.data;
      for (var o = 0, yy = 0; yy < h; yy++) {
        var dy2 = (yy - gy) * (yy - gy);
        for (var xx = 0; xx < w; xx++, o++) {
          var b = o * 4;
          var f = C.it[o];
          if (f < 0) {
            dd[b] = 12; dd[b + 1] = 9; dd[b + 2] = 22;
          } else {
            var dx2 = (xx - gx) * (xx - gx);
            var gb = 1 + Math.max(0, 1 - (dx2 + dy2) / rad2) * 0.7;
            var wave = (0.62 + 0.5 * Math.sin(f * 14 - wt)) * gb;
            var r0 = C.br[o], g0 = C.bg[o], b0 = C.bb[o];
            /* revolve: channels borrow from each other over time */
            var rr2 = (r0 * (1 - m1 * 0.5) + b0 * m1 * 0.5) * wave;
            var gg2 = (g0 * (1 - m2 * 0.4) + r0 * m2 * 0.4) * wave;
            var bb2 = (b0 * (1 - m1 * 0.3) + g0 * m1 * 0.3) * wave;
            dd[b] = rr2 > 255 ? 255 : rr2;
            dd[b + 1] = gg2 > 255 ? 255 : gg2;
            dd[b + 2] = bb2 > 255 ? 255 : bb2;
          }
          dd[b + 3] = 255;
        }
      }
      c.putImageData(C.img, 0, 0);
    }
  };

  function paintOne(L, adv) {
    L.t += adv;
    if (!L.state) L.state = { ctx: L.art, w: L.w, h: L.h, seed: L.seed, mx: 0.5, my: 0.5 };
    L.state.t = L.t;
    /* attention: gazed-at pieces track the exact look point; the rest
       wander gently so they read alive from any distance */
    var tx = L._gx === undefined ? 0.5 + Math.sin(L.t * 0.23) * 0.3 : L._gx;
    var ty = L._gy === undefined ? 0.5 + Math.sin(L.t * 0.17 + 2) * 0.25 : L._gy;
    L.state.mx += (tx - L.state.mx) * 0.14;
    L.state.my += (ty - L.state.my) * 0.14;
    (ORBO_LAB.draw[L.kind] || LOCAL_LIVE[L.kind])(L.state);
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
  var liveIdle = 0;
  function paintLive(dt) {
    liveTick++;
    if (liveTick % 3) return;
    liveProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    liveFrustum.setFromProjectionMatrix(liveProj);
    var near1 = null, near2 = null, d1 = 1e9, d2 = 1e9;
    for (var i = 0; i < liveArts.length; i++) {
      var L = liveArts[i];
      L.plane.getWorldPosition(liveWp);
      L._d = liveWp.distanceTo(pos);
      L._gx = undefined;
      L._gy = undefined;
      if (L.embedActive) continue;   /* the real site is on this wall now */
      if (L._d > 12) continue;
      liveSphere.center.copy(liveWp);
      if (!liveFrustum.intersectsSphere(liveSphere)) continue;
      if (L._d < d1) { d2 = d1; near2 = near1; d1 = L._d; near1 = L; }
      else if (L._d < d2) { d2 = L._d; near2 = L; }
    }
    /* where exactly is the visitor looking on the nearest canvases? */
    [near1, near2].forEach(function (L) {
      if (!L) return;
      gazeRay.setFromCamera({ x: 0, y: 0 }, camera);
      var hit = gazeRay.intersectObject(L.plane, false);
      if (hit.length && hit[0].uv) {
        L._gx = hit[0].uv.x;
        L._gy = 1 - hit[0].uv.y;
      }
    });
    /* dt*3 keeps on-canvas speed steady at the sparser paint rate */
    if (near1) paintOne(near1, dt * 3 * (1 + Math.max(0, 1 - d1 / 9) * 1.25));
    if (near2) paintOne(near2, dt * 3 * (1 + Math.max(0, 1 - d2 / 9) * 1.25));
    /* two more paintings refresh in rotation every tick, so EVERY canvas
       in the hall visibly lives - a museum where nothing moves is a
       museum of posters */
    var rotated = 0;
    for (var k = 0; k < liveArts.length && rotated < 2; k++) {
      liveIdle = (liveIdle + 1) % liveArts.length;
      var IL = liveArts[liveIdle];
      if (IL !== near1 && IL !== near2 && IL._d < 26) {
        paintOne(IL, dt * 3 * liveArts.length * 0.3);
        rotated++;
      }
    }
  }
  /* warm-up: run each living canvas to a fully developed image behind the
     entry overlay - FLUX needs dozens of frames to accumulate its trails,
     the others settle in a few */
  liveArts.forEach(function (L, i) {
    setTimeout(function () {
      var warm = L.kind === 'flux' ? 46 : L.kind === 'genesis' ? 34 : 6;
      for (var w = 0; w < warm; w++) paintOne(L, 0.05);
    }, 450 + i * 130);
  });

  /* ---------- living display screens tick ----------
     same rationing as the paintings, on the OTHER third of frames:
     the two nearest on-screen displays run full rate, one more
     refreshes in rotation so every screen in the hall stays alive */
  var dispIdle = 0;
  function paintDisplays(dt) {
    if (liveTick % 3 !== 1) return;
    var near1 = null, near2 = null, d1 = 1e9, d2 = 1e9;
    for (var i = 0; i < liveDisplays.length; i++) {
      var L = liveDisplays[i];
      L.plane.getWorldPosition(liveWp);
      L._d = liveWp.distanceTo(pos);
      if (L._d > 12) continue;
      liveSphere.center.copy(liveWp);
      if (!liveFrustum.intersectsSphere(liveSphere)) continue;
      if (L._d < d1) { d2 = d1; near2 = near1; d1 = L._d; near1 = L; }
      else if (L._d < d2) { d2 = L._d; near2 = L; }
    }
    if (near1) paintDisplayOverlay(near1, dt * 3);
    if (near2) paintDisplayOverlay(near2, dt * 3);
    for (var k = 0; k < liveDisplays.length; k++) {
      dispIdle = (dispIdle + 1) % liveDisplays.length;
      var IL = liveDisplays[dispIdle];
      if (IL !== near1 && IL !== near2 && IL._d < 26) {
        paintDisplayOverlay(IL, dt * 3 * liveDisplays.length * 0.5);
        break;
      }
    }
  }
  /* first frame for every overlay so the CTA is there from the start */
  liveDisplays.forEach(function (L, i) {
    setTimeout(function () { paintDisplayOverlay(L, 0.001); }, 500 + i * 90);
  });

  /* ---------- real sites inside the frames ----------
     walk up to a lab painting on desktop and the ACTUAL site mounts
     inside its frame: the wall punches a transparent hole and a live
     iframe, held in place by a CSS 3D camera that mirrors the museum
     camera, shows through. click the screen to browse the real site
     on the wall; ESC (or the return pill) resumes the tour.
     one screen at a time; phones keep the painted versions. */
  var screenLayer = document.getElementById('screenLayer');
  var screenCam = document.getElementById('screenCam');
  var screenExit = document.getElementById('screenExit');
  var SCREEN_PPU = 340;                    /* css px per world unit */
  var punchMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  var activeScreen = null;
  var browsing = false;
  var screenClock = 0;
  var canEmbed = !isTouch && !reduced && screenLayer && screenCam && window.CSS && CSS.supports && CSS.supports('transform-style', 'preserve-3d');

  function ep(v) { return Math.abs(v) < 1e-10 ? 0 : v; }
  function cameraCSSMatrix(m) {
    var e = m.elements;
    return 'matrix3d(' + ep(e[0]) + ',' + ep(-e[1]) + ',' + ep(e[2]) + ',' + ep(e[3]) + ',' +
      ep(e[4]) + ',' + ep(-e[5]) + ',' + ep(e[6]) + ',' + ep(e[7]) + ',' +
      ep(e[8]) + ',' + ep(-e[9]) + ',' + ep(e[10]) + ',' + ep(e[11]) + ',' +
      ep(e[12]) + ',' + ep(-e[13]) + ',' + ep(e[14]) + ',' + ep(e[15]) + ')';
  }
  function objectCSSMatrix(m) {
    var e = m.elements;
    return 'translate(-50%,-50%)matrix3d(' + ep(e[0]) + ',' + ep(e[1]) + ',' + ep(e[2]) + ',' + ep(e[3]) + ',' +
      ep(-e[4]) + ',' + ep(-e[5]) + ',' + ep(-e[6]) + ',' + ep(-e[7]) + ',' +
      ep(e[8]) + ',' + ep(e[9]) + ',' + ep(e[10]) + ',' + ep(e[11]) + ',' +
      ep(e[12]) + ',' + ep(e[13]) + ',' + ep(e[14]) + ',' + ep(e[15]) + ')';
  }
  function syncScreenCamera() {
    if (!activeScreen) return;
    var hh = innerHeight / 2;
    var fovPx = camera.projectionMatrix.elements[5] * hh;
    screenLayer.style.perspective = fovPx + 'px';
    camera.updateMatrixWorld();
    screenCam.style.transform = 'translateZ(' + fovPx + 'px)' + cameraCSSMatrix(camera.matrixWorldInverse) +
      'translate(' + (innerWidth / 2) + 'px,' + hh + 'px)';
  }
  function mountScreen(L) {
    var el = document.createElement('div');
    el.className = 'screen-obj';
    el.style.width = Math.round(L.embedW * SCREEN_PPU) + 'px';
    el.style.height = Math.round(L.embedH * SCREEN_PPU) + 'px';
    var m = L.embedMatrix.clone();
    m.multiply(new THREE.Matrix4().makeScale(1 / SCREEN_PPU, 1 / SCREEN_PPU, 1 / SCREEN_PPU));
    el.style.transform = objectCSSMatrix(m);
    var fr = document.createElement('iframe');
    fr.src = L.embedUrl;
    fr.loading = 'eager';
    fr.title = L.artDef.title;
    el.appendChild(fr);
    screenCam.appendChild(el);
    L._screenEl = el;
    L.embedActive = true;
    /* the wall opens: depth-only material punches the hole first */
    L._origMat = L.plane.material;
    L.plane.material = punchMat;
    L.plane.renderOrder = -2;
    activeScreen = L;
    syncScreenCamera();
  }
  function unmountScreen() {
    if (!activeScreen) return;
    var L = activeScreen;
    if (browsing) exitBrowse(false);
    L.plane.material = L._origMat;
    L.plane.renderOrder = 0;
    L.embedActive = false;
    if (L._screenEl) {
      screenCam.removeChild(L._screenEl);
      L._screenEl = null;
    }
    activeScreen = null;
  }
  function tickScreens(dt) {
    if (!canEmbed) return;
    screenClock += dt;
    if (screenClock < 0.3) return;
    screenClock = 0;
    if (browsing) return;                     /* never swap under the visitor */
    var best = null, bd = 1e9;
    /* the screen the visitor is LOOKING at wins; otherwise the nearest */
    if (hoverArt && hoverArt._live && hoverArt._live.embedUrl && hoverArt._live._d !== undefined && hoverArt._live._d < 5.5) {
      best = hoverArt._live;
    } else {
      for (var i = 0; i < liveArts.length; i++) {
        var L = liveArts[i];
        if (!L.embedUrl || L._d === undefined) continue;
        if (L._d < 5 && L._d < bd) { bd = L._d; best = L; }
      }
    }
    if (activeScreen && (activeScreen._d === undefined || activeScreen._d > 6.5)) unmountScreen();
    if (best && best !== activeScreen) {
      unmountScreen();
      mountScreen(best);
    }
  }
  function enterBrowse() {
    if (!activeScreen) return;
    browsing = true;
    if (window.ORBO_SOUND) ORBO_SOUND.sfx('browse');
    document.body.classList.add('browsing');
    screenExit.hidden = false;
    if (locked && document.exitPointerLock) document.exitPointerLock();
    showHint('אתם בתוך האתר האמיתי - גלשו חופשי. ESC או הכפתור למעלה מחזירים לסיור', 5200);
  }
  function exitBrowse(relock) {
    browsing = false;
    if (window.ORBO_SOUND) ORBO_SOUND.sfx('browseExit');
    document.body.classList.remove('browsing');
    screenExit.hidden = true;
    hintWrap.classList.remove('show');
    if (relock && !isTouch) requestLock();
  }
  if (screenExit) screenExit.addEventListener('click', function () { exitBrowse(true); });

  /* ---------- holograms tick ---------- */
  function tickHolograms(t, dt) {
    for (var i = 0; i < holograms.length; i++) {
      var h = holograms[i];
      var u = h.userData;
      u.excite = Math.max(0, u.excite - dt * 0.8);
      var prox = Math.max(0, 1 - h.position.distanceTo(pos) / 6);
      var ex = Math.min(1, u.excite + prox * 0.55);
      u.core.rotation.y += dt * (u.spin + ex * (u.exciteSpin || 3.2));
      u.core.position.y = Math.sin(t * 0.9 + i * 1.7) * 0.05;
      var flick = 1 + ex * 0.28 + (reduced ? 0 : Math.sin(t * (u.flickFreq || 13) + i * 3) * (u.flickAmp || 0.02));
      u.core.scale.setScalar(flick);
      u.aura.lookAt(pos.x, h.position.y, pos.z);
      u.aura.material.opacity = 0.5 + ex * 0.4;
      /* the brand star's extra life: precessing rings, orbiting dust,
         a heart that breathes */
      if (u.tilts) {
        u.tilts[0].rotation.y += dt * (0.2 + ex * 0.5);
        u.tilts[1].rotation.y -= dt * (0.14 + ex * 0.35);
      }
      if (u.particles) {
        u.particles[0].rotation.y += dt * (0.1 + ex * 0.55);
        u.particles[1].rotation.y -= dt * (0.05 + ex * 0.3);
      }
      if (u.coreGlow) {
        u.coreGlow.material.opacity = 0.72 + (reduced ? 0 : Math.sin(t * 1.3) * 0.16) + ex * 0.28;
        u.fillMat.opacity = 0.13 + (reduced ? 0 : Math.sin(t * 1.3 + 0.9) * 0.04) + ex * 0.2;
      }
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
  var spotClock = 1;   /* >0.5 so the pool is parked on the first frame */
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    step(dt);
    spotClock += dt;
    if (spotClock > 0.5) { spotClock = 0; assignSpots(); }
    paintLive(dt);
    paintDisplays(dt);
    tickScreens(dt);
    if (activeScreen) syncScreenCamera();
    tickHolograms(t, dt);
    tickReactive(t, dt);

    for (var i = 0; i < billboards.length; i++) {
      billboards[i].lookAt(pos.x, billboards[i].position.y, pos.z);
    }

    if (!reduced) {
      for (var fg = 0; fg < fogLayers.length; fg++) {
        var F = fogLayers[fg];
        F.tex.offset.x += F.sx * dt * 60 * 0.016;
        F.tex.offset.y += F.sy * dt * 60 * 0.016;
        F.mesh.material.opacity = F.base + Math.sin(t * 0.4 + fg * 2.1) * F.base * 0.35;
      }
      if (doorGlowMat) doorGlowMat.opacity = 0.45 + Math.sin(t * 1.1) * 0.18;
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
    if (activeScreen) syncScreenCamera();
  });
  setTimeout(function () {
    if (!renderer.domElement.width && innerWidth) {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    }
  }, 600);

  /* QA handle - read-only peek at the world, plus a manual tick so
     probes can drive frames even while the tab reports hidden */
  window.__GALLERY = {
    renderer: renderer, scene: scene, camera: camera,
    pickables: pickables, liveArts: liveArts, holograms: holograms,
    pos: pos,
    tick: function (dt) {
      dt = dt || 1 / 60;
      var t = clock.elapsedTime + dt;
      clock.elapsedTime = t;
      step(dt);
      assignSpots();
      paintLive(dt);
      paintDisplays(dt);
      tickScreens(dt);
      if (activeScreen) syncScreenCamera();
      tickHolograms(t, dt);
      tickReactive(t, dt);
      renderer.render(scene, camera);
    },
    setPlayer: function (x, z, newYaw) {
      pos.x = x; pos.z = z;
      if (typeof newYaw === 'number') yaw = newYaw;
      applyCamera();
    },
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
