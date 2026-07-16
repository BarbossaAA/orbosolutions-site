/* LUMEN Studio — services page: chip-nav scroll-spy + cascade, ambient SVG
   two-rate parallax. No-JS: sticky bar is plain anchors, SVGs are static. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- chip cascade delays --- */
  var chips = document.querySelectorAll('.anchor-nav a');
  for (var i = 0; i < chips.length; i++) {
    chips[i].style.setProperty('--d', (i * 0.045) + 's');
  }

  /* --- floating wayfinding bar once the page hero scrolls away --- */
  var nav = document.querySelector('.anchor-nav');
  var hero = document.querySelector('.page-hero');
  var heroContainer = hero ? hero.querySelector('.container') : null;
  var ctaSection = document.querySelector('.cta-section');
  var floatAt = 0;
  var endAt = Infinity;
  var slot = 0;
  function cacheFloatAt() {
    if (!nav || !hero) return;
    var sy = window.scrollY;
    floatAt = hero.getBoundingClientRect().bottom + sy - 60;
    /* measure the nav's in-flow height only while it is in flow */
    if (!nav.classList.contains('nav-floating')) slot = nav.offsetHeight + 36;
    if (ctaSection) endAt = ctaSection.getBoundingClientRect().top + sy - 140;
  }
  cacheFloatAt();
  if (nav && hero) {
    /* wayfinding, not motion — runs under reduced motion too */
    var floating = false;
    var hidden = false;
    window.addEventListener('scroll', function () {
      var sy = window.scrollY;
      var f = sy > floatAt;
      var h = f && sy > endAt; /* bow out over the CTA band / footer */
      if (f !== floating) {
        floating = f;
        nav.classList.toggle('nav-floating', f);
        /* reserve the nav's flow height so the page never jumps */
        if (heroContainer) heroContainer.style.paddingBottom = f ? slot + 'px' : '';
      }
      if (h !== hidden) {
        hidden = h;
        nav.classList.toggle('nav-hidden', h);
      }
    }, { passive: true });
    var frt = null;
    window.addEventListener('resize', function () {
      clearTimeout(frt);
      frt = setTimeout(cacheFloatAt, 160);
    });
    window.addEventListener('load', cacheFloatAt);
  }

  /* --- scroll-spy --- */
  var sections = document.querySelectorAll('.service-detail');
  if ('IntersectionObserver' in window && sections.length && chips.length) {
    var byId = {};
    for (var c = 0; c < chips.length; c++) {
      var href = chips[c].getAttribute('href') || '';
      if (href.charAt(0) === '#') byId[href.slice(1)] = chips[c];
    }
    var current = null;
    var spy = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e++) {
        if (!entries[e].isIntersecting) continue;
        var link = byId[entries[e].target.id];
        if (!link || link === current) continue;
        if (current) current.classList.remove('active');
        current = link;
        link.classList.add('active');
        /* center the active chip only inside the floating bar's own scroller */
        if (nav && nav.classList.contains('nav-floating') && nav.scrollWidth > nav.clientWidth + 4) {
          try { link.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); } catch (err) {}
        }
      }
    }, { rootMargin: '-40% 0px -55% 0px' });
    for (var s = 0; s < sections.length; s++) spy.observe(sections[s]);
  }

  /* --- ambient SVG two-rate parallax --- */
  if (reduced) return;
  var scenes = [];
  for (var a = 0; a < sections.length; a++) {
    var layers = sections[a].querySelectorAll('.svc-scene g[data-rate]');
    if (layers.length) scenes.push({ el: sections[a], layers: layers, top: 0, height: 1, active: false });
  }
  if (!scenes.length) return;

  var vh = innerHeight;
  function cacheRects() {
    vh = innerHeight;
    var sy = window.scrollY;
    for (var i = 0; i < scenes.length; i++) {
      var r = scenes[i].el.getBoundingClientRect();
      scenes[i].top = r.top + sy;
      scenes[i].height = Math.max(1, r.height);
    }
  }
  cacheRects();

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e++) {
        for (var k = 0; k < scenes.length; k++) {
          if (scenes[k].el === entries[e].target) scenes[k].active = entries[e].isIntersecting;
        }
      }
    }, { rootMargin: '80px' });
    for (var m = 0; m < scenes.length; m++) io.observe(scenes[m].el);
  } else {
    for (var n = 0; n < scenes.length; n++) scenes[n].active = true;
  }

  function frame() {
    if (!document.hidden) {
      var sy = window.scrollY;
      for (var i = 0; i < scenes.length; i++) {
        var sc = scenes[i];
        if (!sc.active) continue;
        /* -1..1: section center's distance from viewport center */
        var delta = ((sc.top + sc.height / 2) - (sy + vh / 2)) / vh;
        for (var l = 0; l < sc.layers.length; l++) {
          var rate = parseFloat(sc.layers[l].getAttribute('data-rate')) || 1;
          sc.layers[l].setAttribute('transform', 'translate(0 ' + (delta * (rate - 0.95) * 120).toFixed(1) + ')');
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(cacheRects, 150);
  });
  window.addEventListener('load', cacheRects);
})();
