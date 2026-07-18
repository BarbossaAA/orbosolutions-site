/* ============================================================
   NEBULA — main.js
   Renderer + bloom + grade chain, volumetric fog layer,
   GSAP-scrubbed camera voyage on Lenis smooth scroll,
   mouse gravity warp, shooting stars, staged loader,
   SplitText / ScrambleText chapter reveals, rail, HUD, cursor.
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGalaxy, createNursery, createStarfield } from './galaxy.js';
import { createNebulaLayer, createShootingStars } from './nebula.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);
if (window.SplitText) gsap.registerPlugin(window.SplitText);
if (window.ScrambleTextPlugin) gsap.registerPlugin(window.ScrambleTextPlugin);

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(pointer: fine)').matches;
const SMALL = window.innerWidth < 860;
const CAN_SPLIT = Boolean(window.SplitText) && !REDUCED;
const CAN_SCRAMBLE = Boolean(window.ScrambleTextPlugin) && !REDUCED;

document.documentElement.classList.add('is-loading');

/* ------------------------------------------------ smooth scroll (Lenis) */

let lenis = null;
if (window.Lenis && !REDUCED) {
  lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
  lenis.stop(); /* held until the loader lifts */
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function goTo(target) {
  if (lenis) {
    lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 3) });
  } else if (typeof target === 'number') {
    window.scrollTo({ top: target, behavior: REDUCED ? 'auto' : 'smooth' });
  } else {
    window.scrollTo({ top: target.offsetTop, behavior: REDUCED ? 'auto' : 'smooth' });
  }
}

/* ------------------------------------------------ loader state */

const loaderEl = document.getElementById('loader');
const fillEl = document.getElementById('loader-fill');
const pctEl = document.getElementById('loader-pct');
const labelEl = document.getElementById('loader-label');
const stepEls = Array.from(document.querySelectorAll('.loader-steps li'));

function stepLive(i) {
  if (stepEls[i]) stepEls[i].classList.add('is-live');
}
function stepDone(i) {
  if (stepEls[i]) {
    stepEls[i].classList.remove('is-live');
    stepEls[i].classList.add('is-done');
  }
}

const prog = { shown: 0, target: 0 };
let firstFrameDone = false;
let loaderClosed = false;
let onLoaderClose = null;

function setProgress(v, label) {
  if (loaderClosed) return;
  prog.target = Math.max(prog.target, v);
  if (label) labelEl.textContent = label;
  gsap.to(prog, {
    shown: prog.target,
    duration: REDUCED ? 0.15 : 0.35,
    ease: 'power2.out',
    overwrite: true,
    onUpdate() {
      fillEl.style.transform = `scaleX(${prog.shown / 100})`;
      pctEl.textContent = String(Math.round(prog.shown)).padStart(3, '0');
    },
    onComplete: maybeCloseLoader,
  });
}

function maybeCloseLoader() {
  if (!loaderClosed && firstFrameDone && prog.shown >= 99.5) {
    loaderClosed = true;
    if (onLoaderClose) onLoaderClose();
  }
}

function webglFail() {
  labelEl.textContent = 'WEBGL UNAVAILABLE';
  document.getElementById('loader-sub').textContent =
    'THIS VOYAGE NEEDS A GPU. PLEASE RETURN WITH A WEBGL-CAPABLE BROWSER.';
  document.documentElement.classList.remove('is-loading');
}

/* ------------------------------------------------ webgl boot */

const canvas = document.getElementById('scene');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
} catch (err) {
  renderer = null;
}

if (!renderer) {
  webglFail();
} else {
  boot().catch((err) => {
    console.error(err);
    webglFail();
  });
}

/* yield to the event loop so the loader can paint between boot stages
   (function declaration: hoisted, safe to reach from boot() above) */
function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot() {
  stepLive(0);
  setProgress(16, 'CALIBRATING OPTICS');

  let W = window.innerWidth;
  let H = window.innerHeight;
  let DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  const bgColor = new THREE.Color('#020409');
  scene.background = bgColor;
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 500);

  stepDone(0);

  /* let the loader reach first paint before the heavy star seeding */
  await nextTick();

  /* ---------- procedural sky ---------- */

  stepLive(1);

  /* counts trimmed with per-point size bumped in galaxy.js: same look,
     ~30% fewer vertices + fill; the deep field cut is invisible */
  const starCount = SMALL ? 30000 : 60000;
  const nurseryCount = SMALL ? 6000 : 10000;
  const fieldCount = SMALL ? 900 : 1400;

  const galaxy = createGalaxy(starCount);
  setProgress(34, 'SEEDING STARS');
  await nextTick();

  const nursery = createNursery(nurseryCount);
  const field = createStarfield(fieldCount);
  scene.add(galaxy.points, nursery.points, field.points);
  await nextTick();

  const mats = [galaxy.material, nursery.material, field.material];
  const warpMats = [galaxy.material, nursery.material];

  /* volumetric fog behind the stars: raymarched at low res, upscaled */
  const nebula = createNebulaLayer(W, H, SMALL);
  scene.add(nebula.mesh);

  /* far-field streaks */
  const shooters = REDUCED ? null : createShootingStars(scene, 5);

  stepDone(1);
  setProgress(56, `SEEDED ${starCount.toLocaleString('en-US')} STARS`);

  /* ---------- post chain: render -> bloom -> grade -> output ---------- */

  stepLive(2);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));

  /* bloom runs its whole mip chain at HALF resolution: it is a blur,
     the difference is invisible, the fillrate saving is large.
     (setSize is overridden BEFORE addPass — both addPass and
     composer.setSize push full pixel dims into the pass.) */
  /* threshold 0.5: only genuinely hot pixels bloom — with 0.0 the whole
     frame glowed and the scene read as washed-out bright */
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.15, 0.9, 0.5);
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) =>
    bloomSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  composer.addPass(bloom);

  const GradeShader = {
    name: 'NebulaGradeShader',
    uniforms: {
      tDiffuse: { value: null },
      uTint: { value: new THREE.Color('#7df9ff') },
      uTintAmt: { value: 0.1 },
      uContrast: { value: 1.02 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec3  uTint;
      uniform float uTintAmt;
      uniform float uContrast;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        col = mix(col, col * (uTint * 1.7 + 0.15), uTintAmt); /* chapter cast */
        col = (col - 0.5) * uContrast + 0.5;                  /* pivot contrast */
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }`,
  };
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  setProgress(74, 'IGNITING CORE');

  document.fonts.ready.then(() => setProgress(88, 'FOCUSING TYPE OPTICS'));

  function updateProjUniform() {
    const projFactor = (H * DPR) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const maxPt = 22 * DPR; /* ~22 CSS px cap: bright sprite, never a wall of white */
    mats.forEach((m) => {
      m.uniforms.uProj.value = projFactor;
      m.uniforms.uMaxSize.value = maxPt;
    });
  }
  updateProjUniform();

  if (REDUCED) {
    /* rotation + twinkle are decoration; freeze them */
    mats.forEach((m) => {
      m.uniforms.uTwinkle.value = 0;
      m.uniforms.uRotation.value = 0;
    });
  }

  /* ---------- per-chapter mood: fog tint, grade, background, bloom ---------- */

  const MOODS = [
    { nebA: '#2a9db8', nebB: '#1c3f8f', fog: 0.95, tint: '#7df9ff', tintAmt: 0.10, contrast: 1.02, bg: '#020409', radius: 0.9 },
    { nebA: '#2f7dd1', nebB: '#6a3fd9', fog: 1.0, tint: '#8fb7ff', tintAmt: 0.12, contrast: 1.04, bg: '#02040c', radius: 0.95 },
    { nebA: '#d94fb2', nebB: '#2fb8c9', fog: 0.8, tint: '#ff6ec7', tintAmt: 0.14, contrast: 1.05, bg: '#070310', radius: 1.05 },
    { nebA: '#e8964a', nebB: '#b8483a', fog: 0.55, tint: '#ffb37a', tintAmt: 0.16, contrast: 1.08, bg: '#080302', radius: 1.15 },
    { nebA: '#5f8fc9', nebB: '#23486e', fog: 0.65, tint: '#c9d6ff', tintAmt: 0.08, contrast: 1.0, bg: '#010309', radius: 0.85 },
  ].map((m) => ({
    ...m,
    nebA: new THREE.Color(m.nebA),
    nebB: new THREE.Color(m.nebB),
    tint: new THREE.Color(m.tint),
    bg: new THREE.Color(m.bg),
  }));

  function applyMood(i, immediate) {
    const m = MOODS[i];
    const d = immediate ? 0 : REDUCED ? 0.3 : 1.6;
    const ease = 'sine.inOut';
    gsap.to(nebula.uniforms.uTintA.value, { r: m.nebA.r, g: m.nebA.g, b: m.nebA.b, duration: d, ease, overwrite: 'auto' });
    gsap.to(nebula.uniforms.uTintB.value, { r: m.nebB.r, g: m.nebB.g, b: m.nebB.b, duration: d, ease, overwrite: 'auto' });
    gsap.to(nebula.uniforms.uIntensity, { value: m.fog, duration: d, ease, overwrite: 'auto' });
    gsap.to(grade.uniforms.uTint.value, { r: m.tint.r, g: m.tint.g, b: m.tint.b, duration: d, ease, overwrite: 'auto' });
    gsap.to(grade.uniforms.uTintAmt, { value: m.tintAmt, duration: d, ease, overwrite: 'auto' });
    gsap.to(grade.uniforms.uContrast, { value: m.contrast, duration: d, ease, overwrite: 'auto' });
    gsap.to(bgColor, { r: m.bg.r, g: m.bg.g, b: m.bg.b, duration: d, ease, overwrite: 'auto' });
    gsap.to(bloom, { radius: m.radius, duration: d, ease, overwrite: 'auto' });
  }

  /* ---------- camera voyage (scroll-scrubbed) ---------- */

  const KEYS = [
    { p: [3.2, 26.5, 30.0], t: [0.0, 0.0, 0.0], bloom: 1.02 },   /* 01 high above the disc */
    { p: [12.6, 3.1, 11.4], t: [3.4, 0.2, -2.6], bloom: 1.1 },   /* 02 diving along the arms */
    { p: [9.8, 1.7, -0.2], t: [7.4, 0.5, -4.8], bloom: 1.05 },   /* 03 drifting through the nursery */
    { p: [2.4, 1.5, 2.7], t: [0.0, 0.15, 0.0], bloom: 0.28 },    /* 04 core approach: bloom EASES DOWN
                                                                    hard — the additive stack near the
                                                                    bulge is hot enough on its own */
    { p: [-4.6, 3.4, 24.5], t: [-1.5, 9.5, -16.0], bloom: 1.0 }, /* 05 pulled back, tilted up */
  ];

  const cam = {
    px: KEYS[0].p[0], py: KEYS[0].p[1], pz: KEYS[0].p[2],
    tx: KEYS[0].t[0], ty: KEYS[0].t[1], tz: KEYS[0].t[2],
    bloom: KEYS[0].bloom,
  };

  const camTl = gsap.timeline({
    defaults: { ease: 'power1.inOut', duration: 1 },
    scrollTrigger: {
      trigger: '#journey',
      start: 'top top',
      end: 'bottom bottom',
      scrub: REDUCED ? true : 1.1,
    },
  });
  for (let i = 1; i < KEYS.length; i++) {
    const k = KEYS[i];
    camTl.to(cam, {
      px: k.p[0], py: k.p[1], pz: k.p[2],
      tx: k.t[0], ty: k.t[1], tz: k.t[2],
      bloom: k.bloom,
    }, i - 1);
  }

  /* smoothing + parallax state */
  const curP = new THREE.Vector3(cam.px, cam.py, cam.pz);
  const curT = new THREE.Vector3(cam.tx, cam.ty, cam.tz);
  const wantP = new THREE.Vector3();
  const wantT = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const upv = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  const skipIntro = REDUCED || window.scrollY > 80;
  const introOffset = new THREE.Vector3(0, skipIntro ? 0 : 7, skipIntro ? 0 : 17);

  const mTgt = { x: 0, y: 0 };
  const mCur = { x: 0, y: 0 };
  const PARALLAX = REDUCED ? 0 : 1;

  /* mouse gravity warp state */
  const WARP_ON = FINE && !REDUCED;
  const warpRay = new THREE.Raycaster();
  const warpPlane = new THREE.Plane();
  const warpHit = new THREE.Vector3();
  const warpPos = new THREE.Vector3();
  const warpNdc = new THREE.Vector2();
  let warpStrength = 0;
  let lastPointerMove = -10;

  window.addEventListener('pointermove', (e) => {
    mTgt.x = (e.clientX / window.innerWidth) * 2 - 1;
    mTgt.y = (e.clientY / window.innerHeight) * 2 - 1;
    lastPointerMove = performance.now() * 0.001;
  });

  /* ---------- DOM: rail, hud, reveals ---------- */

  const sections = gsap.utils.toArray('.chapter');
  const dots = gsap.utils.toArray('.rail-dot');
  const railFill = document.getElementById('rail-fill');
  const hudDist = document.getElementById('hud-dist');
  const hudVel = document.getElementById('hud-vel');
  const hudCh = document.getElementById('hud-ch');

  gsap.set(['.site-head', '#rail', '#hud'], { autoAlpha: 0 });
  gsap.set('.site-head', { y: -14 });
  gsap.set('#rail', { x: 14 });

  let activeChapter = -1;
  function setActive(i) {
    if (i === activeChapter) return;
    const first = activeChapter === -1;
    activeChapter = i;
    dots.forEach((d, j) => d.classList.toggle('is-active', j === i));
    hudCh.textContent = `0${i + 1} / 05`;
    applyMood(i, first);
  }
  setActive(0);

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => goTo(sections[i]));
  });

  document.getElementById('restart').addEventListener('click', () => goTo(0));

  const wordmark = document.querySelector('.wordmark');
  if (wordmark && lenis) {
    wordmark.addEventListener('click', (e) => {
      e.preventDefault();
      goTo(0);
    });
  }

  function initScrollUI() {
    sections.forEach((sec, i) => {
      ScrollTrigger.create({
        trigger: sec,
        start: 'top 50%',
        end: 'bottom 50%',
        onToggle: (self) => {
          if (self.isActive) setActive(i);
        },
      });
    });
    gsap.to('.scroll-cue', {
      autoAlpha: 0,
      ease: 'none',
      scrollTrigger: { start: 40, end: 320, scrub: true },
    });
  }

  /* ---------- chapter reveals: masked char cascades + scramble ---------- */

  const SCRAM_GLYPHS = '█▓▒░<>/·─┐┘×';
  const SCRAM_DIGITS = '0123456789·×/';

  function initReveals() {
    sections.forEach((sec) => {
      const lines = sec.querySelectorAll('.line-inner');
      const items = sec.querySelectorAll('[data-reveal]');

      /* headline: split to chars when SplitText made it through the CDN,
         otherwise fall back to the whole-line mask reveal */
      let lineTargets = lines;
      if (CAN_SPLIT) {
        const split = new window.SplitText(lines, { type: 'words,chars' });
        lineTargets = split.chars;
      }

      /* mono strings that scramble in */
      const scrambles = [];
      if (CAN_SCRAMBLE) {
        const kName = sec.querySelector('.kicker span:last-child');
        if (kName) scrambles.push({ el: kName, text: kName.textContent, chars: 'upperCase' });
        const status = sec.querySelector('.hero-status');
        if (status) scrambles.push({ el: status, text: status.textContent, chars: SCRAM_GLYPHS });
        sec.querySelectorAll('.stats dd').forEach((dd) => {
          scrambles.push({ el: dd, text: dd.textContent, chars: SCRAM_DIGITS });
        });
      }

      gsap.set(lineTargets, { yPercent: 115 });
      gsap.set(items, { autoAlpha: 0, y: 26 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sec,
          start: 'top 62%',
          toggleActions: 'play none none reverse',
        },
        defaults: { ease: 'power3.out' },
      });

      tl.to(lineTargets, {
        yPercent: 0,
        duration: REDUCED ? 0.01 : CAN_SPLIT ? 0.85 : 1.1,
        stagger: CAN_SPLIT ? 0.016 : 0.1,
      }, 0)
        .to(items, { autoAlpha: 1, y: 0, duration: REDUCED ? 0.01 : 0.9, stagger: 0.09 }, 0.28);

      scrambles.forEach((s, i) => {
        tl.to(s.el, {
          duration: 0.85 + Math.min(s.text.length * 0.008, 0.5),
          scrambleText: { text: s.text, chars: s.chars, speed: 0.4 },
          ease: 'none',
        }, 0.32 + i * 0.07);
      });
    });
  }

  /* ---------- custom cursor ---------- */

  const cursor = document.getElementById('cursor');
  const cursorDot = cursor.querySelector('.cursor-dot');
  const cursorRing = cursor.querySelector('.cursor-ring');
  const cursorOn = FINE && !REDUCED;
  const rawM = { x: W / 2, y: H / 2 };
  const ringM = { x: W / 2, y: H / 2 };

  if (cursorOn) {
    document.documentElement.classList.add('has-cursor');
    window.addEventListener('pointermove', (e) => {
      rawM.x = e.clientX;
      rawM.y = e.clientY;
      cursor.classList.add('is-visible');
    });
    document.addEventListener('mouseleave', () => cursor.classList.remove('is-visible'));
    document.querySelectorAll('a, button').forEach((el) => {
      el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
    });
  }

  /* ---------- loader close + intro moment ---------- */

  onLoaderClose = () => {
    document.documentElement.classList.remove('is-loading');
    initReveals();
    initScrollUI();
    ScrollTrigger.refresh();
    if (lenis) lenis.start();

    gsap.timeline()
      .to('.loader-core', {
        autoAlpha: 0,
        y: -16,
        duration: REDUCED ? 0.2 : 0.35,
        ease: 'power2.in',
        delay: 0.05,
      })
      .to(loaderEl, {
        autoAlpha: 0,
        duration: REDUCED ? 0.2 : 0.55,
        ease: 'power1.inOut',
      }, '-=0.1')
      .add(() => {
        loaderEl.style.display = 'none';
      });

    if (skipIntro) {
      introOffset.set(0, 0, 0);
    } else {
      gsap.to(introOffset, { x: 0, y: 0, z: 0, duration: 3.6, ease: 'power2.inOut' });
    }

    gsap.timeline({ defaults: { ease: 'power3.out', duration: REDUCED ? 0.01 : 1 } })
      .to('.site-head', { autoAlpha: 1, y: 0 }, 0.5)
      .to('#rail', { autoAlpha: 1, x: 0 }, 0.65)
      .to('#hud', { autoAlpha: 1 }, 0.8);
  };

  /* ---------- resize ---------- */

  function applySize() {
    W = window.innerWidth;
    H = window.innerHeight;
    if (W === 0 || H === 0) return; /* hidden/background tab: try again later */
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(DPR);
    renderer.setSize(W, H);
    composer.setPixelRatio(DPR);
    composer.setSize(W, H);
    nebula.setSize(W, H);
    updateProjUniform();
  }

  window.addEventListener('resize', applySize);

  /* ---------- the one render loop ---------- */

  const clock = new THREE.Clock();
  let elapsed = 0;
  let hudTimer = 0;
  let vSmooth = 0;
  const prevPos = new THREE.Vector3().copy(curP);

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);

    /* self-heal if the page booted in a hidden tab (0x0 viewport)
       or the browser skipped a resize event */
    if (W !== window.innerWidth || H !== window.innerHeight) applySize();
    if (W === 0 || H === 0) return;

    if (!REDUCED) {
      elapsed += dt;
      for (let i = 0; i < mats.length; i++) mats[i].uniforms.uTime.value = elapsed;
    }

    /* smooth camera toward scrubbed keyframe state */
    const k = REDUCED ? 1 : 1 - Math.exp(-dt * 6);
    mCur.x += (mTgt.x - mCur.x) * (1 - Math.exp(-dt * 3.2));
    mCur.y += (mTgt.y - mCur.y) * (1 - Math.exp(-dt * 3.2));

    wantP.set(cam.px, cam.py, cam.pz).add(introOffset);
    wantT.set(cam.tx, cam.ty, cam.tz);
    curP.lerp(wantP, k);
    curT.lerp(wantT, k);

    /* camera-space parallax basis */
    fwd.copy(curT).sub(curP).normalize();
    right.crossVectors(fwd, UP);
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    right.normalize();
    upv.crossVectors(right, fwd).normalize();

    camera.position.copy(curP)
      .addScaledVector(right, mCur.x * 0.6 * PARALLAX)
      .addScaledVector(upv, -mCur.y * 0.4 * PARALLAX);
    camera.lookAt(curT);
    camera.updateMatrixWorld();

    /* gravity warp: cursor ray -> plane through the look target;
       strength eases up while the pointer moves, springs home when idle */
    if (WARP_ON) {
      const nowS = performance.now() * 0.001;
      const moving = nowS - lastPointerMove < 0.3;
      const target = moving ? 1 : 0;
      warpStrength += (target - warpStrength) * (1 - Math.exp(-dt * (moving ? 5 : 1.9)));

      warpNdc.set(mCur.x, -mCur.y);
      warpRay.setFromCamera(warpNdc, camera);
      warpPlane.setFromNormalAndCoplanarPoint(fwd, curT);
      if (warpRay.ray.intersectPlane(warpPlane, warpHit)) {
        warpPos.lerp(warpHit, 1 - Math.exp(-dt * 5));
      }

      for (let i = 0; i < warpMats.length; i++) {
        warpMats[i].uniforms.uWarpPos.value.copy(warpPos);
        warpMats[i].uniforms.uWarpStrength.value = warpStrength;
      }
    }

    if (shooters) shooters.update(dt);

    /* core-approach dimming: as the camera nears the galactic centre,
       per-star brightness eases down (with the per-point near fade in
       the shader) so the additive sum stays luminous, never blinding */
    const coreDim = 0.22 + 0.78 * THREE.MathUtils.smoothstep(camera.position.length(), 2.2, 10.0);
    for (let i = 0; i < warpMats.length; i++) {
      warpMats[i].uniforms.uCoreDim.value = coreDim;
    }

    bloom.strength = cam.bloom * (SMALL ? 0.9 : 1);

    nebula.render(renderer, camera, REDUCED ? 0 : elapsed);
    composer.render();

    if (!firstFrameDone) {
      firstFrameDone = true;
      stepDone(2);
      setProgress(100, 'FIRST LIGHT');
    }

    /* rail progress */
    if (camTl.scrollTrigger) {
      railFill.style.transform = `scaleY(${camTl.scrollTrigger.progress})`;
    }

    /* custom cursor */
    if (cursorOn) {
      const ck = 1 - Math.exp(-dt * 16);
      ringM.x += (rawM.x - ringM.x) * ck;
      ringM.y += (rawM.y - ringM.y) * ck;
      cursorDot.style.transform = `translate3d(${rawM.x}px, ${rawM.y}px, 0)`;
      cursorRing.style.transform = `translate3d(${ringM.x}px, ${ringM.y}px, 0)`;
    }

    /* hud readouts, ~8 Hz */
    hudTimer += dt;
    if (hudTimer > 0.12) {
      const speed = camera.position.distanceTo(prevPos) / Math.max(hudTimer, 0.001);
      vSmooth += (speed - vSmooth) * 0.25;
      prevPos.copy(camera.position);
      hudTimer = 0;
      hudDist.textContent = `${Math.round(camera.position.length() * 1300).toLocaleString('en-US')} LY`;
      hudVel.textContent = `${Math.min(vSmooth * 0.031, 9.99).toFixed(2)} c`;
    }
  }

  renderer.setAnimationLoop(tick);

  /* hard-stop all GPU work in hidden tabs (rAF already throttles,
     this makes it explicit and drops the loop entirely) */
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : tick);
  });
}
