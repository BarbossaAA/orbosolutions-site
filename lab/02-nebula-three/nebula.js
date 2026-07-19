/* ============================================================
   NEBULA - nebula.js
   Volumetric fog layer (cheap raymarched fbm rendered to a
   low-res target, composited additively behind the stars)
   and the shooting-star streak pool. All procedural.
   ============================================================ */

import * as THREE from 'three';
import { NURSERY_CENTER } from './galaxy.js';

/* ------------------------------------------------ fullscreen triangle */

function fullscreenTriangle() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );
  return geo;
}

/* ------------------------------------------------ volumetric nebula */

const NEBULA_FRAG = /* glsl */ `
precision highp float;

varying vec2 vNdc;

uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uTanFov;
uniform float uAspect;
uniform vec3  uTintA;
uniform vec3  uTintB;
uniform float uIntensity;

const vec3 NURSERY = vec3(7.4, 0.5, -4.8);

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
        mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
        mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

/* 3 octaves is the budget: this runs at ~1/2 res on few steps */
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.17 + vec3(11.3);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 rd = normalize(
    uCamFwd
    + uCamRight * (vNdc.x * uAspect * uTanFov)
    + uCamUp * (vNdc.y * uTanFov)
  );

  /* interleaved dither so 7 steps read as smooth fog */
  float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

  const int STEPS = 7;
  const float T0 = 2.5;
  const float T1 = 36.0;
  float stp = (T1 - T0) / float(STEPS);
  float t = T0 + dith * stp;

  vec3 acc = vec3(0.0);

  for (int i = 0; i < STEPS; i++) {
    vec3 p = uCamPos + rd * t;

    /* fog body hugs the galactic disc + the nursery cloud;
       hollowed near the centre where the stellar core already glows */
    float r = length(p.xz);
    float disc = exp(-abs(p.y) * 0.34) * exp(-r * 0.088)
               * (0.3 + 0.7 * smoothstep(0.5, 3.4, r));
    vec3 dn = p - NURSERY;
    float nurs = exp(-dot(dn, dn) * 0.045);
    float body = disc * 0.85 + nurs * 0.5;

    if (body > 0.004) {
      vec3 q = p * 0.17 + vec3(0.0, uTime * 0.014, uTime * 0.009);
      float n = fbm(q + 0.35 * fbm(q * 1.9)); /* one cheap warp */
      n = smoothstep(0.30, 0.88, n);
      /* thin the fog right at the lens so flying THROUGH a cloud
         reads as atmosphere, not a white wall */
      float dens = body * n * smoothstep(1.5, 7.5, t);
      vec3 tint = mix(uTintA, uTintB, vnoise(p * 0.085 + 5.0));
      acc += tint * dens;
    }
    t += stp;
  }

  acc *= uIntensity * (6.4 / float(STEPS));

  /* luminance soft-clamp: the fog can glow, never blow out
     (ceiling ~0.38 pre-bloom keeps the stars as the hero) */
  float lum = dot(acc, vec3(0.299, 0.587, 0.114));
  acc /= 1.0 + lum * 2.6;

  acc += (dith - 0.5) * 0.006; /* break banding on the upscale */

  gl_FragColor = vec4(max(acc, vec3(0.0)), 1.0);
}
`;

const NEBULA_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const COMPOSITE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tFog;
void main() {
  gl_FragColor = vec4(texture2D(tFog, vUv).rgb, 1.0);
}
`;

export function createNebulaLayer(width, height, small) {
  const scaleFactor = small ? 0.36 : 0.5; /* fog is low-frequency: render small, upscale soft */

  const rt = new THREE.WebGLRenderTarget(2, 2, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  const uniforms = {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uTanFov: { value: 0.5 },
    uAspect: { value: 1 },
    uTintA: { value: new THREE.Color('#1c92b8') },
    uTintB: { value: new THREE.Color('#20418f') },
    uIntensity: { value: 0.9 },
  };

  const marchMat = new THREE.ShaderMaterial({
    vertexShader: NEBULA_VERT,
    fragmentShader: NEBULA_FRAG,
    uniforms,
    depthWrite: false,
    depthTest: false,
  });

  const rtScene = new THREE.Scene();
  const marchMesh = new THREE.Mesh(fullscreenTriangle(), marchMat);
  marchMesh.frustumCulled = false;
  rtScene.add(marchMesh);
  const rtCam = new THREE.Camera();

  /* composite quad that lives in the MAIN scene, additive, behind stars */
  const compMat = new THREE.ShaderMaterial({
    vertexShader: COMPOSITE_VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: { tFog: { value: rt.texture } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(fullscreenTriangle(), compMat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  function setSize(w, h) {
    rt.setSize(
      Math.max(2, Math.round(w * scaleFactor)),
      Math.max(2, Math.round(h * scaleFactor))
    );
    uniforms.uAspect.value = w / h;
  }
  setSize(width, height);

  function render(renderer, camera, time) {
    uniforms.uTime.value = time;
    uniforms.uCamPos.value.copy(camera.position);
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    uniforms.uCamRight.value.set(e[0], e[1], e[2]);
    uniforms.uCamUp.value.set(e[4], e[5], e[6]);
    uniforms.uCamFwd.value.set(-e[8], -e[9], -e[10]);
    uniforms.uTanFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

    renderer.setRenderTarget(rt);
    renderer.render(rtScene, rtCam);
    renderer.setRenderTarget(null);
  }

  return { mesh, uniforms, setSize, render };
}

/* ------------------------------------------------ shooting stars */

const STREAK_VERT = /* glsl */ `
uniform vec3  uHead;
uniform vec3  uDir;
uniform float uLen;
uniform float uWidth;

varying vec2 vUv;

void main() {
  vUv = uv;

  /* slide the quad along the travel direction: x=+0.5 is the head */
  vec3 world = uHead - uDir * ((0.5 - position.x) * uLen);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);

  /* view-plane perpendicular so the ribbon always faces the camera */
  vec3 dv = (modelViewMatrix * vec4(uDir, 0.0)).xyz;
  vec3 side = cross(normalize(dv + vec3(0.0, 0.0001, 0.0)), vec3(0.0, 0.0, 1.0));
  float sl = length(side);
  side = sl > 0.001 ? side / sl : vec3(0.0, 1.0, 0.0);
  mv.xyz += side * position.y * uWidth;

  gl_Position = projectionMatrix * mv;
}
`;

const STREAK_FRAG = /* glsl */ `
precision mediump float;

uniform float uLife;
uniform vec3  uColor;

varying vec2 vUv;

void main() {
  float tail = pow(vUv.x, 2.4);                       /* bright head, fading trail */
  float core = pow(max(1.0 - abs(vUv.y - 0.5) * 2.0, 0.0), 2.6);
  float env = sin(clamp(uLife, 0.0, 1.0) * 3.14159);  /* ease in and out of existence */
  float head = smoothstep(0.86, 1.0, vUv.x) * 1.6;    /* hot spark at the tip */
  gl_FragColor = vec4(uColor * (tail + head) * core * env, 1.0);
}
`;

const STREAK_COLORS = ['#d8f3ff', '#cfeaff', '#ffe9f6', '#eafffb'];

export function createShootingStars(scene, poolSize = 5) {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  const pool = [];

  for (let i = 0; i < poolSize; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uHead: { value: new THREE.Vector3() },
        uDir: { value: new THREE.Vector3(1, 0, 0) },
        uLen: { value: 6 },
        uWidth: { value: 0.05 },
        uLife: { value: 0 },
        uColor: { value: new THREE.Color('#d8f3ff') },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    pool.push({
      mesh,
      u: mat.uniforms,
      active: false,
      t: 0,
      dur: 1,
      start: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      speed: 20,
    });
  }

  let cooldown = 2.2;
  let enabled = true;

  function spawn() {
    const s = pool.find((p) => !p.active);
    if (!s) return;

    /* far-shell start point, biased away from the exact camera axis */
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * 1.6;
    const rad = 34 + Math.random() * 26;
    s.start.set(
      Math.cos(theta) * Math.cos(phi) * rad,
      Math.sin(phi) * rad * 0.75,
      Math.sin(theta) * Math.cos(phi) * rad
    );

    /* travel roughly tangentially so it crosses the sky, not the lens */
    s.dir.set(-Math.sin(theta), (Math.random() - 0.5) * 0.55, Math.cos(theta))
      .normalize()
      .multiplyScalar(Math.random() < 0.5 ? 1 : -1);

    s.speed = 26 + Math.random() * 22;
    s.dur = 0.9 + Math.random() * 0.9;
    s.t = 0;
    s.active = true;
    s.mesh.visible = true;
    s.u.uLen.value = 5 + Math.random() * 6;
    s.u.uWidth.value = 0.045 + Math.random() * 0.05;
    s.u.uColor.value.set(STREAK_COLORS[(Math.random() * STREAK_COLORS.length) | 0]);
  }

  function update(dt) {
    for (const s of pool) {
      if (!s.active) continue;
      s.t += dt;
      const life = s.t / s.dur;
      if (life >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.u.uLife.value = life;
      s.u.uHead.value.copy(s.start).addScaledVector(s.dir, s.t * s.speed);
      s.u.uDir.value.copy(s.dir);
    }

    if (!enabled || document.hidden) return;
    cooldown -= dt;
    if (cooldown <= 0) {
      spawn();
      cooldown = 2.4 + Math.random() * 4.4;
    }
  }

  function setEnabled(v) {
    enabled = v;
    if (!v) {
      pool.forEach((s) => {
        s.active = false;
        s.mesh.visible = false;
      });
    }
  }

  return { update, setEnabled };
}
