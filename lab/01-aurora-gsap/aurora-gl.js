/* ============================================================
   AURORA(R) - aurora-gl.js
   Raw WebGL2 aurora-curtain backdrop. Zero dependencies.
   One fragment shader (layered fbm), one rAF, low-res render
   upscaled by CSS (it's a soft glow - resolution is wasted on it).
   Public API: window.AURORA_GL.setVelocity(v)  <- fed by Lenis.
   Respects prefers-reduced-motion: renders a single still frame.
   ============================================================ */
(() => {
  'use strict';

  const canvas = document.getElementById('aurora-gl');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance'
  });
  if (!gl) { canvas.remove(); return; }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- shaders ---------------- */

  const VERT = '#version 300 es\n' +
    'layout(location=0) in vec2 a_pos;\n' +
    'void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }';

  const FRAG = '#version 300 es\n' + `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform float u_vel;    /* smoothed |scroll velocity|, 0..~1.4  */
uniform vec2  u_mouse;  /* uv space, y up                       */
uniform float u_boost;  /* 1 at hero top -> 0 after 1 viewport  */

out vec4 fragColor;

const vec3 BG   = vec3(0.039, 0.039, 0.039);  /* #0A0A0A          */
const vec3 LIME = vec3(0.776, 1.000, 0.247);  /* #C6FF3F          */
const vec3 TEAL = vec3(0.153, 0.815, 0.714);  /* aurora teal      */

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;              /* 0..1, y up   */
  vec2 p  = vec2(uv.x * u_res.x / u_res.y, uv.y); /* aspect-fixed */
  float t = u_time;
  float vel = u_vel;

  vec3 col = vec3(0.0);

  /* three drifting aurora curtains, back to front */
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float li = fi / 3.0;

    /* slow horizontal wander of the curtain ridge; scroll speeds it up */
    float ridge = fbm(vec2(
      p.x * (0.9 + li * 0.6) + t * (0.016 + li * 0.012) * (1.0 + vel * 1.5),
      t * 0.02 + fi * 13.7));

    /* curtain center height + width (widens when scrolling fast) */
    float center = 0.60 + (ridge - 0.5) * 0.62 - li * 0.16;
    float d = uv.y - center;
    float width = 0.055 + li * 0.05 + vel * 0.10;
    float curtain = exp(-(d * d) / (width * width));

    /* vertical rays; y-frequency drops with velocity -> long streaks */
    float rays = fbm(vec2(
      p.x * (5.0 + li * 3.0) + ridge * 4.0,
      uv.y * (2.6 - vel * 1.8) - t * (0.05 + li * 0.03)));
    rays = 0.35 + 0.65 * rays;

    vec3 tint = mix(TEAL, LIME, clamp(ridge * 1.4 - 0.2 + li * 0.25, 0.0, 1.0));
    col += tint * curtain * rays * (0.05 + li * 0.04);
  }

  /* brighten with scroll velocity + hero emphasis */
  col *= 1.0 + vel * 1.1 + u_boost * 0.9;

  /* soft light that follows the cursor */
  vec2 m = vec2(u_mouse.x * u_res.x / u_res.y, u_mouse.y);
  float md = distance(p, m);
  col += mix(TEAL, LIME, 0.6) * 0.05 * exp(-md * md * 6.0);

  /* vignette keeps edges near-black so text stays readable */
  float vig = smoothstep(1.25, 0.35, distance(uv, vec2(0.5, 0.55)));
  col *= 0.55 + 0.45 * vig;

  /* gentle compression so it can never blow out, then sit on near-black */
  col = col / (1.0 + col);
  col = BG + col * 1.1;

  /* subtle temporal dither to kill banding */
  float dn = hash21(gl_FragCoord.xy + fract(t) * 100.0);
  col += (dn - 0.5) * (1.5 / 255.0);

  fragColor = vec4(col, 1.0);
}
`;

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('aurora-gl shader error:', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.remove(); return; }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('aurora-gl link error:', gl.getProgramInfoLog(prog));
    canvas.remove();
    return;
  }
  gl.useProgram(prog);

  /* fullscreen triangle */
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const U = {
    res:   gl.getUniformLocation(prog, 'u_res'),
    time:  gl.getUniformLocation(prog, 'u_time'),
    vel:   gl.getUniformLocation(prog, 'u_vel'),
    mouse: gl.getUniformLocation(prog, 'u_mouse'),
    boost: gl.getUniformLocation(prog, 'u_boost')
  };

  /* soft backdrop: 0.6x resolution is plenty (CSS upscales) */
  const RES_SCALE = 0.6;

  const resize = () => {
    const w = Math.max(2, Math.round(window.innerWidth * RES_SCALE));
    const h = Math.max(2, Math.round(window.innerHeight * RES_SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.res, w, h); /* res only changes here, not per frame */
    }
  };

  /* ---------------- state (everything lerped, never thrashed) ---------------- */

  const state = {
    velTarget: 0, vel: 0,
    mx: 0.5, my: 0.62, mxT: 0.5, myT: 0.62,
    boost: 1,
    extVelocity: false,
    lastScrollY: window.scrollY || 0
  };

  window.AURORA_GL = {
    /* fed from Lenis' scroll velocity by main.js */
    setVelocity(v) {
      state.extVelocity = true;
      const n = Math.min(Math.abs(v) / 26, 1.4);
      if (n > state.velTarget) state.velTarget = n;
    }
  };

  const draw = (t) => {
    gl.uniform1f(U.time, t);
    gl.uniform1f(U.vel, state.vel);
    gl.uniform2f(U.mouse, state.mx, state.my);
    gl.uniform1f(U.boost, state.boost);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /* ---------------- reduced motion: one still frame, no loop ---------------- */

  if (reduceMotion) {
    const still = () => {
      resize();
      state.vel = 0;
      state.boost = 0.7;
      draw(14.0);
    };
    still();
    window.addEventListener('resize', still);
    return;
  }

  /* ---------------- animated path: one rAF, paused when tab hidden ---------------- */

  window.addEventListener('mousemove', (e) => {
    state.mxT = e.clientX / Math.max(1, window.innerWidth);
    state.myT = 1 - e.clientY / Math.max(1, window.innerHeight);
  }, { passive: true });

  let rafId = 0;
  let running = false;
  let elapsed = 0;
  let lastNow = 0;
  let needsDraw = true; /* forces a draw after resize (buffer clears) */

  const frame = (now) => {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(now - lastNow, 100); /* clamp long gaps */
    lastNow = now;

    const sy = window.scrollY || 0;
    if (!state.extVelocity) {
      /* fallback velocity if Lenis/GSAP never showed up */
      const dv = Math.min(Math.abs(sy - state.lastScrollY) / 34, 1.4);
      if (dv > state.velTarget) state.velTarget = dv;
    }
    state.lastScrollY = sy;

    state.velTarget *= 0.93;                             /* decay        */
    state.vel += (state.velTarget - state.vel) * 0.07;   /* lerp         */
    state.mx  += (state.mxT - state.mx) * 0.05;
    state.my  += (state.myT - state.my) * 0.05;

    const boostT = 1 - Math.min(sy / Math.max(1, window.innerHeight), 1);
    state.boost += (boostT - state.boost) * 0.06;

    /* far past the hero with scroll velocity settled, the backdrop's
       contribution is imperceptible -> keep the last frame and pause
       shader time (so resuming is seamless, no jump) */
    const idle = sy > window.innerHeight * 1.2 &&
                 state.vel < 0.004 && state.velTarget < 0.004;
    if (idle && !needsDraw) return;
    needsDraw = false;

    elapsed += dt;
    draw(elapsed / 1000);
  };

  const start = () => {
    if (running) return;
    running = true;
    lastNow = performance.now();
    rafId = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(rafId);
  };

  resize();
  window.addEventListener('resize', () => { resize(); needsDraw = true; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => start());

  start();
})();
