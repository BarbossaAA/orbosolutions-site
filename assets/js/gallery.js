/* ORBO — the gallery.
   A walkable 3D museum for the studio's work, built on three.js.
   One long night-lit hall: polished floor, plaster walls, light coves,
   framed pieces under spotlights. Sites and systems hang as backlit
   posters; the five lab experiments hang as LIVING paintings, painted
   every frame by the shared ORBO_LAB engine (work-gl.js).
   Desktop: pointer-lock + WASD. Touch: joystick + drag-look + tap.
   No assets — every texture is drawn in code. */
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

  /* touch visitors get touch instructions on the door */
  if (isTouch) {
    var ek = document.getElementById('enterKeys');
    if (ek) ek.innerHTML = '<span><b>ג׳ויסטיק</b> בצד — תנועה</span><span><b>גרירה</b> — להסתכל</span><span><b>הקשה</b> על יצירה — פרטים</span>';
  }

  /* make sure the Hebrew display weights are in before posters are painted */
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
  renderer.toneMappingExposure = 1.12;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0810);
  scene.fog = new THREE.Fog(0x0a0810, 20, 52);

  var camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 90);
  camera.rotation.order = 'YXZ';

  /* ---------- hall dimensions ---------- */
  var HALL = { w: 13, l: 46, h: 5 };        /* x: ±6.5, z: ±23 */
  var EYE = 1.65;
  var BOUND = { x: 5.3, zMin: -21.4, zMax: 21.4 };

  /* ---------- environment reflections (PMREM from a tiny emissive room) ---------- */
  (function buildEnv() {
    var env = new THREE.Scene();
    var mk = function (color, w, h, x, y, z, ry) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.y = ry || 0;
      env.add(m);
    };
    env.background = new THREE.Color(0x05040a);
    mk(0x6f5fd6, 14, 2, 0, 5, -6);          /* violet glow ahead */
    mk(0x2c2542, 20, 3, 0, 6, 8, Math.PI);  /* dim behind */
    mk(0xffb080, 3, 1.4, -7, 3, 0, Math.PI / 2);  /* warm side accents */
    mk(0x3fa8d8, 3, 1.4, 7, 3, 0, -Math.PI / 2);
    mk(0x181226, 30, 30, 0, -4, 0);         /* dark floor bounce */
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
  })();

  /* ---------- canvas texture helpers ---------- */
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

  /* fine plaster noise for the walls */
  function plasterTexture() {
    var c = ctx2d(256, 256);
    c.fillStyle = '#241f33';
    c.fillRect(0, 0, 256, 256);
    var img = c.getImageData(0, 0, 256, 256);
    for (var i = 0; i < img.data.length; i += 4) {
      var n = (Math.random() - 0.5) * 12;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n + 2;
    }
    c.putImageData(img, 0, 0);
    var t = asTexture(c.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 2);
    return t;
  }

  /* soft radial gradient sprite (glows, pools, blob shadows) */
  function radialTexture(inner, outer) {
    var c = ctx2d(256, 256);
    var g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    return asTexture(c.canvas);
  }

  /* the star mark, drawn once for reuse on posters */
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

  /* backlit poster for sites & systems */
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

  /* wall plaque beside each piece */
  function plaqueTexture(art) {
    var W = 512, H = 256;
    var c = ctx2d(W, H);
    var redraw = function () {
      c.fillStyle = '#161226';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(157, 140, 255, 0.35)';
      c.lineWidth = 3;
      c.strokeRect(8, 8, W - 16, H - 16);
      c.textAlign = 'right';
      c.direction = 'rtl';
      c.fillStyle = '#F4F2FA';
      c.font = '700 44px ' + FONT;
      c.fillText(art.title, W - 42, 96, W - 84);
      c.fillStyle = 'rgba(201, 175, 255, 0.85)';
      c.font = '500 30px ' + FONT;
      c.fillText(art.tag, W - 42, 158, W - 84);
    };
    redraw();
    var t = asTexture(c.canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { redraw(); t.needsUpdate = true; });
    return t;
  }

  /* faint painted wing titles on the walls */
  function wingTexture(text) {
    var c = ctx2d(1024, 256);
    var redraw = function () {
      c.clearRect(0, 0, 1024, 256);
      c.textAlign = 'center';
      c.direction = 'rtl';
      c.fillStyle = 'rgba(157, 140, 255, 0.30)';
      c.font = '850 150px ' + FONT;
      c.fillText(text, 512, 178);
    };
    redraw();
    var t = asTexture(c.canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { redraw(); t.needsUpdate = true; });
    return t;
  }

  /* ---------- the hall ---------- */
  var wallMat = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.94, metalness: 0.0 });
  var floorMat = new THREE.MeshStandardMaterial({ color: 0x17141f, roughness: 0.24, metalness: 0.5, envMapIntensity: 1.15 });
  var ceilMat = new THREE.MeshStandardMaterial({ color: 0x120f1c, roughness: 0.9, metalness: 0.0 });
  var trimMat = new THREE.MeshStandardMaterial({ color: 0x0c0a13, roughness: 0.6, metalness: 0.3 });

  var floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.l), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  var ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.l), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = HALL.h;
  scene.add(ceil);

  function wall(w, h, x, y, z, ry) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    /* baseboard */
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.05), trimMat);
    b.position.set(x, 0.07, z);
    b.rotation.y = ry;
    b.translateZ(0.02);
    scene.add(b);
    return m;
  }
  wall(HALL.l, HALL.h, -HALL.w / 2, HALL.h / 2, 0, Math.PI / 2);    /* left */
  wall(HALL.l, HALL.h, HALL.w / 2, HALL.h / 2, 0, -Math.PI / 2);    /* right */
  wall(HALL.w, HALL.h, 0, HALL.h / 2, -HALL.l / 2, 0);              /* far */
  wall(HALL.w, HALL.h, 0, HALL.h / 2, HALL.l / 2, Math.PI);         /* entry */

  /* ceiling light coves: two emissive runners the floor loves to reflect */
  var coveMat = new THREE.MeshBasicMaterial({ color: 0x8474e8 });
  [-3.6, 3.6].forEach(function (x) {
    var cove = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, HALL.l - 3), coveMat);
    cove.position.set(x, HALL.h - 0.06, 0);
    scene.add(cove);
  });
  /* a faint doorway glow on the entry wall — something to see when you turn around */
  var door = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 3.4),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(157, 140, 255, 0.5)', 'rgba(157, 140, 255, 0)'), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  door.position.set(0, 1.8, HALL.l / 2 - 0.05);
  door.rotation.y = Math.PI;
  scene.add(door);

  /* base lights */
  scene.add(new THREE.AmbientLight(0x9a8ecf, 0.32));
  var hemi = new THREE.HemisphereLight(0x6a5fae, 0x0d0b14, 0.35);
  scene.add(hemi);
  [18, 9, 0, -9, -18].forEach(function (z, i) {
    var p = new THREE.PointLight(i % 2 ? 0xb7a6ff : 0xffd9bd, 14, 16, 1.7);
    p.position.set(0, HALL.h - 0.5, z);
    scene.add(p);
  });

  /* benches with blob shadows */
  var benchMat = new THREE.MeshStandardMaterial({ color: 0x241e33, roughness: 0.55, metalness: 0.15 });
  var blobTex = radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
  var benches = [];
  [8, -4].forEach(function (z) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.42, 0.58), benchMat);
    b.position.set(0, 0.21, z);
    scene.add(b);
    var s = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.5), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(0, 0.012, z);
    scene.add(s);
    benches.push({ x: 0, z: z, hx: 1.35, hz: 0.65 });
  });

  /* floating dust */
  var dust = null;
  (function () {
    var N = 230;
    var pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (HALL.w - 1.5);
      pos[i * 3 + 1] = Math.random() * (HALL.h - 0.6) + 0.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * (HALL.l - 2);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xa79aff, size: 0.02, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(dust);
  })();

  /* wing titles */
  function wingTitle(text, x, z, ry) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.1),
      new THREE.MeshBasicMaterial({ map: wingTexture(text), transparent: true, depthWrite: false })
    );
    m.position.set(x, 3.95, z);
    m.rotation.y = ry;
    scene.add(m);
  }
  var LX = -HALL.w / 2 + 0.04, RX = HALL.w / 2 - 0.04;
  wingTitle('האתרים', LX, 18.6, Math.PI / 2);
  wingTitle('המערכות', RX, 18.6, -Math.PI / 2);
  wingTitle('המעבדה', LX, -3.3, Math.PI / 2);
  wingTitle('המעבדה', RX, -3.3, -Math.PI / 2);

  /* ---------- the collection ---------- */
  var ART = [
    /* left wall — sites, then lab */
    { id: 'erez', wall: 'L', z: 15, title: 'ארז אגזוזים', tag: 'אתר · באוויר', style: 'light', sub: 'אתר תדמית למוסך בראשון לציון', domain: 'erezegzozim.com', link: 'https://erezegzozim.com',
      body: 'מוסך למערכות פליטה שרצה אתר עם נוכחות. צילמנו את המוסך עצמו לפתיח וידאו, הוספנו כלי שעוזר ללקוח לזהות את התקלה לפי הסאונד, והובלנו הכול לכפתור וואטסאפ אחד.' },
    { id: 'bisomna', wall: 'L', z: 8, title: 'BISOMNA', tag: 'אתר מיזם · באוויר', style: 'light', sub: 'אתר למיזם שינה ישראלי', domain: 'bisomna.com', link: 'https://bisomna.com',
      body: 'אתר רחב למיזם בתחום השינה — מוצר, מדע, חנות ומשקיעים. וידאו שנע יחד עם הגלילה, תצוגת מוצר שנפתחת לשכבות, והכול נשאר מהיר גם בנייד.' },
    { id: 'orbo', wall: 'L', z: 1, title: 'orbosolutions.com', tag: 'הבית שלנו', style: 'dark', sub: 'דף הבית של הסטודיו', domain: 'orbosolutions.com', link: 'index.html', self: true,
      body: 'דף הבית שלנו הוא מסע: גוללים, והמצלמה עפה דרך עולם של חלקיקים שמתגבשים לצורות. בנוי כולו בקוד, בלי אף קובץ תמונה.' },
    { id: 'aurora', wall: 'L', z: -7, live: 'aurora', title: 'AURORA', tag: 'ניסוי מעבדה · חי', link: 'lab/01-aurora-gsap/',
      body: 'סרטי אור שנעים עם הגלילה. היצירה שעל הקיר מצוירת ממש עכשיו, בזמן אמת — כמו כל יצירות המעבדה בחדר הזה.' },
    { id: 'nebula', wall: 'L', z: -14, live: 'nebula', title: 'NEBULA', tag: 'ניסוי מעבדה · חי', link: 'lab/02-nebula-three/',
      body: 'גלקסיה של חלקיקים שמסתחררת לאט. בגרסה המלאה גוללים לתוך מרכז הגלקסיה.' },
    { id: 'prism', wall: 'L', z: -20, live: 'prism', title: 'PRISM', tag: 'ניסוי מעבדה · חי', link: 'lab/03-prism-r3f/',
      body: 'אלומת אור שנשברת דרך גאומטריה ומתפצלת לספקטרום. בגרסה המלאה — חדר חומרים תלת־ממדי שלם.' },
    /* right wall — systems, then lab */
    { id: 'royal', wall: 'R', z: 15, title: 'Royal Tattoo Supply', tag: 'חנות · עבודת לקוח', style: 'light', sub: 'חנות אינטרנטית ליבואן ציוד',
      body: 'חנות אינטרנטית ליבואן ציוד קעקועים — קטלוג מוצרים, מבצעים, סליקה ותשלום מהיר מהנייד.' },
    { id: 'leadforge', wall: 'R', z: 8, title: 'LeadForge', tag: 'מערכת · פיתוח פנימי', style: 'light', sub: 'לידים, מכירות והצעות מחיר',
      body: 'מערכת שעוזרת לעסק קטן לרכז את הלידים, המכירות והצעות המחיר במקום אחד — במקום בוואטסאפ ובאקסל.' },
    { id: 'flowdesk', wall: 'R', z: 1, title: 'FlowDesk', tag: 'מערכת · פיתוח פנימי', style: 'light', sub: 'בק־אופיס לעסקי שירות',
      body: 'בק־אופיס לעסקי שירות — מלווה את הלקוח מהפנייה הראשונה ועד הצעת המחיר והחשבונית.' },
    { id: 'castmark', wall: 'R', z: -7, title: 'CastMark', tag: 'כלי · פיתוח פנימי', style: 'light', sub: 'מפודקאסט לתקציר ופרקים',
      body: 'כלי שמקבל פרק פודקאסט ומחזיר תקציר, נקודות עיקריות וחלוקה לפרקים. חוסך שעות עריכה.' },
    { id: 'flux', wall: 'R', z: -14, live: 'flux', title: 'FLUX', tag: 'ניסוי מעבדה · חי', link: 'lab/04-flux-shaders/',
      body: 'שדות צבע שזורמים על המסך לפי כללים מתמטיים. בגרסה המלאה — שישה שדות שונים.' },
    { id: 'terra', wall: 'R', z: -20, live: 'terra', title: 'TERRA', tag: 'ניסוי מעבדה · חי', link: 'lab/05-terra-webgl/',
      body: 'נופים שנוצרים ממתמטיקה טהורה — אף אחד לא צייר אותם, הם מחושבים. בגרסה המלאה גולשים ביניהם.' },
    /* far wall — the emblem */
    { id: 'star', wall: 'F', z: -HALL.l / 2, title: 'ORBO', tag: 'הסטודיו', style: 'dark', big: true, sub: 'רעיונות יש לכולם. אנחנו הופכים אותם למציאות.',
      body: 'תודה שביקרתם בגלריה. אם משהו כאן הדליק לכם רעיון — נשמח לשמוע עליו.', contact: true }
  ];

  var glowTex = radialTexture('rgba(140, 120, 255, 0.55)', 'rgba(140, 120, 255, 0)');
  var poolTex = radialTexture('rgba(255, 225, 195, 0.16)', 'rgba(255, 225, 195, 0)');
  var frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.35, metalness: 0.75, envMapIntensity: 1.1 });

  var pickables = [];   /* artwork planes for raycasting */
  var liveArts = [];    /* living paintings to repaint */

  ART.forEach(function (art) {
    var group = new THREE.Group();
    var W = art.big ? 2.5 : 2.6, H = art.big ? 2.5 : 1.625;

    if (art.wall === 'L') { group.position.set(LX, 0, art.z); group.rotation.y = Math.PI / 2; }
    else if (art.wall === 'R') { group.position.set(RX, 0, art.z); group.rotation.y = -Math.PI / 2; }
    else { group.position.set(0, 0, -HALL.l / 2 + 0.04); }

    /* back-glow halo */
    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 1.55, H * 1.75),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.position.set(0, 1.95, 0.015);
    group.add(glow);

    /* frame */
    var d = 0.07, th = 0.075, off = 0.09;
    [[0, 1.95 + H / 2 + th / 2, W + th * 2, th], [0, 1.95 - H / 2 - th / 2, W + th * 2, th]].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(s[2], s[3], d), frameMat);
      m.position.set(s[0], s[1], off - d / 2);
      group.add(m);
    });
    [[-W / 2 - th / 2, 1.95], [W / 2 + th / 2, 1.95]].forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(th, H, d), frameMat);
      m.position.set(s[0], s[1], off - d / 2);
      group.add(m);
    });

    /* the canvas itself */
    var tex, liveState = null;
    if (art.live && window.ORBO_LAB) {
      var aw = 640, ah = 400;
      var artC = ctx2d(aw, ah);
      var texC = ctx2d(aw, ah);
      liveState = { kind: art.live, art: artC, tex: texC, w: aw, h: ah, t: Math.random() * 60, seed: ORBO_LAB.makeSeed(art.live, aw, ah) };
      texC.fillStyle = '#0F0D18';
      texC.fillRect(0, 0, aw, ah);
      tex = asTexture(texC.canvas);
    } else {
      tex = posterTexture(art);
    }
    var planeMat = new THREE.MeshBasicMaterial({ map: tex });
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), planeMat);
    plane.position.set(0, 1.95, off + 0.001);
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

    /* plaque beside the piece (not for the emblem) */
    if (!art.big) {
      var plq = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.31),
        new THREE.MeshBasicMaterial({ map: plaqueTexture(art) })
      );
      plq.position.set(W / 2 + 0.62, 1.32, 0.02);
      group.add(plq);
    }

    /* warm pool of light on the floor */
    var pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.014, 0);
    var pWorld = new THREE.Vector3(0, 0, 0).applyEuler(group.rotation).add(group.position);
    pool.position.set(pWorld.x + (art.wall === 'L' ? 1.1 : art.wall === 'R' ? -1.1 : 0), 0.014, pWorld.z + (art.wall === 'F' ? 1.1 : 0));
    scene.add(pool);

    /* real spotlight on desktop for the wall gradient */
    if (!isTouch) {
      var sp = new THREE.SpotLight(0xffe9d6, 26, 9, 0.62, 0.65, 1.4);
      var sWorld = new THREE.Vector3(0, HALL.h - 0.35, 1.6).applyEuler(group.rotation).add(group.position);
      sp.position.copy(sWorld);
      var tWorld = new THREE.Vector3(0, 1.9, 0).applyEuler(group.rotation).add(group.position);
      sp.target.position.copy(tWorld);
      scene.add(sp);
      scene.add(sp.target);
      /* the housing */
      var hs = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.16, 10), trimMat);
      hs.position.copy(sWorld);
      hs.position.y = HALL.h - 0.1;
      scene.add(hs);
    }

    scene.add(group);
  });

  /* ---------- player ---------- */
  var yaw = Math.PI;            /* face the hall: looking toward -z means yaw 0; we START at +z end looking in */
  var pitch = 0;
  var pos = new THREE.Vector3(0, EYE, 19.8);
  var vel = new THREE.Vector3();
  var keys = {};
  var running = false;
  var bobPhase = 0;
  var started = false;
  var glide = null;

  /* camera faces -z at yaw=0; our start is at +z looking toward -z, so yaw starts at 0 */
  yaw = 0;

  function applyCamera() {
    camera.position.copy(pos);
    camera.rotation.set(pitch, yaw, 0);
  }

  /* intro framing before entry */
  pos.set(0, 2.6, 22.2);
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
  raycaster.far = 7;
  var hoverArt = null;
  var panelOpen = false;
  var hintTimer = null;

  function showHint(text, ms) {
    hintText.textContent = text;
    hintWrap.classList.add('show');
    clearTimeout(hintTimer);
    if (ms) hintTimer = setTimeout(function () { hintWrap.classList.remove('show'); }, ms);
  }

  function pickCenter() {
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    var hits = raycaster.intersectObjects(pickables, false);
    var art = null;
    if (hits.length && hits[0].distance < 5.2) art = hits[0].object.userData.art;
    if (art !== hoverArt) {
      if (hoverArt) hoverArt._glow.material.opacity = 0.34;
      hoverArt = art;
      if (art) {
        art._glow.material.opacity = 0.62;
        crosshair.classList.add('hot');
        showHint(isTouch ? 'הקישו על היצירה לפרטים' : '״' + art.title + '״ — לחצו לפרטים');
      } else {
        crosshair.classList.remove('hot');
        hintWrap.classList.remove('show');
      }
    }
  }

  function tapPick(x, y) {
    var ndc = { x: (x / innerWidth) * 2 - 1, y: -(y / innerHeight) * 2 + 1 };
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(pickables, false);
    if (hits.length && hits[0].distance < 7) openPanel(hits[0].object.userData.art);
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
      panelLink.textContent = art.self ? 'לדף הבית' : 'לצפייה חיה';
      if (art.self) panelLink.removeAttribute('target'); else panelLink.setAttribute('target', '_blank');
      panelLink.href = art.link;
    } else {
      panelLink.hidden = true;
    }
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
      pos.set(0, EYE, 19.8);
      pitch = 0;
    } else {
      glide = { t: 0, dur: 1.9, fromP: pos.clone(), toP: new THREE.Vector3(0, EYE, 19.8), fromPitch: pitch, toPitch: 0 };
    }
    requestLock();
    setTimeout(function () {
      showHint(isTouch ? 'ג׳ויסטיק בצד — תנועה · גרירה — להסתכל' : 'W A S D — תנועה · עכבר — להסתכל', 4200);
    }, reduced ? 300 : 2100);
  });

  /* ---------- movement & collisions ---------- */
  var fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), wish = new THREE.Vector3();

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
    var speed = running ? 4.1 : 2.5;
    wish.multiplyScalar(speed);
    var s = 1 - Math.exp(-10 * dt);
    vel.lerp(wish, s);
    pos.addScaledVector(vel, dt);

    /* hall bounds */
    pos.x = Math.max(-BOUND.x, Math.min(BOUND.x, pos.x));
    pos.z = Math.max(BOUND.zMin, Math.min(BOUND.zMax, pos.z));
    /* benches */
    for (var i = 0; i < benches.length; i++) {
      var b = benches[i];
      var dx = pos.x - b.x, dz = pos.z - b.z;
      if (Math.abs(dx) < b.hx && Math.abs(dz) < b.hz) {
        if (b.hx - Math.abs(dx) < b.hz - Math.abs(dz)) pos.x = b.x + (dx > 0 ? b.hx : -b.hx);
        else pos.z = b.z + (dz > 0 ? b.hz : -b.hz);
      }
    }

    /* head bob */
    var sp2 = vel.length();
    if (!reduced && sp2 > 0.4) bobPhase += dt * sp2 * 3.4;
    pos.y = EYE + (reduced ? 0 : Math.sin(bobPhase * 2) * 0.028 * Math.min(sp2 / 2.5, 1));

    applyCamera();
  }

  /* ---------- living paintings ---------- */
  var liveTick = 0;
  function paintLive(dt) {
    liveTick++;
    if (liveTick % 2) return;              /* ~30fps is plenty for oil paint */
    for (var i = 0; i < liveArts.length; i++) {
      var L = liveArts[i];
      /* only pieces near the visitor get fresh paint */
      var wp = L.plane.getWorldPosition(new THREE.Vector3());
      if (wp.distanceTo(pos) > 15) continue;
      L.t += dt * 2;
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

  /* ---------- loop ---------- */
  var clock = new THREE.Clock();
  var pickTick = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    var dt = Math.min(clock.getDelta(), 0.05);

    step(dt);
    paintLive(dt);

    if (dust && !reduced) {
      dust.rotation.y += dt * 0.006;
      dust.position.y = Math.sin(clock.elapsedTime * 0.18) * 0.06;
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

  /* QA handle — read-only peek at the world (harmless in production) */
  window.__GALLERY = {
    renderer: renderer, scene: scene, camera: camera,
    pickables: pickables, liveArts: liveArts,
    pos: pos,
    state: function () {
      return {
        started: started, locked: locked, panelOpen: panelOpen,
        pos: { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2) },
        yaw: +yaw.toFixed(2), artworks: pickables.length, living: liveArts.length,
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles
      };
    }
  };
})();
