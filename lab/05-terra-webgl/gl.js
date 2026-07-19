/*
 * TERRA - gl.js
 * Fullscreen Three.js plane with a custom distortion / RGB-shift
 * transition shader, height-map parallax, an in-shader film pass
 * (grain, vignette, radial chromatic aberration), transition and
 * idle light bands, and a sparse additive dust layer (THREE.Points).
 * One plane + one points cloud, one material each, cover-fit in the
 * shader.
 */

import * as THREE from 'three';

const WHITE = new THREE.Color('#ffffff');

const VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */`
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uTexA;
  uniform sampler2D uTexB;
  uniform sampler2D uHeightA;  // normalised height of slide A (parallax)
  uniform sampler2D uHeightB;
  uniform float uProgress;   // 0 -> 1 transition
  uniform float uVelocity;   // smoothed tween velocity, drives RGB shift
  uniform float uTime;
  uniform float uDirection;  // +1 next / -1 previous
  uniform float uIdle;       // idle motion amplitude (0 under reduced motion)
  uniform float uDispScale;  // displacement amplitude (0 => pure crossfade)
  uniform float uParallax;   // height-parallax strength (0 under reduced motion)
  uniform float uReport;     // 0 -> 1 while the field report is open
  uniform float uPlaceholderA; // 1 => slot A texture not generated yet
  uniform float uPlaceholderB; // 1 => slot B texture not generated yet
  uniform vec2  uMouse;      // eased normalised cursor (0..1, y up)
  uniform vec2  uViewport;
  uniform vec3  uAccent;     // eased active project accent

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

  // 3-octave fBm for the transition flow field; the 4th octave added
  // detail below one output pixel at this scale. Rescaled so range and
  // mean match the old 4-octave sum.
  float fbm3(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(19.7, 7.3);
      a *= 0.5;
    }
    return v * 1.0714;
  }

  // 2-octave fBm for the 1.4% idle UV drift - invisible difference there.
  float fbm2(vec2 p) {
    float v = 0.5 * vnoise(p);
    p = p * 2.03 + vec2(19.7, 7.3);
    v += 0.25 * vnoise(p);
    return v * 1.25;
  }

  // Placeholder shimmer while a slide's texture is still generating in
  // idle time: accent-tinted dark field + slow diagonal sheen. Pure
  // inline math, no extra passes or samples.
  vec3 shimmerCol(vec2 uv, float flow) {
    float sweep = fract((uv.x + uv.y) * 0.5 - uTime * 0.16);
    float band = smoothstep(0.32, 0.5, sweep) * smoothstep(0.68, 0.5, sweep);
    vec3 base = mix(vec3(0.078, 0.071, 0.063), uAccent, 0.14 + 0.10 * flow);
    return base + uAccent * band * 0.12;
  }

  // Square textures, cover-fit against the viewport.
  vec2 coverUv(vec2 uv) {
    float sa = uViewport.x / uViewport.y;
    vec2 s = sa > 1.0 ? vec2(1.0, 1.0 / sa) : vec2(sa, 1.0);
    return (uv - 0.5) * s + 0.5;
  }

  vec3 sampleShift(sampler2D tex, vec2 uv, vec2 off) {
    float r = texture2D(tex, uv + off).r;
    float g = texture2D(tex, uv).g;
    float b = texture2D(tex, uv - off).b;
    return vec3(r, g, b);
  }

  void main() {
    vec2 uv = coverUv(vUv);

    float p = uProgress;
    float env = sin(p * 3.14159265);           // 0 at rest, 1 mid-transition

    // Ambient breathing zoom (~1.000-1.015), transition scale kick
    // (1.0 -> 1.04 -> 1.0) and a slight push while the report is open.
    float scale = 1.0
      + (0.0075 + 0.0075 * sin(uTime * 0.22)) * uIdle
      + env * 0.04
      + uReport * 0.045;
    uv = (uv - 0.5) / scale + 0.5;

    // Subtle idle drift so the landscape breathes at rest.
    vec2 drift = vec2(
      fbm2(uv * 2.2 + uTime * 0.045),
      fbm2(uv * 2.2 - uTime * 0.038 + 47.1)
    ) - 0.5;
    uv += drift * 0.014 * uIdle * (1.0 - env * 0.6);

    // Height parallax - the cursor tilts each landscape by its own relief.
    vec2 par = (uMouse - 0.5) * uParallax;
    float hA = texture2D(uHeightA, uv).r;
    float hB = texture2D(uHeightB, uv).r;

    // Noise flow field that displaces both textures during the swap.
    float flow = fbm3(uv * 3.2 + vec2(uTime * 0.03, 0.0));
    vec2 dir = vec2(uDirection, 0.35 * uDirection);
    float amp = uDispScale * 0.45;

    vec2 uvA = uv + par * (hA - 0.5) + dir * (flow - 0.35) * p * amp;
    vec2 uvB = uv + par * (hB - 0.5) - dir * (flow - 0.35) * (1.0 - p) * amp;

    // Gentle counter-zoom while the slide travels.
    uvA = (uvA - 0.5) * (1.0 + env * 0.05) + 0.5;
    uvB = (uvB - 0.5) * (1.0 - env * 0.05) + 0.5;

    // RGB offset: tween velocity + radial chromatic aberration that
    // grows toward the edges and spikes briefly mid-transition.
    vec2 radial = vUv - 0.5;
    float ca = (0.0009 + 0.013 * dot(radial, radial)) * (1.0 + env * 2.6);
    vec2 shift = vec2(0.9, 0.35) * 0.02 * uVelocity * uDirection
               + radial * ca;
    vec3 colA = sampleShift(uTexA, uvA, shift);
    vec3 colB = sampleShift(uTexB, uvB, shift);

    // Slides still generating show the shimmer state instead.
    colA = mix(colA, shimmerCol(uvA, flow), uPlaceholderA);
    colB = mix(colB, shimmerCol(uvB, flow), uPlaceholderB);

    // Displaced mix - the noise field tears the wipe edge organically.
    float m = smoothstep(0.12, 0.88, p + (flow - 0.5) * 0.5 * env);
    vec3 color = mix(colA, colB, m);

    // Slight luminance dip mid-transition for weight.
    color *= 1.0 - env * 0.08;

    // Directional light band sweeping with the wipe.
    vec2 axisDir = normalize(vec2(1.0, 0.35));
    float axis = dot(vUv - 0.5, axisDir) * uDirection;
    float bandC = mix(-0.75, 0.75, p);
    float bd = (axis - bandC) * 7.5;
    float band = exp(-bd * bd);
    color += band * env * 0.16 * mix(vec3(1.0), uAccent, 0.45);

    // Faint drifting light band while resting.
    float iAxis = dot(vUv - 0.5, normalize(vec2(0.85, 0.5)));
    float iC = sin(uTime * 0.05) * 0.45;
    float id = (iAxis - iC) * 3.0;
    float iBand = exp(-id * id);
    color += iBand * 0.03 * uIdle * (1.0 - env) * mix(vec3(1.0), uAccent, 0.6);

    // Field report open: desaturate and dim so the dossier reads.
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, vec3(lum), uReport * 0.35);
    color *= 1.0 - uReport * 0.5;

    // Vignette (deepens slightly under the report).
    float vig = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.6);
    color *= mix(0.82 - uReport * 0.1, 1.0, vig);

    // Fine animated film grain.
    float g = hash21(vUv * uViewport + fract(uTime) * 100.0);
    color += (g - 0.5) * 0.035;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/* Sparse dust motes drifting over the landscape. Positions live in NDC;
   aDepth fakes distance (size + alpha), uMouse adds a light parallax so
   the dust agrees with the terrain tilt. */
const DUST_VERTEX = /* glsl */`
  attribute float aDepth;
  attribute vec3 aRand;
  uniform float uTime;
  uniform float uDrift;   // 0 under reduced motion
  uniform float uDpr;
  uniform float uReport;
  uniform vec2 uMouse;
  varying float vFade;
  void main() {
    vec2 p = position.xy;
    float t = uTime * uDrift;
    p.x = mod(p.x + t * (0.006 + 0.015 * aRand.z) + 1.15, 2.3) - 1.15;
    p.y += sin(t * (0.10 + 0.13 * aRand.y) + aRand.x * 6.2831) * 0.02;
    p += (uMouse - 0.5) * (0.02 + aDepth * 0.055);
    gl_Position = vec4(p, 0.0, 1.0);
    gl_PointSize = (1.0 + aRand.y * 2.4) * (0.5 + aDepth * 0.95) * uDpr;
    float tw = 0.7 + 0.3 * sin(uTime * (0.3 + aRand.y * 0.55) + aRand.x * 41.0);
    vFade = (0.2 + 0.8 * aDepth) * tw * (1.0 - uReport * 0.65);
  }
`;

const DUST_FRAGMENT = /* glsl */`
  precision mediump float;
  uniform vec3 uDustColor;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.06, d);
    gl_FragColor = vec4(uDustColor, a * vFade * 0.35);
  }
`;

const DUST_COUNT = 400;

export class Stage {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x141210, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      uTexA: { value: null },
      uTexB: { value: null },
      uHeightA: { value: null },
      uHeightB: { value: null },
      uProgress: { value: 0 },
      uVelocity: { value: 0 },
      uTime: { value: 0 },
      uDirection: { value: 1 },
      uIdle: { value: reducedMotion ? 0 : 1 },
      uDispScale: { value: reducedMotion ? 0.05 : 1 },
      uParallax: { value: reducedMotion ? 0 : 0.055 },
      uReport: { value: 0 },
      uPlaceholderA: { value: 0 },
      uPlaceholderB: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uAccent: { value: new THREE.Color('#C89B5E') }
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    /* ---- dust layer -------------------------------------------------- */

    this.dustUniforms = {
      uTime: this.uniforms.uTime,        // shared references
      uMouse: this.uniforms.uMouse,
      uReport: this.uniforms.uReport,
      uDrift: { value: reducedMotion ? 0 : 1 },
      uDpr: { value: 1 },
      uDustColor: { value: new THREE.Color('#C89B5E').lerp(WHITE, 0.42) }
    };

    const pos = new Float32Array(DUST_COUNT * 3);
    const depth = new Float32Array(DUST_COUNT);
    const rand = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 1.15;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * 1.05;
      pos[i * 3 + 2] = 0;
      depth[i] = Math.random();
      rand[i * 3] = Math.random();
      rand[i * 3 + 1] = Math.random();
      rand[i * 3 + 2] = Math.random();
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
    dustGeo.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));

    const dustMat = new THREE.ShaderMaterial({
      uniforms: this.dustUniforms,
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.dust = new THREE.Points(dustGeo, dustMat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 1;
    this.scene.add(this.dust);

    /* ---- eased targets ---------------------------------------------- */

    this._mouseTarget = new THREE.Vector2(0.5, 0.5);
    this._accentTarget = new THREE.Color('#C89B5E');
    this._dustTarget = this.dustUniforms.uDustColor.value.clone();

    this.resize();
  }

  makeTexture(sourceCanvas) {
    const texture = new THREE.CanvasTexture(sourceCanvas);
    texture.wrapS = THREE.MirroredRepeatWrapping;
    texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  /* Tiny neutral slot shown (behind the shader's shimmer state) for
     slides whose textures are still generating. Mid-grey height keeps
     the parallax term at zero. */
  makePlaceholder() {
    const make = (fill) => {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const cx = c.getContext('2d');
      cx.fillStyle = fill;
      cx.fillRect(0, 0, 4, 4);
      return c;
    };
    return {
      tex: this.makeTexture(make('#141210')),
      height: this.makeTexture(make('#808080'))
    };
  }

  /* Upload a finished slot to the GPU off the hot path so the first
     swipe to it never stalls on texImage2D. */
  initTexture(slot) {
    this.renderer.initTexture(slot.tex);
    this.renderer.initTexture(slot.height);
  }

  /* a / b are { tex, height } slots. */
  setSlide(a, b) {
    this.uniforms.uTexA.value = a.tex;
    this.uniforms.uHeightA.value = a.height;
    this.uniforms.uTexB.value = b.tex;
    this.uniforms.uHeightB.value = b.height;
  }

  setPalette(hex) {
    this._accentTarget.set(hex);
    this._dustTarget.set(hex).lerp(WHITE, 0.42);
  }

  setMouse(nx, ny) {
    this._mouseTarget.set(nx, ny);
  }

  /* Frame-rate independent easing of mouse + palette uniforms. */
  update(dt) {
    const km = 1 - Math.exp(-dt * 3.4);
    this.uniforms.uMouse.value.lerp(this._mouseTarget, km);
    const kc = 1 - Math.exp(-dt * 2.4);
    this.uniforms.uAccent.value.lerp(this._accentTarget, kc);
    this.dustUniforms.uDustColor.value.lerp(this._dustTarget, kc);
  }

  resize() {
    // 1.5 DPR cap: the film grain / CA / vignette treatment hides the
    // difference from native DPR while cutting fill cost up to ~44%.
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.uniforms.uViewport.value.set(window.innerWidth, window.innerHeight);
    this.dustUniforms.uDpr.value = dpr;
  }

  render(timeSeconds) {
    this.uniforms.uTime.value = timeSeconds;
    this.renderer.render(this.scene, this.camera);
  }
}
