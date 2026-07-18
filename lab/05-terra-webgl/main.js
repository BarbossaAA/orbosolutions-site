/*
 * TERRA — main.js
 * Loader, slider state machine, input (wheel / drag / keys),
 * DOM choreography, custom cursor, height-parallax mouse feed
 * and the field-report overlay wiring. One rAF loop drives the
 * WebGL stage and the cursor.
 */

import { PROJECTS } from './data.js';
import { generateProjectCanvas } from './textures.js';
import { Stage } from './gl.js';
import { createReport } from './report.js';

const gsap = window.gsap;
if (window.SplitText) gsap.registerPlugin(window.SplitText);

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
  reportCta: document.getElementById('reportCta'),
  cursorRing: document.getElementById('cursorRing'),
  cursorDot: document.getElementById('cursorDot')
};

let stage = null;
let report = null;
let textures = [];         // [{ tex, height }] — sparse; slides fill in from idle time
let mapFields = [];        // [{ field, size }] — same noise field as the textures
let placeholderSlot = null; // tiny neutral slot for not-yet-generated slides
let slotBIndex = -1;       // which slide currently occupies shader slot B
let index = 0;
let state = 'loading';     // loading | idle | drag | anim | report
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

/* Render gating */
let pageVisible = !document.hidden;
let onScreen = true;

/* SplitText bookkeeping for the slide title */
let titleSplit = null;
let titleInTween = null;
let introTl = null;        // intro timeline — completed + killed on an early swipe

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pad2 = (n) => String(n).padStart(2, '0');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let titleQuickX = null;
let titleQuickO = null;

boot();

/* ------------------------------------------------------------- boot */

async function boot() {
  document.documentElement.style.setProperty('--accent', PROJECTS[0].accent);

  // Fonts load in parallel with texture generation. display=swap means
  // text never blocks on them — this short race only steadies SplitText
  // metrics for the intro; it does not gate first paint on the network.
  const fontsReady = Promise.race([document.fonts.ready, delay(800)]);

  try {
    stage = new Stage(els.canvas, { reducedMotion: RM });
  } catch (err) {
    document.body.classList.add('no-webgl');
  }

  if (stage) {
    // Slide 1 only — the loader reflects first-slide readiness. The other
    // four fields generate in idle time while the user is already looking.
    placeholderSlot = stage.makePlaceholder();
    const first = PROJECTS[0];
    const gen = await generateProjectCanvas(first.id, (f) => setLoad(f, first.name, 0));
    textures[0] = {
      tex: stage.makeTexture(gen.canvas),
      height: stage.makeTexture(gen.heightCanvas)
    };
    mapFields[0] = { field: gen.mapField, size: gen.mapSize };
    stage.setSlide(textures[0], textures[0]);
    stage.setPalette(first.accent);
    stage.initTexture(textures[0]);
  }
  setLoad(1, PROJECTS[0].name, 0);

  report = createReport({ stage, RM, onRequestClose: closeReport });

  buildSlideDom(PROJECTS[0]);
  buildCounter();
  if (COARSE) els.hint.textContent = 'Swipe to explore';

  titleQuickX = gsap.quickSetter(els.title, 'x', 'px');
  titleQuickO = gsap.quickSetter(els.title, 'opacity');

  await fontsReady;

  bindInput();
  startLoop();
  intro();

  if (stage) generateRemaining();

  // Verification hook, only active with ?debug in the URL.
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__TERRA__ = {
      stage,
      textures,
      trans,
      advance,
      openReport,
      closeReport,
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

/* ------------------------------------------- background texture stream */

/* Slides 2-5 build in requestIdleCallback slices after first paint.
   Each finished set is pre-uploaded to the GPU and hot-swapped into any
   slot currently showing its shimmer placeholder. */
async function generateRemaining() {
  for (let i = 1; i < N; i++) {
    const gen = await generateProjectCanvas(PROJECTS[i].id, undefined, { idle: true });
    const slot = {
      tex: stage.makeTexture(gen.canvas),
      height: stage.makeTexture(gen.heightCanvas)
    };
    stage.initTexture(slot);         // upload now, not on first swipe
    textures[i] = slot;
    mapFields[i] = { field: gen.mapField, size: gen.mapSize };
    onTextureReady(i);
  }
}

function slotFor(i) {
  return textures[i] || placeholderSlot;
}

function onTextureReady(i) {
  const slot = textures[i];
  if (i === index) {
    stage.uniforms.uTexA.value = slot.tex;
    stage.uniforms.uHeightA.value = slot.height;
    gsap.to(stage.uniforms.uPlaceholderA, {
      value: 0, duration: 0.8, ease: 'power2.out', overwrite: true
    });
  }
  if (i === slotBIndex) {
    stage.uniforms.uTexB.value = slot.tex;
    stage.uniforms.uHeightB.value = slot.height;
    gsap.to(stage.uniforms.uPlaceholderB, {
      value: 0, duration: 0.5, ease: 'power2.out', overwrite: true
    });
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

/* Split the title's line inners into chars; null when unavailable. */
function splitTitle() {
  if (!window.SplitText || RM) return null;
  try {
    return new window.SplitText(els.title.querySelectorAll('.t-line__in'), { type: 'chars' });
  } catch (e) {
    return null;
  }
}

function playDomSwap(next, dir = 1) {
  const project = PROJECTS[next];

  // Input unlocks at ~1.35s but the intro tail (desc/counter/CTA/rail/hint)
  // runs until ~3.5s. On an early swipe, jump the intro to its end state and
  // kill it BEFORE creating any swap tweens — otherwise its pending from/
  // fromTo tweens fire later and stomp this swap (e.g. the rail-fill fromTo
  // would snap the progress rail back to slide 1's fill, and the hint
  // fade-in would override dimHint()).
  if (introTl) { introTl.progress(1).kill(); introTl = null; }

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

  // Clear any in-flight title split from the previous swap.
  if (titleInTween) { titleInTween.kill(); titleInTween = null; }
  if (titleSplit) { titleSplit.revert(); titleSplit = null; }

  const outSplit = splitTitle();
  const outTargets = outSplit ? outSplit.chars : els.title.querySelectorAll('.t-line__in');
  const tl = gsap.timeline();
  tl.to(outTargets, {
    yPercent: -115,
    duration: outSplit ? 0.55 : 0.5,
    stagger: outSplit ? { each: 0.015, from: dir === 1 ? 'start' : 'end' } : 0.05,
    ease: 'power2.in'
  }, 0)
    // overwrite:'auto' kills any still-running in-tweens on these elements
    // from a previous rapid swap. (Intro tweens are handled by the introTl
    // complete+kill at the top of playDomSwap — overwrite alone can't reach
    // intro tail tweens that haven't started yet.)
    .to([els.eyebrow, els.meta, els.desc], { y: -12, opacity: 0, duration: 0.4, ease: 'power2.in', overwrite: 'auto' }, 0.02)
    .add(() => {
      buildSlideDom(project);
      gsap.set([els.eyebrow, els.meta, els.desc], { y: 0, opacity: 1 });
      titleSplit = splitTitle();
      const inTargets = titleSplit ? titleSplit.chars : els.title.querySelectorAll('.t-line__in');
      const chips = els.meta.querySelectorAll('.meta__item');
      titleInTween = gsap.from(inTargets, {
        yPercent: 115,
        duration: 0.95,
        stagger: titleSplit ? { each: 0.02, from: dir === 1 ? 'start' : 'end' } : 0.075,
        ease: 'power3.out',
        onComplete: () => {
          if (titleSplit) { titleSplit.revert(); titleSplit = null; }
          titleInTween = null;
        }
      });
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
    const slot = slotFor(next);
    gsap.killTweensOf(stage.uniforms.uPlaceholderB);
    stage.uniforms.uTexB.value = slot.tex;
    stage.uniforms.uHeightB.value = slot.height;
    stage.uniforms.uPlaceholderB.value = textures[next] ? 0 : 1;
    stage.uniforms.uDirection.value = dir;
    stage.setPalette(PROJECTS[next].accent);
    slotBIndex = next;
  }
  const remaining = Math.max(0.35, 1 - fromP);
  gsap.to(trans, {
    p: 1,
    duration: (RM ? 0.6 : 1.45) * remaining,
    ease: fromP > 0 ? 'power2.out' : 'power2.inOut',
    overwrite: true,
    onComplete: () => finishTransition(next)
  });
  playDomSwap(next, dir);
  dimHint();
}

function finishTransition(next) {
  index = next;
  if (stage) {
    const slot = slotFor(next);
    const ready = !!textures[next];
    gsap.killTweensOf(stage.uniforms.uPlaceholderA);
    stage.uniforms.uTexA.value = slot.tex;
    stage.uniforms.uHeightA.value = slot.height;
    // If the texture landed mid-transition its B-slot shimmer may still
    // be fading — carry that fade over to A so there is no pop.
    const pb = stage.uniforms.uPlaceholderB.value;
    gsap.killTweensOf(stage.uniforms.uPlaceholderB);
    if (ready && pb > 0.001) {
      stage.uniforms.uPlaceholderA.value = pb;
      gsap.to(stage.uniforms.uPlaceholderA, {
        value: 0, duration: 0.4, ease: 'power2.out', overwrite: true
      });
    } else {
      stage.uniforms.uPlaceholderA.value = ready ? 0 : 1;
    }
    stage.uniforms.uProgress.value = 0;
    slotBIndex = -1;
  }
  trans.p = 0;
  prevP = 0;
  state = 'idle';
  wheelAcc = 0;
  wheelArmed = false;                       // require a fresh gesture
  lockUntil = performance.now() + 300;      // swallow inertia tail
}

/* ------------------------------------------------------ field report */

function openReport() {
  if (state !== 'idle' || !report) return;
  state = 'report';
  document.documentElement.classList.add('is-report');
  document.body.classList.remove('is-dragging');
  report.open(PROJECTS[index], mapFields[index] || null);
}

function closeReport() {
  if (state !== 'report' || !report) return;
  report.close(() => {
    document.documentElement.classList.remove('is-report');
    state = 'idle';
    wheelArmed = false;
    wheelAcc = 0;
    lockUntil = performance.now() + 350;
    els.reportCta.focus({ preventScroll: true });
  });
}

/* ------------------------------------------------------------- input */

function bindInput() {
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // rAF-gated resize: renderer.setSize is expensive, drag-resizes spam it.
  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      if (stage) stage.resize();
    });
  });

  els.reportCta.addEventListener('click', openReport);

  document.addEventListener('visibilitychange', () => {
    pageVisible = !document.hidden;
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
    }).observe(els.canvas);
  }

  if (FINE && !RM) {
    document.body.classList.add('has-cursor');
    document.addEventListener('mouseover', (e) => {
      document.body.classList.toggle('is-hover', !!e.target.closest('a, button'));
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
  if (state === 'report') {
    if (e.key === 'Escape') closeReport();
    return;                                  // let the dossier scroll natively
  }
  if (e.key === 'Enter' && state === 'idle' && e.target === document.body) {
    openReport();
    return;
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    advance(1);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    advance(-1);
  }
}

let drag = null;
let dragX = 0;
let dragDirty = false;

function onPointerDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  trackCursor(e);
  if (state !== 'idle') return;
  drag = { x0: e.clientX, active: false, dir: 0, target: -1 };
  dragX = e.clientX;
  dragDirty = false;
}

/* pointermove only records the position; the actual drag math and DOM
   writes run once per frame in the rAF loop (processDrag). */
function onPointerMove(e) {
  trackCursor(e);
  if (!drag) return;
  dragX = e.clientX;
  dragDirty = true;
}

function processDrag() {
  if (!drag) return;

  const dx = dragX - drag.x0;
  if (!drag.active) {
    if (Math.abs(dx) < 8) return;
    drag.active = true;
    drag.dir = dx < 0 ? 1 : -1;
    drag.target = (index + drag.dir + N) % N;
    if (stage) {
      const slot = slotFor(drag.target);
      gsap.killTweensOf(stage.uniforms.uPlaceholderB);
      stage.uniforms.uTexB.value = slot.tex;
      stage.uniforms.uHeightB.value = slot.height;
      stage.uniforms.uPlaceholderB.value = textures[drag.target] ? 0 : 1;
      stage.uniforms.uDirection.value = drag.dir;
      slotBIndex = drag.target;
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
  if (dragDirty) { dragDirty = false; processDrag(); }  // final position
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
      onComplete: () => { trans.p = 0; prevP = 0; slotBIndex = -1; state = 'idle'; }
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

    // Coalesced drag input — at most one drag update per frame.
    if (drag && dragDirty) { dragDirty = false; processDrag(); }

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
      stage.setMouse(
        mouseX / Math.max(1, window.innerWidth),
        1 - mouseY / Math.max(1, window.innerHeight)
      );
      stage.update(dt);
      stage.uniforms.uProgress.value = trans.p;
      stage.uniforms.uVelocity.value = RM ? 0 : vel;
      if (pageVisible && onScreen) stage.render(now / 1000);
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

  titleSplit = splitTitle();
  const titleTargets = titleSplit
    ? titleSplit.chars
    : els.title.querySelectorAll('.t-line__in');
  const chips = els.meta.querySelectorAll('.meta__item');

  const tl = gsap.timeline({
    onComplete: () => {
      introTl = null;
      if (state === 'loading') state = 'idle';
    }
  });
  introTl = tl;
  tl.to(els.loaderFill, { scaleX: 1, duration: 0.2, ease: 'power1.inOut' })
    .to(els.loader, { yPercent: -100, duration: 0.85, ease: 'power4.inOut', delay: 0.15 })
    .set(els.loader, { display: 'none' })
    .from(els.canvas, { opacity: 0, scale: 1.06, duration: 1.3, ease: 'power2.out' }, '-=0.5')
    // Unlock input as soon as the landscape is on screen — the rest of
    // the intro is chrome settling in and should not block interaction.
    .add(() => { if (state === 'loading') state = 'idle'; }, 1.35)
    .from('.site-head > *', { y: -18, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, '-=1.0')
    .from(els.eyebrow, { y: 16, opacity: 0, duration: 0.6, ease: 'power3.out' }, '-=0.7');

  // Kept out of the timeline chain so playDomSwap's existing kill path
  // handles an early swipe cleanly (it kills titleInTween + reverts).
  titleInTween = gsap.from(titleTargets, {
    yPercent: 114,
    duration: 1.0,
    stagger: titleSplit ? 0.028 : 0.09,
    ease: 'power3.out',
    onComplete: () => {
      if (titleSplit) { titleSplit.revert(); titleSplit = null; }
      titleInTween = null;
    }
  });
  tl.add(titleInTween, '-=0.65')
    .from(chips, { y: 14, opacity: 0, duration: 0.6, stagger: 0.06, ease: 'power3.out' }, '-=0.7')
    .from(els.desc, { y: 12, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.6')
    .from('.counter', { y: 12, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.55')
    .from(els.reportCta, { y: 12, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.5')
    .fromTo(els.railFill, { scaleY: 0 }, { scaleY: 1 / N, duration: 0.9, ease: 'power3.inOut' }, '-=0.6')
    .from('.rail', { opacity: 0, duration: 0.5 }, '<')
    .from(els.hint, { opacity: 0, duration: 0.6 }, '-=0.4');
}
