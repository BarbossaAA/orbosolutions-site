/*
 * TERRA - report.js
 * Field-report dossier overlay: SplitText line-reveal headline,
 * three count-up stat rows, a procedurally drawn topographic
 * mini-map (marching squares over the SAME normalised height
 * field the WebGL texture was built from) and a closing quote.
 *
 * The overlay uses plain native scroll - the slider's own wheel /
 * drag / key handling is state-gated off while the report is open,
 * and the landscape behind dissolves via the stage's uReport uniform.
 */

const MAP_LEVELS = 12;

export function createReport({ stage, RM, onRequestClose }) {
  const gsap = window.gsap;

  const root = document.getElementById('report');
  const scroller = document.getElementById('reportScroll');
  const eyebrowEl = document.getElementById('reportEyebrow');
  const titleEl = document.getElementById('reportTitle');
  const coordsEl = document.getElementById('reportCoords');
  const ledeEl = document.getElementById('reportLede');
  const statsEl = document.getElementById('reportStats');
  const mapWrap = document.getElementById('reportMapWrap');
  const mapCanvas = document.getElementById('reportMap');
  const mapCap = document.getElementById('reportMapCap');
  const quoteEl = document.getElementById('reportQuote');
  const citeEl = document.getElementById('reportCite');
  const closeBtn = document.getElementById('reportClose');
  const ctx = mapCanvas.getContext('2d');

  let isOpen = false;
  let split = null;
  let io = null;
  let tweens = [];
  let current = null;             // { project, map, cache, cssSize, drawn, peakDrawn }
  const contourCache = new Map(); // project.id -> { levels: [], peak: [u, v] }

  closeBtn.addEventListener('click', () => onRequestClose());
  window.addEventListener('resize', () => {
    if (isOpen && current && current.map) redrawMap();
  });

  const fmt = (v, dec) =>
    dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US');

  const hexToRgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  /* ------------------------------------------------------------ content */

  function buildContent(project) {
    eyebrowEl.textContent = `Field Report - No. ${project.no} · ${project.year}`;
    titleEl.innerHTML = project.lines
      .map((line, i) =>
        `<span class="report__tline-mask"><span class="report__tline${i === 1 ? ' is-italic' : ''}">${line}</span></span>`)
      .join('');
    coordsEl.textContent = `${project.coords} · ${project.medium}`;
    ledeEl.textContent = project.desc;
    statsEl.innerHTML = project.report.stats
      .map((s) => `
        <div class="rstat">
          <span class="rstat__label">${s.label}</span>
          <span class="rstat__value" data-end="${s.value}" data-dec="${s.dec || 0}">0</span>
          <span class="rstat__suffix">${s.suffix || ''}</span>
        </div>`)
      .join('');
    quoteEl.textContent = project.report.quote;
    citeEl.textContent = project.report.cite;
    mapCap.textContent = `${project.coords} · Contour interval ${project.report.interval}`;
    root.querySelectorAll('.r-sec').forEach((s) => s.classList.remove('is-in'));
  }

  /* --------------------------------------------------------------- open */

  function open(project, map) {
    if (isOpen) return;
    isOpen = true;
    current = { project, map, cache: null, cssSize: 0, drawn: 0, peakDrawn: false };

    buildContent(project);
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    scroller.scrollTop = 0;

    if (map && map.field) {
      mapWrap.parentElement.style.display = '';
      let cache = contourCache.get(project.id);
      if (!cache) {
        cache = { levels: new Array(MAP_LEVELS).fill(null), peak: findPeak(map) };
        contourCache.set(project.id, cache);
      }
      current.cache = cache;
      sizeMapCanvas();
      drawMapFrame();
    } else {
      mapWrap.parentElement.style.display = 'none';
    }

    gsap.set(root, { opacity: 0 });
    tweens.push(gsap.to(root, { opacity: 1, duration: RM ? 0.25 : 0.6, ease: 'power1.out' }));
    if (stage) {
      gsap.to(stage.uniforms.uReport, {
        value: 1,
        duration: RM ? 0.4 : 1.2,
        ease: 'power2.inOut',
        overwrite: true
      });
    }

    if (RM) {
      root.querySelectorAll('.r-sec').forEach((s) => s.classList.add('is-in'));
      statsEl.querySelectorAll('.rstat__value').forEach((el) => {
        el.textContent = fmt(parseFloat(el.dataset.end), parseInt(el.dataset.dec, 10));
      });
      if (current.map) { drawMapLevels(MAP_LEVELS); drawPeak(); }
    } else {
      animateHead();
      // Low threshold: sections can be taller than short viewports and
      // would otherwise never reach a high intersection ratio.
      io = new IntersectionObserver(onSection, { root: scroller, threshold: 0.15 });
      root.querySelectorAll('.r-sec').forEach((s) => io.observe(s));
    }

    closeBtn.focus({ preventScroll: true });
  }

  function animateHead() {
    const tlines = titleEl.querySelectorAll('.report__tline');
    if (window.SplitText) {
      try {
        split = new window.SplitText(tlines, { type: 'lines', mask: 'lines' });
      } catch (e) { split = null; }
    }
    const targets = split ? split.lines : tlines;
    tweens.push(gsap.fromTo(targets,
      { yPercent: 115 },
      { yPercent: 0, duration: 1.15, stagger: 0.14, ease: 'power4.out', delay: 0.25 }));
    tweens.push(gsap.from([eyebrowEl, coordsEl], {
      y: 18, opacity: 0, duration: 0.7, delay: 0.35, stagger: 0.08, ease: 'power3.out'
    }));
    tweens.push(gsap.from(ledeEl, {
      y: 16, opacity: 0, duration: 0.7, delay: 0.55, ease: 'power2.out'
    }));
  }

  function onSection(entries) {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const sec = en.target;
      sec.classList.add('is-in');
      if (sec.dataset.sec === 'stats') runStats();
      if (sec.dataset.sec === 'map' && current && current.map) runMapReveal();
      io.unobserve(sec);
    });
  }

  function runStats() {
    statsEl.querySelectorAll('.rstat__value').forEach((el, i) => {
      const end = parseFloat(el.dataset.end);
      const dec = parseInt(el.dataset.dec, 10);
      const o = { v: 0 };
      tweens.push(gsap.to(o, {
        v: end,
        duration: 1.6,
        delay: 0.25 + i * 0.15,
        ease: 'power3.out',
        onUpdate: () => { el.textContent = fmt(o.v, dec); }
      }));
    });
  }

  /* -------------------------------------------------------------- close */

  function close(cb) {
    if (!isOpen) return;
    isOpen = false;
    if (io) { io.disconnect(); io = null; }
    tweens.forEach((t) => t.kill());
    tweens = [];

    if (stage) {
      gsap.to(stage.uniforms.uReport, {
        value: 0,
        duration: RM ? 0.3 : 0.9,
        ease: 'power2.inOut',
        overwrite: true
      });
    }
    gsap.to(root, {
      opacity: 0,
      duration: RM ? 0.2 : 0.5,
      ease: 'power1.in',
      onComplete: () => {
        root.classList.remove('is-open');
        root.setAttribute('aria-hidden', 'true');
        if (split) { split.revert(); split = null; }
        current = null;
        if (cb) cb();
      }
    });
  }

  /* ------------------------------------------------------ mini-map draw */

  function sizeMapCanvas() {
    const css = mapCanvas.clientWidth || 320;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    mapCanvas.width = Math.round(css * dpr);
    mapCanvas.height = Math.round(css * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    current.cssSize = css;
  }

  function clearMap() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    ctx.restore();
  }

  function drawMapFrame() {
    const w = current.cssSize;
    clearMap();
    // Quarter graticule.
    ctx.strokeStyle = 'rgba(232, 226, 214, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const q = (w * i) / 4;
      ctx.moveTo(q, 0); ctx.lineTo(q, w);
      ctx.moveTo(0, q); ctx.lineTo(w, q);
    }
    ctx.stroke();
    // Corner ticks.
    ctx.strokeStyle = 'rgba(232, 226, 214, 0.35)';
    ctx.beginPath();
    const t = 10;
    [[0, 0, 1, 1], [w, 0, -1, 1], [0, w, 1, -1], [w, w, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.moveTo(x + sx * t, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * t);
    });
    ctx.stroke();
  }

  /* Marching squares over the normalised grid - one flat array of
     [x, y] endpoints per level, computed lazily and cached forever. */
  function contourSegments(field, size, level) {
    const segs = [];
    const inv = (a, b) => {
      const d = b - a;
      const t = (level - a) / (d === 0 ? 1e-9 : d);
      return t < 0 ? 0 : t > 1 ? 1 : t;
    };
    for (let y = 0; y < size - 1; y++) {
      const r0 = y * size;
      const r1 = (y + 1) * size;
      for (let x = 0; x < size - 1; x++) {
        const tl = field[r0 + x];
        const tr = field[r0 + x + 1];
        const br = field[r1 + x + 1];
        const bl = field[r1 + x];
        let idx = 0;
        if (tl > level) idx |= 8;
        if (tr > level) idx |= 4;
        if (br > level) idx |= 2;
        if (bl > level) idx |= 1;
        if (idx === 0 || idx === 15) continue;
        const top = [x + inv(tl, tr), y];
        const right = [x + 1, y + inv(tr, br)];
        const bottom = [x + inv(bl, br), y + 1];
        const left = [x, y + inv(tl, bl)];
        switch (idx) {
          case 1: case 14: segs.push(left, bottom); break;
          case 2: case 13: segs.push(bottom, right); break;
          case 3: case 12: segs.push(left, right); break;
          case 4: case 11: segs.push(top, right); break;
          case 6: case 9: segs.push(top, bottom); break;
          case 7: case 8: segs.push(top, left); break;
          case 5: segs.push(top, right, left, bottom); break;
          case 10: segs.push(top, left, right, bottom); break;
        }
      }
    }
    return segs;
  }

  function findPeak(map) {
    let best = 0;
    let bi = 0;
    for (let i = 0; i < map.field.length; i++) {
      if (map.field[i] > best) { best = map.field[i]; bi = i; }
    }
    return [(bi % map.size) / (map.size - 1), Math.floor(bi / map.size) / (map.size - 1)];
  }

  function strokeLevel(i) {
    const { map, cache, cssSize } = current;
    if (!cache.levels[i]) {
      cache.levels[i] = contourSegments(map.field, map.size, (i + 1) / (MAP_LEVELS + 1));
    }
    const segs = cache.levels[i];
    const k = cssSize / (map.size - 1);
    const isIndex = i % 4 === 2;
    ctx.strokeStyle = isIndex
      ? hexToRgba(current.project.accent, 0.6)
      : 'rgba(232, 226, 214, 0.2)';
    ctx.lineWidth = isIndex ? 1.3 : 0.7;
    ctx.beginPath();
    for (let s = 0; s < segs.length; s += 2) {
      ctx.moveTo(segs[s][0] * k, segs[s][1] * k);
      ctx.lineTo(segs[s + 1][0] * k, segs[s + 1][1] * k);
    }
    ctx.stroke();
  }

  function drawMapLevels(upTo) {
    for (let i = current.drawn; i < upTo && i < MAP_LEVELS; i++) strokeLevel(i);
    current.drawn = Math.max(current.drawn, Math.min(upTo, MAP_LEVELS));
  }

  function drawPeak() {
    const { cache, cssSize } = current;
    const px = cache.peak[0] * cssSize;
    const py = cache.peak[1] * cssSize;
    ctx.strokeStyle = hexToRgba(current.project.accent, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px - 7, py); ctx.lineTo(px + 7, py);
    ctx.moveTo(px, py - 7); ctx.lineTo(px, py + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.stroke();
    current.peakDrawn = true;
  }

  function runMapReveal() {
    const o = { n: 0 };
    tweens.push(gsap.to(o, {
      n: MAP_LEVELS,
      duration: 1.7,
      delay: 0.15,
      ease: 'power1.inOut',
      onUpdate: () => drawMapLevels(Math.floor(o.n)),
      onComplete: () => { drawMapLevels(MAP_LEVELS); drawPeak(); }
    }));
  }

  function redrawMap() {
    const drawn = current.drawn;
    const hadPeak = current.peakDrawn;
    sizeMapCanvas();
    drawMapFrame();
    current.drawn = 0;
    drawMapLevels(drawn);
    if (hadPeak) drawPeak();
  }

  return { open, close, isOpen: () => isOpen };
}
