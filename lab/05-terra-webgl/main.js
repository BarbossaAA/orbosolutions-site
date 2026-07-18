/*
 * TERRA — main.js
 * Loader, slider state machine, input (wheel / drag / keys),
 * DOM choreography and the custom cursor. One rAF loop drives
 * the WebGL stage and the cursor.
 */

import { PROJECTS } from './data.js';
import { generateProjectCanvas } from './textures.js';
import { Stage } from './gl.js';

const gsap = window.gsap;

const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(pointer: fine)').matches;
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const N = PROJECTS.length;

const els = {
  loader: document.getElementById('loader'),
  loaderPct: document.getElementById('loaderPct'),
  loaderFill: document.getElementById('loaderFill'),
  loaderNote: document.getElementById('loaderNote'),
  canvas: document.getElementById('gl'),
  eyebrow: document.getElementById('eyebrow'),
  title: document.getElementById('title'),
  meta: document.getElementById('meta'),
  desc: document.getElementById('desc'),
  counterWin: document.getElementById('counterWin'),
  railFill: document.getElementById('railFill'),
  hint: document.getElementById('hint'),
  cursorRing: document.getElementById('cursorRing'),
  cursorDot: document.getElementById('cursorDot')
};

let stage = null;
let textures = [];
let index = 0;
let state = 'loading';            // loading | idle | drag | anim
const trans = { p: 0 };
let prevP = 0;
let vel = 0;
let hintDimmed = false;

/* Wheel gating — one gesture, one slide. */
let wheelArmed = true;
let wheelAcc = 0;
let lastWheel = 0;
let lockUntil = 0;

/* Cursor */
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let ringX = mouseX;
let ringY = mouseY;
let cursorSeen = false;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pad2 = (n) => String(n).padStart(2, '0');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let titleQuickX = null;
let titleQuickO = null;

boot();

/* ------------------------------------------------------------- boot */

async function boot() {
  document.documentElement.style.setProperty('--accent', PROJECTS[0].accent);

  try {
    stage = new Stage(els.canvas, { reducedMotion: RM });
  } catch (err) {
    document.body.classList.add('no-webgl');
  }

  if (stage) {
    for (let i = 0; i < N; i++) {
      const project = PROJECTS[i];
      const canvas = await generateProjectCanvas(project.id, (f) => {
        setLoad((i + f) / N, project.name, i);
      });
      textures.push(stage.makeTexture(canvas));
    }
    stage.setTextures(textures[0], textures[0]);
  }
  setLoad(1, PROJECTS[N - 1].name, N - 1);

  buildSlideDom(PROJECTS[0]);
  buildCounter();
  if (COARSE) els.hint.textContent = 'Swipe to explore';

  titleQuickX = gsap.quickSetter(els.title, 'x', 'px');
  titleQuickO = gsap.quickSetter(els.title, 'opacity');

  await Promise.race([document.fonts.ready, delay(2500)]);

  bindInput();
  startLoop();
  intro();

  // Verification hook, only active with ?debug in the URL.
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__TERRA__ = {
      stage,
      textures,
      trans,
      advance,
      getState: () => state,
      getIndex: () => index
    };
  }
}

function setLoad(fraction, name, i) {
  const pct = Math.min(100, Math.round(fraction * 100));
  els.loaderPct.textContent = pad2(pct);
  els.loaderFill.style.transform = `scaleX(${fraction})`;
  if (name) {
    els.loaderNote.textContent = `Rendering ${name.toUpperCase()} field — ${pad2(i + 1)}/${pad2(N)}`;
  }
}

/* -------------------------------------------------------------- dom */

function buildSlideDom(project) {
  els.eyebrow.textContent = `No. ${project.no} — ${project.name}`;
  els.title.innerHTML = project.lines
    .map((line, i) =>
      `<span class="t-line"><span class="t-line__in${i === 1 ? ' is-italic' : ''}">${line}</span></span>`)
    .join('');
  els.meta.innerHTML = [
    ['Year', project.year],
    ['Coordinates', project.coords],
    ['Medium', project.medium]
  ]
    .map(([label, value]) =>
      `<li class="meta__item"><span class="meta__label">${label}</span><span class="meta__value">${value}</span></li>`)
    .join('');
  els.desc.textContent = project.desc;
}

function buildCounter() {
  const num = document.createElement('span');
  num.className = 'counter__num';
  num.textContent = pad2(index + 1);
  els.counterWin.appendChild(num);
}

function rollCounter(next) {
  const win = els.counterWin;
  const old = win.querySelector('.counter__num');
  const span = document.createElement('span');
  span.className = 'counter__num';
  span.textContent = pad2(next + 1);
  win.appendChild(span);
  if (RM) {
    if (old) old.remove();
    return;
  }
  gsap.set(span, { yPercent: 120 });
  if (old) {
    gsap.to(old, { yPercent: -120, duration: 0.55, ease: 'power2.in', onComplete: () => old.remove() });
  }
  gsap.to(span, { yPercent: 0, duration: 0.75, delay: 0.28, ease: 'power3.out' });
}

function playDomSwap(next) {
  const project = PROJECTS[next];

  rollCounter(next);
  gsap.to(document.documentElement, {
    '--accent': project.accent,
    duration: RM ? 0.3 : 1.1,
    ease: 'power2.inOut'
  });
  gsap.to(els.railFill, {
    scaleY: (next + 1) / N,
    duration: RM ? 0.3 : 1.2,
    ease: 'power3.inOut'
  });

  if (RM) {
    const tl = gsap.timeline();
    tl.to([els.title, els.eyebrow, els.meta, els.desc], { opacity: 0, duration: 0.18 })
      .add(() => buildSlideDom(project))
      .to([els.title, els.eyebrow, els.meta, els.desc], { opacity: 1, duration: 0.25 });
    return;
  }

  const oldLines = els.title.querySelectorAll('.t-line__in');
  const tl = gsap.timeline();
  tl.to(oldLines, { yPercent: -112, duration: 0.5, stagger: 0.05, ease: 'power2.in' }, 0)
    .to([els.eyebrow, els.meta, els.desc], { y: -12, opacity: 0, duration: 0.4, ease: 'power2.in' }, 0.02)
    .add(() => {
      buildSlideDom(project);
      gsap.set([els.eyebrow, els.meta, els.desc], { y: 0, opacity: 1 });
      const inners = els.title.querySelectorAll('.t-line__in');
      const chips = els.meta.querySelectorAll('.meta__item');
      gsap.from(inners, { yPercent: 114, duration: 0.95, stagger: 0.075, ease: 'power3.out' });
      gsap.from(els.eyebrow, { y: 14, opacity: 0, duration: 0.55, ease: 'power3.out' });
      gsap.from(chips, { y: 12, opacity: 0, duration: 0.55, stagger: 0.05, delay: 0.08, ease: 'power3.out' });
      gsap.from(els.desc, { y: 10, opacity: 0, duration: 0.55, delay: 0.14, ease: 'power2.out' });
    }, 0.55);
}

function dimHint() {
  if (hintDimmed) return;
  hintDimmed = true;
  gsap.to(els.hint, { opacity: 0.3, duration: 0.8, delay: 1 });
}

/* ------------------------------------------------------- transitions */

function advance(dir) {
  if (state !== 'idle') return;
  startTransition((index + dir + N) % N, dir, 0);
}

function startTransition(next, dir, fromP) {
  state = 'anim';
  if (stage) {
    stage.uniforms.uTexB.value = textures[next];
    stage.uniforms.uDirection.value = dir;
  }
  const remaining = Math.max(0.35, 1 - fromP);
  gsap.to(trans, {
    p: 1,
    duration: (RM ? 0.6 : 1.45) * remaining,
    ease: fromP > 0 ? 'power2.out' : 'power2.inOut',
    overwrite: true,
    onComplete: () => finishTransition(next)
  });
  playDomSwap(next);
  dimHint();
}

function finishTransition(next) {
  index = next;
  if (stage) {
    stage.uniforms.uTexA.value = textures[next];
    stage.uniforms.uProgress.value = 0;
  }
  trans.p = 0;
  prevP = 0;
  state = 'idle';
  wheelAcc = 0;
  wheelArmed = false;                       // require a fresh gesture
  lockUntil = performance.now() + 300;      // swallow inertia tail
}

/* ------------------------------------------------------------- input */

function bindInput() {
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('resize', () => { if (stage) stage.resize(); });

  if (FINE && !RM) {
    document.body.classList.add('has-cursor');
    document.addEventListener('mouseover', (e) => {
      document.body.classList.toggle('is-hover', !!e.target.closest('a'));
    });
    document.addEventListener('mouseleave', () => {
      document.body.classList.remove('is-cursor-active');
      cursorSeen = false;
    });
  }
}

function onWheel(e) {
  const now = performance.now();
  const gap = now - lastWheel;
  lastWheel = now;

  if (state !== 'idle' || now < lockUntil) {
    wheelArmed = false;
    wheelAcc = 0;
    return;
  }
  if (!wheelArmed) {
    if (gap > 300) { wheelArmed = true; wheelAcc = 0; }
    else return;
  }
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) > 80) {
    const dir = wheelAcc > 0 ? 1 : -1;
    wheelArmed = false;
    wheelAcc = 0;
    advance(dir);
  }
}

function onKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    advance(1);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    advance(-1);
  }
}

let drag = null;

function onPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  trackCursor(e);
  if (state !== 'idle') return;
  drag = { x0: e.clientX, active: false, dir: 0, target: -1 };
}

function onPointerMove(e) {
  trackCursor(e);
  if (!drag) return;

  const dx = e.clientX - drag.x0;
  if (!drag.active) {
    if (Math.abs(dx) < 8) return;
    drag.active = true;
    drag.dir = dx < 0 ? 1 : -1;
    drag.target = (index + drag.dir + N) % N;
    if (stage) {
      stage.uniforms.uTexB.value = textures[drag.target];
      stage.uniforms.uDirection.value = drag.dir;
    }
    state = 'drag';
    document.body.classList.add('is-dragging');
  }

  const raw = (drag.dir === 1 ? -dx : dx) / (window.innerWidth * 0.7);
  trans.p = clamp(raw, 0, 0.42);

  if (!RM) {
    titleQuickX(dx * 0.05);
    titleQuickO(Math.max(0.25, 1 - trans.p * 1.8));
  }
}

function onPointerUp() {
  document.body.classList.remove('is-dragging');
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.active) return;

  gsap.to(els.title, { x: 0, opacity: 1, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });

  if (trans.p > 0.13) {
    startTransition(d.target, d.dir, trans.p);
  } else {
    state = 'anim';
    gsap.to(trans, {
      p: 0,
      duration: 0.55,
      ease: 'power3.out',
      overwrite: true,
      onComplete: () => { trans.p = 0; prevP = 0; state = 'idle'; }
    });
  }
}

function trackCursor(e) {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (!cursorSeen && FINE && !RM) {
    cursorSeen = true;
    ringX = mouseX;
    ringY = mouseY;
    document.body.classList.add('is-cursor-active');
  }
}

/* --------------------------------------------------------------- loop */

function startLoop() {
  let lastT = performance.now();

  const tick = (now) => {
    const dt = Math.min(50, now - lastT) / 1000;
    lastT = now;

    // Velocity: smoothed dp/dt, decays to zero after each tween.
    const dp = trans.p - prevP;
    prevP = trans.p;
    const target = clamp((dp / Math.max(dt, 1e-3)) * 0.55, -1.2, 1.2);
    vel += (target - vel) * Math.min(1, dt * 7);
    if (Math.abs(vel) < 0.0005) vel = 0;

    // Cursor follow.
    if (FINE && !RM) {
      const k = Math.min(1, dt * 11);
      ringX += (mouseX - ringX) * k;
      ringY += (mouseY - ringY) * k;
      els.cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      els.cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
    }

    if (stage) {
      stage.uniforms.uProgress.value = trans.p;
      stage.uniforms.uVelocity.value = RM ? 0 : vel;
      stage.render(now / 1000);
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame((t) => { lastT = t; tick(t); });
}

/* -------------------------------------------------------------- intro */

function intro() {
  document.body.classList.add('is-ready');

  if (RM) {
    gsap.set(els.railFill, { scaleY: 1 / N });
    gsap.to(els.loader, {
      opacity: 0,
      duration: 0.4,
      onComplete: () => {
        els.loader.style.display = 'none';
        state = 'idle';
      }
    });
    return;
  }

  const inners = els.title.querySelectorAll('.t-line__in');
  const chips = els.meta.querySelectorAll('.meta__item');

  const tl = gsap.timeline({ onComplete: () => { state = 'idle'; } });
  tl.to(els.loaderFill, { scaleX: 1, duration: 0.25, ease: 'power1.inOut' })
    .to(els.loader, { yPercent: -100, duration: 0.95, ease: 'power4.inOut', delay: 0.3 })
    .set(els.loader, { display: 'none' })
    .from(els.canvas, { opacity: 0, scale: 1.06, duration: 1.4, ease: 'power2.out' }, '-=0.55')
    .from('.site-head > *', { y: -18, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, '-=1.0')
    .from(els.eyebrow, { y: 16, opacity: 0, duration: 0.6, ease: 'power3.out' }, '-=0.7')
    .from(inners, { yPercent: 112, duration: 1.0, stagger: 0.09, ease: 'power3.out' }, '-=0.65')
    .from(chips, { y: 14, opacity: 0, duration: 0.6, stagger: 0.06, ease: 'power3.out' }, '-=0.7')
    .from(els.desc, { y: 12, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.6')
    .from('.counter', { y: 12, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.55')
    .fromTo(els.railFill, { scaleY: 0 }, { scaleY: 1 / N, duration: 0.9, ease: 'power3.inOut' }, '-=0.6')
    .from('.rail', { opacity: 0, duration: 0.5 }, '<')
    .from(els.hint, { opacity: 0, duration: 0.6 }, '-=0.4');
}
