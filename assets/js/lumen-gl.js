/* LUMEN Studio — shared WebGL runtime.
   One rAF loop, one pointer listener, per-instance IO pause, FPS governor,
   context-loss fade. mount() returns null on ANY failure so callers fall back. */
(function () {
  'use strict';

  var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var instances = [];
  var rafId = null;
  var lastClient = [innerWidth / 2, innerHeight / 2];
  var mouse = [0.5, 0.5];
  var pageScrollY = 0;
  var globalsAttached = false;

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }

  function buildProgram(gl, frag) {
    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    var pr = gl.createProgram();
    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.bindAttribLocation(pr, 0, 'a');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    return pr;
  }

  function cacheUniforms(gl, pr) {
    return {
      res: gl.getUniformLocation(pr, 'u_res'),
      time: gl.getUniformLocation(pr, 'u_time'),
      mouse: gl.getUniformLocation(pr, 'u_mouse'),
      scroll: gl.getUniformLocation(pr, 'u_scroll'),
      intro: gl.getUniformLocation(pr, 'u_intro'),
      dpr: gl.getUniformLocation(pr, 'u_dpr')
    };
  }

  function baseDpr() {
    return Math.min(window.devicePixelRatio || 1, innerWidth < 768 ? 1.25 : 1.5);
  }

  function cacheRect(inst) {
    var r = inst.canvas.getBoundingClientRect();
    inst.rectLeft = r.left;
    inst.rectPageTop = r.top + window.scrollY;
    inst.rectW = Math.max(1, r.width);
    inst.rectH = Math.max(1, r.height);
  }

  function size(inst, force) {
    var w = inst.canvas.clientWidth, h = inst.canvas.clientHeight;
    if (!w || !h) { var r = inst.canvas.getBoundingClientRect(); w = r.width; h = r.height; }
    var bw = Math.max(1, Math.round(w * inst.dpr));
    var bh = Math.max(1, Math.round(h * inst.dpr));
    /* realloc only on >2% delta (mobile URL-bar guard) */
    if (!force && inst.canvas.width && Math.abs(bw - inst.canvas.width) / inst.canvas.width < 0.02 &&
        Math.abs(bh - inst.canvas.height) / inst.canvas.height < 0.02) { cacheRect(inst); return; }
    inst.canvas.width = bw;
    inst.canvas.height = bh;
    inst.gl.viewport(0, 0, bw, bh);
    cacheRect(inst);
  }

  function setUniforms(inst, u, timeSec) {
    var gl = inst.gl;
    var mx = mouse[0], my = mouse[1];
    if (inst.opts.localPointer) {
      mx = (lastClient[0] - inst.rectLeft) / inst.rectW;
      my = 1.0 - (lastClient[1] - (inst.rectPageTop - pageScrollY)) / inst.rectH;
    }
    if (u.res) gl.uniform2f(u.res, inst.canvas.width, inst.canvas.height);
    if (u.time) gl.uniform1f(u.time, timeSec);
    if (u.mouse) gl.uniform2f(u.mouse, mx, my);
    if (u.scroll) gl.uniform1f(u.scroll, Math.min(Math.max(pageScrollY / (inst.opts.scrollRange || 600), 0), 1));
    if (u.intro) gl.uniform1f(u.intro, inst.intro);
    if (u.dpr) gl.uniform1f(u.dpr, inst.dpr);
  }

  function render(inst, timeSec) {
    var gl = inst.gl;
    gl.useProgram(inst.program);
    setUniforms(inst, inst.au, timeSec);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* --- FPS governor: one-way ladder, evaluated on 120-frame windows --- */
  function govern(inst, dt) {
    inst.frames++;
    inst.dtSum += dt;
    if (inst.frames < 120) return;
    var fps = 120000 / inst.dtSum;
    inst.frames = 0;
    inst.dtSum = 0;
    if (fps >= 50) return;
    if (inst.level === 0) {
      inst.level = 1;
      inst.dpr = 1.0;
      size(inst, true);
    } else if (inst.level === 1) {
      inst.level = 2;
      if (inst.programCheap && inst.program !== inst.programCheap) {
        inst.program = inst.programCheap;
        inst.au = inst.uCheap;
      } else {
        inst.level = 3;
        inst.frozen = true; /* keep the last frame */
      }
    } else {
      inst.level = 3;
      inst.frozen = true;
    }
  }

  function anyActive() {
    for (var i = 0; i < instances.length; i++) {
      var it = instances[i];
      if (!it.dead && !it.frozen && it.visible) return true;
    }
    return false;
  }

  var lastT = 0;
  function tick(t) {
    rafId = null;
    var dt = lastT ? t - lastT : 16.7;
    lastT = t;
    pageScrollY = window.scrollY;
    var tx = lastClient[0] / innerWidth;
    var ty = 1.0 - lastClient[1] / innerHeight; /* bottom-up, matches gl_FragCoord */
    mouse[0] += (tx - mouse[0]) * 0.045;
    mouse[1] += (ty - mouse[1]) * 0.045;
    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      if (inst.dead || inst.frozen || !inst.visible) continue;
      inst.intro += (1 - inst.intro) * 0.03;
      render(inst, t * 0.001);
      govern(inst, dt);
    }
    if (!document.hidden && anyActive()) rafId = requestAnimationFrame(tick);
    else lastT = 0;
  }

  function wake() {
    if (!rafId && !document.hidden && !reduced && anyActive()) rafId = requestAnimationFrame(tick);
  }

  var resizeTimer = null;
  function attachGlobals() {
    if (globalsAttached) return;
    globalsAttached = true;
    window.addEventListener('pointermove', function (e) {
      lastClient[0] = e.clientX;
      lastClient[1] = e.clientY;
    }, { passive: true });
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        for (var i = 0; i < instances.length; i++) {
          instances[i].dpr = Math.min(baseDpr(), instances[i].level >= 1 ? 1.0 : 10);
          size(instances[i]);
        }
      }, 150);
    });
    window.addEventListener('scroll', function () {
      /* rect page positions are scroll-invariant; nothing to do, but keep
         pageScrollY fresh for reduced-motion-free frames */
    }, { passive: true });
  }

  function mount(opts) {
    var canvas = opts.canvas;
    if (!canvas || !window.WebGLRenderingContext) return null;
    var gl = null;
    try {
      gl = canvas.getContext('webgl', {
        alpha: false, antialias: false,
        powerPreference: 'low-power', preserveDrawingBuffer: false
      });
    } catch (e) { gl = null; }
    if (!gl) return null;

    var full = buildProgram(gl, opts.frag);
    if (!full) return null;
    var cheap = opts.fragCheap ? buildProgram(gl, opts.fragCheap) : null;

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var startCheap = !!(opts.preferCheap && cheap);
    var inst = {
      canvas: canvas, gl: gl, opts: opts,
      programFull: full, programCheap: cheap,
      program: startCheap ? cheap : full,
      u: null, uCheap: null, au: null,
      dpr: baseDpr(),
      intro: reduced ? 1 : 0,
      visible: true, frozen: false, dead: false,
      level: startCheap ? 2 : 0,
      frames: 0, dtSum: 0
    };
    inst.u = cacheUniforms(gl, full);
    inst.uCheap = cheap ? cacheUniforms(gl, cheap) : null;
    inst.au = startCheap ? inst.uCheap : inst.u;

    size(inst, true);
    pageScrollY = window.scrollY;

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      inst.frozen = true;
    });
    canvas.addEventListener('webglcontextrestored', function () {
      /* rebuild everything; on failure fade the canvas out to the CSS tier */
      var f = buildProgram(gl, opts.frag);
      if (!f) { canvas.style.opacity = '0'; inst.dead = true; return; }
      inst.programFull = f;
      inst.programCheap = opts.fragCheap ? buildProgram(gl, opts.fragCheap) : null;
      inst.program = inst.level >= 2 && inst.programCheap ? inst.programCheap : f;
      inst.u = cacheUniforms(gl, f);
      inst.uCheap = inst.programCheap ? cacheUniforms(gl, inst.programCheap) : null;
      inst.au = inst.program === inst.programCheap ? inst.uCheap : inst.u;
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      size(inst, true);
      inst.frozen = false;
      wake();
    });

    if (reduced) {
      /* exactly one curated frame; no loop, no listeners */
      gl.useProgram(inst.program);
      var uu = inst.au;
      if (uu.res) gl.uniform2f(uu.res, canvas.width, canvas.height);
      if (uu.time) gl.uniform1f(uu.time, opts.curatedTime || 40.0);
      if (uu.mouse) gl.uniform2f(uu.mouse, 0.5, 0.5);
      if (uu.scroll) gl.uniform1f(uu.scroll, 0.0);
      if (uu.intro) gl.uniform1f(uu.intro, 1.0);
      if (uu.dpr) gl.uniform1f(uu.dpr, inst.dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return inst;
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          inst.visible = entries[i].isIntersecting;
        }
        wake();
      }, { threshold: 0.01 });
      io.observe(canvas);
    }

    instances.push(inst);
    attachGlobals();
    wake();
    return inst;
  }

  window.LUMEN_GL = { mount: mount, reduced: reduced };
})();
