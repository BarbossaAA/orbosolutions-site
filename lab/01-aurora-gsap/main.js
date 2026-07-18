/* ============================================================
   AURORA(R) — main.js
   GSAP 3.13 (ScrollTrigger + SplitText) + Lenis 1.3.4
   No build step. Everything animated lives here.
   ============================================================ */
(() => {
  'use strict';

  const docEl = document.documentElement;
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer  = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ------------------------------------------------ helpers */
  const pad = (n, len = 2) => String(Math.round(n)).padStart(len, '0');

  const setStatsInstant = () => {
    $$('.stat-value').forEach((el) => {
      el.textContent = pad(parseInt(el.dataset.value, 10) || 0);
    });
  };

  const dropPreloader = () => {
    const pre = $('.preloader');
    if (pre) pre.remove();
    docEl.classList.remove('is-loading');
  };

  /* ------------------------------------------------ local time (always on) */
  const startClock = () => {
    const el = $('#local-time');
    if (!el) return;
    const tick = () => {
      const d = new Date();
      el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    };
    tick();
    setInterval(tick, 1000);
  };
  startClock();

  /* ------------------------------------------------ static fallback:
     no GSAP (CDN failure) or the user prefers reduced motion.
     Site renders as a fully readable static page. */
  if (!window.gsap || reduceMotion) {
    docEl.classList.add('reduced');
    dropPreloader();
    setStatsInstant();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  const hasSplit = typeof SplitText !== 'undefined';
  if (hasSplit) gsap.registerPlugin(SplitText);
  ScrollTrigger.config({ ignoreMobileResize: true });

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  /* ------------------------------------------------ Lenis smooth scroll,
     driven by gsap.ticker and feeding ScrollTrigger */
  let lenis = null;
  if (typeof Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop(); // released after the preloader curtain wipe
  }

  const scrollToTarget = (target) => {
    if (lenis) {
      lenis.scrollTo(target, { duration: 1.4 });
    } else if (typeof target === 'number') {
      window.scrollTo({ top: target, behavior: 'smooth' });
    } else {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || href.length <= 1) { e.preventDefault(); return; }
      const target = $(href);
      if (!target) return;
      e.preventDefault();
      scrollToTarget(target);
    });
  });

  const toTop = $('.to-top');
  if (toTop) toTop.addEventListener('click', () => scrollToTarget(0));

  /* ------------------------------------------------ custom cursor + magnetic
     (mouse-driven; only on fine pointers) */
  if (finePointer) {
    const dot = $('.cursor-dot');
    const ring = $('.cursor-ring');

    if (dot && ring) {
      docEl.classList.add('has-cursor');
      gsap.set([dot, ring], { x: -100, y: -100 });

      const dotX  = gsap.quickTo(dot,  'x', { duration: 0.15, ease: 'power2.out' });
      const dotY  = gsap.quickTo(dot,  'y', { duration: 0.15, ease: 'power2.out' });
      const ringX = gsap.quickTo(ring, 'x', { duration: 0.5,  ease: 'power3.out' });
      const ringY = gsap.quickTo(ring, 'y', { duration: 0.5,  ease: 'power3.out' });

      window.addEventListener('mousemove', (e) => {
        dotX(e.clientX); dotY(e.clientY);
        ringX(e.clientX); ringY(e.clientY);
      }, { passive: true });

      const HOVER_SELECTOR = 'a, button, .service-card, .poster';
      document.addEventListener('mouseover', (e) => {
        if (e.target.closest(HOVER_SELECTOR)) docEl.classList.add('cursor-hot');
      });
      document.addEventListener('mouseout', (e) => {
        if (e.target.closest(HOVER_SELECTOR)) docEl.classList.remove('cursor-hot');
      });
    }

    $$('.magnetic').forEach((el) => {
      const strength = parseFloat(el.dataset.strength || '0.35');
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        gsap.to(el, {
          x: (e.clientX - (r.left + r.width / 2)) * strength,
          y: (e.clientY - (r.top + r.height / 2)) * strength,
          duration: 0.6,
          ease: 'power3.out',
          overwrite: 'auto'
        });
      });
      el.addEventListener('mouseleave', () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)', overwrite: 'auto' });
      });
    });
  }

  /* ------------------------------------------------ preloader counter */
  const counter = { value: 0 };
  const countEl = $('.preloader-count b');
  const counterTween = gsap.to(counter, {
    value: 100,
    duration: 2.1,
    ease: 'power2.inOut',
    onUpdate: () => { if (countEl) countEl.textContent = pad(counter.value, 3); }
  });

  const fontsReady = Promise.race([
    (document.fonts && document.fonts.ready) || Promise.resolve(),
    new Promise((res) => setTimeout(res, 3000))
  ]);

  /* ------------------------------------------------ hero */
  let introTl = gsap.timeline({ paused: true });

  const buildHero = () => {
    const lines = $$('.hero-line-inner');
    let chars = null;

    if (hasSplit && lines.length) {
      const split = new SplitText(lines, { type: 'chars', charsClass: 'hero-char' });
      chars = split.chars;
    }

    gsap.set('.site-nav', { yPercent: -130, autoAlpha: 0 });
    gsap.set(['.hero-meta', '.hero-badge'], { autoAlpha: 0, y: 28 });

    introTl = gsap.timeline({ paused: true, defaults: { ease: 'power4.out' } });

    if (chars) {
      gsap.set(chars, { yPercent: 120 });
      introTl.to(chars, { yPercent: 0, duration: 1.2, stagger: 0.032 }, 0);
    } else {
      gsap.set('.hero-title', { autoAlpha: 0, y: 60 });
      introTl.to('.hero-title', { autoAlpha: 1, y: 0, duration: 1.1 }, 0);
    }

    introTl
      .to('.site-nav', { yPercent: 0, autoAlpha: 1, duration: 0.9, ease: 'power3.out' }, 0.5)
      .to('.hero-meta', { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 0.62)
      .to('.hero-badge', { autoAlpha: 1, y: 0, duration: 1, ease: 'back.out(1.5)' }, 0.72);

    // Slowly rotating circular badge + drifting glow (decorative, looped)
    gsap.to('.hero-badge', { rotation: 360, duration: 26, repeat: -1, ease: 'none', transformOrigin: '50% 50%' });
    gsap.to('.hero-glow', {
      xPercent: 14, yPercent: -12, scale: 1.18,
      duration: 10, yoyo: true, repeat: -1, ease: 'sine.inOut'
    });
  };

  /* ------------------------------------------------ services: pin + stack */
  const buildServices = () => {
    const stage = $('.services-stage');
    const cards = $$('.service-card');
    if (!stage || cards.length < 2) return;

    cards.forEach((card, i) => { if (i > 0) gsap.set(card, { yPercent: 145 }); });

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: stage,
        start: 'top top',
        end: () => '+=' + (cards.length - 1) * window.innerHeight,
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
        invalidateOnRefresh: true
      }
    });

    for (let k = 1; k < cards.length; k++) {
      tl.fromTo(cards[k], { yPercent: 145 }, { yPercent: 0, duration: 1 }, k - 1);
      tl.to(cards.slice(0, k), {
        scale: (i) => 1 - (k - i) * 0.045,
        yPercent: (i) => (k - i) * -2.2,
        filter: (i) => 'brightness(' + Math.max(0.35, 1 - (k - i) * 0.22) + ')',
        duration: 1
      }, k - 1);
    }
  };

  /* ------------------------------------------------ work: pinned horizontal
     gallery with inner parallax + velocity skew */
  const buildWork = () => {
    const section = $('.work');
    const track = $('.work-track');
    if (!section || !track) return;
    const posters = $$('.poster', track);

    const skewProxy = { skew: 0 };
    const skewSetters = posters.map((p) => gsap.quickSetter(p, 'skewX', 'deg'));
    const applySkew = () => skewSetters.forEach((set) => set(skewProxy.skew));
    const clampSkew = gsap.utils.clamp(-5, 5);

    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);

    const horizontal = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => '+=' + distance(),
        pin: true,
        scrub: 1,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate(self) {
          const skew = clampSkew(self.getVelocity() / -160);
          if (Math.abs(skew) > Math.abs(skewProxy.skew)) {
            skewProxy.skew = skew;
            gsap.to(skewProxy, {
              skew: 0,
              duration: 0.8,
              ease: 'power3.out',
              overwrite: true,
              onUpdate: applySkew
            });
          }
        }
      }
    });

    posters.forEach((poster) => {
      const bg = $('.poster-bg', poster);
      if (!bg) return;
      gsap.fromTo(bg, { xPercent: -7 }, {
        xPercent: 7,
        ease: 'none',
        scrollTrigger: {
          trigger: poster,
          containerAnimation: horizontal,
          start: 'left right',
          end: 'right left',
          scrub: true
        }
      });
    });
  };

  /* ------------------------------------------------ marquee: two rows,
     opposite directions, timeScale follows scroll velocity */
  const buildMarquee = () => {
    const rows = $$('.marquee-row');
    if (!rows.length) return;

    const tweens = rows.map((row, i) => {
      const inner = $('.marquee-inner', row);
      inner.innerHTML += inner.innerHTML; // two identical halves -> seamless -50% loop
      const fromX = i % 2 === 0 ? 0 : -50;
      const toX   = i % 2 === 0 ? -50 : 0;
      return gsap.fromTo(inner, { xPercent: fromX }, {
        xPercent: toX, duration: 24, ease: 'none', repeat: -1
      });
    });

    const state = { current: 1, target: 1, dir: 1 };

    if (lenis) {
      lenis.on('scroll', (e) => {
        const v = e.velocity || 0;
        if (Math.abs(v) > 0.2) state.dir = v > 0 ? 1 : -1;
        state.target = state.dir * (1 + Math.min(Math.abs(v) / 30, 3));
      });
    }

    gsap.ticker.add(() => {
      state.target += (state.dir - state.target) * 0.04;      // relax toward cruise speed
      state.current += (state.target - state.current) * 0.1;  // smooth the reaction
      tweens.forEach((t) => t.timeScale(state.current));
    });
  };

  /* ------------------------------------------------ manifesto: word scrub */
  const buildManifesto = () => {
    const text = $('.manifesto-text');
    if (!text) return;

    const targets = hasSplit ? new SplitText(text, { type: 'words' }).words : [text];

    gsap.fromTo(targets, { opacity: 0.14 }, {
      opacity: 1,
      ease: 'none',
      duration: 2,
      stagger: 0.5,
      scrollTrigger: {
        trigger: text,
        start: 'top 80%',
        end: 'bottom 45%',
        scrub: true
      }
    });
  };

  /* ------------------------------------------------ stats: count up on enter */
  const buildStats = () => {
    $$('.stat').forEach((stat, i) => {
      const valueEl = $('.stat-value', stat);
      if (!valueEl) return;
      const target = parseInt(valueEl.dataset.value, 10) || 0;
      const state = { v: 0 };

      gsap.from(stat, {
        y: 44,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        delay: i * 0.08,
        scrollTrigger: { trigger: '.stats-grid', start: 'top 82%', once: true }
      });

      gsap.to(state, {
        v: target,
        duration: 1.8,
        ease: 'power2.out',
        delay: i * 0.12,
        scrollTrigger: { trigger: '.stats-grid', start: 'top 82%', once: true },
        onUpdate: () => { valueEl.textContent = pad(state.v); }
      });
    });
  };

  /* ------------------------------------------------ generic reveals */
  const buildReveals = () => {
    $$('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 60,
        autoAlpha: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
    });

    $$('.rule').forEach((el) => {
      gsap.from(el, {
        scaleX: 0,
        transformOrigin: 'left center',
        duration: 1.1,
        ease: 'power3.inOut',
        scrollTrigger: { trigger: el, start: 'top 92%', once: true }
      });
    });
  };

  /* ------------------------------------------------ curtain wipe reveal */
  const revealSite = () => {
    gsap.timeline({ defaults: { ease: 'power4.inOut' }, onComplete: dropPreloader })
      .to('.preloader-inner', { autoAlpha: 0, y: -40, duration: 0.5, ease: 'power2.in' }, '+=0.15')
      .to('.panel-dark', { yPercent: -100, duration: 0.9 }, '-=0.1')
      .to('.panel-lime', { yPercent: -100, duration: 0.9 }, '<0.14')
      .add(() => {
        docEl.classList.remove('is-loading');
        if (lenis) lenis.start();
        ScrollTrigger.refresh();
        introTl.play();
      }, '-=0.55');
  };

  /* ------------------------------------------------ boot */
  const buildAll = () => {
    buildHero();
    buildServices();
    buildWork();
    buildMarquee();
    buildManifesto();
    buildStats();
    buildReveals();
    ScrollTrigger.refresh();
  };

  Promise.all([fontsReady, counterTween.then(() => true)]).then(() => {
    buildAll();
    revealSite();
  });

  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
