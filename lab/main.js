/* ==========================================================================
   5 SITES PROJECT — hub launcher
   Entrance choreography + custom cursor. Degrades cleanly: if GSAP is
   missing or the user prefers reduced motion, the page renders static.
   ========================================================================== */

(function () {
  'use strict';

  var docEl = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var hasGSAP = typeof window.gsap !== 'undefined';

  docEl.classList.add('js');

  /* ------------------------------------------------------------------
     Intro + entrance
     The overlay is display:none in the markup, so without JS (or with
     reduced motion) nothing ever covers the page.
     ------------------------------------------------------------------ */

  if (hasGSAP && !reduceMotion) {
    var gsap = window.gsap;
    var intro = document.getElementById('intro');
    var ticks = intro.querySelectorAll('.intro-tick');
    var mark = intro.querySelector('.intro-mark');

    intro.style.display = 'flex';

    // Initial states (set via JS so a script failure leaves content visible)
    gsap.set(mark, { autoAlpha: 0, y: 10 });
    gsap.set('.title .line-inner', { yPercent: 115 });
    gsap.set('.brand-row > *', { autoAlpha: 0, y: 14 });
    gsap.set('.meta span', { autoAlpha: 0, y: 10 });
    gsap.set('.index li', { autoAlpha: 0, y: 34 });
    gsap.set('.site-foot', { autoAlpha: 0 });

    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl
      // Overlay: wordmark + five accent ticks light up
      .to(mark, { autoAlpha: 1, y: 0, duration: 0.45 })
      .to(ticks, {
        scaleX: 1,
        duration: 0.3,
        stagger: 0.08,
        ease: 'power2.inOut'
      }, '-=0.15')
      // Overlay lifts away
      .to(intro, {
        yPercent: -100,
        duration: 0.7,
        ease: 'power4.inOut',
        onComplete: function () { intro.style.display = 'none'; }
      }, '+=0.25')
      // Header cascade
      .to('.brand-row > *', { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08 }, '-=0.35')
      .to('.title .line-inner', { yPercent: 0, duration: 0.9, stagger: 0.1 }, '<')
      .to('.meta span', { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06 }, '-=0.55')
      // Rows stagger in
      .to('.index li', { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.09 }, '-=0.45')
      .to('.site-foot', { autoAlpha: 1, duration: 0.6 }, '-=0.3');
  }

  /* ------------------------------------------------------------------
     Custom cursor — fine pointers only, never with reduced motion.
     One requestAnimationFrame loop; no canvas on this page.
     ------------------------------------------------------------------ */

  if (finePointer && !reduceMotion) {
    var cursor = document.getElementById('cursor');
    var targetX = window.innerWidth / 2;
    var targetY = window.innerHeight / 2;
    var curX = targetX;
    var curY = targetY;
    var shown = false;

    docEl.classList.add('cursor-on');

    window.addEventListener('pointermove', function (e) {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!shown) {
        shown = true;
        curX = targetX;
        curY = targetY;
        cursor.classList.add('is-visible');
      }
    }, { passive: true });

    document.addEventListener('pointerdown', function () {
      cursor.classList.add('is-down');
    });

    document.addEventListener('pointerup', function () {
      cursor.classList.remove('is-down');
    });

    document.addEventListener('mouseleave', function () {
      cursor.classList.remove('is-visible');
      shown = false;
    });

    // Grow the ring and tint it with each row's accent
    var rows = document.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) {
      (function (row) {
        row.addEventListener('pointerenter', function () {
          var accent = getComputedStyle(row).getPropertyValue('--accent').trim();
          cursor.style.setProperty('--cursor-accent', accent);
          cursor.classList.add('is-hover');
        });
        row.addEventListener('pointerleave', function () {
          cursor.style.removeProperty('--cursor-accent');
          cursor.classList.remove('is-hover');
        });
      })(rows[i]);
    }

    var tick = function () {
      curX += (targetX - curX) * 0.18;
      curY += (targetY - curY) * 0.18;
      cursor.style.transform = 'translate3d(' + curX + 'px,' + curY + 'px,0)';
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }
})();
