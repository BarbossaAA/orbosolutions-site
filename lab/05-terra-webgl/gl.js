/*
 * TERRA — gl.js
 * Fullscreen Three.js plane with a custom distortion / RGB-shift
 * transition shader. One plane, one material, cover-fit in the shader.
 */

import * as THREE from 'three';

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
  uniform float uProgress;   // 0 -> 1 transition
  uniform float uVelocity;   // smoothed tween velocity, drives RGB shift
  uniform float uTime;
  uniform float uDirection;  // +1 next / -1 previous
  uniform float uIdle;       // idle wave amplitude (0 under reduced motion)
  uniform float uDispScale;  // displacement amplitude (0 => pure crossfade)
  uniform vec2  uViewport;

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
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(19.7, 7.3);
      a *= 0.5;
    }
    return v;
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

    // Subtle idle drift so the landscape breathes at rest.
    vec2 drift = vec2(
      fbm(uv * 2.2 + uTime * 0.045),
      fbm(uv * 2.2 - uTime * 0.038 + 47.1)
    ) - 0.5;
    uv += drift * 0.014 * uIdle * (1.0 - env * 0.6);

    // Noise flow field that displaces both textures during the swap.
    float flow = fbm(uv * 3.2 + vec2(uTime * 0.03, 0.0));
    vec2 dir = vec2(uDirection, 0.35 * uDirection);
    float amp = uDispScale * 0.45;

    vec2 uvA = uv + dir * (flow - 0.35) * p * amp;
    vec2 uvB = uv - dir * (flow - 0.35) * (1.0 - p) * amp;

    // Gentle counter-zoom while the slide travels.
    uvA = (uvA - 0.5) * (1.0 + env * 0.05) + 0.5;
    uvB = (uvB - 0.5) * (1.0 - env * 0.05) + 0.5;

    // RGB channel offset proportional to tween velocity.
    vec2 shift = vec2(0.9, 0.35) * 0.02 * uVelocity * uDirection;
    vec3 colA = sampleShift(uTexA, uvA, shift);
    vec3 colB = sampleShift(uTexB, uvB, shift);

    // Displaced mix — the noise field tears the wipe edge organically.
    float m = smoothstep(0.12, 0.88, p + (flow - 0.5) * 0.5 * env);
    vec3 color = mix(colA, colB, m);

    // Slight luminance dip mid-transition for weight.
    color *= 1.0 - env * 0.08;

    // Vignette.
    float vig = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.6);
    color *= mix(0.82, 1.0, vig);

    // Fine animated grain.
    float g = hash21(vUv * uViewport + fract(uTime) * 100.0);
    color += (g - 0.5) * 0.035;

    gl_FragColor = vec4(color, 1.0);
  }
`;

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
      uProgress: { value: 0 },
      uVelocity: { value: 0 },
      uTime: { value: 0 },
      uDirection: { value: 1 },
      uIdle: { value: reducedMotion ? 0 : 1 },
      uDispScale: { value: reducedMotion ? 0.05 : 1 },
      uViewport: { value: new THREE.Vector2(1, 1) }
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

    this.resize();
  }

  makeTexture(sourceCanvas) {
    const texture = new THREE.CanvasTexture(sourceCanvas);
    texture.wrapS = THREE.MirroredRepeatWrapping;
    texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  setTextures(texA, texB) {
    this.uniforms.uTexA.value = texA;
    this.uniforms.uTexB.value = texB;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.uniforms.uViewport.value.set(window.innerWidth, window.innerHeight);
  }

  render(timeSeconds) {
    this.uniforms.uTime.value = timeSeconds;
    this.renderer.render(this.scene, this.camera);
  }
}
