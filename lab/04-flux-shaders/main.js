/* ============================================================
   FLUX — main.js
   Raw WebGL2 engine. One shared requestAnimationFrame drives
   every visible tile; the fullscreen inspector takes over the
   frame budget while it is open. Zero libraries.
   ============================================================ */

import { VERT_SRC, SHADERS } from './shaders.js';

const MAX_DPR = 2;       // hard cap on devicePixelRatio
const TILE_SCALE = 0.75; // tiles render at ~0.75 of capped DPR
const HOVER_SPEED = 2.2; // hover overdrive multiplier

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pause = (ms) => new Promise((res) => setTimeout(res, ms));

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)').matches;

const state = {
  reduced: reducedQuery.matches,
  tiles: [],
  linked: 0,
  boot: performance.now(),
  frames: 0,
  fpsStamp: performance.now(),
};

/* ---------------- WebGL helpers ------------------------------ */

function createProgram(gl, vsSrc, fsSrc) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src.trim());
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(log || 'unknown compile error');
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(log || 'unknown link error');
  }
  return prog;
}

// one fullscreen triangle — cheaper than a quad, no diagonal seam
function setupSurface(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return vao;
}

function getUniforms(gl, prog) {
  return {
    time: gl.getUniformLocation(prog, 'u_time'),
    mouse: gl.getUniformLocation(prog, 'u_mouse'),
    res: gl.getUniformLocation(prog, 'u_resolution'),
  };
}

const CTX_OPTS = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' };

/* ---------------- tiles -------------------------------------- */

class Tile {
  constructor(def, el, canvas, i) {
    this.def = def;
    this.el = el;
    this.canvas = canvas;
    this.i = i;
    this.gl = canvas.getContext('webgl2', CTX_OPTS);
    this.time = 3 + i * 7.3;      // desynchronized start clocks
    this.timeScale = 1;
    this.targetScale = 1;
    this.mouse = [0.5, 0.5];
    this.target = [0.5, 0.5];
    this.visible = true;
    this.error = null;
    this.needsFrame = true;
    this.cssW = 0;
    this.cssH = 0;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (!this.error) this.fail(new Error('WebGL context lost'));
    });
  }

  init() {
    if (!this.gl) throw new Error('could not acquire a WebGL2 context for this tile');
    this.vao = setupSurface(this.gl);
    this.prog = createProgram(this.gl, VERT_SRC, this.def.src);
    this.uni = getUniforms(this.gl, this.prog);
    this.applySize();
  }

  fail(err) {
    this.error = err;
    console.error(`[FLUX ${this.def.id} ${this.def.name}] GLSL error:\n${err.message}`);
    this.el.classList.add('tile--error');
    const ov = document.createElement('div');
    ov.className = 'tile-fault';
    ov.innerHTML = '<b>ERR</b><span>GLSL COMPILE FAILED</span><span>SEE CONSOLE FOR LOG</span>';
    this.el.appendChild(ov);
    const st = this.el.querySelector('.t-status b');
    if (st) st.textContent = 'FAULT';
    if (this.gl && !this.gl.isContextLost()) {
      this.gl.clearColor(0.07, 0.0, 0.0, 1.0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
  }

  applySize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * TILE_SCALE;
    const w = Math.max(1, Math.round((this.cssW || this.el.clientWidth) * dpr));
    const h = Math.max(1, Math.round((this.cssH || this.el.clientHeight) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.needsFrame = true;
    }
  }

  step(dt) {
    const k = 1 - Math.exp(-dt * 8);
    this.mouse[0] += (this.target[0] - this.mouse[0]) * k;
    this.mouse[1] += (this.target[1] - this.mouse[1]) * k;
    this.timeScale += (this.targetScale - this.timeScale) * (1 - Math.exp(-dt * 5));
    if (!state.reduced) this.time += dt * this.timeScale;
  }

  draw() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform1f(this.uni.time, this.time);
    gl.uniform2f(this.uni.mouse, this.mouse[0], this.mouse[1]);
    gl.uniform2f(this.uni.res, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.needsFrame = false;
  }
}

function buildTiles() {
  const grid = $('#grid');
  SHADERS.forEach((def, i) => {
    const el = document.createElement('article');
    el.className = 'tile';
    el.tabIndex = 0;
    el.dataset.i = i;
    el.style.setProperty('--i', i);
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Open ${def.name} — ${def.tech} — in the fullscreen inspector`);
    el.innerHTML = `
      <canvas></canvas>
      <div class="tile-row tile-top">
        <span class="t-index">${def.id}</span>
        <span class="t-tech">${def.tech}</span>
      </div>
      <div class="tile-row tile-bot">
        <span class="t-name">${def.name}</span>
        <span class="t-status"><i></i><b>LIVE</b></span>
      </div>`;
    grid.appendChild(el);

    const tile = new Tile(def, el, el.querySelector('canvas'), i);
    state.tiles.push(tile);

    el.addEventListener('pointerenter', () => {
      tile.targetScale = HOVER_SPEED;
      const b = el.querySelector('.t-status b');
      if (b && !tile.error) b.textContent = `OVERDRIVE ×${HOVER_SPEED}`;
      if (state.reduced) tile.needsFrame = true;
    });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      tile.target[0] = clamp((e.clientX - r.left) / r.width, 0, 1);
      tile.target[1] = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    });
    el.addEventListener('pointerleave', () => {
      tile.targetScale = 1;
      tile.target[0] = 0.5;
      tile.target[1] = 0.5;
      const b = el.querySelector('.t-status b');
      if (b && !tile.error) b.textContent = state.reduced ? 'STATIC' : 'LIVE';
    });
    el.addEventListener('click', () => openModal(i));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(i);
      }
    });

    io.observe(el);
    ro.observe(el);
  });
}

const io = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      const tile = state.tiles[+en.target.dataset.i];
      if (!tile) continue;
      tile.visible = en.isIntersecting;
      if (en.isIntersecting) tile.needsFrame = true;
    }
  },
  { rootMargin: '80px', threshold: 0.01 }
);

const ro = new ResizeObserver((entries) => {
  for (const en of entries) {
    const tile = state.tiles[+en.target.dataset.i];
    if (!tile) continue;
    tile.cssW = en.contentRect.width;
    tile.cssH = en.contentRect.height;
    if (tile.gl && !tile.error) tile.applySize();
  }
});

/* ---------------- fullscreen inspector ------------------------ */

const modal = {
  el: $('#modal'),
  canvas: $('#modal-canvas'),
  gl: null,
  vao: null,
  cache: {},
  entry: null,
  def: null,
  open: false,
  time: 0,
  mouse: [0.5, 0.5],
  target: [0.5, 0.5],
  needsFrame: true,
  prevFocus: null,
};

function ensureModalGL() {
  if (modal.gl) return modal.gl;
  modal.gl = modal.canvas.getContext('webgl2', CTX_OPTS);
  if (modal.gl) modal.vao = setupSurface(modal.gl);
  return modal.gl;
}

function sizeModal() {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  modal.canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
  modal.canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
  modal.needsFrame = true;
}

function openModal(i) {
  const tile = state.tiles[i];
  if (!tile || tile.error) return;
  const def = tile.def;
  modal.def = def;
  modal.time = tile.time;             // pick up where the tile left off
  modal.mouse = [...tile.mouse];
  modal.target = [0.5, 0.5];

  $('#modal-index').textContent = def.id;
  $('#modal-name').textContent = def.name;
  $('#modal-tech').textContent = def.tech;
  $('#modal-desc').textContent = def.desc;
  const src = def.src.trim();
  $('#source-code').innerHTML = highlightGLSL(src);
  $('#source-stats').textContent = `${src.split('\n').length} LINES · ${src.length} CHARS`;
  modal.el.classList.remove('show-source');
  const sBtn = $('#btn-source');
  sBtn.setAttribute('aria-pressed', 'false');
  sBtn.textContent = 'SOURCE';

  modal.entry = null;
  modal.el.classList.remove('modal-error');
  const gl = ensureModalGL();
  if (gl) {
    let entry = modal.cache[def.id];
    if (entry === undefined) {
      try {
        const prog = createProgram(gl, VERT_SRC, def.src);
        entry = { prog, uni: getUniforms(gl, prog) };
      } catch (err) {
        console.error(`[FLUX ${def.id} ${def.name}] inspector compile failed:\n${err.message}`);
        entry = null;
      }
      modal.cache[def.id] = entry;
    }
    modal.entry = entry;
  }
  if (!modal.entry) modal.el.classList.add('modal-error');

  modal.open = true;
  modal.needsFrame = true;
  modal.el.hidden = false;
  document.body.classList.add('modal-open');
  modal.prevFocus = document.activeElement;
  sizeModal();
  $('#btn-close').focus();
}

function closeModal() {
  if (!modal.open) return;
  modal.open = false;
  modal.el.hidden = true;
  document.body.classList.remove('modal-open');
  for (const t of state.tiles) t.needsFrame = true;
  if (modal.prevFocus && modal.prevFocus.focus) modal.prevFocus.focus();
}

function modalFrame(dt) {
  if (!modal.entry || !modal.gl) return;
  const k = 1 - Math.exp(-dt * 6);
  modal.mouse[0] += (modal.target[0] - modal.mouse[0]) * k;
  modal.mouse[1] += (modal.target[1] - modal.mouse[1]) * k;
  if (!state.reduced) modal.time += dt;
  else if (!modal.needsFrame) return;
  const gl = modal.gl;
  gl.viewport(0, 0, modal.canvas.width, modal.canvas.height);
  gl.useProgram(modal.entry.prog);
  gl.bindVertexArray(modal.vao);
  gl.uniform1f(modal.entry.uni.time, modal.time);
  gl.uniform2f(modal.entry.uni.mouse, modal.mouse[0], modal.mouse[1]);
  gl.uniform2f(modal.entry.uni.res, modal.canvas.width, modal.canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  modal.needsFrame = false;
}

modal.el.addEventListener('pointermove', (e) => {
  modal.target[0] = clamp(e.clientX / window.innerWidth, 0, 1);
  modal.target[1] = clamp(1 - e.clientY / window.innerHeight, 0, 1);
});

$('#btn-close').addEventListener('click', closeModal);
$('#btn-source').addEventListener('click', () => {
  const on = modal.el.classList.toggle('show-source');
  const btn = $('#btn-source');
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? 'RENDER' : 'SOURCE';
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.open) {
    closeModal();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const d = parseInt(e.key, 10);
  if (d >= 1 && d <= state.tiles.length) openModal(d - 1);
});

/* ---------------- tiny GLSL highlighter ----------------------- */

function highlightGLSL(src) {
  const esc = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const re = new RegExp(
    [
      '(\\/\\/[^\\n]*)',                                                  // 1 comment
      '(#\\w+)',                                                          // 2 preprocessor
      '(\\bu_(?:time|mouse|resolution)\\b)',                              // 3 uniforms
      '(\\b(?:precision|highp|mediump|lowp|uniform|out|in|const|void|float|int|bool|vec[234]|mat[234]|if|else|for|return|break|continue|true|false)\\b)', // 4 keywords
      '(\\b(?:sin|cos|tan|atan|pow|exp|exp2|log|log2|sqrt|abs|sign|floor|fract|mod|min|max|clamp|mix|step|smoothstep|length|dot|cross|normalize|reflect|refract)\\b)', // 5 builtins
      '(\\b\\d+\\.?\\d*(?:[eE][-+]?\\d+)?\\b|\\.\\d+\\b)',                // 6 numbers
    ].join('|'),
    'g'
  );
  return esc.replace(re, (m, cmt, pre, uni, kw, fn, num) => {
    const cls = cmt ? 'g-cmt' : pre ? 'g-pre' : uni ? 'g-uni' : kw ? 'g-kw' : fn ? 'g-fn' : 'g-num';
    return `<span class="${cls}">${m}</span>`;
  });
}

/* ---------------- custom cursor ------------------------------- */

const cursorEl = $('#cursor');
const cur = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2, on: false };

if (finePointer) {
  window.addEventListener('pointermove', (e) => {
    cur.tx = e.clientX;
    cur.ty = e.clientY;
    cur.on = true;
  });
  document.addEventListener('pointerover', (e) => {
    cursorEl.classList.toggle('is-active', !!e.target.closest('.tile, button, a'));
  });
  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget) cur.on = false;
  });
}

function updateCursor(dt) {
  if (!document.documentElement.classList.contains('has-cursor')) return;
  const k = 1 - Math.exp(-dt * 24);
  cur.x += (cur.tx - cur.x) * k;
  cur.y += (cur.ty - cur.y) * k;
  cursorEl.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
  cursorEl.style.opacity = cur.on ? '1' : '0';
}

/* ---------------- HUD ----------------------------------------- */

const hudTime = $('#hud-time');
const hudFps = $('#hud-fps');
const hudDpr = $('#hud-dpr');
const hudPrg = $('#hud-prg');

function updateHud(now) {
  const t = (now - state.boot) / 1000;
  hudTime.textContent = t.toFixed(1).padStart(6, '0');
  hudDpr.textContent = Math.min(window.devicePixelRatio || 1, MAX_DPR).toFixed(2);
}

/* ---------------- reduced motion ------------------------------- */

function setReduced(v) {
  state.reduced = v;
  document.documentElement.classList.toggle('has-cursor', finePointer && !v);
  const note = $('#foot-note');
  if (note) note.textContent = v ? 'MOTION: REDUCED (SYSTEM PREFERENCE)' : 'MOTION: FULL';
  const btn = $('#motion-btn');
  if (btn) btn.hidden = !v;
  for (const t of state.tiles) {
    t.needsFrame = true;
    const b = t.el.querySelector('.t-status b');
    if (b && !t.error) b.textContent = v ? 'STATIC' : 'LIVE';
  }
  modal.needsFrame = true;
}

reducedQuery.addEventListener('change', (e) => setReduced(e.matches));
$('#motion-btn').addEventListener('click', () => {
  setReduced(false);
  $('#motion-btn').hidden = true;
  $('#foot-note').textContent = 'MOTION: FULL (MANUAL OVERRIDE)';
});

/* ---------------- main loop ------------------------------------ */

let lastT = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = clamp((now - lastT) / 1000, 0, 0.066);
  lastT = now;

  state.frames++;
  if (now - state.fpsStamp >= 500) {
    hudFps.textContent = String(Math.round((state.frames * 1000) / (now - state.fpsStamp)));
    state.frames = 0;
    state.fpsStamp = now;
    updateHud(now);
  }

  updateCursor(dt);

  if (modal.open) {
    modalFrame(dt);
    return; // the inspector owns the frame budget
  }

  for (const t of state.tiles) {
    if (t.error || !t.gl || !t.prog || !t.visible) continue;
    if (state.reduced && !t.needsFrame) continue;
    t.step(dt);
    t.draw();
  }
}

/* ---------------- resize --------------------------------------- */

window.addEventListener('resize', () => {
  for (const t of state.tiles) if (t.gl && !t.error) t.applySize();
  if (modal.open) sizeModal();
  hudDpr.textContent = Math.min(window.devicePixelRatio || 1, MAX_DPR).toFixed(2);
});

/* ---------------- boot sequence -------------------------------- */

function bootLine(text, bad = false) {
  const div = document.createElement('div');
  div.className = 'boot-line' + (bad ? ' bad' : '');
  div.textContent = text;
  $('#boot-log').appendChild(div);
}

function setFill(x) {
  $('#intro-fill').style.width = `${Math.round(clamp(x, 0, 1) * 100)}%`;
}

async function boot() {
  hudDpr.textContent = Math.min(window.devicePixelRatio || 1, MAX_DPR).toFixed(2);
  setReduced(state.reduced);

  // probe for WebGL2 before building anything
  const probeCanvas = document.createElement('canvas');
  const probe = probeCanvas.getContext('webgl2');
  if (!probe) {
    $('#intro').remove();
    $('#fallback').hidden = false;
    document.body.classList.add('revealed');
    hudPrg.textContent = '0/6';
    console.error('[FLUX] WebGL2 is unavailable in this browser.');
    return;
  }
  const gpu = String(probe.getParameter(probe.RENDERER) || 'UNKNOWN RENDERER');
  const lose = probe.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();

  bootLine('WEBGL2 CONTEXT // OK');
  bootLine(`GPU // ${gpu.slice(0, 72).toUpperCase()}`);
  if (!state.reduced) await pause(140);

  buildTiles();

  const step = 1 / (state.tiles.length + 1);
  let fill = step;
  setFill(fill);
  for (const tile of state.tiles) {
    try {
      tile.init();
      state.linked++;
      bootLine(`${tile.def.id} ${tile.def.name} // LINKED`);
    } catch (err) {
      tile.fail(err);
      bootLine(`${tile.def.id} ${tile.def.name} // FAULT`, true);
    }
    fill += step;
    setFill(fill);
    if (!state.reduced) await pause(110);
  }

  hudPrg.textContent = `${state.linked}/${state.tiles.length}`;
  bootLine(`${state.linked}/${state.tiles.length} PROGRAMS LINKED // RUNNING`, state.linked !== state.tiles.length);
  setFill(1);
  if (!state.reduced) await pause(520);

  const intro = $('#intro');
  intro.classList.add('done');
  document.body.classList.remove('booting');
  document.body.classList.add('revealed');
  setTimeout(() => intro.remove(), 800);

  lastT = performance.now();
  requestAnimationFrame(loop);
}

boot();
