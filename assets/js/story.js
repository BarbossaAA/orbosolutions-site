/* LUMEN Studio — the scroll story, V5.1 (three.js).
   The particles ARE the subject. Every hero visual is the SAME liquid
   swarm poured into a new formation — free dust -> the LUMEN star ->
   a rushing river -> six brand icons (browser / phone / lattice /
   neural web / controller / lifebuoy) -> an orbit system -> four
   process gates -> the giant portal star, which forms as the final
   words arrive and HOLDS to the end of the scroll (V5.1 directive:
   no burst, no second star — the story finishes ON the star).
   Formations are procedural point-samplings of icon strokes; each leg of
   the journey morphs aFrom -> aTo (scrub-safe in both directions, holds
   at each side of a leg, wide per-mote stagger so motes travel as
   INDIVIDUALS, not as one mass — V5.1 de-blob directive).
   Liquid comes from the V4 GPGPU sim (offset+velocity ping-pong FBOs,
   underdamped spring + cursor splash) plus divergence-free curl noise in
   the velocity pass; V5.1 moves the curl energy into finer, seed-offset
   octaves so neighbouring motes stop agreeing (individual wander, no
   coherent slosh), and calms the autonomous camera sway.
   V5.1 GPU adaptation: the renderer string + memory/core hints classify
   the machine ONCE at startup and size the swarm to it (three tiers);
   a finer down-only governor sheds smoke -> DPR steps -> swarm thinning
   (shuffled index draw-range, so thinning is an even sprinkle).
   Rendering: motes use a runtime-BAKED sprite texture (one lookup
   replaces per-fragment falloff math; a bright nucleus makes each mote
   read as an individual point of light), and the tone curve + gamma
   moved from the fragment to the vertex shader (color is flat per point).
   White studio world (per client direction the background stays light).
   Progressive enhancement: static site by default; html.story-live only
   after successful WebGL init.
   V5.2 (same-day user directive "glowing self-responsive individuals"):
   stronger colors (near-pure accents, tint no longer swallows them),
   brighter sprite nucleus + bigger points + per-mote glow twinkle, and
   the cursor splash rebuilt per-mote (personal reach/gain/lag/swirl —
   everyone responds, each differently; no stamped circular dent). The
   mouse-parallax camera pan is cut to a whisper: hover response lives
   in the particles, not in the screen.
   V5.3 (2026-07-16 directive "individuals across the WHOLE scroll,
   neon colors, sharp particles, sharper icons"): dustHome rebuilt —
   personal departure + duration + curved detour per mote (no group
   wave anywhere in the journey); neon palette (electric cyan/orange/
   hot pink) + post-tone-curve re-saturation; SHARP sprite (crisp AA
   disc + whisper halo, the gaussian skirt was the blur) + sub-pixel
   size floor; DPR cap now tier-based up to 2.0 (the flat 1.5 cap
   upscaled ~33% on HiDPI = blur); formed motes wobble/twinkle half
   as much so sculptures stand crisp.
   V5.4 (2026-07-16 directive "EVERY particle reactive to the mouse in
   each and every moment — a reactive universe taking shapes, not a
   reactive blob in the middle"): the cursor interaction is REBUILT as
   a ray-brush — the pointer is a ray through the world, every mote
   reacts by perpendicular distance to it with depth-scaled (angular)
   reach, so reactivity is uniform across the whole screen at every
   depth; a constant HOVER presence force works even when the mouse
   rests (speed only adds splash); halo dust spread as a full-frame
   starfield. Palette reverted to the pre-V5.3 muted accents (same-day
   directive: "colors like before").
   QA: ?storyp=<p> pin, ?nofbo=1 fallback, ?gputier=<0|1|2> tier pin.
   Software GL (e.g. Edge --use-angle=swiftshader) classifies as tier 0;
   modern headless Edge may use the REAL GPU — always pin gputier in
   screenshot harnesses so shots are deterministic either way. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = document.getElementById('storyCanvas');
  var track = document.querySelector('.story-track');
  var beatsWrap = document.querySelector('.story-beats');
  if (!canvas || !track || !beatsWrap) return;
  if (reduced || !window.THREE) return;

  var THREE = window.THREE;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) { return; }
  if (!renderer) return;

  var mobile = innerWidth < 768;

  /* ------------------------------------------------------------
     GPU TIER — classify the machine once, BEFORE any budget is set,
     so the swarm AND the render resolution are sized to the GPU it
     will actually run on. 0 = software / very weak, 1 = weak
     integrated, 2 = capable. The governor still sheds down-only
     from whatever we pick here. ?gputier=<n> pins the tier (QA: pin
     it in screenshot harnesses — software GL classifies as tier 0,
     hardware headless as tier 2).
     ------------------------------------------------------------ */
  var gpuTier = (function () {
    var pin = /[?&]gputier=([0-2])/.exec(location.search);
    if (pin) return parseInt(pin[1], 10);
    var str = '';
    try {
      var gl = renderer.getContext();
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) str = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    } catch (e) { }
    str = str.toLowerCase();
    var mem = navigator.deviceMemory || 8;       /* hints; absent -> assume ok */
    var cores = navigator.hardwareConcurrency || 8;
    if (/swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic/.test(str)) return 0;
    if (mem <= 2 || cores <= 2) return 0;
    /* real Adreno strings read 'Adreno (TM) 640' — the separator between
       the name and the model number must stay flexible */
    var dedicated = /nvidia|geforce|rtx|gtx|quadro|radeon|\brx\b|apple (m\d|gpu)|adreno[^0-9]*[67]\d\d|mali-g[67]\d/.test(str);
    var weakIntegrated = /intel[^]*\b(hd|uhd)\b|adreno[^0-9]*[1-5]\d\d\b|mali-[t4]|videocore|powervr/.test(str);
    if (weakIntegrated && !dedicated) return 1;
    if (!str && (mem <= 4 || cores <= 4)) return 1; /* masked string + weak hints */
    return 2;
  })();

  /* render resolution by tier (V5.3 sharpness directive): the old flat
     1.5 cap upscaled ~33% on HiDPI screens — every mote read as BLUR.
     Capable GPUs now render native up to DPR 2.0; the governor's DPR
     ladder starts from here and can shed it right back down. */
  var DPR_CAP = mobile
    ? (gpuTier === 2 ? 1.5 : 1.25)
    : (gpuTier === 2 ? 2.0 : gpuTier === 1 ? 1.5 : 1.25);
  var DPR = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  /* base mote size (multiplied by DPR wherever uSize is written) */
  var SIZE0 = mobile ? 1.5 : 1.8;
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight, false);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xfafaf9, 0.010);
  var camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 400);

  /* V5.4: palette REVERTED to the pre-V5.3 set (user 2026-07-16: "I want
     the colors like before, I don't like the V5.3 colors") — the muted
     warm accents are the brand voice; the neon electric set is dead. */
  var INK = new THREE.Color(0x14121f), VIOLET = new THREE.Color(0x6c5cff),
      DEEP = new THREE.Color(0x5b3df0), PEACH = new THREE.Color(0xff8f4d),
      CYAN = new THREE.Color(0x2f9fd8), ROSE = new THREE.Color(0xe8548f);
  function mixColor(a, b, t) { return a.clone().lerp(b, t); }

  /* narrow-aspect staging (QA): at 390×844 the half-frustum at icon depth
     (~23u) is only ~5.8 world units, so the desktop stations x=±6.2 put the
     icon CENTER off-screen. On phones the icons pull toward center, rise
     above the text column, and shrink so the whole stroke fits; the camera
     weave flips to arc TOWARD the icon side. Formations are built once from
     the load-time aspect (a rotation mid-story keeps the load-time staging). */
  var narrow = innerWidth / innerHeight < 0.8;
  var ICON_X = narrow ? 2.0 : 6.2;
  var ICON_Y = narrow ? 4.2 : 0.6;
  var ICON_S = narrow ? 3.6 : 5.2;

  /* the visible half-frame at sculpture depth (~23u ahead of the camera;
     load-time aspect, same convention as the icon staging above; ×1.06
     covers the ±1.1u camera weave) — the SKY half of the halo dust is
     scattered uniformly across this, so every screen column holds
     living motes for the ray-brush (V5.4 reactive-universe directive) */
  var SKY_T = Math.tan(camera.fov * Math.PI / 360) * 23;
  var SKY_HW = SKY_T * camera.aspect * 1.06;
  var SKY_HH = SKY_T * 1.06;

  /* ============================================================
     SIM DETECTION — float render-target support (V4, unchanged)
     ============================================================ */
  var forceNoSim = /[?&]nofbo=1/.test(location.search);

  function detectSim() {
    if (forceNoSim) return null;
    if (renderer.capabilities.maxVertexTextures < 1) return null;
    var gl2 = renderer.capabilities.isWebGL2;
    if (!gl2 && !renderer.extensions.get('OES_texture_float')) return null;
    function rtOpts(type) {
      return {
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat, type: type,
        depthBuffer: false, stencilBuffer: false
      };
    }
    function testType(type) {
      var rt = new THREE.WebGLRenderTarget(4, 4, rtOpts(type));
      renderer.setRenderTarget(rt);
      var gl = renderer.getContext();
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      renderer.setRenderTarget(null);
      rt.dispose();
      return ok;
    }
    var type = null;
    if (testType(THREE.FloatType)) type = THREE.FloatType;
    else if (testType(THREE.HalfFloatType)) type = THREE.HalfFloatType;
    if (!type) return null;
    /* sim texture side by GPU tier: the swarm budget IS W*H */
    var W = mobile
      ? (gpuTier >= 1 ? 160 : 128)
      : (gpuTier === 2 ? 256 : gpuTier === 1 ? 208 : 144);
    return { type: type, W: W, H: W, rtOpts: rtOpts };
  }
  var simInfo = detectSim();

  var N = simInfo ? simInfo.W * simInfo.H
    : mobile ? (gpuTier >= 1 ? 26000 : 14000)
    : (gpuTier === 2 ? 60000 : gpuTier === 1 ? 43000 : 22000);

  function jit(a) { return (Math.random() - 0.5) * a; }
  /* triangular-ish gaussian */
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 0.667; }

  /* per-mote seeds + the color population. V5.2 (user directive:
     "stronger colors, real individuals"): much less INK dilution — the
     accents stay near-pure so every mote carries a saturated identity;
     a violet-ink core (40%) keeps contrast anchoring on the light bg */
  var aSeed = new Float32Array(N * 3);
  var aCol = new Float32Array(N * 3);
  for (var di = 0; di < N; di++) {
    aSeed[di * 3] = Math.random();
    aSeed[di * 3 + 1] = Math.random();
    aSeed[di * 3 + 2] = Math.random();
    var r = Math.random(), c;
    if (r < 0.40) c = mixColor(INK, VIOLET, 0.35 + Math.random() * 0.65);
    else if (r < 0.62) c = mixColor(VIOLET, DEEP, Math.random());
    else if (r < 0.75) c = mixColor(PEACH, INK, Math.random() * 0.20);
    else if (r < 0.88) c = mixColor(CYAN, INK, Math.random() * 0.20);
    else c = mixColor(ROSE, INK, Math.random() * 0.16);
    aCol[di * 3] = c.r; aCol[di * 3 + 1] = c.g; aCol[di * 3 + 2] = c.b;
  }

  /* ============================================================
     FORMATIONS — every hero visual is a Float32Array(N*3) of world
     positions. Icon formations sample points along stroke polylines
     (the brand icon language); 1-in-8 motes are always "halo dust"
     scattered around the formation so sculptures breathe.
     ============================================================ */
  function isHalo(i) { return (i & 7) === 7; }

  function circlePts(cx, cy, r, n) {
    var pts = [];
    n = n || 30;
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
  }

  /* mark a polyline with a density weight (small features need MORE
     motes per unit length or they blur into the outline) */
  function w(seg, weight) { seg.w = weight; return seg; }

  /* sample N points along a set of polylines (normalized ±1 icon space,
     y up), placed in the world at (x,y,z), scaled s. Allocation is
     proportional to length × weight; placement uses true geometry. */
  function buildIcon(segs, x, y, z, s) {
    var lens = [], total = 0;
    for (var si = 0; si < segs.length; si++) {
      var seg = segs[si], L = 0;
      for (var pi = 1; pi < seg.length; pi++) {
        L += Math.hypot(seg[pi][0] - seg[pi - 1][0], seg[pi][1] - seg[pi - 1][1]);
      }
      var wl = L * (seg.w || 1);
      lens.push(wl);
      total += wl;
    }
    var out = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      if (isHalo(i)) {
        /* V5.4 "reactive universe": halo dust is the STARFIELD. Half
           keeps the gaussian skirt (sculpture breathing); half scatters
           UNIFORMLY across the load-time frustum at icon depth so EVERY
           screen column holds living motes — gauss() has hard ±1
           support, so skirt-only left dead bands at the frame edges
           (QA 2026-07-16) */
        if ((i & 15) === 7) {
          out[i * 3] = x * 0.45 + gauss() * s * 3.1;
          out[i * 3 + 1] = y * 0.7 + gauss() * s * 1.7;
        } else {
          out[i * 3] = (Math.random() * 2 - 1) * SKY_HW;
          out[i * 3 + 1] = (Math.random() * 2 - 1) * SKY_HH;
        }
        out[i * 3 + 2] = z + gauss() * s * 1.3;
        continue;
      }
      var d = Math.random() * total, k = 0;
      while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
      var seg2 = segs[k], px = seg2[0][0], py = seg2[0][1];
      var dg = d / (seg2.w || 1); /* back to geometric distance */
      for (var pj = 1; pj < seg2.length; pj++) {
        var dx = seg2[pj][0] - seg2[pj - 1][0], dy = seg2[pj][1] - seg2[pj - 1][1];
        var l = Math.hypot(dx, dy);
        if (dg <= l || pj === seg2.length - 1) {
          var t = l > 0 ? Math.min(1, dg / l) : 0;
          px = seg2[pj - 1][0] + dx * t;
          py = seg2[pj - 1][1] + dy * t;
          break;
        }
        dg -= l;
      }
      /* stroke thickness + slight depth so lines read as dust, not vectors */
      out[i * 3] = x + px * s + jit(0.055 * s);
      out[i * 3 + 1] = y + py * s + jit(0.055 * s);
      out[i * 3 + 2] = z + jit(0.10 * s);
    }
    return out;
  }

  /* the LUMEN star (edge sampling + inner rings — V4's sampler) */
  var STAR_V = [[16, 3], [18.6, 13.4], [29, 16], [18.6, 18.6], [16, 29], [13.4, 18.6], [3, 16], [13.4, 13.4]];
  function buildStar(x, y, z, s) {
    var out = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      if (isHalo(i)) {
        /* star halo widened too (V5.4 starfield) — sky, not hug */
        out[i * 3] = x + gauss() * s * 2.4;
        out[i * 3 + 1] = y + gauss() * s * 1.9;
        out[i * 3 + 2] = z + gauss() * s * 1.0;
        continue;
      }
      var ring = i % 5;
      var sc = 1 - ring * 0.13;
      var e = Math.floor(Math.random() * STAR_V.length);
      var a = STAR_V[e], b = STAR_V[(e + 1) % STAR_V.length];
      var t = Math.random();
      out[i * 3] = x + (((a[0] + (b[0] - a[0]) * t) - 16) / 13 * sc + jit(0.05)) * s;
      out[i * 3 + 1] = y + ((16 - (a[1] + (b[1] - a[1]) * t)) / 13 * sc + jit(0.05)) * s;
      out[i * 3 + 2] = z + jit(0.09 * s);
    }
    return out;
  }

  /* V5.7 finale gather: EVERY mote — including the halo/sky dust that
     breathes around every other formation — sits IN the piece. The leg
     into this formation is the finale event: the whole visible universe
     streams together into the one made thing. */
  function buildGatherStar(x, y, z, s) {
    var out = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var e = Math.floor(Math.random() * STAR_V.length);
      var a = STAR_V[e], b = STAR_V[(e + 1) % STAR_V.length];
      var t = Math.random();
      /* V5.8 AQUARIUM: area-uniform INTERIOR fill with a hard 12%
         margin — no mote on or past the wall (the star polygon is
         star-shaped around its center, so inward-scaled boundary
         samples always stay inside). */
      var r = Math.sqrt(Math.random()) * 0.88;
      out[i * 3] = x + ((a[0] + (b[0] - a[0]) * t) - 16) / 13 * r * s;
      out[i * 3 + 1] = y + (16 - (a[1] + (b[1] - a[1]) * t)) / 13 * r * s;
      /* V5.13 (user: "really INSIDE, 3D, containing them — not
         floating at the borders"): spread through the solid's whole
         thickness (extrude 1.1 + bevel 0.85 each side ≈ 2.8u) */
      out[i * 3 + 2] = z + jit(1.15);
    }
    return out;
  }

  /* loose cloud (the opening drift) */
  function buildCloud(cx, cy, cz, sx, sy, sz) {
    var out = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      out[i * 3] = cx + gauss() * sx;
      out[i * 3 + 1] = cy + gauss() * sy;
      out[i * 3 + 2] = cz + gauss() * sz;
    }
    return out;
  }

  /* the way: a sinuous particle river the camera flies inside */
  function buildRiver() {
    var out = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var t = i / N;
      var z = -28 - t * 145 + jit(6);
      var ang = z * 0.30 + aSeed[i * 3] * 0.9;
      var rad = 5.5 + 2.2 * Math.sin(z * 0.11);
      var x = Math.cos(ang) * rad * 1.25 + Math.sin(z * 0.045) * 3.0;
      var y = Math.sin(ang) * rad * 0.55;
      out[i * 3] = x + jit(1.4);
      out[i * 3 + 1] = y + jit(1.0);
      out[i * 3 + 2] = z;
    }
    return out;
  }

  /* orbit system: three tilted rings + core + satellites */
  function buildOrbit(cx, cy, cz) {
    var rings = [
      { R: 7.0, rx: Math.PI / 2 - 0.5, rz: 0.0 },
      { R: 9.5, rx: Math.PI / 2 - 0.9, rz: 0.4 },
      { R: 12.0, rx: Math.PI / 2 - 0.35, rz: -0.7 }
    ];
    var out = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var x, y, z;
      var pick = i % 20;
      if (isHalo(i)) {
        x = gauss() * 15; y = gauss() * 8; z = gauss() * 12;
      } else if (pick < 4) {                      /* core */
        x = gauss() * 1.8; y = gauss() * 1.8; z = gauss() * 1.8;
      } else if (pick < 6) {                      /* satellites */
        var rg0 = rings[i % 3];
        var sa = (i % 3) * 2.1 + 0.7;
        var sx = Math.cos(sa) * rg0.R, sy = Math.sin(sa) * rg0.R, sz = 0;
        var y1 = sy * Math.cos(rg0.rx) - sz * Math.sin(rg0.rx);
        var z1 = sy * Math.sin(rg0.rx) + sz * Math.cos(rg0.rx);
        var x2 = sx * Math.cos(rg0.rz) - y1 * Math.sin(rg0.rz);
        var y2 = sx * Math.sin(rg0.rz) + y1 * Math.cos(rg0.rz);
        x = x2 + gauss() * 0.55; y = y2 + gauss() * 0.55; z = z1 + gauss() * 0.55;
      } else {                                    /* the rings */
        var rg = rings[i % 3];
        var a = Math.random() * Math.PI * 2;
        var px = Math.cos(a) * rg.R, py = Math.sin(a) * rg.R, pz = jit(0.5);
        var yy = py * Math.cos(rg.rx) - pz * Math.sin(rg.rx);
        var zz = py * Math.sin(rg.rx) + pz * Math.cos(rg.rx);
        var xx = px * Math.cos(rg.rz) - yy * Math.sin(rg.rz);
        var yr = px * Math.sin(rg.rz) + yy * Math.cos(rg.rz);
        x = xx + jit(0.35); y = yr + jit(0.35); z = zz + jit(0.35);
      }
      out[i * 3] = cx + x; out[i * 3 + 1] = cy + y; out[i * 3 + 2] = cz + z;
    }
    return out;
  }

  /* four gates strung along the path, with a faint dust road beneath */
  function buildGates() {
    var gz = [-366, -380, -394, -408];
    var tilt = [0.0, 0.12, -0.12, 0.06];
    var out = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var x, y, z;
      if (isHalo(i)) {
        x = gauss() * 10; y = gauss() * 8; z = -387 + gauss() * 30;
      } else if (i % 12 === 5) {                  /* the road of light */
        x = jit(1.6); y = -4.2 + jit(0.8); z = -360 - Math.random() * 54;
      } else {
        var g = i % 4;
        var a = Math.random() * Math.PI * 2;
        var R = 6.6 + jit(0.5);
        var px = Math.cos(a) * R, py = Math.sin(a) * R;
        x = px * Math.cos(tilt[g]) - py * Math.sin(tilt[g]);
        y = px * Math.sin(tilt[g]) + py * Math.cos(tilt[g]) + 0.6;
        z = gz[g] + jit(0.7);
      }
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    }
    return out;
  }

  /* --- brand icons (normalized ±1, y up — matching the site's SVG set) --- */
  function iconBrowser() {
    return [
      [[-1, -0.72], [1, -0.72], [1, 0.72], [-1, 0.72], [-1, -0.72]],
      [[-1, 0.42], [1, 0.42]],
      w(circlePts(0.72, 0.57, 0.055, 10), 2.4),
      w(circlePts(0.52, 0.57, 0.055, 10), 2.4),
      w([[-0.25, 0.05], [0.45, -0.21], [0.14, -0.33], [0.02, -0.64], [-0.25, 0.05]], 1.5)
    ];
  }
  function iconPhone() {
    return [
      [[-0.44, -1], [0.44, -1], [0.56, -0.88], [0.56, 0.88], [0.44, 1], [-0.44, 1], [-0.56, 0.88], [-0.56, -0.88], [-0.44, -1]],
      w([[-0.12, 0.80], [0.12, 0.80]], 2),
      w([[-0.10, 0.20], [-0.32, 0.0], [-0.10, -0.20]], 2),
      w([[0.10, 0.20], [0.32, 0.0], [0.10, -0.20]], 2),
      w([[-0.11, -0.80], [0.11, -0.80]], 2)
    ];
  }
  /* systems: a clean 3×3 node grid — rows, columns, junction dots */
  function iconLattice() {
    var xs = [-0.85, 0, 0.85], ys = [0.7, 0, -0.7];
    var segs = [];
    for (var r = 0; r < 3; r++) segs.push([[xs[0], ys[r]], [xs[2], ys[r]]]);
    for (var c = 0; c < 3; c++) segs.push([[xs[c], ys[0]], [xs[c], ys[2]]]);
    for (var rr = 0; rr < 3; rr++) {
      for (var cc = 0; cc < 3; cc++) {
        segs.push(w(circlePts(xs[cc], ys[rr], 0.11, 14), 2.2));
      }
    }
    return segs;
  }
  /* AI: five heavy nodes, a light web between them, one sparkle */
  function iconNeural() {
    var A = [0, 0.75], B = [-0.85, 0.15], C = [0.85, 0.2], D = [-0.35, -0.6], E = [0.5, -0.65];
    var segs = [
      w([A, B], 0.7), w([A, C], 0.7), w([B, D], 0.7),
      w([C, E], 0.7), w([D, E], 0.7), w([B, E], 0.55)
    ];
    [A, B, C, D, E].forEach(function (n) { segs.push(w(circlePts(n[0], n[1], 0.14, 16), 2.6)); });
    /* the little AI sparkle */
    segs.push(w([[0.58, 0.92], [0.65, 0.72], [0.85, 0.65], [0.65, 0.58], [0.58, 0.38], [0.51, 0.58], [0.31, 0.65], [0.51, 0.72], [0.58, 0.92]], 1.8));
    return segs;
  }
  /* games: the classic two-grip gamepad silhouette + d-pad + buttons */
  function iconController() {
    return [
      [[-0.8, 0.42], [0.8, 0.42], [0.97, 0.28], [1.02, 0.0], [0.95, -0.3], [0.78, -0.48], [0.6, -0.42], [0.42, -0.26], [-0.42, -0.26], [-0.6, -0.42], [-0.78, -0.48], [-0.95, -0.3], [-1.02, 0.0], [-0.97, 0.28], [-0.8, 0.42]],
      w([[-0.5, -0.14], [-0.5, 0.26]], 2.2),
      w([[-0.7, 0.06], [-0.3, 0.06]], 2.2),
      w(circlePts(0.42, 0.2, 0.085, 12), 2.6),
      w(circlePts(0.66, -0.02, 0.085, 12), 2.6)
    ];
  }
  function iconLifebuoy() {
    var segs = [circlePts(0, 0, 1.0, 44), circlePts(0, 0, 0.45, 26)];
    for (var k = 0; k < 4; k++) {
      var a = Math.PI / 4 + k * Math.PI / 2;
      segs.push([[Math.cos(a) * 0.45, Math.sin(a) * 0.45], [Math.cos(a) * 1.0, Math.sin(a) * 1.0]]);
    }
    return segs;
  }

  /* chapter icon stations: z = camera position at that beat's center
     + ~23 ahead (computed for the V5 camera path — the smoothstep leg
     easing compresses the tail; V3/V4 lesson) */
  var FORMS = [
    { name: 'cloud0', pts: buildCloud(0, 0, -20, 13, 6.5, 16), tint: VIOLET },
    { name: 'star1', pts: buildStar(0, 0.6, -22, 4.4), tint: VIOLET },
    { name: 'river', pts: buildRiver(), tint: DEEP },
    { name: 'browser', pts: buildIcon(iconBrowser(), -ICON_X, ICON_Y, -174, ICON_S), tint: VIOLET },
    { name: 'phone', pts: buildIcon(iconPhone(), ICON_X, ICON_Y, -190.5, ICON_S), tint: CYAN },
    { name: 'lattice', pts: buildIcon(iconLattice(), -ICON_X, ICON_Y, -218.8, ICON_S), tint: PEACH },
    { name: 'neural', pts: buildIcon(iconNeural(), ICON_X, ICON_Y, -251, ICON_S), tint: DEEP },
    { name: 'controller', pts: buildIcon(iconController(), -ICON_X, ICON_Y, -279.6, ICON_S * 1.08), tint: CYAN },
    { name: 'lifebuoy', pts: buildIcon(iconLifebuoy(), ICON_X, ICON_Y, -295.7, ICON_S * 0.88), tint: ROSE },
    /* narrow: drop the dense core below the centered text column (QA) */
    { name: 'orbit', pts: buildOrbit(0, narrow ? -2.5 : 0, -337), tint: VIOLET },
    { name: 'gates', pts: buildGates(), tint: CYAN },
    /* the finale: forms as B10's words arrive and holds to p=1 —
       no burst / second star after it (V5.1 user directive) */
    { name: 'portal', pts: buildStar(0, 0.4, -444, 8.5), tint: VIOLET },
    /* V5.7: then the whole universe gathers onto it (same star, same
       station — the swarm condenses, nothing new appears after) */
    { name: 'gather', pts: buildGatherStar(0, 0.4, -444, 8.5), tint: VIOLET }
  ];

  /* the journey: at each anchor p the swarm is fully formed; between
     anchors it pours (holds ~26% at each side of a leg — see FORM_GLSL).
     Anchors sit on the V5 beat centers. */
  var ANCHORS = [
    { p: 0.000, f: 0 },   /* drifting dust at load            */
    { p: 0.060, f: 1 },   /* converges into the LUMEN star    */
    { p: 0.140, f: 2 },   /* bursts into the river (the way)  */
    { p: 0.2325, f: 3 },  /* 01 browser                       */
    { p: 0.3125, f: 4 },  /* 02 phone                         */
    { p: 0.3925, f: 5 },  /* 03 lattice                       */
    { p: 0.4725, f: 6 },  /* 04 neural web                    */
    { p: 0.5525, f: 7 },  /* 05 controller                    */
    { p: 0.6325, f: 8 },  /* 06 lifebuoy                      */
    { p: 0.7350, f: 9 },  /* orbit — the running business     */
    { p: 0.8400, f: 10 }, /* process gates                    */
    { p: 0.9250, f: 11 }, /* the portal star — B10's arrival    */
    { p: 0.9650, f: 12 }  /* V5.7 in-gathering: every last mote
                             (halo sky included) streams onto
                             the star while it solidifies; legT
                             clamps at 1 past it — HOLDS to end.
                             V5.8: pulled earlier with the solid */
  ];

  /* ============================================================
     GEOMETRY — aFrom/aTo swap per leg (render path needs no vertex
     textures, so the stateless fallback works everywhere)
     ============================================================ */
  var fromArr = new Float32Array(N * 3);
  var toArr = new Float32Array(N * 3);
  fromArr.set(FORMS[ANCHORS[0].f].pts);
  toArr.set(FORMS[ANCHORS[1].f].pts);

  var dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(FORMS[0].pts, 3));
  dustGeo.setAttribute('aFrom', new THREE.BufferAttribute(fromArr, 3));
  dustGeo.setAttribute('aTo', new THREE.BufferAttribute(toArr, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 3));
  dustGeo.setAttribute('aCol', new THREE.BufferAttribute(aCol, 3));
  if (simInfo) {
    var aRef = new Float32Array(N * 2);
    for (var ri = 0; ri < N; ri++) {
      aRef[ri * 2] = ((ri % simInfo.W) + 0.5) / simInfo.W;
      aRef[ri * 2 + 1] = (Math.floor(ri / simInfo.W) + 0.5) / simInfo.H;
    }
    dustGeo.setAttribute('aRef', new THREE.BufferAttribute(aRef, 2));
  }

  /* shuffled index (V5.1): drawing order becomes a random permutation, so
     the governor can thin the swarm with setDrawRange and lose an EVEN
     SPRINKLE from every formation — plain truncation would amputate
     i-indexed structure (the river's far half, whole orbit rings/gates).
     N=65536 needs 32-bit indices (WebGL2 native / OES_element_index_uint). */
  var canThin = false;
  if (N <= 65535 || renderer.capabilities.isWebGL2 || renderer.extensions.get('OES_element_index_uint')) {
    var order = N <= 65535 ? new Uint16Array(N) : new Uint32Array(N);
    for (var oi = 0; oi < N; oi++) order[oi] = oi;
    for (var oj = N - 1; oj > 0; oj--) {
      var osw = (Math.random() * (oj + 1)) | 0;
      var otmp = order[oj]; order[oj] = order[osw]; order[osw] = otmp;
    }
    dustGeo.setIndex(new THREE.BufferAttribute(order, 1));
    canThin = true;
  }

  /* uniforms shared by the render material AND the sim passes —
     same value objects, so one write updates every shader */
  var U = {
    uTime: { value: 0 },
    uDt: { value: 1 },
    uSize: { value: SIZE0 * DPR },
    uRayO: { value: new THREE.Vector3(0, 0, 9999) },
    uRayD: { value: new THREE.Vector3(0, 0, -1) },
    uRayDPrev: { value: new THREE.Vector3(0, 0, -1) },
    uHover: { value: 0 },
    uPush: { value: 0 },
    uLegT: { value: 0 },
    uSolid: { value: 0 },
    uOver: { value: 0 },
    uHand: { value: 0 },
    uDockPos: { value: new THREE.Vector3(0, 0.4, -444) },
    uDockScale: { value: 1 },
    uTintFrom: { value: FORMS[ANCHORS[0].f].tint.clone() },
    uTintTo: { value: FORMS[ANCHORS[1].f].tint.clone() }
  };

  /* the living home of a mote — must be byte-identical between sim and
     render. V5.3 (user directive "every particle on its own from the
     first scroll to the last"): the group-wave is GONE. Each mote owns
     its leg: a PERSONAL departure time (anywhere in the first ~45% of
     the leg), a PERSONAL travel duration, and a PERSONAL curved detour
     off the straight line — no two motes share a schedule or a path.
     The formation is always complete by ~90% of the leg (beat anchors
     still meet a finished sculpture), and formed motes barely wobble
     (V5.3 crispness directive) while in-flight motes fly lively. */
  var FORM_GLSL = [
    'vec3 dustHome(vec3 f, vec3 t, vec3 seed, float time, float legT, out float mm, out float settle){',
    '  float start = 0.06 + seed.y*0.39;',
    '  float end = min(start + 0.25 + seed.z*0.17, 0.90);',
    '  mm = smoothstep(start, end, legT);',
    '  vec3 p = mix(f, t, mm);',
    '  float transit = 4.0*mm*(1.0-mm);',
    '  settle = 1.0 - transit;',
    '  vec3 dir = t - f;',
    '  float span = length(dir) + 0.0001;',
    '  vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(0.0011));',
    '  vec3 up2 = normalize(cross(side, dir / span) + vec3(0.0007));',
    '  float arc = transit * min(span * 0.10, 5.0);',
    '  p += side * ((seed.x - 0.5) * 2.0 * arc) + up2 * ((seed.z - 0.5) * 1.4 * arc);',
    '  float wob = 0.05 + 0.08*seed.x + 0.8*transit;',
    '  p.x += wob*sin(time*0.30 + seed.x*6.283 + p.z*0.05);',
    '  p.y += wob*sin(time*0.26 + seed.y*6.283 + p.x*0.07);',
    '  p.z += wob*sin(time*0.22 + seed.z*6.283);',
    '  return p;',
    '}'
  ].join('\n');

  /* divergence-free curl flow: analytic curl of a trig vector potential —
     this is what makes the pour read as LIQUID instead of jelly */
  var CURL_GLSL = [
    'vec3 curlFlow(vec3 q, float t){',
    '  float c1 = cos(q.y*1.10 + q.z*0.60 + t*0.90);',
    '  float c2 = cos(q.z*0.95 + q.x*0.70 + t*0.70 + 2.1);',
    '  float c3 = cos(q.x*0.85 + q.y*0.75 + t*0.80 + 4.2);',
    '  return vec3(0.75*c3 - 0.95*c2, 0.60*c1 - 0.85*c3, 0.70*c2 - 1.10*c1);',
    '}'
  ].join('\n');

  /* V5.4 — THE CURSOR IS A RAY, NOT A POINT (user 2026-07-16: "every
     particle reactive to the mouse in each and every moment — not a
     single millisecond that even one particle is not reactive; a
     reactive universe, not a blob in the middle").
     The old model unprojected the pointer onto ONE plane 26u ahead and
     measured 3D distance to that point — anything at another depth
     (river tail, gates, halo sky, half the icons) was mathematically
     dead to the mouse, and the whole response was gated by pointer
     SPEED, so a resting mouse meant zero reactivity. Both are gone:
     every mote measures its PERPENDICULAR DISTANCE TO THE POINTER RAY,
     and its reach grows with depth along the ray (a fixed ANGULAR
     brush = the same on-screen radius everywhere, at every depth), so
     the entire visible universe is live under the pointer. `hover` is
     a constant presence force (dimple + slow swirl while the pointer
     merely rests); `push` adds splash energy from pointer speed. The
     V5.2 individuality survives: personal reach/gain/lag/swirl —
     each mote answers on its own terms and springs back home.
     gH/gP are the personal hover/splash gains, gT the personal swirl
     gain (signed by seed) — all folded in at the call site. */
  var RAY_GLSL = [
    'vec3 rayForce(vec3 wp, vec3 seed, vec3 ro, vec3 rd, vec3 rdPrev, float hover, float push, float gH, float gP, float gT){',
    '  vec3 w = wp - ro;',
    '  float t1 = max(dot(w, rd), 3.0);',
    '  vec3 pp1 = w - rd * t1;',
    '  float t2 = max(dot(w, rdPrev), 3.0);',
    '  vec3 pp2 = w - rdPrev * t2;',
    '  float lag = seed.y;',
    /* V5.5 (user: "brush 30% of what we have now"): tight personal
       angular reach ~2.2..4.1deg — an intimate liquid poke, not a wide
       gravity well */
    '  float ang = 0.039 + 0.033*seed.z;',
    '  float f1 = 1.0 - smoothstep(0.0, t1 * ang, length(pp1));',
    '  float f2 = 1.0 - smoothstep(0.0, t2 * ang, length(pp2));',
    '  float ff = mix(f1, f2, lag);',      /* slow reactors chase where the ray WAS */
    '  vec3 dir = normalize(mix(pp1, pp2, lag) + vec3(0.0001));',
    '  vec3 tang = normalize(cross(rd, pp1) + vec3(0.0001));',
    /* V5.5: swirl slowed to a lazy shear (hover 0.5 -> 0.2) — the water
       turns around the finger instead of orbiting it like a gravity blob */
    '  return dir * (ff * (hover * gH + push * gP)) + tang * (ff * (hover * 0.2 + push * 0.6) * gT);',
    '}'
  ].join('\n');

  /* BAKED mote sprite (V5.1, runtime-baked — rule 2 still holds, no
     external files): the old per-fragment length+smoothstep falloff is
     precomputed once into a 64px texture (one lookup per pixel instead
     of math), and a small bright NUCLEUS is baked in so every mote
     reads as an individual point of light instead of merging into fuzz. */
  var moteTex = (function () {
    var S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(S, S);
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var dx = (x + 0.5) / S - 0.5, dy = (y + 0.5) / S - 0.5;
        var d = Math.sqrt(dx * dx + dy * dy);
        /* V5.3 SHARP sprite (user: "particles look blurry"): a crisp
           anti-aliased disc — hard core, thin edge — plus only a whisper
           of neon halo. The old wide gaussian skirt was the blur. */
        var ct = Math.min(1, Math.max(0, (0.34 - d) / 0.10));
        var core = ct * ct * (3 - 2 * ct);
        var h = Math.min(1, Math.max(0, (0.5 - d) / 0.5));
        var halo = h * h * (3 - 2 * h);
        var a = Math.min(1, core + halo * halo * 0.32);
        var o = (y * S + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true; /* 64 = POT: mipmaps kill small-point shimmer */
    tex.needsUpdate = true;
    return tex;
  })();

  /* ShaderMaterial skips three's output transform; the direct path (the
     only path in V5 — no bloom without glass glints) applies the same
     tone curve + gamma the V4 composite used, so dust matches the
     tone-mapped world it used to live in. V5.1: that curve moved to the
     VERTEX shader (color is flat across a point sprite — 65k evals
     instead of millions), so the fragment is one baked-texture lookup. */
  var DUST_FRAG = [
    'uniform sampler2D tMote;',
    'varying vec3 vColor; varying float vA;',
    'void main(){',
    '  float a = texture2D(tMote, gl_PointCoord).a * vA;',
    '  if (a < 0.012) discard;',
    '  gl_FragColor = vec4(vColor, a);',
    '}'
  ].join('\n');

  /* shared vertex-shader tail: color (tone-curved), alpha, size,
     fog-matched decay. V5.2: the chapter tint no longer swallows the
     mote's own color when formed (individuals stay individuals), every
     mote glows on its OWN clock (per-seed twinkle frequency + phase),
     and the size scatter widened — small sparks among big glows */
  var VERT_TAIL = [
    '  vec3 tint = mix(uTintFrom, uTintTo, mm);',
    '  vec3 cc = mix(aCol, tint, 0.14 + 0.24*settle);',
    '  cc = cc / (0.55 + 0.45 * cc);',
    '  vColor = pow(max(cc, vec3(0.0)), vec3(0.4545));',
    /* V5.11 (user directive): inside the hardening star the motes turn
       WHITE — sparkling glass shards, not colored dust */
    '  vColor = mix(vColor, vec3(1.0), uSolid * 0.9);',
    /* per-mote glow twinkle; HALVED once formed so sculpture strokes
       hold steady (V5.3 crispness) while free dust sparkles hard —
       but INSIDE the solid the damping lifts again and a faster glint
       rides on top: glass catching light (V5.11) */
    '  float tw = 0.80 + 0.34*sin(uTime*(0.8 + aSeed.x*1.7) + aSeed.y*6.283);',
    '  tw = mix(tw, 1.0, settle*0.5*(1.0 - uSolid));',
    '  tw += uSolid * 0.30 * sin(uTime*(2.2 + aSeed.z*2.6) + aSeed.x*6.283);',
    '  vA = (0.72 + 0.24*aSeed.z + settle*0.24) * tw;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    /* match FogExp2(0.010): exp(-(d*0.010)^2) — distant specks melt into
       the grade instead of popping at the far plane */
    '  vA *= exp(-0.0001 * mv.z * mv.z);',
    /* V5.7 finale: the gathered swarm is the glass's living content —
       sealed inside like an aquarium. V5.12: it stays glowing the
       WHOLE flight (no mid-air switch) and dissolves only WITH the
       piece→mark crossfade (uHand), handing its light to the mark's
       baked core glint. */
    '  vA *= (1.0 - uSolid * 0.50) * (1.0 - uHand);',
    /* clamp BOTH ways: sub-pixel points shimmer as blur (V5.3 floor),
       near motes never balloon (ceiling) */
    /* point size rides uDockScale too — the sealed motes shrink with
       their aquarium instead of ballooning out of the tiny glass */
    '  gl_PointSize = clamp(uSize * (30.0 / max(1.0, -mv.z)) * (0.45 + aSeed.x*1.1 + settle*0.4) * (0.85 + 0.15*tw) * mix(1.0, uDockScale * 6.0, uOver), 1.0, uSize * 2.7);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var dustMat;
  if (simInfo) {
    dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      /* no depth READ either (QA 2026-07-16): the finale solid writes
         depth, and a depth-tested swarm was culled behind its front
         face — the gathered body popped out in one frame and the
         "living skin" never rendered. Dust draws after the mesh
         (renderOrder 1) and composites over it; the mesh keeps its own
         depth for correct facet self-occlusion. */
      depthTest: false,
      uniforms: {
        uTime: U.uTime, uSize: U.uSize, uLegT: U.uLegT, uSolid: U.uSolid,
        uOver: U.uOver, uHand: U.uHand, uDockPos: U.uDockPos, uDockScale: U.uDockScale,
        uTintFrom: U.uTintFrom, uTintTo: U.uTintTo,
        tPos: { value: null }, tMote: { value: moteTex }
      },
      vertexShader: [
        'uniform float uTime; uniform float uSize; uniform float uLegT; uniform float uSolid; uniform float uOver; uniform float uHand;',
        'uniform vec3 uDockPos; uniform float uDockScale;',
        'uniform vec3 uTintFrom; uniform vec3 uTintTo;',
        'uniform sampler2D tPos;',
        'attribute vec2 aRef; attribute vec3 aFrom; attribute vec3 aTo; attribute vec3 aSeed; attribute vec3 aCol;',
        'varying vec3 vColor; varying float vA;',
        FORM_GLSL,
        'void main(){',
        '  float mm; float settle;',
        '  vec3 p = dustHome(aFrom, aTo, aSeed, uTime, uLegT, mm, settle);',
        /* physics offset — SEALED as the aquarium closes (V5.8): inside
           the glass the swarm may only breathe via the small formation
           wobble; big spring/curl/brush excursions would cross the line */
        '  p += texture2D(tPos, aRef).xyz * (1.0 - uSolid * 0.85);',
        /* V5.8.1: the aquarium TRAVELS — the same shrink+glide that docks
           the glass onto the header logo carries every sealed mote with
           it (applied after all motion, so containment holds exactly) */
        '  p = uDockPos + (p - vec3(0.0, 0.4, -444.0)) * uDockScale;',
        VERT_TAIL
      ].join('\n'),
      fragmentShader: DUST_FRAG
    });
  } else {
    /* stateless fallback: the V3 cursor push (no momentum, but alive) */
    dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      /* no depth READ either (QA 2026-07-16): the finale solid writes
         depth, and a depth-tested swarm was culled behind its front
         face — the gathered body popped out in one frame and the
         "living skin" never rendered. Dust draws after the mesh
         (renderOrder 1) and composites over it; the mesh keeps its own
         depth for correct facet self-occlusion. */
      depthTest: false,
      uniforms: {
        uTime: U.uTime, uSize: U.uSize, uLegT: U.uLegT, uSolid: U.uSolid,
        uOver: U.uOver, uHand: U.uHand, uDockPos: U.uDockPos, uDockScale: U.uDockScale,
        uTintFrom: U.uTintFrom, uTintTo: U.uTintTo,
        uRayO: U.uRayO, uRayD: U.uRayD, uRayDPrev: U.uRayDPrev,
        uHover: U.uHover, uPush: U.uPush,
        tMote: { value: moteTex }
      },
      vertexShader: [
        'uniform float uTime; uniform float uSize; uniform float uLegT; uniform float uSolid; uniform float uOver; uniform float uHand;',
        'uniform vec3 uDockPos; uniform float uDockScale;',
        'uniform float uHover; uniform float uPush;',
        'uniform vec3 uTintFrom; uniform vec3 uTintTo;',
        'uniform vec3 uRayO; uniform vec3 uRayD; uniform vec3 uRayDPrev;',
        'attribute vec3 aFrom; attribute vec3 aTo; attribute vec3 aSeed; attribute vec3 aCol;',
        'varying vec3 vColor; varying float vA;',
        FORM_GLSL,
        RAY_GLSL,
        'void main(){',
        '  float mm; float settle;',
        '  vec3 p = dustHome(aFrom, aTo, aSeed, uTime, uLegT, mm, settle);',
        /* cursor liquid (stateless, no momentum): the ray-brush displaces
           directly — a resting pointer holds a dimple, a fast pointer
           splashes, and release snaps straight back home */
        '  p += rayForce(p, aSeed, uRayO, uRayD, uRayDPrev, uHover, uPush,',
        '                1.1 + aSeed.x*1.6, 0.25 + aSeed.x*1.6, 0.2*(aSeed.z - 0.5))',
        '       * (1.0 - uSolid * 0.85);', /* sealed inside the aquarium */
        '  p = uDockPos + (p - vec3(0.0, 0.4, -444.0)) * uDockScale;', /* travels with the glass */
        VERT_TAIL
      ].join('\n'),
      fragmentShader: DUST_FRAG
    });
  }
  var dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 1; /* over the smoke haze */
  scene.add(dust);

  /* ============================================================
     THE SIMULATION — V4's ping-pong FBO pair (offset + velocity),
     now spring-chasing the MORPHING home and stirred by curl flow
     ============================================================ */
  var sim = null;
  var formTex = null;
  function zeroSim() {
    if (!sim) return;
    var old = new THREE.Color();
    renderer.getClearColor(old);
    var oldA = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    [sim.posA, sim.posB, sim.velA, sim.velB].forEach(function (rt) {
      renderer.setRenderTarget(rt);
      renderer.clear(true, false, false);
    });
    renderer.setRenderTarget(null);
    renderer.setClearColor(old, oldA);
  }
  if (simInfo) {
    var W = simInfo.W, H = simInfo.H;
    function dataTex(arr3) {
      var data = new Float32Array(N * 4);
      for (var i = 0; i < N; i++) {
        data[i * 4] = arr3[i * 3]; data[i * 4 + 1] = arr3[i * 3 + 1];
        data[i * 4 + 2] = arr3[i * 3 + 2]; data[i * 4 + 3] = 1;
      }
      var t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    }
    formTex = FORMS.map(function (f) { return dataTex(f.pts); });
    var seedTex = dataTex(aSeed);
    function makeRT() {
      var rt = new THREE.WebGLRenderTarget(W, H, simInfo.rtOpts(simInfo.type));
      rt.texture.generateMipmaps = false;
      return rt;
    }
    var SIM_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    sim = {
      posA: makeRT(), posB: makeRT(), velA: makeRT(), velB: makeRT(),
      cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      scene: new THREE.Scene(),
      quad: null,
      velMat: null, posMat: null
    };
    sim.velMat = new THREE.ShaderMaterial({
      depthWrite: false, depthTest: false,
      uniforms: {
        tPos: { value: null }, tVel: { value: null },
        tFrom: { value: formTex[ANCHORS[0].f] }, tTo: { value: formTex[ANCHORS[1].f] },
        tSeed: { value: seedTex },
        uTime: U.uTime, uDt: U.uDt, uPush: U.uPush, uHover: U.uHover,
        uRayO: U.uRayO, uRayD: U.uRayD, uRayDPrev: U.uRayDPrev,
        uLegT: U.uLegT
      },
      vertexShader: SIM_VERT,
      fragmentShader: [
        'precision highp float;',
        'uniform sampler2D tPos; uniform sampler2D tVel;',
        'uniform sampler2D tFrom; uniform sampler2D tTo; uniform sampler2D tSeed;',
        'uniform float uTime; uniform float uDt; uniform float uPush; uniform float uHover;',
        'uniform vec3 uRayO; uniform vec3 uRayD; uniform vec3 uRayDPrev;',
        'uniform float uLegT;',
        'varying vec2 vUv;',
        FORM_GLSL,
        CURL_GLSL,
        RAY_GLSL,
        'void main(){',
        '  vec3 seed = texture2D(tSeed, vUv).xyz;',
        '  vec3 off = texture2D(tPos, vUv).xyz;',
        '  vec3 vel = texture2D(tVel, vUv).xyz;',
        '  float mm; float settle;',
        '  vec3 home = dustHome(texture2D(tFrom, vUv).xyz, texture2D(tTo, vUv).xyz, seed, uTime, uLegT, mm, settle);',
        /* spring toward zero offset — underdamped, so motes wobble back;
           stiffer once formed so the sculpture re-knits crisply.
           V5.2: the per-mote spread widened — some snap home, some drift
           long, so recovery reads as individuals, never one membrane */
        '  float k = 0.010 + 0.026*seed.x + settle*0.04;',
        '  vel -= off * (k * uDt);',
        /* curl-noise flow — simmers when formed, surges mid-pour.
           V5.1 de-blob: the old dominant octave (wavelength ~57u, far
           wider than any formation) pushed every mote the same way, so
           the whole swarm sloshed as one blob. It now only breathes
           during transit (mass flow while pouring); the energy moved to
           finer octaves whose sample points are OFFSET PER-MOTE by the
           seed — neighbours stop agreeing and each mote wanders alone. */
        '  float transit = 1.0 - settle;',
        '  vec3 wp = home + off;',
        '  float famp = (0.007 + 0.030*transit) * (0.6 + 0.8*seed.y);',
        '  vel += curlFlow(wp*0.11, uTime*0.5) * (famp * (0.12 + 0.55*transit) * uDt);',
        '  vel += curlFlow(wp*0.45 + seed*3.1, uTime*0.8) * (famp * 0.55 * uDt);',
        '  vel += curlFlow(wp*1.30 + seed*29.0, uTime*1.15) * (famp * 0.85 * uDt);',
        /* cursor ray-brush (V5.4): a constant HOVER force dimples and
           slowly swirls whatever the pointer rests on — at any depth,
           anywhere on screen — and pointer speed (uPush) adds splash
           on top. The spring above pulls every displaced mote back to
           its formation: liquid that always heals. Personal gain/lag/
           swirl (V5.2) are inside rayForce. */
        /* hover gain sized so the RESTING dimple is unmistakable in open
           dust (~2u equilibrium vs the 0.010-0.036 free spring) and a
           clear ~0.5-1u dent on formed strokes (QA 2026-07-16 — the
           first gain read as sub-perceptual in the field pins) */
        '  vel += rayForce(wp, seed, uRayO, uRayD, uRayDPrev, uHover, uPush,',
        '                  (0.022 + 0.055*seed.x) * uDt,',
        '                  (0.010 + 0.034*seed.x) * uDt,',
        /* V5.5 liquid swirl: less than half the gain of the first cut */
        '                  (0.005 + 0.013*seed.z) * (seed.z - 0.5) * uDt);',
        /* damping ~0.94 (heavier once formed, so sculptures hold crisp;
           V5.2: per-mote spread — some heal fast, some glide) */
        '  vel *= pow(0.935 + 0.02*seed.y - settle*0.05, uDt);',
        '  float vl = length(vel);',
        '  if (vl > 1.0) vel *= 1.0 / vl;',
        '  gl_FragColor = vec4(vel, 1.0);',
        '}'
      ].join('\n')
    });
    sim.posMat = new THREE.ShaderMaterial({
      depthWrite: false, depthTest: false,
      uniforms: { tPos: { value: null }, tVel: { value: null }, uDt: U.uDt },
      vertexShader: SIM_VERT,
      fragmentShader: [
        'precision highp float;',
        'uniform sampler2D tPos; uniform sampler2D tVel; uniform float uDt;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec3 off = texture2D(tPos, vUv).xyz + texture2D(tVel, vUv).xyz * uDt;',
        '  gl_FragColor = vec4(off, 1.0);',
        '}'
      ].join('\n')
    });
    sim.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sim.velMat);
    sim.quad.frustumCulled = false;
    sim.scene.add(sim.quad);
    zeroSim();
    dustMat.uniforms.tPos.value = sim.posA.texture;
  }
  /* sim state lives only on the GPU — re-zero it if the context returns */
  canvas.addEventListener('webglcontextrestored', function () { zeroSim(); });

  function runSim() {
    sim.quad.material = sim.velMat;
    sim.velMat.uniforms.tPos.value = sim.posA.texture;
    sim.velMat.uniforms.tVel.value = sim.velA.texture;
    renderer.setRenderTarget(sim.velB);
    renderer.render(sim.scene, sim.cam);
    sim.quad.material = sim.posMat;
    sim.posMat.uniforms.tPos.value = sim.posA.texture;
    sim.posMat.uniforms.tVel.value = sim.velB.texture;
    renderer.setRenderTarget(sim.posB);
    renderer.render(sim.scene, sim.cam);
    renderer.setRenderTarget(null);
    var t = sim.posA; sim.posA = sim.posB; sim.posB = t;
    t = sim.velA; sim.velA = sim.velB; sim.velB = t;
    dustMat.uniforms.tPos.value = sim.posA.texture;
  }

  /* ---------- leg bookkeeping: swap aFrom/aTo + sim textures ---------- */
  var curLeg = -1;
  function applyLeg(p) {
    var k = 0;
    while (k < ANCHORS.length - 2 && p >= ANCHORS[k + 1].p) k++;
    var a = ANCHORS[k], b = ANCHORS[k + 1];
    if (k !== curLeg) {
      curLeg = k;
      fromArr.set(FORMS[a.f].pts);
      toArr.set(FORMS[b.f].pts);
      dustGeo.attributes.aFrom.needsUpdate = true;
      dustGeo.attributes.aTo.needsUpdate = true;
      U.uTintFrom.value.copy(FORMS[a.f].tint);
      U.uTintTo.value.copy(FORMS[b.f].tint);
      if (sim) {
        sim.velMat.uniforms.tFrom.value = formTex[a.f];
        sim.velMat.uniforms.tTo.value = formTex[b.f];
      }
    }
    U.uLegT.value = Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p)));
  }

  /* ============================================================
     SMOKE — soft tinted haze along the corridor (V4, retimed to the
     V5 stations)
     ============================================================ */
  var smokeTex = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var ctx = c.getContext('2d');
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 70;
      var x = 128 + Math.cos(a) * r * 0.6, y = 128 + Math.sin(a) * r * 0.6;
      var rad = 34 + Math.random() * 54;
      var g = ctx.createRadialGradient(x, y, 2, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.fill();
    }
    var t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  })();
  function smokeTint(z) {
    if (z > -40) return VIOLET;    /* ignition               */
    if (z > -165) return DEEP;     /* the river              */
    if (z > -183) return VIOLET;   /* browser                */
    if (z > -205) return CYAN;     /* phone                  */
    if (z > -235) return PEACH;    /* lattice                */
    if (z > -266) return DEEP;     /* neural                 */
    if (z > -288) return CYAN;     /* controller             */
    if (z > -316) return ROSE;     /* lifebuoy               */
    if (z > -352) return VIOLET;   /* orbit                  */
    if (z > -420) return CYAN;     /* gates                  */
    return VIOLET;                 /* portal — the finale    */
  }
  var smokes = [];
  (function () {
    var count = mobile ? 10 : 22;
    for (var i = 0; i < count; i++) {
      var z = 8 - (i + 0.5) / count * 500 + (Math.random() - 0.5) * 10;
      var x = (i % 2 ? 1 : -1) * (7 + Math.random() * 10);
      var y = -2.5 + Math.random() * 6;
      var mat = new THREE.SpriteMaterial({
        map: smokeTex, color: smokeTint(z), transparent: true,
        depthWrite: false, opacity: 0.045 + Math.random() * 0.04,
        rotation: Math.random() * Math.PI * 2
      });
      var sp = new THREE.Sprite(mat);
      var sc = 16 + Math.random() * 14;
      sp.scale.set(sc, sc, 1);
      sp.position.set(x, y, z);
      scene.add(sp);
      smokes.push({ sp: sp, mat: mat, x: x, y: y, base: mat.opacity, rot: (Math.random() - 0.5) * 0.06, ph: Math.random() * 6.283 });
    }
  })();

  /* ============================================================
     THE SOLIDIFYING STAR (V5.6, 2026-07-16 directive): on the final
     stretch of the scroll the particle star HARDENS into one solid
     piece — the metaphor of an idea turned into reality. Driven
     entirely by scroll progress (sol = smoothstep(.955, .995, p)):
     scrub-safe in both directions, deterministic at ?storyp pins.
     The swarm fades to a breathing remainder (uSolid in VERT_TAIL)
     while a beveled extrusion of the SAME 8-point mark fades in,
     grows the last few percent, and locks still. Rule 2 intact:
     the mesh, its lights and its env reflection are all procedural.
     ============================================================ */
  var solidStar = (function () {
    /* V5.13 (user: "back to the previous star shape, aquarium style,
       3D that really CONTAINS the particles — and the logo and the
       star EXACTLY the same"): the extruded 8-point brand star again,
       but as PURE GLASS — a fresnel shader: face-on the surface is a
       near-clear breath of violet (see straight through to the white
       swarm living inside the real 3D thickness), and where the
       surface turns away (bevel ring + silhouette walls) it deepens
       into the SAME violet edge gradient the .logo-mark svgs stroke
       with. Face-on, this draws exactly the flat mark: violet edges,
       see-through middle. Unlit, no env/PMREM — nothing to drift
       from the svg colors on any GPU. */
    var S = 8.5;
    var shape = new THREE.Shape();
    STAR_V.forEach(function (v, i) {
      var x = (v[0] - 16) / 13 * S, y = (16 - v[1]) / 13 * S;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
    shape.closePath();
    var geo = new THREE.ExtrudeGeometry(shape, {
      depth: 1.1, bevelEnabled: true,
      bevelThickness: 0.85, bevelSize: 0.8, bevelSegments: 4
    });
    geo.center(); /* shape is XY-symmetric — this only centers depth */
    /* the TRUE silhouette span (tips + bevel miter overshoot included)
       — estimating it (20.2u) landed the glass slightly larger than
       the mark and doubled the outline mid-crossfade (user QA) */
    geo.computeBoundingBox();
    var H = geo.boundingBox.max.y - geo.boundingBox.min.y;
    var uOp = { value: 0 };
    var uDockF = { value: 0 };
    var mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uOp: uOp, uDockF: uDockF },
      vertexShader: [
        'varying vec3 vN; varying vec3 vV;',
        'void main(){',
        '  vN = normalize(normalMatrix * normal);',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vV = mv.xyz;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uOp; uniform float uDockF;',
        'varying vec3 vN; varying vec3 vV;',
        'void main(){',
        /* glass law: colors are FINAL sRGB values (ShaderMaterial
           bypasses the output transform) — the svg stroke family
           #9d8bff → #5a46d6. uDockF thickens+saturates the walls as
           the piece SHRINKS: at hero size the fresnel edge spans many
           pixels, but at logo size it collapses to sub-pixel and
           averages out pale — the mark's crisp 1.4px stroke would
           read as a different color and wall thickness (user QA). */
        '  float t = uDockF;',
        '  float fr = pow(1.0 - abs(dot(normalize(vN), normalize(-vV))), mix(1.8, 1.0, t));',
        '  vec3 edge = mix(vec3(0.616, 0.545, 1.0), vec3(0.353, 0.275, 0.839), smoothstep(mix(0.35, 0.10, t), mix(1.0, 0.6, t), fr));',
        '  float a = mix(0.055, 0.92, smoothstep(mix(0.12, 0.03, t), mix(0.85, 0.42, t), fr));',
        '  gl_FragColor = vec4(edge, a * uOp);',
        '}'
      ].join('\n')
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0.4, -444);
    mesh.rotation.x = -0.10;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh: mesh, mat: mat, op: uOp, df: uDockF, H: H };
  })();

  function smoothstep01(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /* V5.8 logo docking: the overscroll that raises the footer sends the
     finished piece home — onto the header's star mark itself (V5.8.1
     user directive: "on top of the current logo, cover it, bring the
     particles with it"). The dock target and size are measured from
     the REAL logo <svg> rect and mapped to world at the star's ~17u
     viewing distance; the flat mark is CSS-hidden in live mode (V5.9:
     no corner logo until the star docks and BECOMES it).
     The sealed swarm rides the same transform (uDockPos/uDockScale in
     the render shaders), so containment holds the whole way. */
  /* V5.14: the dock target is stored as the mark's NDC anchor + pixel
     size, and mapped to world THROUGH THE CURRENT CAMERA every frame
     (see the frame loop) — the old fixed 17u mapping assumed the
     finale camera had fully settled, but during a fast real scroll
     pSmooth (and so camera z) is still converging when the crossfade
     starts, which parked the glass LEFT of the mark (user QA). */
  var TANF = Math.tan(camera.fov * Math.PI / 360);
  var DOCK_NX = 0.72, DOCK_NY = 0.80, DOCK_PX = 24; /* fallbacks if no logo el */
  var logoMark = document.querySelector('.site-header .logo svg');
  function computeDock() {
    if (!logoMark) return;
    var r = logoMark.getBoundingClientRect();
    if (!r.width) return;
    DOCK_NX = ((r.left + r.right) / innerWidth) - 1;
    DOCK_NY = 1 - ((r.top + r.bottom) / innerHeight);
    /* the mark's star path spans 26/32 of its svg box; matched against
       the MEASURED glass silhouette (solidStar.H bbox) at frame time */
    DOCK_PX = r.height * 0.8125;
  }
  computeDock();

  /* ============================================================
     CHAPTER GRADES — bright whites, richer tint per chapter; the
     finale HOLDS the portal violet (V5.1 — the loop is gone)
     ============================================================ */
  var STATIONS = [
    { p: 0.010, bg: 0xfafaf9 }, { p: 0.060, bg: 0xf1ecff }, { p: 0.140, bg: 0xedefff },
    { p: 0.2325, bg: 0xf0eaff }, { p: 0.3125, bg: 0xe7f3fc }, { p: 0.3925, bg: 0xfdefe3 },
    { p: 0.4725, bg: 0xefe8ff }, { p: 0.5525, bg: 0xe7f3fc }, { p: 0.6325, bg: 0xfceef3 },
    { p: 0.7350, bg: 0xebf1fb }, { p: 0.8400, bg: 0xf1ecfa }, { p: 0.9250, bg: 0xf0e7ff },
    /* finale holds the portal violet, lifting slightly as the camera
       noses in (CTA legibility) — no fade back to the opening white */
    { p: 0.9980, bg: 0xf3edff }
  ];
  /* one linear grade everywhere. r160 converts the clear color at clear
     time using the color space of the target bound then: canvas -> sRGB
     encode (exact station hex on screen). */
  var GRADES = STATIONS.map(function (s) { return new THREE.Color(s.bg); });
  var gradeColor = new THREE.Color(0xfafaf9);

  function gradeUpdate(p) {
    var k = 0;
    while (k < STATIONS.length - 2 && p > STATIONS[k + 1].p) k++;
    var a = STATIONS[k].p, b = STATIONS[k + 1].p;
    var t = Math.min(1, Math.max(0, (p - a) / (b - a)));
    var k1 = Math.min(k + 1, GRADES.length - 1);
    gradeColor.copy(GRADES[k]).lerp(GRADES[k1], t);
    scene.fog.color.copy(gradeColor);
  }

  function clamp01(x) { return Math.min(1, Math.max(0, x)); }

  function renderFrame() {
    renderer.setClearColor(gradeColor, 1);
    renderer.render(scene, camera);
  }

  /* ============================================================
     CAMERA PATH + BEATS — stretched for the 1100vh track; keyframes
     re-timed to the V5 beat centers, corridor depth unchanged
     ============================================================ */
  /* finale re-timed (V5.1): the camera reaches the QA'd ~23u framing
     exactly at the portal anchor (.925 -> z -421, star at -444), then
     dollies in gently to -427 and SETTLES — it never flies past the
     star, because nothing exists behind it any more */
  var KP = [0, 0.10, 0.205, 0.66, 0.735, 0.875, 0.925, 1.0];
  var KZ = [7, -13, -150, -274, -314, -404, -421, -427];
  function camZ(p) {
    for (var i = 1; i < KP.length; i++) {
      if (p <= KP[i]) {
        var t = (p - KP[i - 1]) / (KP[i] - KP[i - 1]);
        t = t * t * (3 - 2 * t);
        return KZ[i - 1] + (KZ[i] - KZ[i - 1]) * t;
      }
    }
    return KZ[KZ.length - 1];
  }

  var beats = [];
  beatsWrap.querySelectorAll('[data-range]').forEach(function (el) {
    var r = (el.getAttribute('data-range') || '0,1').split(',');
    beats.push({ el: el, a: parseFloat(r[0]), b: parseFloat(r[1]), state: -1 });
  });
  var hint = document.querySelector('.story-hint');

  function updateBeats(p) {
    for (var i = 0; i < beats.length; i++) {
      var bt = beats[i];
      var fade = 0.022; /* < the smallest dead gap (0.025) — beats never mix */
      var o = 0;
      /* fade IN starts at the beat's own range (no pre-roll); only the
         opening beat keeps a lead so the hero is visible at load */
      var lead = bt.a < 0.01 ? fade : 0;
      if (p > bt.a - lead && p < bt.b + fade) {
        var inE = Math.min(1, (p - (bt.a - lead)) / fade);
        var outE = Math.min(1, ((bt.b + fade) - p) / fade);
        o = Math.max(0, Math.min(inE, outE));
      }
      var q = Math.round(o * 40) / 40;
      if (q !== bt.state) {
        bt.state = q;
        bt.el.style.opacity = q;
        bt.el.style.transform = 'translateY(' + ((1 - q) * 12).toFixed(1) + 'px)';
        bt.el.classList.toggle('live', q > 0.5);
      }
    }
    if (hint) hint.style.opacity = Math.max(0, 1 - p * 14);
  }

  /* ---------- go live ---------- */
  document.documentElement.classList.add('story-live');
  document.documentElement.classList.add('story-light');
  var header = document.getElementById('siteHeader');

  var trackH0 = track.offsetHeight - innerHeight;
  var pSmooth = trackH0 > 0 ? Math.min(1, Math.max(0, window.scrollY / trackH0)) : 0;
  var pinMatch = /[?&]storyp=([0-9.]+)/.exec(location.search);
  var pPin = pinMatch ? Math.min(1, Math.max(0, parseFloat(pinMatch[1]))) : null;
  if (pPin !== null) pSmooth = pPin;
  /* QA pin for the footer-overscroll docking (V5.8): ?over=<0..1> */
  var overMatch = /[?&]over=([0-9.]+)/.exec(location.search);
  var overPin = overMatch ? Math.min(1, Math.max(0, parseFloat(overMatch[1]))) : null;
  var overS = overPin !== null ? overPin : 0;

  /* cursor -> a RAY through the world (V5.4). `hover` is PRESENCE: it
     ramps to 1 while the pointer is over the page and holds there —
     a resting mouse keeps a live dimple under it at all times — and
     ramps to 0 when the pointer leaves the window / the finger lifts.
     `push` stays the SPEED energy on top (splash while stirring). */
  var ndc = new THREE.Vector2(0, 0);
  var lastNdc = new THREE.Vector2(0, 0);
  var push = 0;
  var hover = 0, hoverTarget = 0;
  var rayDir = new THREE.Vector3();
  var rayPrev = new THREE.Vector3(0, 0, -1);
  window.addEventListener('pointermove', function (e) {
    ndc.x = (e.clientX / innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / innerHeight) * 2 + 1;
    hoverTarget = 1;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', function () { hoverTarget = 0; });
  window.addEventListener('blur', function () { hoverTarget = 0; });
  window.addEventListener('touchstart', function (e) {
    if (!e.touches.length) return;
    ndc.x = (e.touches[0].clientX / innerWidth) * 2 - 1;
    ndc.y = -(e.touches[0].clientY / innerHeight) * 2 + 1;
    lastNdc.copy(ndc);
    hoverTarget = 1;
    push += 0.7; /* a tap splashes on its own */
  }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (!e.touches.length) return;
    ndc.x = (e.touches[0].clientX / innerWidth) * 2 - 1;
    ndc.y = -(e.touches[0].clientY / innerHeight) * 2 + 1;
    hoverTarget = 1;
  }, { passive: true });
  /* only the LAST finger leaving drops presence — a resting finger keeps
     its dimple even while other fingers tap/lift elsewhere (QA 2026-07-16) */
  window.addEventListener('touchend', function (e) { if (e.touches.length) return; hoverTarget = 0; });
  window.addEventListener('touchcancel', function (e) { if (e.touches.length) return; hoverTarget = 0; });

  /* cache the track height — reading offsetHeight every frame while also
     writing --sp (a layout-affecting property on the header) forces a
     synchronous reflow per frame. maxScroll caches the document end for
     the footer-overscroll docking (V5.8). */
  var trackH = track.offsetHeight - innerHeight;
  var maxScroll = Math.max(trackH + 1, document.documentElement.scrollHeight - innerHeight);

  var mx = 0, my = 0;
  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      /* refresh DPR too — dragging to another monitor / browser zoom changes
         devicePixelRatio without a reload. Once the governor has stepped AT
         ALL, DPR may only go DOWN (the machine already proved itself slow;
         raising pixel load with the ladder exhausted would be unshedable) */
      var newDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      if (gLevel > 0) newDpr = Math.min(newDpr, DPR);
      if (newDpr !== DPR) {
        DPR = newDpr;
        renderer.setPixelRatio(DPR);
        U.uSize.value = SIZE0 * DPR;
      }
      renderer.setSize(innerWidth, innerHeight, false);
      trackH = track.offsetHeight - innerHeight;
      maxScroll = Math.max(trackH + 1, document.documentElement.scrollHeight - innerHeight);
      computeDock();
    }, 150);
  });
  /* V5.18 ("the last frame still sits where it always did" — owner's
     real machine): layout can SHIFT AFTER load without firing resize —
     the webfont swap changes the footer/page height, so the cached
     maxScroll (the overscroll normalization!) and the logo rect go
     stale, and the dock chain aims at yesterday's layout. Re-measure
     the WHOLE chain on every layout signal: load, resize (above),
     the fonts becoming ready, and any body size change. */
  function relayout() {
    trackH = track.offsetHeight - innerHeight;
    maxScroll = Math.max(trackH + 1, document.documentElement.scrollHeight - innerHeight);
    computeDock();
  }
  window.addEventListener('load', relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(document.body);

  /* perf governor (V5.1): finer down-only ladder, one step per slow
     90-frame window — half the smoke, then DPR down in 0.25 steps to
     1.0, then thin the swarm to 80% / 60% (shuffled index -> an even
     sprinkle disappears, no formation loses structure). Never steps up. */
  var gFrames = 0, gSum = 0, gMin = 999, gLevel = 0, lastT = 0, lastSp = -1, hdrDocked = false, lastLogoOp = -1;
  var gSteps = [function () {
    /* halve the smoke by PAIRS (i & 2), not by (i % 2) — sprite SIDE is
       assigned by i % 2, so index parity would strip one whole side of
       the corridor's haze (QA 2026-07-15) */
    for (var i = 0; i < smokes.length; i++) if (i & 2) smokes[i].sp.visible = false;
  }];
  (function () {
    /* rungs are built for the TIER CAP (not the load DPR — a 1x-display
       load must still own rungs in case a monitor drag raises DPR later)
       and each rung clamps to the CURRENT DPR, so a rung can only ever
       step DOWN; a rung that has nothing to shed returns false and
       govern() falls through to the next (QA 2026-07-16) */
    function dprStep(target) {
      return function () {
        var nd = Math.max(1, Math.min(DPR, target));
        if (nd >= DPR - 0.001) return false;
        DPR = nd;
        renderer.setPixelRatio(nd);
        renderer.setSize(innerWidth, innerHeight, false);
        U.uSize.value = SIZE0 * nd;
      };
    }
    for (var d = DPR_CAP - 0.25; d > 0.999; d -= 0.25) gSteps.push(dprStep(Math.max(1, d)));
    if (DPR_CAP > 1.001 && (DPR_CAP - 1) % 0.25 !== 0) gSteps.push(dprStep(1));
  })();
  if (canThin) {
    gSteps.push(function () { dustGeo.setDrawRange(0, Math.floor(N * 0.8)); });
    gSteps.push(function () { dustGeo.setDrawRange(0, Math.floor(N * 0.6)); });
  }
  function govern(dt) {
    gFrames++; gSum += dt;
    if (dt < gMin) gMin = dt;
    if (gFrames < 90) return;
    var avg = gSum / gFrames, min = gMin;
    gFrames = 0; gSum = 0; gMin = 999;
    if (avg <= 26) return;
    /* a slow-vsync display (30/24Hz TV, projector) renders EVERY frame at
       a uniform ~33/42ms — that is a locked cadence, not GPU overload
       (shedding quality could never lower it anyway). Overload shows a
       sub-28ms floor or spread between fast holds and slow pours; a
       locked display shows avg hugging its min. (QA 2026-07-15) */
    if (min >= 28 && avg < min * 1.2) return;
    /* a rung that had nothing to shed (DPR already below its target)
       returns false — fall straight through to the next real rung */
    while (gLevel < gSteps.length) {
      if (gSteps[gLevel++]() !== false) break;
    }
  }

  var lookTarget = new THREE.Vector3();
  var dockV = new THREE.Vector3();
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    /* cap dt: a tab-hide rAF gap must not read as 90 slow frames and trip
       the governor (permanent quality drop after one tab switch) */
    var dt = lastT ? Math.min(100, t - lastT) : 16.7;
    lastT = t;
    var dtn = Math.min(2.0, Math.max(0.25, dt / 16.7));
    var time = t * 0.001;
    var p = pPin !== null ? pPin : (trackH > 0 ? Math.min(1, Math.max(0, window.scrollY / trackH)) : 0);
    pSmooth += (p - pSmooth) * 0.085;
    mx += (ndc.x * 0.5 - mx) * 0.04;
    my += (-ndc.y * 0.5 - my) * 0.04;

    gradeUpdate(pSmooth);
    applyLeg(pSmooth);

    /* V5.6/V5.8 finale: the idea hardens into reality — a bit EARLIER
       now (user directive), and as translucent aquarium glass. Pure
       function of scroll — scrub back and it dissolves again. */
    /* V5.12: the glass enters WITH the final sentence (B10 fade-in
       completes ~.922; user asked twice for earlier — was .945/.928) */
    var sol = smoothstep01(0.915, 0.98, pSmooth);
    U.uSolid.value = sol;
    /* footer overscroll -> the piece docks as a small logo (V5.8);
       driven by scroll past the track end, pinned via ?over= in QA */
    var overRaw = overPin !== null ? overPin
      : (trackH > 0 ? Math.min(1, Math.max(0, (window.scrollY - trackH) / Math.max(1, maxScroll - trackH))) : 0);
    /* V5.18/19: the last stretch of the overscroll snaps to DONE — the
       handover must complete even if the measured document end is off
       by tens of px on some machine; the resting state is then the
       REAL header mark, which by definition cannot be misplaced */
    if (overRaw > 0.9) overRaw = 1;
    overS += (overRaw - overS) * Math.min(1, 0.10 * dtn);

    /* camera FIRST (V5.15 — moved above the dock block so the dock
       anchor is projected through THIS frame's matrices, not last
       frame's). calm-camera directive: the motion belongs to the
       PARTICLES, not the screen; V5.9/V5.12: ALL camera drift dies as
       the star docks — a logo sits rock-still. */
    var z = camZ(pSmooth);
    var sway = Math.sin(pSmooth * 14) * 0.5;
    var weave = 0;
    if (pSmooth > 0.205 && pSmooth < 0.66) {
      /* six gentle alternating arcs — one per capability icon side.
         Desktop arcs away from the icon (text keeps the frame); narrow
         aspects arc TOWARD it so the formation stays inside the frustum. */
      var ct = (pSmooth - 0.205) / 0.455 * 6;
      var wdir = Math.floor(ct) % 2 === 0 ? 1 : -1;
      if (narrow) wdir = -wdir;
      weave = wdir * (narrow ? 1.0 : 1.1) * Math.sin((ct % 1) * Math.PI);
    }
    /* V5.17 (owner: "return the star to the previous round"): the
       V5.16 total freeze + sheen are reverted — gentle pointer
       parallax lives through the finale again and dies only with the
       dock. The landing stays exact regardless: the V5.15 unproject
       maps the anchor through the FULL camera pose every frame. */
    var calm = 1 - overS;
    camera.position.set((sway * 0.4 + weave + mx * 1.0) * calm, (Math.sin(pSmooth * 9) * 0.35 - my * 0.75) * calm, z);
    lookTarget.set(mx * 2.2 * calm, -my * 1.6 * calm, z - 46);
    camera.lookAt(lookTarget);

    /* dock transform (V5.8.1): glide to the header's star mark and
       shrink to just-cover it; the dust shaders ride the SAME transform
       (uDockPos/uDockScale), so the sealed swarm travels inside the
       glass. camera x/y included so the landing stays glued to the
       screen-fixed logo even under pointer parallax.
       V5.19 staging (owner's machine parks the glass mid-glide "too
       far left" — its real scroll tops out short of the measured
       overscroll end, so deep-overS milestones never fire there):
       the WHOLE landing now lives in the first ~60% of the region —
       flight 0-45%, flatten 30-55%, mark crossfade 45-62%. Even a
       machine that only reaches 65% of the measured overscroll gets a
       COMPLETED handover, and the resting frame is the REAL header
       mark, which cannot be misplaced. */
    var dock = smoothstep01(0, 0.45, overS);
    var flat = smoothstep01(0.3, 0.55, overS);
    U.uOver.value = dock;
    /* V5.15 ("once and for all"): project the anchor through the FULL
       camera matrices. With a live pointer the camera is slightly
       ROTATED (lookAt) during the crossfade — any straight-ahead
       mapping shifts the whole world 3-7px against the DOM mark
       (pointer-dependent, so headless pins never saw it). Unproject
       the mark's NDC into a ray and intersect the star's z=-444
       plane: the glass projects onto the mark's PIXELS for any camera
       pose, any convergence state, any resize. */
    camera.updateMatrixWorld();
    var dd = camera.position.z + 444;
    var dockSc = (DOCK_PX * 2 * TANF * dd / innerHeight) / solidStar.H;
    var dockScale = 1 + (dockSc - 1) * dock;
    dockV.set(DOCK_NX, DOCK_NY, 0.5).unproject(camera).sub(camera.position).normalize();
    var dockRayT = (-444 - camera.position.z) / dockV.z;
    var dtx = (camera.position.x + dockV.x * dockRayT) * dock;
    var dty = 0.4 + (camera.position.y + dockV.y * dockRayT - 0.4) * dock;
    U.uDockPos.value.set(dtx, dty, -444);
    U.uDockScale.value = dockScale;
    /* V5.9: the flat mark is CSS-hidden for the whole live story (the
       corner carries no logo until the star docks — user directive).
       Past half-flight the header's frosted scroll pane hands over
       instead, so the landing star is not buried behind its blur.
       Hysteresis keeps the class steady at the threshold. */
    var wantDocked = dock > (hdrDocked ? 0.45 : 0.55);
    if (wantDocked !== hdrDocked) {
      hdrDocked = wantDocked;
      document.documentElement.classList.toggle('star-docked', hdrDocked);
    }
    /* V5.10: on the last stretch of the flight the living piece hands
       over to the page's REAL flat mark — they now look identical, so
       the resting state on index is literally the same svg logo as
       every other page (the circle closes). The inline opacity write
       intentionally overrides the story-live CSS hide at the dock;
       scrubbing back returns the mark to the living piece. */
    var handoff = smoothstep01(0.45, 0.62, overS);
    U.uHand.value = handoff;
    var lq = Math.round(handoff * 40) / 40;
    if (logoMark && lq !== lastLogoOp) {
      lastLogoOp = lq;
      logoMark.style.opacity = lq;
    }
    solidStar.mesh.visible = sol > 0.002;
    if (solidStar.mesh.visible) {
      /* the glass is see-through by construction (fresnel alpha:
         near-clear face, violet walls); uOp just breathes it in with
         sol and hands it to the mark with the crossfade (V5.13).
         uDockF thickens+saturates the shrinking walls so the small
         glass matches the mark's color and stroke weight. */
      solidStar.op.value = sol * (1 - handoff);
      solidStar.df.value = dock;
      var sc = (0.92 + 0.08 * sol) * dockScale;
      /* V5.13: the glass FLATTENS as it docks — a fronto-parallel flat
         plate projects as a pure scale (zero depth parallax), so the
         landed outline overlays the mark EXACTLY. At full thickness an
         object ±1.4u deep sitting ~9u off the camera axis smears its
         front/back outlines ±13px apart (measured, v514 pixel scan) —
         that was the stubborn "double outline". */
      solidStar.mesh.scale.set(sc, sc, sc * (1 - flat) + 0.003 * flat);
      solidStar.mesh.position.x = dtx;
      solidStar.mesh.position.y = dty;
      /* forming, it still breathes with the world; solid, it settles —
         but stays alive: the glass pane leans gently toward the
         pointer (hover-gated — pins stay deterministic), and a drift
         too slow to see keeps it breathing. Docking straightens
         everything — the logo lands square and rock-still. */
      solidStar.mesh.rotation.z = (1 - sol) * (0.10 + Math.sin(time * 0.4) * 0.03) * (1 - dock);
      solidStar.mesh.rotation.y = (0.14 + Math.sin(time * 0.12) * 0.05 + mx * 0.36 * hover) * (1 - dock);
      solidStar.mesh.rotation.x = (-0.10 + my * 0.28 * hover) * (1 - dock);
    }

    /* pointer speed -> push impulse; decay heals the liquid closed.
       normalized by dtn so the splash feels the same at 60/120/165 Hz */
    var speed = Math.hypot(ndc.x - lastNdc.x, ndc.y - lastNdc.y);
    lastNdc.copy(ndc);
    push += Math.min(1.2, (speed / dtn) * 28) * 0.4 * dtn;
    push *= Math.pow(0.92, dtn);
    /* presence ramps smoothly — arrival blooms in, leaving heals out */
    hover += (hoverTarget - hover) * Math.min(1, 0.10 * dtn);
    /* the pointer RAY (V5.4): origin at the camera, direction through
       the pointer; the lagged prev-ray gives slow reactors something
       old to chase (temporal scatter, V5.2 individuality) */
    rayPrev.lerp(rayDir, 0.12).normalize();
    rayDir.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    U.uRayO.value.copy(camera.position);
    U.uRayD.value.copy(rayDir);
    U.uRayDPrev.value.copy(rayPrev);
    U.uHover.value = hover;
    U.uPush.value = Math.min(3.0, push);
    U.uTime.value = time;
    U.uDt.value = dtn;

    /* V5.1: smoke is ATMOSPHERE, not an actor — drift cut to a shimmer
       so the big soft sprites never read as moving blobs */
    for (var si = 0; si < smokes.length; si++) {
      var sk = smokes[si];
      sk.mat.rotation += sk.rot * dt * 0.001;
      sk.sp.position.x = sk.x + Math.sin(time * 0.06 + sk.ph) * 0.5;
      sk.sp.position.y = sk.y + Math.sin(time * 0.05 + sk.ph * 1.7) * 0.25;
      sk.mat.opacity = sk.base * (0.92 + 0.08 * Math.sin(time * 0.11 + sk.ph));
    }

    if (sim) runSim();

    updateBeats(pSmooth);
    /* write --sp only when the displayed value actually changes — it feeds a
       width calc on the header, so an unconditional write costs a reflow */
    var spq = Math.round(pSmooth * 500);
    if (header && spq !== lastSp) {
      lastSp = spq;
      header.style.setProperty('--sp', (spq / 500).toFixed(3));
    }
    renderFrame();
    govern(dt);
  }
  /* warm the finale material at load (QA 2026-07-16): otherwise it
     compiles synchronously on the FIRST frame it becomes visible — a
     hitch at the story's emotional peak. The pane is opacity 0, so
     this draws nothing visible; pins stay untouched. */
  solidStar.mesh.visible = true;
  renderer.compile(scene, camera);
  solidStar.mesh.visible = false;

  requestAnimationFrame(frame);
})();
