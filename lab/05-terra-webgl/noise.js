/*
 * TERRA — noise.js
 * Small deterministic 2D value-noise + fBm used to synthesise
 * the procedural landscape textures. No dependencies.
 */

export function createValueNoise(seed = 1) {
  // Seeded permutation table via xorshift32.
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  let s = (seed >>> 0) || 1;
  const rand = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };

  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  // Lattice value in [0, 1].
  const lattice = (xi, yi) => perm[(perm[xi & 255] + yi) & 255] / 255;

  return function noise2D(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = lattice(xi, yi);
    const b = lattice(xi + 1, yi);
    const c = lattice(xi, yi + 1);
    const d = lattice(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/*
 * Returns a normalised fractal-Brownian-motion function of (x, y) -> ~[0, 1].
 */
export function makeFbm(seed, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  const noise = createValueNoise(seed);
  let norm = 0;
  let amp = 1;
  for (let i = 0; i < octaves; i++) { norm += amp; amp *= gain; }

  return function fbm(x, y) {
    let value = 0;
    let a = 1;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i++) {
      value += a * noise(fx, fy);
      fx = fx * lacunarity + 19.19;
      fy = fy * lacunarity + 7.33;
      a *= gain;
    }
    return value / norm;
  };
}
