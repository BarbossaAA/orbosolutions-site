/* ============================================================
   NEBULA — main.js
   Renderer + bloom chain, GSAP-scrubbed camera voyage,
   loader sequence, chapter reveals, rail, HUD, custom cursor.
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGalaxy, createNursery, createStarfield } from './galaxy.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(pointer: fine)').matches;
const SMALL = window.innerWidth < 860;

document.documentElement.classList.add('is-loading');

/* ------------------------------------------------ loader state */

const loaderEl = document.getElementById('loader');
const fillEl = document.getElementById('loader-fill');
const pctEl = document.getElementById('loader-pct');
const labelEl = document.getElementById('loader-label');

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
    duration: REDUCED ? 0.15 : 0.7,
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
  boot();
}

function boot() {
  setProgress(18, 'CALIBRATING OPTICS');

  let W = window.innerWidth;
  let H = window.innerHeight;
  let DPR = Math.min(window.devicePixelRatio || 1, 2);

  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H);
  renderer.setClearColor(new THREE.Color('#020409'), 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 500);

  /* ---------- procedural sky ---------- */

  const starCount = SMALL ? 45000 : 80000;
  const nurseryCount = SMALL ? 8000 : 14000;
  const fieldCount = SMALL ? 1800 : 3200;

  const galaxy = createGalaxy(starCount);
  const nursery = createNursery(nurseryCount);
  const field = createStarfield(fieldCount);
  scene.add(galaxy.points, nursery.points, field.points);

  const mats = [galaxy.material, nursery.material, field.material];

  setProgress(58, `SEEDING ${starCount.toLocaleString('en-US')} STARS`);

  /* ---------- post chain ---------- */

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.15, 0.9, 0.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  setProgress(74, 'ALIGNING SPIRAL ARMS');

  document.fonts.ready.then(() => setProgress(88, 'FOCUSING TYPE OPTICS'));

  function updateProjUniform() {
    const projFactor = (H * DPR) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    mats.forEach((m) => {
      m.uniforms.uProj.value = projFactor;
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

  /* ---------- camera voyage (scroll-scrubbed) ---------- */

  const KEYS = [
    { p: [3.2, 26.5, 30.0], t: [0.0, 0.0, 0.0], bloom: 1.02 },   /* 01 high above the disc */
    { p: [12.6, 3.1, 11.4], t: [3.4, 0.2, -2.6], bloom: 1.1 },   /* 02 diving along the arms */
    { p: [9.8, 1.7, -0.2], t: [7.4, 0.5, -4.8], bloom: 1.24 },   /* 03 drifting through the nursery */
    { p: [2.4, 1.5, 2.7], t: [0.0, 0.15, 0.0], bloom: 1.4 },     /* 04 pushing into the core */
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
  window.addEventListener('pointermove', (e) => {
    mTgt.x = (e.clientX / window.innerWidth) * 2 - 1;
    mTgt.y = (e.clientY / window.innerHeight) * 2 - 1;
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
    activeChapter = i;
    dots.forEach((d, j) => d.classList.toggle('is-active', j === i));
    hudCh.textContent = `0${i + 1} / 05`;
  }
  setActive(0);

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      window.scrollTo({
        top: sections[i].offsetTop,
        behavior: REDUCED ? 'auto' : 'smooth',
      });
    });
  });

  document.getElementById('restart').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  });

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

  function initReveals() {
    sections.forEach((sec) => {
      const lines = sec.querySelectorAll('.line-inner');
      const items = sec.querySelectorAll('[data-reveal]');
      gsap.set(lines, { yPercent: 115 });
      gsap.set(items, { autoAlpha: 0, y: 26 });
      gsap.timeline({
        scrollTrigger: {
          trigger: sec,
          start: 'top 62%',
          toggleActions: 'play none none reverse',
        },
        defaults: { ease: 'power3.out' },
      })
        .to(lines, { yPercent: 0, duration: REDUCED ? 0.01 : 1.1, stagger: 0.1 }, 0)
        .to(items, { autoAlpha: 1, y: 0, duration: REDUCED ? 0.01 : 0.9, stagger: 0.09 }, 0.28);
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

    gsap.timeline()
      .to('.loader-core', {
        autoAlpha: 0,
        y: -16,
        duration: REDUCED ? 0.2 : 0.55,
        ease: 'power2.in',
        delay: 0.3,
      })
      .to(loaderEl, {
        autoAlpha: 0,
        duration: REDUCED ? 0.2 : 0.9,
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
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(DPR);
    renderer.setSize(W, H);
    composer.setPixelRatio(DPR);
    composer.setSize(W, H);
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
      mats.forEach((m) => {
        m.uniforms.uTime.value = elapsed;
      });
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

    bloom.strength = cam.bloom * (SMALL ? 0.9 : 1);

    composer.render();

    if (!firstFrameDone) {
      firstFrameDone = true;
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
}
