/* ============================================================
   NEBULA — galaxy.js
   Procedural star geometry: spiral galaxy, stellar nursery
   cluster, and deep-field backdrop. One shared point shader
   (size attenuation, differential rotation, twinkle).
   ============================================================ */

import * as THREE from 'three';

const VERT = /* glsl */ `
uniform float uTime;
uniform float uProj;
uniform float uSize;
uniform float uRotation;
uniform vec3  uCenter;

attribute float aScale;
attribute float aSeed;
attribute vec3  aColor;

varying vec3  vColor;
varying float vSeed;

void main() {
  vec3 p = position - uCenter;

  /* differential rotation: inner stars orbit faster */
  float r = length(p.xz);
  float angle = atan(p.z, p.x) + uTime * (uRotation / (r + 0.75));
  p.x = cos(angle) * r;
  p.z = sin(angle) * r;
  p += uCenter;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  /* perspective size attenuation, clamped so near stars stay sprites */
  gl_PointSize = min(uSize * aScale * uProj / max(0.15, -mv.z), 120.0);

  vColor = aColor;
  vSeed = aSeed;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uTwinkle;

varying vec3  vColor;
varying float vSeed;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;

  /* soft gaussian-ish core with a faint halo skirt */
  float glow = pow(1.0 - d, 3.0) + 0.05 * (1.0 - d);

  /* per-star twinkle, seeded so neighbours stay out of phase */
  float tw = 1.0 - uTwinkle * 0.45 * (0.5 + 0.5 * sin(uTime * (1.2 + fract(vSeed * 0.137) * 2.6) + vSeed));

  gl_FragColor = vec4(vColor * tw, glow);
}
`;

export const NURSERY_CENTER = new THREE.Vector3(7.4, 0.5, -4.8);

function makeStarMaterial({ size, rotation, twinkle, center = new THREE.Vector3() }) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uProj: { value: 1000 },
      uSize: { value: size },
      uRotation: { value: rotation },
      uTwinkle: { value: twinkle },
      uCenter: { value: center },
    },
  });
}

function buildPoints(count, material, fill) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const scl = new Float32Array(count);
  const seed = new Float32Array(count);

  fill(pos, col, scl, seed);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const points = new THREE.Points(geo, material);
  return { points, material };
}

/* biased random: mostly small values, occasional outliers, signed */
const spread = () => Math.pow(Math.random(), 2.6) * (Math.random() < 0.5 ? -1 : 1);

/* Box-Muller gaussian */
function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ------------------------------------------------ spiral galaxy */

export function createGalaxy(count) {
  const RADIUS = 14;
  const BRANCHES = 5;
  const SPIN = 0.38;

  const cCore = new THREE.Color('#FFB37A');
  const cCyan = new THREE.Color('#7DF9FF');
  const cMag = new THREE.Color('#FF6EC7');
  const cWhite = new THREE.Color('#FFFFFF');
  const rim = new THREE.Color();
  const mixed = new THREE.Color();

  const material = makeStarMaterial({ size: 0.055, rotation: 0.45, twinkle: 0.9 });

  return buildPoints(count, material, (pos, col, scl, seed) => {
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      /* radial falloff: dense luminous bulge, thinning rim */
      const r = Math.pow(Math.random(), 1.7) * RADIUS;
      const branch = ((i % BRANCHES) / BRANCHES) * Math.PI * 2;
      const angle = branch + r * SPIN;

      const sXZ = 0.35 + r * 0.22;
      const yAmp = 0.3 + Math.exp(-r * 0.3) * 1.7; /* thick bulge, thin disc */

      pos[i3] = Math.cos(angle) * r + spread() * sXZ;
      pos[i3 + 1] = spread() * yAmp;
      pos[i3 + 2] = Math.sin(angle) * r + spread() * sXZ;

      /* colour: warm core -> cyan/magenta rim, varied along each arm */
      const tR = Math.pow(Math.min(r / RADIUS, 1), 0.62);
      const armMix = 0.5 + 0.5 * Math.sin((i % BRANCHES) * 2.4 + r * 0.42 + Math.random() * 1.4);
      rim.copy(cCyan).lerp(cMag, armMix);
      mixed.copy(cCore).lerp(rim, tR);

      let lum = 0.55 + Math.random() * 0.55;
      let scale = 0.55 + Math.pow(Math.random(), 2.5) * 2.1;

      /* rare hero stars: hotter, bigger, whiter */
      if (Math.random() < 0.015) {
        lum *= 2.1;
        scale *= 1.7;
        mixed.lerp(cWhite, 0.55);
      }

      col[i3] = mixed.r * lum;
      col[i3 + 1] = mixed.g * lum;
      col[i3 + 2] = mixed.b * lum;
      scl[i] = scale;
      seed[i] = Math.random() * 100;
    }
  });
}

/* ------------------------------------------------ stellar nursery */

export function createNursery(count) {
  const cInner = new THREE.Color('#FFE3F4');
  const cMag = new THREE.Color('#FF6EC7');
  const cCyan = new THREE.Color('#7DF9FF');
  const rim = new THREE.Color();
  const mixed = new THREE.Color();

  /* three overlapping gaussian clumps, anisotropic */
  const clumps = [
    { o: [0, 0, 0], s: [1.7, 0.8, 2.0] },
    { o: [1.5, 0.4, -1.2], s: [0.9, 0.5, 1.0] },
    { o: [-1.2, -0.35, 1.0], s: [0.7, 0.45, 0.85] },
  ];

  const material = makeStarMaterial({
    size: 0.06,
    rotation: 0.16,
    twinkle: 1.1,
    center: NURSERY_CENTER.clone(),
  });

  return buildPoints(count, material, (pos, col, scl, seed) => {
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      const pick = Math.random();
      const c = pick < 0.62 ? clumps[0] : pick < 0.86 ? clumps[1] : clumps[2];

      const lx = gauss() * c.s[0];
      const ly = gauss() * c.s[1];
      const lz = gauss() * c.s[2];

      pos[i3] = NURSERY_CENTER.x + c.o[0] + lx;
      pos[i3 + 1] = NURSERY_CENTER.y + c.o[1] + ly;
      pos[i3 + 2] = NURSERY_CENTER.z + c.o[2] + lz;

      /* hot white-pink centres cooling to magenta / teal rims */
      const dn = Math.min(Math.sqrt(lx * lx + ly * ly + lz * lz) / 2.4, 1);
      rim.copy(cMag).lerp(cCyan, Math.pow(Math.random(), 1.6));
      mixed.copy(cInner).lerp(rim, Math.pow(dn, 0.7));

      const lum = 0.5 + Math.random() * 0.75;
      col[i3] = mixed.r * lum;
      col[i3 + 1] = mixed.g * lum;
      col[i3 + 2] = mixed.b * lum;
      scl[i] = 0.5 + Math.pow(Math.random(), 2.2) * 2.4;
      seed[i] = Math.random() * 100;
    }
  });
}

/* ------------------------------------------------ deep-field backdrop */

export function createStarfield(count) {
  const cBase = new THREE.Color('#C9D6FF');
  const cCyan = new THREE.Color('#7DF9FF');
  const cMag = new THREE.Color('#FF6EC7');
  const mixed = new THREE.Color();

  const material = makeStarMaterial({ size: 0.14, rotation: 0.015, twinkle: 0.7 });

  return buildPoints(count, material, (pos, col, scl, seed) => {
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      /* uniform direction on a sphere, pushed to a far shell */
      const x = gauss();
      const y = gauss();
      const z = gauss();
      const n = Math.sqrt(x * x + y * y + z * z) || 1;
      const rad = 55 + Math.random() * 65;

      pos[i3] = (x / n) * rad;
      pos[i3 + 1] = (y / n) * rad;
      pos[i3 + 2] = (z / n) * rad;

      const t = Math.random();
      mixed.copy(cBase);
      if (t < 0.12) mixed.lerp(cCyan, 0.6);
      else if (t < 0.2) mixed.lerp(cMag, 0.5);

      const lum = 0.25 + Math.random() * 0.55;
      col[i3] = mixed.r * lum;
      col[i3 + 1] = mixed.g * lum;
      col[i3 + 2] = mixed.b * lum;
      scl[i] = 0.5 + Math.random() * 1.1;
      seed[i] = Math.random() * 100;
    }
  });
}
