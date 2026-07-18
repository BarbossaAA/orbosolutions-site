/* ============================================================
   FLUX — shaders.js
   Six hand-written GLSL ES 3.00 fragment programs.
   Shared uniform contract: u_time / u_mouse / u_resolution.
   These strings ARE the content — they are compiled live and
   displayed verbatim in the inspector's SOURCE view.
   ============================================================ */

export const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/* ------------------------------------------------------------ */

const MORPH = `#version 300 es
// 001 MORPH — raymarched signed distance field
// sphere -> box -> torus with soft shadows and a fresnel rim
precision highp float;

uniform float u_time;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
out vec4 fragColor;

const vec3 ACCENT = vec3(1.0, 0.231, 0.188);

mat3 rotY(float a){
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, s,  0.0, 1.0, 0.0,  -s, 0.0, c);
}
mat3 rotX(float a){
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0,  0.0, c, -s,  0.0, s, c);
}

float sdSphere(vec3 p, float r){ return length(p) - r; }
float sdBox(vec3 p, vec3 b){
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdTorus(vec3 p, vec2 t){
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

// blend the three solids on a three-beat cycle
float shape(vec3 p){
  float cyc = mod(u_time * 0.35, 3.0);
  float f   = smoothstep(0.25, 0.75, fract(cyc));
  float sph = sdSphere(p, 0.72);
  float box = sdBox(p, vec3(0.52));
  float tor = sdTorus(p, vec2(0.56, 0.22));
  if (cyc < 1.0) return mix(sph, box, f);
  if (cyc < 2.0) return mix(box, tor, f);
  return mix(tor, sph, f);
}

float map(vec3 p){
  vec3 q = p - vec3(0.0, 0.12, 0.0);
  q = rotX((u_mouse.y - 0.5) * 1.4 + 0.25)
    * rotY(u_time * 0.5 + (u_mouse.x - 0.5) * 3.0) * q;
  return min(shape(q), p.y + 1.0);   // solid + ground plane
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(1.0, -1.0) * 0.0007;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx)
                 + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// penumbra shadow: track the closest pass of the light ray
float softShadow(vec3 ro, vec3 rd){
  float res = 1.0, t = 0.04;
  for (int i = 0; i < 40; i++){
    float h = map(ro + rd * t);
    if (h < 0.0005) return 0.0;
    res = min(res, 12.0 * h / t);
    t += clamp(h, 0.02, 0.3);
    if (t > 7.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float ambOcc(vec3 p, vec3 n){
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 5; i++){
    float h = 0.03 + 0.06 * float(i);
    o += (h - map(p + n * h)) * s;
    s *= 0.72;
  }
  return clamp(1.0 - 2.2 * o, 0.0, 1.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution)
          / min(u_resolution.x, u_resolution.y);
  vec3 ro = vec3(0.0, 0.30, -3.2);
  vec3 rd = normalize(vec3(uv, 1.75));

  float t = 0.0;
  for (int i = 0; i < 96; i++){
    float h = map(ro + rd * t);
    if (h < 0.0008 || t > 14.0) break;
    t += h;
  }

  vec3 col = vec3(0.012) * (1.0 - 0.4 * length(uv));   // the void
  if (t < 14.0){
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 ld = normalize(vec3(2.2, 3.4, -2.6) - p);
    float dif = clamp(dot(n, ld), 0.0, 1.0);
    float sha = softShadow(p + n * 0.01, ld);
    float ao  = ambOcc(p, n);
    float spe = pow(clamp(dot(reflect(rd, n), ld), 0.0, 1.0), 40.0);
    bool ground = p.y < -0.98;
    vec3 alb = ground ? vec3(0.055) : vec3(0.62);
    col = alb * (0.06 + dif * sha) * ao;
    col += vec3(1.0) * spe * sha * (ground ? 0.05 : 0.7);
    if (!ground){
      float fre = pow(clamp(1.0 + dot(rd, n), 0.0, 1.0), 3.0);
      col += ACCENT * fre * 0.55;             // red rim on the silhouette
    }
    col *= exp(-0.055 * max(t - 2.0, 0.0));   // depth fade
  }
  col = pow(col, vec3(0.4545));               // gamma
  fragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------ */

const INK = `#version 300 es
// 002 INK — fbm domain warping, monochrome
// p -> fbm(p + fbm(p + fbm(p))) : the field feeds itself
precision highp float;

uniform float u_time;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
out vec4 fragColor;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),                   hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)),  hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// five octaves, rotated each pass to bury the lattice
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution)
          / min(u_resolution.x, u_resolution.y);
  uv *= 1.35;
  float t = u_time * 0.055;

  vec2 q = vec2(fbm(uv + t),
                fbm(uv + vec2(5.2, 1.3) - t * 1.35));
  vec2 r = vec2(fbm(uv + 3.4 * q + vec2(1.7, 9.2) + (u_mouse - 0.5) * 0.9 + t * 0.9),
                fbm(uv + 3.4 * q + vec2(8.3, 2.8) - t * 0.6));
  float f = fbm(uv + 3.1 * r);

  float body = smoothstep(0.28, 0.72, f);   // the ink mass
  float seam = smoothstep(0.46, 0.50, f) - smoothstep(0.50, 0.54, f);

  vec3 col = vec3(body * 0.95);
  col += vec3(1.0) * seam * 0.5;                                       // white seam
  col += vec3(1.0, 0.231, 0.188) * exp(-80.0 * abs(f - 0.65)) * 0.28;  // one red vein
  col *= 0.88 + 0.12 * noise(uv * 240.0);                              // paper grain
  col *= 1.0 - 0.35 * dot(uv * 0.5, uv * 0.5);                         // vignette
  fragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------ */

const JULIA = `#version 300 es
// 003 JULIA — escape-time fractal with orbit traps
// z -> z^2 + c while c orbits the seahorse valley
precision highp float;

uniform float u_time;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
out vec4 fragColor;

void main(){
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution)
          / min(u_resolution.x, u_resolution.y);
  vec2 z = uv * 1.4;

  float t = u_time * 0.12;
  vec2 c = vec2(-0.78, 0.155)
         + vec2(0.095 * cos(t), 0.060 * sin(t * 1.6))
         + (u_mouse - 0.5) * 0.06;

  float trapP = 1e5;   // closest pass to a fixed point
  float trapL = 1e5;   // closest pass to the imaginary axis
  float n = 0.0;
  bool escaped = false;

  for (int i = 0; i < 150; i++){
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trapP = min(trapP, length(z - vec2(0.0, 0.66)));
    trapL = min(trapL, abs(z.x));
    if (dot(z, z) > 64.0){ escaped = true; break; }
    n += 1.0;
  }

  // fractional iteration count removes the banding
  float sn = escaped ? n - log2(log2(dot(z, z))) + 4.0 : n;
  float g  = clamp(sn / 150.0, 0.0, 1.0);

  vec3 col = vec3(0.0);
  col += vec3(0.85) * exp(-2.6 * trapL) * 0.45;               // pale filaments
  col += vec3(1.0, 0.231, 0.188) * exp(-3.2 * trapP) * 0.85;  // red trap glow
  if (escaped){
    col += vec3(0.80) * pow(g, 1.6);                              // boundary heat
    col += vec3(0.05) * (0.5 + 0.5 * cos(6.28318 * sn * 0.35));   // faint bands
  }
  col *= 1.0 - 0.30 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------ */

const BLOOM = `#version 300 es
// 004 BLOOM — metaball field with additive glow
// nine drifting balls, one hard isoline, your pointer is the tenth
precision highp float;

uniform float u_time;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
out vec4 fragColor;

void main(){
  float mn = min(u_resolution.x, u_resolution.y);
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / mn;
  vec2 mp = (u_mouse * 2.0 - 1.0) * u_resolution / mn;
  float t = u_time * 0.85;

  float field = 0.0;
  for (int i = 0; i < 9; i++){
    float fi = float(i);
    vec2 p = vec2(sin(t * (0.41 + 0.073 * fi) + fi * 1.9) * 0.66,
                  cos(t * (0.53 + 0.062 * fi) + fi * 2.7) * 0.52);
    float r = 0.075 + 0.028 * sin(t * 0.7 + fi * 2.1);
    vec2 d = uv - p;
    field += r * r / (dot(d, d) + 1e-5);      // inverse-square falloff
  }
  vec2 dm = uv - mp;
  field += 0.012 / (dot(dm, dm) + 1e-4);      // the pointer ball

  vec3 col = vec3(0.0);
  col += vec3(1.0, 0.231, 0.188) * pow(min(field, 2.5) * 0.42, 2.4);  // red halo
  col += vec3(1.0) * smoothstep(1.05, 1.45, field);                    // white cores
  col += vec3(1.0) * (smoothstep(0.97, 1.00, field)
                    - smoothstep(1.04, 1.07, field)) * 0.55;           // isoline
  col *= 1.0 - 0.22 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------ */

const AURORA = `#version 300 es
// 005 AURORA — layered sine and noise curtains
// an aurora observed in infrared: red at the root, white at the tip
precision highp float;

uniform float u_time;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
out vec4 fragColor;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),                  hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++){
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

void main(){
  vec2 st = gl_FragCoord.xy / u_resolution;
  vec2 uv = vec2((st.x * 2.0 - 1.0) * (u_resolution.x / u_resolution.y),
                 st.y * 2.0 - 1.0);
  float t = u_time * 0.22 + (u_mouse.x - 0.5) * 1.5;   // wind
  vec3 col = vec3(0.0);

  // sparse twinkling stars
  vec2 cell = floor(gl_FragCoord.xy / 2.0);
  float s = hash(cell);
  float star = step(0.9982, s)
             * (0.35 + 0.65 * (0.5 + 0.5 * sin(u_time * 1.7 + s * 90.0)))
             * smoothstep(-0.2, 0.5, uv.y);
  col += vec3(star) * 0.5;

  // five curtains, back to front
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float z = 1.0 + fi * 0.45;                        // depth
    float x = uv.x * 0.8 * z + fi * 13.7;
    float wave = fbm(vec2(x * 0.9 - t * (0.5 + 0.12 * fi), fi * 3.1)) - 0.5;
    float base = -0.45 + fi * 0.16 + (u_mouse.y - 0.5) * 0.25;
    float d = uv.y - base - wave * 0.9;
    float up = exp(-max(d, 0.0) * (1.7 + 0.3 * fi));  // long fade upward
    float dn = exp(-max(-d, 0.0) * 11.0);             // sharp lower edge
    float ray = 0.45 + 0.55 * noise(vec2(x * 3.5 + t * 2.1, d * 2.0));
    vec3 tint = mix(vec3(1.0, 0.231, 0.188), vec3(1.0, 0.92, 0.88),
                    clamp(d * 1.5, 0.0, 1.0));
    col += tint * up * dn * ray * (0.5 / z);
  }

  col *= smoothstep(-0.92, -0.70, uv.y);   // ground silhouette
  col = pow(col, vec3(0.85));              // lift the mids
  fragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------ */

const CELLS = `#version 300 es
// 006 CELLS — animated voronoi with true border distance
// second pass measures distance to the cell wall, not the seed
precision highp float;

uniform float u_time;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
out vec4 fragColor;

vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

void main(){
  float mn = min(u_resolution.x, u_resolution.y);
  vec2 p = gl_FragCoord.xy / mn * 5.5;
  vec2 mpt = u_mouse * u_resolution / mn * 5.5;

  vec2 n = floor(p), f = fract(p);
  vec2 mg = vec2(0.0), mr = vec2(0.0), mid = vec2(0.0);
  float md = 8.0;

  // pass one: find the owning cell
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 id = n + g;
    vec2 o = 0.5 + 0.42 * sin(u_time * 0.8 + 6.28318 * hash2(id));
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md){ md = d; mr = r; mg = g; mid = id; }
  }

  // pass two: perpendicular distance to every neighboring wall
  float ed = 8.0;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++){
    vec2 g = mg + vec2(float(i), float(j));
    vec2 id = n + g;
    vec2 o = 0.5 + 0.42 * sin(u_time * 0.8 + 6.28318 * hash2(id));
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 0.00001)
      ed = min(ed, dot(0.5 * (mr + r), normalize(r - mr)));
  }

  float idh = hash2(mid + 31.7).x;
  float pulse = 0.5 + 0.5 * sin(u_time * 1.6 + idh * 6.28318);

  vec3 col = vec3(0.02 + 0.075 * pulse);                       // breathing fill
  float marked = step(0.88, idh);                              // a chosen few
  col = mix(col, vec3(1.0, 0.231, 0.188) * (0.25 + 0.45 * pulse), marked * 0.85);

  float edge = 1.0 - smoothstep(0.0, 0.045, ed);
  col += vec3(0.95) * edge;                                    // white walls
  col += vec3(1.0) * (1.0 - smoothstep(0.02, 0.05, length(mr))) * 0.9;  // seeds

  float dm = length(p - mpt);
  col += vec3(1.0, 0.231, 0.188) * edge * exp(-dm * 1.1) * 0.9;  // hot walls near pointer
  fragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------ */

export const SHADERS = [
  {
    id: '001',
    name: 'MORPH',
    tech: 'RAYMARCHED SDF · SOFT SHADOWS',
    desc: 'A single signed distance field interpolates between sphere, cube and torus while a raymarcher walks each ray through space. Lighting is computed analytically: one key light with penumbra soft shadows, ambient occlusion sampled along the normal, and a fresnel rim that catches the silhouette in red. Drag the pointer to orbit the solid.',
    src: MORPH,
  },
  {
    id: '002',
    name: 'INK',
    tech: 'FBM DOMAIN WARP',
    desc: 'Three stacked layers of fractional Brownian motion feed their output back into their own coordinates — domain warping. The field is thresholded into hard monochrome so it reads as ink dispersing in water, perpetually folding into itself. A single red vein traces one contour of the flow. The pointer drags the warp.',
    src: INK,
  },
  {
    id: '003',
    name: 'JULIA',
    tech: 'ESCAPE-TIME FRACTAL · ORBIT TRAP',
    desc: 'The quadratic Julia set z to z squared plus c, with c orbiting a fixed loop through the seahorse valley of the Mandelbrot set. Coloring comes from orbit traps: every pixel remembers how close its orbit passed to a point and to a line, drawing filaments the plain escape count cannot see. The pointer nudges c.',
    src: JULIA,
  },
  {
    id: '004',
    name: 'BLOOM',
    tech: 'METABALL FIELD · ADDITIVE GLOW',
    desc: 'Nine weightless metaballs sum their inverse-square fields into one scalar. A hard threshold carves the white cores, a thin isoline rings the exact surface, and everything below it becomes a red additive halo. Your pointer contributes the tenth ball — push into the swarm and it fuses with you.',
    src: BLOOM,
  },
  {
    id: '005',
    name: 'AURORA',
    tech: 'LAYERED NOISE CURTAINS',
    desc: 'Five transparent curtains of sine-displaced noise, each at its own depth and drift speed, integrated additively from root to tip over a sparse field of twinkling stars. The palette runs hot — an aurora observed in infrared, red at the base and burning out to white. Move horizontally to change the wind.',
    src: AURORA,
  },
  {
    id: '006',
    name: 'CELLS',
    tech: 'VORONOI · BORDER DISTANCE',
    desc: 'A Voronoi diagram whose seed points orbit inside their own lattice cells. A second pass measures the true perpendicular distance to each cell wall, which keeps every edge the same width no matter how the diagram deforms. Cells breathe on independent phases; a marked few flash the accent. Walls ignite near the pointer.',
    src: CELLS,
  },
];
