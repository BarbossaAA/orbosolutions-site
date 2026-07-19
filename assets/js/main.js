/* LUMEN Studio - shared interactions */
(function () {
  'use strict';

  /* Header scroll state */
  var header = document.getElementById('siteHeader');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 12);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Mobile nav */
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* Reveal on scroll */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* Current year */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ORBO MOBILE shell: the tab bar ducks away while scrolling down and
     returns on scroll-up or after a short idle (standard app pattern).
     Attached ONLY under 768px - desktop gets no listener at all. */
  var tabBar = document.querySelector('.tab-bar');
  if (tabBar && window.matchMedia('(max-width: 767px)').matches) {
    var tbLastY = window.scrollY, tbIdle = null, tbHidden = false;
    var tbSet = function (h) {
      if (h === tbHidden) return;
      tbHidden = h;
      document.documentElement.classList.toggle('tabbar-hidden', h);
    };
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      var dy = y - tbLastY;
      tbLastY = y;
      if (y < 40) tbSet(false);
      else if (dy > 6) tbSet(true);
      else if (dy < -6) tbSet(false);
      clearTimeout(tbIdle);
      tbIdle = setTimeout(function () { tbSet(false); }, 900);
    }, { passive: true });
  }

  /* Close only one FAQ at a time */
  var faqs = document.querySelectorAll('.faq-item');
  faqs.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (item.open) {
        faqs.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      }
    });
  });

  /* ---- Lightfield interactions (pointer:fine + motion allowed only) ---- */
  var fine = window.matchMedia('(pointer: fine)').matches;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduced) return;

  var CARD_SEL = '.world-card, .value-card, .process-step, .aside-card';

  /* Cursor-lumen: per-card --mx/--my, rect cached on pointerover,
     invalidated on scroll (never read layout inside pointermove) */
  var litCard = null;
  var litRect = null;
  document.addEventListener('pointerover', function (e) {
    var card = e.target.closest ? e.target.closest(CARD_SEL) : null;
    if (card && card !== litCard) {
      litCard = card;
      litRect = card.getBoundingClientRect();
    }
  }, { passive: true });
  window.addEventListener('scroll', function () { litRect = null; }, { passive: true });
  document.addEventListener('pointermove', function (e) {
    if (!litCard) return;
    if (!litCard.contains(e.target)) { litCard = null; litRect = null; return; }
    if (!litRect) litRect = litCard.getBoundingClientRect();
    litCard.style.setProperty('--mx', (e.clientX - litRect.left).toFixed(0) + 'px');
    litCard.style.setProperty('--my', (e.clientY - litRect.top).toFixed(0) + 'px');
  }, { passive: true });

  /* Magnetic primary buttons: pull toward the cursor, spring back on leave */
  document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
    var rect = null;
    btn.addEventListener('pointerenter', function () { rect = btn.getBoundingClientRect(); });
    btn.addEventListener('pointermove', function (e) {
      if (!rect) rect = btn.getBoundingClientRect();
      var dx = e.clientX - (rect.left + rect.width / 2);
      var dy = e.clientY - (rect.top + rect.height / 2);
      btn.style.setProperty('--bx', Math.max(-6, Math.min(6, dx * 0.15)).toFixed(1) + 'px');
      btn.style.setProperty('--by', Math.max(-6, Math.min(6, dy * 0.15)).toFixed(1) + 'px');
    }, { passive: true });
    btn.addEventListener('pointerleave', function () {
      rect = null;
      btn.style.setProperty('--bx', '0px');
      btn.style.setProperty('--by', '0px');
    });
  });
})();
