/* LUMEN Studio - scroll bus.
   Writes --p (per [data-scene]), --hp (.hero exit falloff), --sp (header
   progress) from ONE rAF loop with cached rects. Reduced motion: terminal
   states, no loop, no listeners. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sceneEls = document.querySelectorAll('[data-scene]');
  var hero = document.querySelector('.hero');
  var header = document.getElementById('siteHeader');

  if (reduced) {
    for (var i = 0; i < sceneEls.length; i++) sceneEls[i].style.setProperty('--p', '1');
    return;
  }

  var scenes = [];
  for (var j = 0; j < sceneEls.length; j++) {
    scenes.push({ el: sceneEls[j], top: 0, height: 1, active: true, last: -1 });
  }

  var vh = innerHeight;
  var docH = 1;
  function cacheRects() {
    vh = innerHeight;
    docH = Math.max(1, document.documentElement.scrollHeight);
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
      for (var i = 0; i < entries.length; i++) {
        for (var k = 0; k < scenes.length; k++) {
          if (scenes[k].el === entries[i].target) scenes[k].active = entries[i].isIntersecting;
        }
      }
    }, { rootMargin: '100px' });
    for (var m = 0; m < scenes.length; m++) io.observe(scenes[m].el);
  }

  var sy = window.scrollY;
  var lastHp = -1, lastSp = -1;

  function frame() {
    if (!document.hidden) {
      sy += (window.scrollY - sy) * 0.1;
      if (Math.abs(window.scrollY - sy) < 0.3) sy = window.scrollY;

      for (var i = 0; i < scenes.length; i++) {
        var s = scenes[i];
        if (!s.active) continue;
        var p = (sy + vh - s.top) / (s.height + vh);
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        if (Math.abs(p - s.last) > 0.002) {
          s.last = p;
          s.el.style.setProperty('--p', p.toFixed(4));
        }
      }
      if (hero) {
        var hp = Math.min(Math.max(sy / 400, 0), 1);
        if (Math.abs(hp - lastHp) > 0.002) {
          lastHp = hp;
          hero.style.setProperty('--hp', hp.toFixed(4));
        }
      }
      if (header) {
        var sp = Math.min(Math.max(sy / Math.max(1, docH - vh), 0), 1);
        if (Math.abs(sp - lastSp) > 0.002) {
          lastSp = sp;
          header.style.setProperty('--sp', sp.toFixed(4));
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
  /* content height can change after webfonts/reveals settle */
  window.addEventListener('load', cacheRects);
})();
