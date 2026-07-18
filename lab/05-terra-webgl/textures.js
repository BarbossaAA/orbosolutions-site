/*
 * TERRA — textures.js
 * Procedural 1024x1024 "aerial landscape" textures.
 * Each project renders a height field (fBm + domain warp) at 512^2,
 * then a full-resolution colour pass applies a palette ramp, directional
 * relief shading, optional contour lines, grain and layered canvas
 * gradients. Everything is deterministic (seeded) — no image assets.
 */

import { makeFbm } from './noise.js';

const SIZE = 1024;   // final texture resolution
const HF = 512;      // height-field resolution

/* ---------------------------------------------------------------- utils */

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* Builds a 256-entry colour LUT from gradient stops [[t, '#hex'], ...] */
function makeLut(stops) {
  const parsed = stops.map(([t, hex]) => [t, hexToRgb(hex)]);
  const lut = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = parsed[0];
    let b = parsed[parsed.length - 1];
    for (let s = 1; s < parsed.length; s++) {
      if (t <= parsed[s][0]) { a = parsed[s - 1]; b = parsed[s]; break; }
    }
    const span = (b[0] - a[0]) || 1;
    const k = clamp01((t - a[0]) / span);
    lut[i * 3] = a[1][0] + (b[1][0] - a[1][0]) * k;
    lut[i * 3 + 1] = a[1][1] + (b[1][1] - a[1][1]) * k;
    lut[i * 3 + 2] = a[1][2] + (b[1][2] - a[1][2]) * k;
  }
  return lut;
}

function lutRead(lut, t, out) {
  const i = 3 * (t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0);
  out[0] = lut[i];
  out[1] = lut[i + 1];
  out[2] = lut[i + 2];
}

/* Bilinear sample of the height grid, u/v in [0,1], clamped. */
function bilinear(grid, size, u, v) {
  const x = (u < 0 ? 0 : u > 1 ? 1 : u) * (size - 1);
  const y = (v < 0 ? 0 : v > 1 ? 1 : v) * (size - 1);
  const xi = x | 0;
  const yi = y | 0;
  const x1 = xi + 1 < size ? xi + 1 : xi;
  const y1 = yi + 1 < size ? yi + 1 : yi;
  const xf = x - xi;
  const yf = y - yi;
  const a = grid[yi * size + xi];
  const b = grid[yi * size + x1];
  const c = grid[y1 * size + xi];
  const d = grid[y1 * size + x1];
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/* Yield to the event loop so the loader can actually repaint.
   In a hidden tab there is nothing to repaint and timers are throttled,
   so skip the pause and keep crunching. */
function microYield() {
  if (document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 80);
    requestAnimationFrame(() => { clearTimeout(t); resolve(); });
  });
}

/* ---------------------------------------------------------- the recipes */

const RECIPES = {

  /* DUNE — long diagonal sand ridges, warm amber ramp, hard relief. */
  dune: {
    lut: makeLut([
      [0, '#2e2113'], [0.22, '#5c4223'], [0.45, '#94663a'],
      [0.68, '#c29254'], [0.86, '#e0bd85'], [1, '#f2e2b8']
    ]),
    lightDir: [-0.9, -0.45],
    lightStrength: 16,
    grain: 8,
    contour: null,
    glow: { pos: [0.72, 0.2], inner: 'rgba(255,214,150,0.32)', outer: 'rgba(24,16,8,0.40)' },
    makeNoise() {
      return { f1: makeFbm(1101, 4), f2: makeFbm(1102, 4) };
    },
    field(n, x, y) {
      const w = n.f1(x * 1.7, y * 1.7);
      let d = Math.abs(Math.sin((y * 2.0 + x * 0.6 + (w - 0.5) * 1.9) * 6.8));
      d = Math.pow(d, 1.5);
      return d * 0.66 + n.f2(x * 5.5, y * 5.5) * 0.34;
    },
    color(h, out) { lutRead(this.lut, clamp01(h), out); }
  },

  /* MOSS — terraced blotch fields with dark water channels. */
  moss: {
    lut: makeLut([
      [0, '#0a120c'], [0.22, '#162413'], [0.45, '#263a1a'],
      [0.65, '#3f5423'], [0.82, '#5d6f30'], [1, '#8a9448']
    ]),
    lightDir: [-0.5, -0.85],
    lightStrength: 11,
    grain: 10,
    contour: { bands: 12, strength: 0.10 },
    glow: { pos: [0.3, 0.25], inner: 'rgba(214,255,190,0.16)', outer: 'rgba(6,10,6,0.45)' },
    makeNoise() {
      return { f1: makeFbm(2201, 4), f2: makeFbm(2202, 4), f3: makeFbm(2203, 4) };
    },
    field(n, x, y) {
      const w = n.f1(x * 2.1, y * 2.1);
      let h = n.f2(x * 3.1 + (w - 0.5) * 2.4, y * 3.1 + (w - 0.5) * 2.4);
      const bt = h * 6;
      const bi = bt | 0;
      h = (bi + smoothstep(0.25, 0.75, bt - bi)) / 6;
      const r = 1 - Math.abs(2 * n.f3(x * 3.4 + (w - 0.5) * 1.2, y * 3.4 + (w - 0.5) * 1.2) - 1);
      if (r > 0.8) h *= 1 - ((r - 0.8) / 0.2) * 0.42;
      return h;
    },
    color(h, out) { lutRead(this.lut, clamp01(h), out); }
  },

  /* CLAY — warped horizontal strata cycling through a terracotta ramp. */
  clay: {
    lut: makeLut([
      [0, '#6b3322'], [0.16, '#9c492b'], [0.34, '#c1763f'],
      [0.5, '#d8ac77'], [0.64, '#b98a5e'], [0.78, '#8a5f4a'],
      [0.9, '#54291d'], [1, '#6b3322']
    ]),
    lightDir: [-0.85, -0.3],
    lightStrength: 5,
    grain: 7,
    contour: null,
    glow: { pos: [0.65, 0.3], inner: 'rgba(255,205,160,0.25)', outer: 'rgba(30,12,6,0.35)' },
    makeNoise() {
      return { f1: makeFbm(3301, 4), f2: makeFbm(3302, 4) };
    },
    field(n, x, y) {
      const w = n.f1(x * 2.0, y * 2.6);
      const fine = n.f2(x * 6.5, y * 6.5);
      return y * 6.4 + (w - 0.5) * 2.8 + x * 0.22 + (fine - 0.5) * 0.35;
    },
    color(h, out) {
      const bi = Math.floor(h);
      lutRead(this.lut, h - bi, out);
      // Per-stratum brightness variation so bands read as distinct beds.
      const rv = Math.sin((bi + 3) * 12.9898) * 43758.5453;
      const m = 0.9 + (rv - Math.floor(rv)) * 0.22;
      out[0] *= m; out[1] *= m; out[2] *= m;
    }
  },

  /* GLACIER — ridged crevasse field, ice-blue ramp, topo contours. */
  glacier: {
    lut: makeLut([
      [0, '#132b38'], [0.25, '#28536a'], [0.48, '#4e83a2'],
      [0.7, '#8db8cd'], [0.88, '#cfe5ec'], [1, '#eef7f8']
    ]),
    lightDir: [-0.65, -0.75],
    lightStrength: 18,
    grain: 6,
    contour: { bands: 15, strength: 0.08 },
    glow: { pos: [0.35, 0.18], inner: 'rgba(220,245,255,0.22)', outer: 'rgba(6,14,20,0.40)' },
    makeNoise() {
      return { f1: makeFbm(4401, 4), f2: makeFbm(4402, 4) };
    },
    field(n, x, y) {
      const w = n.f1(x * 2.5, y * 2.5);
      let r = n.f2(x * 3.3 + (w - 0.5) * 2.0, y * 3.3 + (w - 0.5) * 2.0);
      r = 1 - Math.abs(2 * r - 1);
      return Math.pow(r, 1.55);
    },
    color(h, out) {
      lutRead(this.lut, clamp01(h), out);
      if (h > 0.82) {
        // Crevasse shadow — deep blue in the ridge cores.
        const k = Math.min(1, (h - 0.82) / 0.18) * 0.7;
        out[0] += (16 - out[0]) * k;
        out[1] += (34 - out[1]) * k;
        out[2] += (46 - out[2]) * k;
      }
    }
  },

  /* BASALT — posterised charcoal plates with thin ash joint lines. */
  basalt: {
    lut: makeLut([
      [0, '#080807'], [0.3, '#171614'], [0.55, '#2a2825'],
      [0.78, '#403c36'], [1, '#5a544b']
    ]),
    lightDir: [-0.6, -0.85],
    lightStrength: 13,
    grain: 12,
    contour: null,
    glow: { pos: [0.6, 0.75], inner: 'rgba(255,240,220,0.10)', outer: 'rgba(0,0,0,0.50)' },
    makeNoise() {
      return { f1: makeFbm(5501, 4), f2: makeFbm(5502, 4) };
    },
    field(n, x, y) {
      const w = n.f1(x * 2.7, y * 2.7);
      return n.f2(x * 3.9 + (w - 0.5) * 1.6, y * 3.9 + (w - 0.5) * 1.6);
    },
    color(h, out) {
      const s = clamp01(h) * 4.999;
      const bi = s | 0;
      const bf = s - bi;
      lutRead(this.lut, (bi + smoothstep(0.4, 0.6, bf)) / 5, out);
      // Ash-coloured joint lines where plates meet.
      const vein = 1 - Math.min(1, Math.abs(bf - 0.5) / 0.06);
      if (vein > 0) {
        const k = vein * 0.4;
        out[0] += (148 - out[0]) * k;
        out[1] += (140 - out[1]) * k;
        out[2] += (128 - out[2]) * k;
      }
    }
  }
};

/* ------------------------------------------------------------ generator */

/*
 * Generates one project texture. onProgress receives 0..1.
 * Work is chunked with event-loop yields so the loader bar repaints.
 */
export async function generateProjectCanvas(id, onProgress = () => {}) {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`Unknown texture recipe: ${id}`);

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const noise = recipe.makeNoise();
  const heights = new Float32Array(HF * HF);

  const H_CHUNK = 64;                 // 8 chunks for the height pass
  const C_CHUNK = 128;                // 8 chunks for the colour pass
  const totalChunks = HF / H_CHUNK + SIZE / C_CHUNK;
  let done = 0;

  /* Pass 1 — height field at 512^2 */
  for (let y0 = 0; y0 < HF; y0 += H_CHUNK) {
    for (let y = y0; y < y0 + H_CHUNK; y++) {
      const v = y / (HF - 1);
      const row = y * HF;
      for (let x = 0; x < HF; x++) {
        heights[row + x] = recipe.field(noise, x / (HF - 1), v);
      }
    }
    done++;
    onProgress((done / totalChunks) * 0.97);
    await microYield();
  }

  /* Pass 2 — colour, relief light, contours and grain at 1024^2 */
  const img = ctx.createImageData(SIZE, SIZE);
  const data = img.data;
  const eps = 1.5 / HF;
  const ldx = recipe.lightDir[0];
  const ldy = recipe.lightDir[1];
  const ls = recipe.lightStrength;
  const contour = recipe.contour;
  const grain = recipe.grain;
  const out = [0, 0, 0];

  for (let y0 = 0; y0 < SIZE; y0 += C_CHUNK) {
    for (let y = y0; y < y0 + C_CHUNK; y++) {
      const v = y / (SIZE - 1);
      let o = y * SIZE * 4;
      for (let x = 0; x < SIZE; x++, o += 4) {
        const u = x / (SIZE - 1);
        const h = bilinear(heights, HF, u, v);
        recipe.color(h, out);

        // Directional relief shading from the height gradient.
        const dhx = bilinear(heights, HF, u + eps, v) - bilinear(heights, HF, u - eps, v);
        const dhy = bilinear(heights, HF, u, v + eps) - bilinear(heights, HF, u, v - eps);
        let light = 1 + (dhx * ldx + dhy * ldy) * ls;
        light = light < 0.45 ? 0.45 : light > 1.5 ? 1.5 : light;

        let r = out[0] * light;
        let g = out[1] * light;
        let b = out[2] * light;

        // Faint topographic contour lines.
        if (contour) {
          let c = (h * contour.bands) % 1;
          if (c < 0) c += 1;
          const dEdge = c < 0.5 ? c : 1 - c;
          if (dEdge < 0.045) {
            const k = 1 - (1 - dEdge / 0.045) * contour.strength;
            r *= k; g *= k; b *= k;
          }
        }

        const gr = (Math.random() - 0.5) * grain;
        data[o] = r + gr;
        data[o + 1] = g + gr;
        data[o + 2] = b + gr;
        data[o + 3] = 255;
      }
    }
    done++;
    onProgress((done / totalChunks) * 0.97);
    await microYield();
  }

  ctx.putImageData(img, 0, 0);

  /* Pass 3 — layered gradients: atmospheric glow + depth falloff. */
  const gx = recipe.glow.pos[0] * SIZE;
  const gy = recipe.glow.pos[1] * SIZE;
  const radial = ctx.createRadialGradient(gx, gy, SIZE * 0.05, gx, gy, SIZE * 0.95);
  radial.addColorStop(0, recipe.glow.inner);
  radial.addColorStop(1, recipe.glow.outer);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const linear = ctx.createLinearGradient(0, 0, 0, SIZE);
  linear.addColorStop(0, 'rgba(0,0,0,0)');
  linear.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = linear;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.globalCompositeOperation = 'source-over';
  onProgress(1);
  return canvas;
}
