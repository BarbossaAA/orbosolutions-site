/* ============================================================
   AURORA(R) — main.js
   GSAP 3.13 (ScrollTrigger + SplitText + ScrambleText + DrawSVG
   + CustomEase + Flip) + Lenis 1.3.4 + aurora-gl.js (WebGL2 backdrop)
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
     Site renders as a fully readable static page.
     (aurora-gl.js handles its own reduced-motion still frame.) */
  if (!window.gsap || reduceMotion) {
    docEl.classList.add('reduced');
    dropPreloader();
    setStatsInstant();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  const hasSplit = typeof SplitText !== 'undefined';
  if (hasSplit) gsap.registerPlugin(SplitText);
  const hasScramble = typeof ScrambleTextPlugin !== 'undefined';
  if (hasScramble) gsap.registerPlugin(ScrambleTextPlugin);
  const hasDraw = typeof DrawSVGPlugin !== 'undefined';
  if (hasDraw) gsap.registerPlugin(DrawSVGPlugin);
  const hasFlip = typeof Flip !== 'undefined';
  if (hasFlip) gsap.registerPlugin(Flip);
  ScrollTrigger.config({ ignoreMobileResize: true });

  /* the one signature ease: fast attack, long luminous settle.
     Used for every reveal on the page. */
  let EASE = 'power4.out';
  if (typeof CustomEase !== 'undefined') {
    gsap.registerPlugin(CustomEase);
    CustomEase.create('aurora', 'M0,0 C0.19,0.62 0.24,1 1,1');
    EASE = 'aurora';
  }

  const SCRAMBLE_CHARS = '#/\\_<>[]AURORA01';

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  /* ------------------------------------------------ Lenis smooth scroll,
     driven by gsap.ticker and feeding ScrollTrigger + the WebGL backdrop */
  let lenis = null;
  if (typeof Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    lenis.on('scroll', (e) => {
      if (window.AURORA_GL) window.AURORA_GL.setVelocity(e.velocity || 0);
    });
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

      /* rAF-gated: pointer events can fire at 120-250Hz, one update per frame is enough */
      let px = 0, py = 0, cursorRaf = 0;
      window.addEventListener('mousemove', (e) => {
        px = e.clientX; py = e.clientY;
        if (cursorRaf) return;
        cursorRaf = requestAnimationFrame(() => {
          cursorRaf = 0;
          dotX(px); dotY(py);
          ringX(px); ringY(py);
        });
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
      let cx = 0, cy = 0, ex = 0, ey = 0, raf = 0;

      /* one layout read per hover (not per event); subtract any in-flight
         magnetic offset so the cached center is the rest position */
      const cacheCenter = () => {
        const r = el.getBoundingClientRect();
        cx = r.left + r.width / 2 - (parseFloat(gsap.getProperty(el, 'x')) || 0);
        cy = r.top + r.height / 2 - (parseFloat(gsap.getProperty(el, 'y')) || 0);
      };

      const apply = () => {
        raf = 0;
        gsap.to(el, {
          x: (ex - cx) * strength,
          y: (ey - cy) * strength,
          duration: 0.6,
          ease: 'power3.out',
          overwrite: 'auto'
        });
      };

      el.addEventListener('mouseenter', cacheCenter);
      el.addEventListener('mousemove', (e) => {
        ex = e.clientX; ey = e.clientY;
        if (!raf) raf = requestAnimationFrame(apply); /* rAF-gated */
      }, { passive: true });
      el.addEventListener('mouseleave', () => {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)', overwrite: 'auto' });
      });
    });
  }

  /* ------------------------------------------------ preloader counter */
  const counter = { value: 0 };
  const countEl = $('.preloader-count b');
  const counterTween = gsap.to(counter, {
    value: 100,
    duration: 0.5,
    ease: 'power2.inOut',
    onUpdate: () => { if (countEl) countEl.textContent = pad(counter.value, 3); }
  });

  /* fonts get 0.8s max — display=swap means text renders regardless,
     and the intro must never gate interaction on the network */
  const fontsReady = Promise.race([
    (document.fonts && document.fonts.ready) || Promise.resolve(),
    new Promise((res) => setTimeout(res, 800))
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

    introTl = gsap.timeline({ paused: true, defaults: { ease: EASE } });

    if (chars) {
      gsap.set(chars, { yPercent: 120 });
      introTl.to(chars, { yPercent: 0, duration: 1.2, stagger: 0.032 }, 0);
    } else {
      gsap.set('.hero-title', { autoAlpha: 0, y: 60 });
      introTl.to('.hero-title', { autoAlpha: 1, y: 0, duration: 1.1 }, 0);
    }

    introTl
      .to('.site-nav', { yPercent: 0, autoAlpha: 1, duration: 0.9, ease: EASE }, 0.5)
      .to('.hero-meta', { autoAlpha: 1, y: 0, duration: 0.9, ease: EASE }, 0.62)
      .to('.hero-badge', { autoAlpha: 1, y: 0, duration: 1, ease: EASE }, 0.72);

    /* badge ring draws itself in around the rotating text */
    if (hasDraw && $('.badge-ring')) {
      gsap.set('.badge-ring', { drawSVG: '0%' });
      introTl.to('.badge-ring', { drawSVG: '100%', duration: 1.4, ease: EASE }, 0.85);
    }

    /* once the mask reveal is done, unclip the lines so chars can drift */
    introTl.add(() => docEl.classList.add('intro-done'), 1.3);

    /* hero v2: chars drift up at slightly different rates on scroll (depth) */
    const driftTargets = chars || lines;
    if (driftTargets.length) {
      gsap.to(driftTargets, {
        y: (i) => -(40 + ((i * 53) % 7) * 24),
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 0.4,
          invalidateOnRefresh: true
        }
      });
    }

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

  /* ------------------------------------------------ work detail overlay:
     Flip a poster's media fullscreen; its gradient becomes the backdrop */
  const buildOverlay = () => {
    const overlay = $('.work-overlay');
    if (!overlay) return;
    const slot = $('.overlay-media-slot', overlay);
    const closeBtn = $('.overlay-close', overlay);
    const content = $('.overlay-content', overlay);
    const posters = $$('.poster');
    if (!slot || !closeBtn || !content || !posters.length) return;

    const fields = {
      num:    $('.overlay-num', overlay),
      title:  $('.overlay-title', overlay),
      desc:   $('.overlay-desc', overlay),
      client: $('.ov-client', overlay),
      sector: $('.ov-sector', overlay),
      year:   $('.ov-year', overlay),
      scope:  $('.ov-scope', overlay)
    };

    /* fake case-study copy, keyed by poster title */
    const CASES = {
      Nocturne: {
        client: 'Maison Nocturne',
        scope: 'Art direction, e-commerce, motion',
        desc: 'A darkened runway for a Paris fashion house — velvet blacks, silver type and a checkout that moves like a catwalk.'
      },
      Helios: {
        client: 'Helios Energy',
        scope: 'Product design, WebGL, design system',
        desc: 'A clean-energy platform that treats sunlight as an interface — live irradiance data drawn as slow, warm gradients.'
      },
      Pulse: {
        client: 'Pulse Festival',
        scope: 'Campaign site, identity, ticketing',
        desc: 'Three days, ninety artists, one heartbeat — a campaign site that syncs its palette to 128 BPM.'
      },
      Meridian: {
        client: 'Meridian Journal',
        scope: 'Editorial design, CMS, photo direction',
        desc: 'A travel editorial that scrolls like a long-haul flight — slow, panoramic and impossible to skim.'
      },
      Obsidian: {
        client: 'Obsidian Architects',
        scope: 'Portfolio, 3D, brand system',
        desc: 'A monolithic portfolio for brutalist architects — concrete greys, razor grids and light used like material.'
      }
    };

    let active = null; // { media, parent, next, poster }
    let busy = false;

    const populate = (poster) => {
      const titleEl = $('.poster-meta h3', poster);
      const numEl = $('.poster-num', poster);
      const metaSpans = $$('.poster-meta span:not(.poster-num)', poster);
      const title = titleEl ? titleEl.textContent.trim() : '';
      const data = CASES[title] || { client: title, scope: 'Design, development', desc: '' };

      if (fields.num)    fields.num.textContent = numEl ? numEl.textContent : '';
      if (fields.title)  fields.title.textContent = title;
      if (fields.desc)   fields.desc.textContent = data.desc;
      if (fields.client) fields.client.textContent = data.client;
      if (fields.sector) fields.sector.textContent = metaSpans[0] ? metaSpans[0].textContent : '';
      if (fields.year)   fields.year.textContent = metaSpans[1] ? metaSpans[1].textContent : '';
      if (fields.scope)  fields.scope.textContent = data.scope;
    };

    const open = (poster) => {
      if (busy || active) return;
      const media = $('.poster-media', poster);
      if (!media) return;
      busy = true;

      populate(poster);
      active = { media, parent: media.parentNode, next: media.nextSibling, poster };

      if (lenis) lenis.stop();
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');

      const place = () => {
        slot.appendChild(media);
        media.classList.add('is-overlay');
      };

      if (hasFlip) {
        const state = Flip.getState(media);
        place();
        Flip.from(state, {
          duration: 0.9,
          ease: EASE,
          absolute: true,
          props: 'borderRadius',
          onComplete: () => { busy = false; }
        });
      } else {
        place();
        busy = false;
      }

      gsap.fromTo(content,
        { autoAlpha: 0, y: 30 },
        { autoAlpha: 1, y: 0, duration: 0.7, delay: 0.45, ease: EASE, overwrite: true });

      closeBtn.focus({ preventScroll: true });
    };

    const close = () => {
      if (busy || !active) return;
      busy = true;
      const { media, parent, next, poster } = active;

      gsap.to(content, { autoAlpha: 0, y: 16, duration: 0.25, ease: 'power2.in', overwrite: true });

      const finish = () => {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        if (lenis) lenis.start();
        active = null;
        busy = false;
        poster.focus({ preventScroll: true });
      };

      const restore = () => {
        parent.insertBefore(media, next);
        media.classList.remove('is-overlay');
      };

      if (hasFlip) {
        const state = Flip.getState(media);
        restore();
        Flip.from(state, {
          duration: 0.8,
          ease: EASE,
          absolute: true,
          props: 'borderRadius',
          onComplete: finish
        });
      } else {
        restore();
        finish();
      }
    };

    posters.forEach((poster) => {
      poster.setAttribute('tabindex', '0');
      poster.setAttribute('role', 'button');
      poster.addEventListener('click', () => open(poster));
      poster.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(poster); }
      });
    });

    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  };

  /* ------------------------------------------------ marquee: two rows,
     opposite directions, timeScale + skew follow scroll velocity */
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

    const skewSetters = rows.map((row) => gsap.quickSetter($('.marquee-inner', row), 'skewX', 'deg'));

    const state = { current: 1, target: 1, dir: 1, skew: 0, skewTarget: 0 };
    let onscreen = true;

    if (lenis) {
      lenis.on('scroll', (e) => {
        if (!onscreen) return; /* velocity reaction only matters when visible */
        const v = e.velocity || 0;
        if (Math.abs(v) > 0.2) state.dir = v > 0 ? 1 : -1;
        state.target = state.dir * (1 + Math.min(Math.abs(v) / 30, 3));
        state.skewTarget = gsap.utils.clamp(-6, 6, v * 0.14);
      });
    }

    gsap.ticker.add(() => {
      if (!onscreen) return; /* no per-frame work while offscreen */
      state.target += (state.dir - state.target) * 0.04;      // relax toward cruise speed
      state.current += (state.target - state.current) * 0.1;  // smooth the reaction
      tweens.forEach((t) => t.timeScale(state.current));

      state.skewTarget *= 0.9;                                // relax toward upright
      state.skew += (state.skewTarget - state.skew) * 0.12;
      skewSetters.forEach((set, i) => set(i % 2 === 0 ? state.skew : -state.skew));
    });

    /* don't animate the loop while the marquee is offscreen */
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        onscreen = entries[0].isIntersecting;
        tweens.forEach((t) => (onscreen ? t.play() : t.pause()));
      }, { rootMargin: '120px' });
      io.observe(rows[0].closest('.marquee') || rows[0]);
    }
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
        ease: EASE,
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

  /* ------------------------------------------------ scramble: nav hover +
     section labels settle out of noise (mono-ish charset, fast settle) */
  const buildScramble = () => {
    if (!hasScramble) return;

    $$('.nav-links a').forEach((link) => {
      const original = link.textContent;
      link.addEventListener('mouseenter', () => {
        gsap.to(link, {
          duration: 0.6,
          scrambleText: { text: original, chars: SCRAMBLE_CHARS, speed: 1.2 },
          overwrite: 'auto'
        });
      });
    });

    $$('.tag-name').forEach((el) => {
      const original = el.textContent;
      gsap.to(el, {
        duration: 0.9,
        scrambleText: { text: original, chars: SCRAMBLE_CHARS, speed: 0.6, revealDelay: 0.15 },
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
  };

  /* ------------------------------------------------ dividers: thin SVG
     strokes draw themselves outward from center on enter */
  const buildDividers = () => {
    $$('.divider-path').forEach((path) => {
      if (hasDraw) {
        gsap.fromTo(path, { drawSVG: '50% 50%' }, {
          drawSVG: '0% 100%',
          duration: 1.4,
          ease: EASE,
          scrollTrigger: { trigger: path, start: 'top 88%', once: true }
        });
      } else {
        gsap.from(path, {
          autoAlpha: 0,
          duration: 1,
          ease: EASE,
          scrollTrigger: { trigger: path, start: 'top 88%', once: true }
        });
      }
    });
  };

  /* ------------------------------------------------ generic reveals */
  const buildReveals = () => {
    $$('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 60,
        autoAlpha: 0,
        duration: 1,
        ease: EASE,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
    });

    $$('.rule').forEach((el) => {
      gsap.from(el, {
        scaleX: 0,
        transformOrigin: 'left center',
        duration: 1.1,
        ease: EASE,
        scrollTrigger: { trigger: el, start: 'top 92%', once: true }
      });
    });
  };

  /* ------------------------------------------------ curtain wipe reveal */
  const revealSite = () => {
    gsap.timeline({ defaults: { ease: 'power4.inOut' }, onComplete: dropPreloader })
      .to('.preloader-inner', { autoAlpha: 0, y: -40, duration: 0.3, ease: 'power2.in' }, 0)
      .to('.panel-dark', { yPercent: -100, duration: 0.55 }, 0.1)
      .to('.panel-lime', { yPercent: -100, duration: 0.5 }, 0.2)
      .add(() => {
        /* release everything as soon as the wipe starts — never gate input */
        const pre = $('.preloader');
        if (pre) pre.style.pointerEvents = 'none';
        docEl.classList.remove('is-loading');
        if (lenis) lenis.start();
        ScrollTrigger.refresh();
        introTl.play();
      }, 0.2);
  };

  /* ------------------------------------------------ boot */
  const buildAll = () => {
    buildHero();
    buildServices();
    buildWork();
    buildOverlay();
    buildMarquee();
    buildManifesto();
    buildStats();
    buildScramble();
    buildDividers();
    buildReveals();
    ScrollTrigger.refresh();
  };

  Promise.all([fontsReady, counterTween.then(() => true)]).then(() => {
    buildAll();
    revealSite();
  });

  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
