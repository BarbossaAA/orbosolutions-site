/* ============================================================
   FLUX - main.js
   Raw WebGL2 engine. One shared requestAnimationFrame drives
   every visible tile; the fullscreen inspector takes over the
   frame budget while it is open. The GL core uses zero
   libraries. GSAP + Lenis are UI-layer only: scroll, reveals,
   scramble, and the FLIP expansion of the inspector.
   ============================================================ */

import { VERT_SRC, SHADERS } from './shaders.js';

const MAX_DPR = 1.5;       // hard cap on devicePixelRatio (fullscreen inspector)
const TILE_DPR = 0.6;      // grid tiles render at ~0.6 device px per CSS px
const HOVER_DPR_CAP = 1.2; // the hovered tile sharpens up to this
const SIM_MAX = 512;       // long-side cap on the 008 FLOW state buffers
const HOVER_SPEED = 2.2;   // hover overdrive multiplier

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pause = (ms) => new Promise((res) => setTimeout(res, ms));
const nextFrame = () => new Promise((res) => requestAnimationFrame(res));

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)').matches;

const state = {
  reduced: reducedQuery.matches,
  tiles: [],
  linked: 0,
  boot: performance.now(),
  fpsStamp: performance.now(),
  hover: null,       // tile currently under the pointer
  bootDone: false,
};

/* ---------------- UI layer (GSAP + Lenis, optional) ----------- */

const G = window.gsap || null;
const ST = (G && window.ScrollTrigger) || null;
const SCRAMBLE = !!(G && window.ScrambleTextPlugin);
if (G) {
  const plugs = [];
  if (window.ScrollTrigger) plugs.push(window.ScrollTrigger);
  if (window.ScrambleTextPlugin) plugs.push(window.ScrambleTextPlugin);
  if (plugs.length) G.registerPlugin(...plugs);
}
const uiReady = () => !!G;

const SCRAMBLE_CHARS = '▓▒░<>/#01';
function scramble(el, text, dur = 0.45) {
  if (!el) return;
  if (SCRAMBLE && !state.reduced) {
    G.killTweensOf(el);
    G.to(el, { duration: dur, scrambleText: { text, chars: SCRAMBLE_CHARS, speed: 1.6 } });
  } else {
    el.textContent = text;
  }
}

let lenis = null;
function initLenis() {
  if (lenis || state.reduced || !window.Lenis) return;
  try {
    lenis = new window.Lenis({ autoRaf: false, duration: 1.05, smoothWheel: true });
    if (ST) lenis.on('scroll', ST.update);
  } catch (err) {
    console.warn('[FLUX] Lenis failed to start; native scroll remains.', err);
    lenis = null;
  }
}
function killLenis() {
  if (!lenis) return;
  try { lenis.destroy(); } catch (err) { /* native scroll takes over */ }
  lenis = null;
}

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

// one fullscreen triangle - cheaper than a quad, no diagonal seam
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

/* ---------------- ping-pong feedback rig (008 FLOW) ----------- */
/* Two render targets trade places every frame: read the previous
   state, write the next. RGBA16F when the GPU can render to it,
   RGBA8 otherwise - the piece survives the downgrade. */

class FeedbackRig {
  constructor(gl, def, vao) {
    this.gl = gl;
    this.def = def;
    this.vao = vao;
    this.w = 0;
    this.h = 0;
    this.fmt = 'RGBA8';
    this.a = null; // read (current state)
    this.b = null; // write (next state)
  }

  init() {
    const gl = this.gl;
    const floatOK = gl.getExtension('EXT_color_buffer_float')
                 || gl.getExtension('EXT_color_buffer_half_float');
    this.fmt = floatOK ? 'RGBA16F' : 'RGBA8';
    this.sim = createProgram(gl, VERT_SRC, this.def.simSrc);
    this.view = createProgram(gl, VERT_SRC, this.def.viewSrc);
    const u = (p, n) => gl.getUniformLocation(p, n);
    this.simU = {
      prev: u(this.sim, 'u_prev'), time: u(this.sim, 'u_time'), dt: u(this.sim, 'u_dt'),
      res: u(this.sim, 'u_resolution'), mouse: u(this.sim, 'u_mouse'),
      vel: u(this.sim, 'u_mouseVel'), inject: u(this.sim, 'u_inject'),
    };
    this.viewU = { state: u(this.view, 'u_state'), time: u(this.view, 'u_time'), res: u(this.view, 'u_resolution') };
  }

  makeTarget(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.fmt === 'RGBA16F') {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, ok };
  }

  free(t) {
    if (!t) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fb);
  }

  resize(canvasW, canvasH) {
    // sim resolution is capped independent of display size (~512 on the
    // long side); the view pass upscales. Feedback ink is soft - it survives.
    const long = Math.max(canvasW, canvasH, 1);
    const s = Math.min(1, SIM_MAX / long);
    const w = Math.max(1, Math.round(canvasW * s));
    const h = Math.max(1, Math.round(canvasH * s));
    if (w === this.w && h === this.h) return;
    const oldRead = this.a;      // preserve the ink through the resize
    this.free(this.b);
    this.w = w;
    this.h = h;
    let a = this.makeTarget(w, h);
    let b = this.makeTarget(w, h);
    if (this.fmt === 'RGBA16F' && (!a.ok || !b.ok)) {
      // the extension said yes but the framebuffer said no - fall back
      this.free(a); this.free(b);
      this.fmt = 'RGBA8';
      a = this.makeTarget(w, h);
      b = this.makeTarget(w, h);
    }
    this.a = a;
    this.b = b;
    if (oldRead) {
      this.copyInto(oldRead.tex);
      this.free(oldRead);
    }
  }

  // one dt=0 sim step: a pure resample of src into the state
  copyInto(srcTex) {
    this.runSim(srcTex, 0, 0, 0.5, 0.5, 0, 0, 0);
  }

  runSim(srcTex, time, dt, mx, my, vx, vy, inject) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.sim);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.simU.prev, 0);
    gl.uniform1f(this.simU.time, time);
    gl.uniform1f(this.simU.dt, dt);
    gl.uniform2f(this.simU.res, this.w, this.h);
    gl.uniform2f(this.simU.mouse, mx, my);
    gl.uniform2f(this.simU.vel, vx, vy);
    gl.uniform1f(this.simU.inject, inject);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const t = this.a; this.a = this.b; this.b = t;
  }

  step(dt, time, mx, my, vx, vy, inject) {
    this.runSim(this.a.tex, time, dt, mx, my, vx, vy, inject);
  }

  blit(w, h, time) {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.view);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform1i(this.viewU.state, 0);
    gl.uniform1f(this.viewU.time, time);
    gl.uniform2f(this.viewU.res, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // pull pixels from another canvas into the state (cross-context handoff)
  seedFrom(sourceCanvas) {
    const gl = this.gl;
    const tmp = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tmp);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.copyInto(tmp);
    gl.deleteTexture(tmp);
  }
}

// shared driver: paint physics + ghost emitter + sim step + blit
function driveFlow(rig, paint, time, dt, canvasW, canvasH) {
  const p = paint;
  const idt = Math.max(dt, 1e-3);
  p.vx += ((p.tx - p.x) / idt - p.vx) * 0.55;
  p.vy += ((p.ty - p.y) / idt - p.vy) * 0.55;
  p.x = p.tx;
  p.y = p.ty;
  let mx = p.x, my = p.y, vx = p.vx, vy = p.vy, inject = 0;
  if (p.down) {
    inject = 1;
  } else if (!state.reduced && performance.now() - p.lastInput > 2400) {
    // ghost emitter: keeps the pool alive when nobody is pouring
    const t = time * 0.5;
    mx = 0.5 + 0.30 * Math.sin(t * 1.3) + 0.08 * Math.sin(t * 3.7);
    my = 0.5 + 0.26 * Math.cos(t * 0.9) + 0.08 * Math.cos(t * 2.9);
    vx = (mx - p.ex) / idt;
    vy = (my - p.ey) / idt;
    p.ex = mx;
    p.ey = my;
    inject = 0.5;
  }
  if (!state.reduced || p.down) rig.step(clamp(dt, 0, 0.05), time, mx, my, vx, vy, inject);
  rig.blit(canvasW, canvasH, time);
}

function freshPaint() {
  return { tx: 0.5, ty: 0.5, x: 0.5, y: 0.5, vx: 0, vy: 0, down: false, lastInput: -1e4, ex: 0.5, ey: 0.5 };
}

/* ---------------- tiles -------------------------------------- */

class Tile {
  constructor(def, el, canvas, i) {
    this.def = def;
    this.el = el;
    this.canvas = canvas;
    this.i = i;
    this.gl = null;               // acquired in init(), spread across frames
    this.time = 3 + i * 7.3;      // desynchronized start clocks
    this.timeScale = 1;
    this.targetScale = 1;
    this.mouse = [0.5, 0.5];
    this.target = [0.5, 0.5];
    this.visible = true;
    this.error = null;
    this.needsFrame = true;
    this.acc = 0;                 // dt accumulated across skipped half-rate frames
    this.cssW = 0;
    this.cssH = 0;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (!this.error) this.fail(new Error('WebGL context lost'));
    });
  }

  acquire() {
    this.gl = this.canvas.getContext('webgl2', CTX_OPTS);
    if (!this.gl) throw new Error('could not acquire a WebGL2 context for this tile');
  }

  init() {
    this.acquire();
    this.vao = setupSurface(this.gl);
    // tiles compile the capped-step variant; the inspector gets the original
    this.prog = createProgram(this.gl, VERT_SRC, this.def.tileSrc || this.def.src);
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
    const dpr = tileDpr(this);
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

// 008 FLOW - the tile that remembers: ping-pong feedback state
class FlowTile extends Tile {
  constructor(def, el, canvas, i) {
    super(def, el, canvas, i);
    this.paint = freshPaint();
    this.fmt = '';
  }

  init() {
    this.acquire();
    this.vao = setupSurface(this.gl);
    this.rig = new FeedbackRig(this.gl, this.def, this.vao);
    this.rig.init();
    this.applySize();
    this.fmt = this.rig.fmt;
    const tech = this.el.querySelector('.t-tech');
    if (tech) tech.textContent = `${this.def.tech} · ${this.fmt}`;
  }

  applySize() {
    super.applySize();
    if (this.rig) this.rig.resize(this.canvas.width, this.canvas.height);
  }

  draw(dt = 0) {
    driveFlow(this.rig, this.paint, this.time, dt * this.timeScale, this.canvas.width, this.canvas.height);
    this.needsFrame = false;
  }
}

function statusIdle(tile) {
  if (tile.error) return 'FAULT';
  if (state.reduced) return 'STATIC';
  return 'LIVE';
}

function buildTiles() {
  const grid = $('#grid');
  SHADERS.forEach((def, i) => {
    const el = document.createElement('article');
    el.className = 'tile' + (def.feedback ? ' tile--flow' : '');
    el.tabIndex = 0;
    el.dataset.i = i;
    el.style.setProperty('--i', i);
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Open ${def.name} - ${def.tech} - in the fullscreen inspector`);
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

    const canvas = el.querySelector('canvas');
    const tile = def.feedback ? new FlowTile(def, el, canvas, i) : new Tile(def, el, canvas, i);
    state.tiles.push(tile);

    const nameEl = el.querySelector('.t-name');
    const statusEl = el.querySelector('.t-status b');
    let isDown = false;
    let dragged = false;
    let downX = 0;
    let downY = 0;

    const localUV = (e) => {
      const r = el.getBoundingClientRect();
      return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp(1 - (e.clientY - r.top) / r.height, 0, 1)];
    };

    el.addEventListener('pointerenter', () => {
      state.hover = tile;
      tile.targetScale = HOVER_SPEED;
      if (!tile.error) {
        if (tile.gl) tile.applySize();   // hovered tile sharpens to HOVER_DPR_CAP
        scramble(nameEl, def.name, 0.5);
        scramble(statusEl, def.feedback ? 'DRAG TO POUR' : `OVERDRIVE ×${HOVER_SPEED}`, 0.4);
      }
      if (state.reduced) tile.needsFrame = true;
    });
    el.addEventListener('pointermove', (e) => {
      const [ux, uy] = localUV(e);
      tile.target[0] = ux;
      tile.target[1] = uy;
      if (tile.paint) {
        tile.paint.tx = ux;
        tile.paint.ty = uy;
        if (tile.paint.down) {
          tile.paint.lastInput = performance.now();
          tile.needsFrame = true;
        }
      }
      if (isDown && Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragged = true;
    });
    el.addEventListener('pointerdown', (e) => {
      isDown = true;
      dragged = false;
      downX = e.clientX;
      downY = e.clientY;
      if (tile.paint && !tile.error) {
        const [ux, uy] = localUV(e);
        tile.paint.down = true;
        tile.paint.lastInput = performance.now();
        tile.paint.tx = ux; tile.paint.ty = uy;
        tile.paint.x = ux; tile.paint.y = uy;
        tile.needsFrame = true;
        scramble(statusEl, 'POURING', 0.3);
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      }
    });
    const release = () => {
      isDown = false;
      if (tile.paint) {
        tile.paint.down = false;
        if (!tile.error) {
          scramble(statusEl, state.hover === tile ? 'DRAG TO POUR' : statusIdle(tile), 0.35);
        }
      }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', () => {
      if (state.hover === tile) state.hover = null;
      tile.targetScale = 1;
      tile.target[0] = 0.5;
      tile.target[1] = 0.5;
      if (!tile.error) {
        if (tile.gl) tile.applySize();   // back down to grid density
        scramble(statusEl, statusIdle(tile), 0.35);
      }
    });
    el.addEventListener('click', () => {
      if (dragged) { dragged = false; return; }   // a pour is not a click
      openModal(i);
    });
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
  tileIndex: null,
  open: false,
  anim: false,          // FLIP expansion / collapse in flight
  time: 0,
  mouse: [0.5, 0.5],
  target: [0.5, 0.5],
  needsFrame: true,
  prevFocus: null,
  flowRig: null,
  paint: freshPaint(),
  src: '',
  typed: false,
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
  if (modal.flowRig) modal.flowRig.resize(modal.canvas.width, modal.canvas.height);
  modal.needsFrame = true;
}

const modalChrome = () => modal.el.querySelectorAll('.modal-top, .modal-info');

function openModal(i) {
  if (modal.anim) {
    if (!G) return;
    // recover from an interrupted FLIP rather than swallowing the input
    G.killTweensOf(modal.el);
    G.killTweensOf(modalChrome());
    G.set(modal.el, { clearProps: 'clipPath' });
    G.set(modalChrome(), { clearProps: 'all' });
    modal.anim = false;
    if (!modal.open) {
      modal.el.hidden = true;
      document.body.classList.remove('modal-open');
    }
  }
  const tile = state.tiles[i];
  if (!tile || tile.error) return;
  const def = tile.def;
  const wasOpen = modal.open;
  cancelTyping(false);

  modal.def = def;
  modal.tileIndex = i;
  modal.time = tile.time;             // pick up where the tile left off
  modal.mouse = [...tile.mouse];
  modal.target = [0.5, 0.5];
  modal.paint = freshPaint();

  $('#modal-index').textContent = def.id;
  $('#modal-name').textContent = def.name;
  $('#modal-tech').textContent = def.feedback && tile.fmt ? `${def.tech} · ${tile.fmt}` : def.tech;
  $('#modal-desc').textContent = def.desc;
  const src = def.src.trim();
  modal.src = src;
  $('#source-stats').textContent = `${src.split('\n').length} LINES · ${src.length} CHARS`;
  if (state.reduced) {
    $('#source-code').innerHTML = highlightGLSL(src);   // no typing theatre
    modal.typed = true;
  } else {
    $('#source-code').innerHTML = '';
    modal.typed = false;
  }
  modal.el.classList.remove('show-source');
  const sBtn = $('#btn-source');
  sBtn.setAttribute('aria-pressed', 'false');
  sBtn.textContent = 'SOURCE';
  resetCopyBtn();

  modal.entry = null;
  modal.el.classList.remove('modal-error');
  const gl = ensureModalGL();
  if (gl) {
    if (def.feedback) {
      if (!modal.flowRig) {
        try {
          modal.flowRig = new FeedbackRig(gl, def, modal.vao);
          modal.flowRig.init();
        } catch (err) {
          console.error(`[FLUX ${def.id} ${def.name}] inspector rig failed:\n${err.message}`);
          modal.flowRig = null;
        }
      }
      modal.entry = modal.flowRig ? { feedback: true } : null;
    } else {
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
  }
  if (!modal.entry) modal.el.classList.add('modal-error');

  modal.open = true;
  modal.needsFrame = true;
  modal.el.hidden = false;
  document.body.classList.add('modal-open');
  if (lenis) lenis.stop();
  if (!wasOpen) modal.prevFocus = document.activeElement;
  sizeModal();

  // hand the tile's ink to the inspector so nothing visibly resets
  if (modal.entry && modal.entry.feedback && tile.rig) {
    try {
      tile.draw(0);                       // guarantee fresh pixels this task
      modal.flowRig.seedFrom(tile.canvas);
    } catch (err) { /* the pool just starts clean */ }
  }

  // FLIP: the inspector expands out of the clicked tile's rect
  if (!wasOpen && uiReady() && !state.reduced) {
    const r = tile.el.getBoundingClientRect();
    const inView = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    if (inView) {
      modal.anim = true;
      const chrome = modalChrome();
      G.set(modal.el, {
        clipPath: `inset(${r.top}px ${window.innerWidth - r.right}px ${window.innerHeight - r.bottom}px ${r.left}px)`,
      });
      G.set(chrome, { autoAlpha: 0 });
      G.to(modal.el, {
        clipPath: 'inset(0px 0px 0px 0px)',
        duration: 0.72,
        ease: 'power4.inOut',
        onComplete: () => {
          modal.anim = false;
          G.set(modal.el, { clearProps: 'clipPath' });
        },
      });
      G.to(chrome, {
        autoAlpha: 1,
        duration: 0.35,
        delay: 0.48,
        stagger: 0.07,
        onComplete: () => {
          G.set(chrome, { clearProps: 'all' });
          $('#btn-close').focus();
        },
      });
    }
  }
  if (!modal.anim) $('#btn-close').focus();
}

function closeModal() {
  if (!modal.open && !modal.anim) return;
  if (modal.anim && G) {
    // a FLIP was interrupted (hidden tab, rapid input): cut to its end state
    G.killTweensOf(modal.el);
    G.killTweensOf(modalChrome());
    G.set(modal.el, { clearProps: 'clipPath' });
    G.set(modalChrome(), { clearProps: 'all' });
    modal.anim = false;
    if (!modal.open) {              // it was already collapsing - just finish
      modal.el.hidden = true;
      document.body.classList.remove('modal-open');
      if (lenis) lenis.start();
      return;
    }
  }
  if (!modal.open) return;
  cancelTyping(false);
  modal.el.classList.remove('show-source');
  const sBtn = $('#btn-source');
  sBtn.setAttribute('aria-pressed', 'false');
  sBtn.textContent = 'SOURCE';

  const tile = modal.tileIndex != null ? state.tiles[modal.tileIndex] : null;

  // hand the inspector's ink back to the tile
  if (modal.entry && modal.entry.feedback && tile && tile.rig) {
    try {
      modal.needsFrame = true;
      modalFrame(0);                      // fresh pixels this task
      tile.rig.seedFrom(modal.canvas);
      tile.needsFrame = true;
    } catch (err) { /* the tile keeps its old pool */ }
  }

  const done = () => {
    modal.el.hidden = true;
    document.body.classList.remove('modal-open');
    if (lenis) lenis.start();
    if (modal.prevFocus && modal.prevFocus.focus) modal.prevFocus.focus();
  };

  modal.open = false;
  for (const t of state.tiles) t.needsFrame = true;

  const r = tile ? tile.el.getBoundingClientRect() : null;
  const inView = r && r.bottom > 8 && r.top < window.innerHeight - 8 && r.right > 8 && r.left < window.innerWidth - 8;
  if (uiReady() && !state.reduced && inView) {
    modal.anim = true;
    const chrome = modalChrome();
    G.to(chrome, { autoAlpha: 0, duration: 0.22 });
    G.to(modal.el, {
      clipPath: `inset(${r.top}px ${window.innerWidth - r.right}px ${window.innerHeight - r.bottom}px ${r.left}px)`,
      duration: 0.6,
      ease: 'power4.inOut',
      onComplete: () => {
        modal.anim = false;
        G.set(modal.el, { clearProps: 'clipPath' });
        G.set(chrome, { clearProps: 'all' });
        done();
      },
    });
  } else {
    done();
  }
}

function modalFrame(dt) {
  if (!modal.entry || !modal.gl) return;
  const k = 1 - Math.exp(-dt * 6);
  modal.mouse[0] += (modal.target[0] - modal.mouse[0]) * k;
  modal.mouse[1] += (modal.target[1] - modal.mouse[1]) * k;
  if (!state.reduced) modal.time += dt;
  else if (!modal.needsFrame && !(modal.entry.feedback && modal.paint.down)) return;

  if (modal.entry.feedback) {
    driveFlow(modal.flowRig, modal.paint, modal.time, dt, modal.canvas.width, modal.canvas.height);
    modal.needsFrame = false;
    return;
  }

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
  const p = modal.paint;
  p.tx = modal.target[0];
  p.ty = modal.target[1];
  if (p.down) {
    p.lastInput = performance.now();
    modal.needsFrame = true;
  }
});
modal.el.addEventListener('pointerdown', (e) => {
  if (!modal.entry || !modal.entry.feedback) return;
  if (e.target.closest('button, #source-panel, .modal-info, .modal-id')) return;
  const p = modal.paint;
  p.down = true;
  p.lastInput = performance.now();
  p.tx = clamp(e.clientX / window.innerWidth, 0, 1);
  p.ty = clamp(1 - e.clientY / window.innerHeight, 0, 1);
  p.x = p.tx;
  p.y = p.ty;
  modal.needsFrame = true;
  try { modal.el.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
});
const modalPaintEnd = () => { modal.paint.down = false; };
modal.el.addEventListener('pointerup', modalPaintEnd);
modal.el.addEventListener('pointercancel', modalPaintEnd);

$('#btn-close').addEventListener('click', closeModal);
$('#btn-source').addEventListener('click', () => {
  const on = modal.el.classList.toggle('show-source');
  const btn = $('#btn-source');
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? 'RENDER' : 'SOURCE';
  if (on && !modal.typed) {
    modal.typed = true;
    if (state.reduced) $('#source-code').innerHTML = highlightGLSL(modal.src);
    else typeSource(modal.src);
  } else if (!on) {
    cancelTyping(true);   // finish instantly so reopening shows the full listing
  }
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

/* ---------------- source view v2: the typer + copy ------------ */

const typer = { timer: 0, caret: null, lines: null, i: 0 };

function cancelTyping(complete) {
  if (typer.timer) {
    clearInterval(typer.timer);
    typer.timer = 0;
  }
  if (complete && typer.lines && typer.caret) {
    let html = '';
    for (; typer.i < typer.lines.length; typer.i++) html += highlightGLSL(typer.lines[typer.i]) + '\n';
    typer.caret.insertAdjacentHTML('beforebegin', html);
  }
  if (typer.caret) {
    typer.caret.remove();
    typer.caret = null;
  }
  typer.lines = null;
}

function typeSource(src) {
  cancelTyping(false);
  const code = $('#source-code');
  const pre = $('#source-pre');
  code.innerHTML = '';
  const caret = document.createElement('span');
  caret.className = 'type-caret';
  code.appendChild(caret);
  typer.caret = caret;
  typer.lines = src.split('\n');
  typer.i = 0;
  pre.scrollTop = 0;
  typer.timer = setInterval(() => {
    if (!typer.lines) return;
    let html = '';
    const end = Math.min(typer.lines.length, typer.i + 3);   // three lines a tick: fast, chunked
    for (; typer.i < end; typer.i++) html += highlightGLSL(typer.lines[typer.i]) + '\n';
    caret.insertAdjacentHTML('beforebegin', html);
    pre.scrollTop = pre.scrollHeight;
    if (typer.i >= typer.lines.length) cancelTyping(false);
  }, 16);
}

const copyBtn = $('#btn-copy');
function resetCopyBtn() {
  if (copyBtn) copyBtn.textContent = 'COPY';
}
if (copyBtn) {
  copyBtn.addEventListener('click', async () => {
    const text = modal.src;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (err) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (err2) {
        ok = false;
      }
    }
    copyBtn.textContent = ok ? 'COPIED' : 'FAILED';
    clearTimeout(copyBtn._t);
    copyBtn._t = setTimeout(resetCopyBtn, 1400);
  });
}

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
      '(\\bu_(?:time|mouse|resolution|prev|dt|mouseVel|inject|state)\\b)', // 3 uniforms
      '(\\b(?:precision|highp|mediump|lowp|uniform|out|in|const|void|float|int|bool|vec[234]|mat[234]|sampler2D|if|else|for|return|break|continue|true|false)\\b)', // 4 keywords
      '(\\b(?:sin|cos|tan|atan|pow|exp|exp2|log|log2|sqrt|abs|sign|floor|fract|mod|min|max|clamp|mix|step|smoothstep|length|dot|cross|normalize|reflect|refract|texture)\\b)', // 5 builtins
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
const cur = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2, on: false, op: '' };

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
  const dx = cur.tx - cur.x;
  const dy = cur.ty - cur.y;
  if (Math.abs(dx) + Math.abs(dy) > 0.05) {   // skip CSSOM writes when parked
    const k = 1 - Math.exp(-dt * 24);
    cur.x += dx * k;
    cur.y += dy * k;
    cursorEl.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
  }
  const op = cur.on ? '1' : '0';
  if (cur.op !== op) {
    cur.op = op;
    cursorEl.style.opacity = op;
  }
}

/* ---------------- HUD: live readout ---------------------------- */

const hudTime = $('#hud-time');
const hudFps = $('#hud-fps');
const hudDpr = $('#hud-dpr');
const hudPrg = $('#hud-prg');
const hudSpec = $('#hud-spec');
const hudQ = $('#hud-q');

// rolling average over the last ~90 frames
const fpsRing = new Float32Array(90);
let fpsIdx = 0;
let fpsFill = 0;
let fpsSum = 0;

function pushFrameTime(ms) {
  fpsSum += ms - fpsRing[fpsIdx];
  fpsRing[fpsIdx] = ms;
  fpsIdx = (fpsIdx + 1) % fpsRing.length;
  if (fpsFill < fpsRing.length) fpsFill++;
}

function avgFrameMs() {
  return fpsFill ? fpsSum / fpsFill : 16.7;
}

function updateHud(now) {
  const t = (now - state.boot) / 1000;
  hudTime.textContent = t.toFixed(1).padStart(6, '0');
  hudDpr.textContent = Math.min(window.devicePixelRatio || 1, MAX_DPR).toFixed(2);
}

function updateSpec() {
  let txt = '---';
  if (state.hover && !state.hover.error) {
    txt = `${state.hover.def.id} T+${state.hover.time.toFixed(1)}`;
  } else if (modal.open && modal.def) {
    txt = `${modal.def.id} T+${modal.time.toFixed(1)}`;
  }
  if (hudSpec.textContent !== txt) hudSpec.textContent = txt;
}

/* ---------------- adaptive quality ----------------------------- */
/* Watch the rolling frame time. Sustained > 22 ms: step the tile
   DPR down (never below 0.4 device pixels per CSS pixel) and mark
   the HUD "Q AUTO". Sustained headroom: step back up. The ring
   buffer is preallocated - this path never allocates per frame. */

const quality = { scale: 1, auto: false, slow: 0, calm: 0, warm: 0 };

function tileDpr(tile) {
  const hovered = tile && state.hover === tile;
  const base = hovered ? Math.min(window.devicePixelRatio || 1, HOVER_DPR_CAP) : TILE_DPR;
  return Math.max(0.4, base * quality.scale);
}

function applyQuality() {
  for (const t of state.tiles) if (t.gl && !t.error) t.applySize();
  if (hudQ) hudQ.textContent = quality.auto ? `AUTO ${tileDpr().toFixed(2)}` : 'FULL';
}

function adaptQuality(dt) {
  if (!state.bootDone || state.reduced || modal.open || modal.anim) return;
  quality.warm += dt;
  if (quality.warm < 3) return;              // ignore boot turbulence
  const ms = avgFrameMs();
  if (ms > 22) {
    quality.slow += dt;
    quality.calm = 0;
  } else {
    quality.slow = 0;
    quality.calm = ms < 14 ? quality.calm + dt : 0;
  }
  if (quality.slow > 1.4 && TILE_DPR * quality.scale > 0.4) {
    quality.scale = Math.max(quality.scale * 0.8, 0.4 / TILE_DPR);
    quality.auto = true;
    quality.slow = 0;
    quality.calm = 0;
    applyQuality();
  } else if (quality.auto && quality.calm > 5 && quality.scale < 1) {
    quality.scale = Math.min(1, quality.scale / 0.8);
    quality.calm = 0;
    applyQuality();
  }
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
  if (v) killLenis();
  else if (state.bootDone) initLenis();
}

reducedQuery.addEventListener('change', (e) => setReduced(e.matches));
$('#motion-btn').addEventListener('click', () => {
  setReduced(false);
  $('#motion-btn').hidden = true;
  $('#foot-note').textContent = 'MOTION: FULL (MANUAL OVERRIDE)';
});

/* ---------------- main loop ------------------------------------ */

let lastT = performance.now();
let specStamp = 0;
let frameParity = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const rawMs = now - lastT;
  const dt = clamp(rawMs / 1000, 0, 0.066);
  lastT = now;
  // clamp spikes (tab switches, window drags) so one dead frame cannot
  // poison the rolling average or trip the quality governor
  pushFrameTime(Math.min(rawMs, 100));
  adaptQuality(Math.min(rawMs / 1000, 0.25));

  if (lenis) lenis.raf(now);

  if (now - state.fpsStamp >= 400) {
    state.fpsStamp = now;
    hudFps.textContent = String(Math.round(1000 / avgFrameMs()));
    updateHud(now);
  }
  if (now - specStamp >= 120) {
    specStamp = now;
    updateSpec();
  }

  updateCursor(dt);

  if (modal.open || modal.anim) {
    modalFrame(dt);
    if (modal.open && !modal.anim) return;   // fully open: the inspector owns the budget
  }

  frameParity ^= 1;
  for (const t of state.tiles) {
    if (t.error || !t.gl || (!t.prog && !t.rig) || !t.visible) continue;
    if (state.reduced && !t.needsFrame) continue;
    t.acc += dt;
    // non-hovered tiles tick at half rate, staggered by index so the
    // fillrate splits evenly; hover and pending frames run full rate
    if (state.hover !== t && !t.needsFrame && ((t.i ^ frameParity) & 1)) continue;
    t.step(t.acc);
    t.draw(t.acc);
    t.acc = 0;
  }
}

/* ---------------- resize --------------------------------------- */

window.addEventListener('resize', () => {
  for (const t of state.tiles) if (t.gl && !t.error) t.applySize();
  if (modal.open) sizeModal();
  hudDpr.textContent = Math.min(window.devicePixelRatio || 1, MAX_DPR).toFixed(2);
});

// a hidden tab freezes rAF; on return, restart the frame clock so the
// dead time never reads as one enormous frame
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastT = performance.now();
});

/* ---------------- reveal (GSAP clip-path, CSS fallback) -------- */

let revealed = false;
function revealTiles() {
  if (!revealed && G && ST && !state.reduced) {
    revealed = true;
    document.body.classList.add('gsap');   // hands the reveal to GSAP
    G.set('.tile', { clipPath: 'inset(0% 0% 100% 0%)' });
    ST.batch('.tile', {
      start: 'top 88%',
      once: true,
      onEnter: (batch) => G.to(batch, {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: 0.55,
        ease: 'power4.inOut',
        stagger: 0.045,          // full batch lands in ~0.8s
        onComplete: () => G.set(batch, { clearProps: 'clipPath' }),
      }),
    });
    ST.refresh();
  }
  document.body.classList.remove('booting');
  document.body.classList.add('revealed');
}

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
    hudPrg.textContent = '0/8';
    console.error('[FLUX] WebGL2 is unavailable in this browser.');
    return;
  }
  const gpu = String(probe.getParameter(probe.RENDERER) || 'UNKNOWN RENDERER');
  const floatFbo = probe.getExtension('EXT_color_buffer_float') || probe.getExtension('EXT_color_buffer_half_float');
  const lose = probe.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();

  bootLine('WEBGL2 CONTEXT // OK');
  bootLine(`GPU // ${gpu.slice(0, 72).toUpperCase()}`);
  bootLine(`FLOAT FBO // ${floatFbo ? 'RGBA16F AVAILABLE' : 'RGBA8 FALLBACK'}`, !floatFbo);
  bootLine(`UI LAYER // ${G ? 'GSAP 3.13' + (window.Lenis ? ' + LENIS' : '') : 'CSS FALLBACK'}`);
  await nextFrame();   // paint the log before any compile work

  buildTiles();

  // one tile per frame: the bar tracks REAL compile progress and the
  // main thread never blocks longer than a single context + link
  const step = 1 / (state.tiles.length + 1);
  let fill = step;
  setFill(fill);
  for (const tile of state.tiles) {
    try {
      tile.init();
      state.linked++;
      bootLine(`${tile.def.id} ${tile.def.name} // LINKED${tile.fmt ? ' · ' + tile.fmt : ''}`);
    } catch (err) {
      tile.fail(err);
      bootLine(`${tile.def.id} ${tile.def.name} // FAULT`, true);
    }
    fill += step;
    setFill(fill);
    await nextFrame();
  }

  hudPrg.textContent = `${state.linked}/${state.tiles.length}`;
  bootLine(`${state.linked}/${state.tiles.length} PROGRAMS LINKED // RUNNING`, state.linked !== state.tiles.length);
  setFill(1);
  if (!state.reduced) await pause(220);   // one readable beat, no fake counting

  state.bootDone = true;
  initLenis();
  revealTiles();

  const intro = $('#intro');
  intro.classList.add('done');
  setTimeout(() => intro.remove(), 800);

  lastT = performance.now();
  requestAnimationFrame(loop);
}

boot();
