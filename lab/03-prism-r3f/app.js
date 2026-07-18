/* PRISM — React 18 + React Three Fiber, no JSX (htm bound to createElement).
   v2: RoomEnvironment PMREM reflections, Lenis+ScrollTrigger scroll story,
   particle dust, preset pulse FX, per-preset ambience. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import htm from "htm";

const html = htm.bind(React.createElement);

const ACCENT = "#6C4CFF";
const BG = "#ECEAE6";

/* ------------------------------------------------------------------ */
/* Material presets                                                     */
/* ------------------------------------------------------------------ */

const PRESET_ORDER = ["CHROME", "GLASS", "HOLO", "CLAY"];

const PRESETS = {
  CHROME: {
    label: "Chrome",
    blurb:
      "Full-metal body with mirror-tight microfacets. It reads every light in the room and reports back.",
    color: "#f4f2ee",
    metalness: 1,
    roughness: 0.05,
    transmission: 0,
    thickness: 0,
    ior: 1.5,
    clearcoat: 0.35,
    clearcoatRoughness: 0.08,
    iridescence: 0,
    iridescenceIOR: 1.3,
    sheen: 0,
    sheenColor: "#ffffff",
    envMapIntensity: 1.5,
  },
  GLASS: {
    label: "Glass",
    blurb:
      "A refractive solid with true wall thickness. Light enters, bends, and carries the scene out with it.",
    color: "#ffffff",
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    thickness: 2,
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    iridescence: 0,
    iridescenceIOR: 1.3,
    sheen: 0,
    sheenColor: "#ffffff",
    envMapIntensity: 1.1,
  },
  HOLO: {
    label: "Holo",
    blurb:
      "Thin-film interference sealed under a lacquered clearcoat. The hue shifts with every degree of orbit.",
    color: "#cfc8ff",
    metalness: 0.4,
    roughness: 0.12,
    transmission: 0,
    thickness: 0.4,
    ior: 1.8,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 1,
    iridescenceIOR: 1.9,
    sheen: 0.3,
    sheenColor: "#b9a8ff",
    envMapIntensity: 1.25,
  },
  CLAY: {
    label: "Clay",
    blurb:
      "Dry matte with a whisper of sheen. The honest surface for judging silhouette and pure form.",
    color: "#b3a7d6",
    metalness: 0,
    roughness: 0.95,
    transmission: 0,
    thickness: 0,
    ior: 1.45,
    clearcoat: 0,
    clearcoatRoughness: 0.5,
    iridescence: 0,
    iridescenceIOR: 1.3,
    sheen: 0.55,
    sheenColor: "#d8cfff",
    envMapIntensity: 0.45,
  },
};

const SPEC_KEYS = [
  ["metalness", "Metalness"],
  ["roughness", "Roughness"],
  ["transmission", "Transmission"],
  ["clearcoat", "Clearcoat"],
  ["iridescence", "Iridescence"],
];

/* Per-preset ambience: a glow hue for the page gradient, dust, pulse and
   pointer light, plus a fog color that keeps the scene sitting in the page. */
const GLOW = {
  CHROME: "#6C4CFF",
  GLASS: "#4C9EFF",
  HOLO: "#C44CFF",
  CLAY: "#E08D4C",
};

const FOG_COLORS = {};
for (const k of PRESET_ORDER) {
  FOG_COLORS[k] = new THREE.Color(BG).lerp(new THREE.Color(GLOW[k]), 0.16);
}

/* Plain sRGB hex → 0-255 rgb (bypasses THREE color management; DOM use only). */
const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/* Stable prop constants so R3F never reconstructs geometry/camera/etc. */
/* dpr capped at 1.5: on 2x displays this is a 44% fillrate cut that the smooth
   physical materials + env reflections fully hide. Antialias off for the same
   reason (no hard geometric edges survive the curved chrome/glass surfaces). */
const DPR = [1, 1.5];
const CAMERA = { position: [0, 0, 8], fov: 40 };
const GL_PROPS = { alpha: true, antialias: false, stencil: false, powerPreference: "high-performance" };
/* 200x32 segments: same silhouette as 256x40 under smooth normals, ~40% fewer
   vertices for the heaviest shader (physical + transmission) in the scene. */
const TK_ARGS = [1.05, 0.34, 200, 32];
const ICO_ARGS = [1, 0];
const RING_ARGS = [2.6, 0.018, 12, 220];
const PULSE_ARGS = [1, 0.02, 8, 96];
const IRID_RANGE = [120, 480];
const FOG_ARGS = [FOG_COLORS.CHROME.clone(), 8.5, 18];

/* ------------------------------------------------------------------ */
/* Shared mutable stores (written by UI + ScrollTrigger, read in R3F)   */
/* ------------------------------------------------------------------ */

/* story.p runs 0→3 across the four page sections (hero/lab/macro/cta). */
const story = { p: 0 };

/* fx: preset-switch pulse + light flash + current glow color. */
const fx = { flash: 0, pulseId: 0, glow: new THREE.Color(GLOW.CHROME) };

/* Debug handle (console): window.__PRISM.story.p = 0..3 previews the story. */
if (typeof window !== "undefined") window.__PRISM = { story, fx };

/* Camera keyframes, one per section. */
const CAM_KEYS = [
  { x: 0, y: 0, z: 8, fov: 40 },
  { x: 0.5, y: 0.12, z: 6.5, fov: 37 },
  { x: 0.85, y: 0.3, z: 3.2, fov: 30 },
  { x: 0, y: -0.1, z: 9.4, fov: 44 },
];

/* Hero-object keyframes: wide x/y, narrow nx/ny, extra rotation, scale. */
const OBJ_KEYS = [
  { x: 1.5, y: 0, nx: 0, ny: 0.7, rx: 0, ry: 0, sc: 1 },
  { x: 1.75, y: -0.1, nx: 0, ny: 0.75, rx: 0.12, ry: 1.05, sc: 1.06 },
  { x: 1.5, y: 0.2, nx: 0, ny: 0.35, rx: 0.42, ry: 2.3, sc: 1.3 },
  { x: 0.8, y: 0.35, nx: 0, ny: 0.9, rx: -0.08, ry: 3.4, sc: 0.8 },
];

function sampleKeys(keys, p, out) {
  const i = clamp(Math.floor(p), 0, keys.length - 2);
  let f = clamp(p - i, 0, 1);
  f = f * f * (3 - 2 * f);
  const a = keys[i];
  const b = keys[i + 1];
  for (const k in a) out[k] = lerp(a[k], b[k], f);
  return out;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
function expDamp(lambda, delta) {
  return 1 - Math.exp(-lambda * delta);
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/* Scene: RoomEnvironment baked through PMREM (real studio reflections) */
/* ------------------------------------------------------------------ */

function StudioEnv() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    /* One-shot bake, deferred to idle so the PMREM work (six cubemap renders,
       mip chain, shader compiles) never blocks mount / first paint. The idle
       timeout guarantees it lands well before the loader fades (~950ms), so
       reflections are in place before the scene is ever visible. */
    let rt = null;
    let cancel = null;

    const bake = () => {
      cancel = null;
      const pmrem = new THREE.PMREMGenerator(gl);
      /* Pass the renderer: r160's RoomEnvironment reads it to pick the
         physically-correct light intensity (900) instead of legacy (5). */
      const room = new RoomEnvironment(gl);

      /* Keep PRISM's character lighting inside the room: one violet strip,
         one warm strip, so reflections still carry the art direction. */
      const panelGeo = new THREE.PlaneGeometry(1, 1);
      const extraMats = [];
      const addPanel = (color, intensity, w, h, pos) => {
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color).multiplyScalar(intensity),
          side: THREE.DoubleSide,
        });
        extraMats.push(mat);
        const mesh = new THREE.Mesh(panelGeo, mat);
        mesh.scale.set(w, h, 1);
        mesh.position.set(pos[0], pos[1], pos[2]);
        mesh.lookAt(0, 2, 0);
        room.add(mesh);
      };
      addPanel(ACCENT, 20, 3.5, 12, [11, 4, -4]);
      addPanel("#ffd9b0", 8, 3, 10, [-11.5, 3, 3]);

      rt = pmrem.fromScene(room, 0.04);
      scene.environment = rt.texture;

      /* Bake is done: the generator and the source scene are no longer needed. */
      pmrem.dispose();
      room.traverse((obj) => {
        if (obj.isMesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        }
      });
      panelGeo.dispose();
      extraMats.forEach((m) => m.dispose());
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(bake, { timeout: 350 });
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(bake, 50);
      cancel = () => window.clearTimeout(id);
    }

    return () => {
      if (cancel) cancel();
      scene.environment = null;
      if (rt) rt.dispose();
    };
  }, [gl, scene]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Scene: scroll-driven camera rig                                      */
/* ------------------------------------------------------------------ */

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const buf = useMemo(
    () => ({ cam: {}, obj: {}, look: new THREE.Vector3() }),
    []
  );
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const k = expDamp(4.5, dt);
    const c = sampleKeys(CAM_KEYS, story.p, buf.cam);
    const o = sampleKeys(OBJ_KEYS, story.p, buf.obj);
    const wide = state.size.width > 900;
    camera.position.x = lerp(camera.position.x, wide ? c.x : 0, k);
    camera.position.y = lerp(camera.position.y, c.y, k);
    camera.position.z = lerp(camera.position.z, c.z, k);
    const fov = lerp(camera.fov, c.fov, k);
    if (Math.abs(fov - camera.fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    buf.look.set(
      (wide ? o.x : o.nx) * 0.55,
      (wide ? o.y : o.ny) * 0.45,
      0
    );
    camera.lookAt(buf.look);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Scene: fog color lerp per preset                                     */
/* ------------------------------------------------------------------ */

function FogLerp({ preset }) {
  const scene = useThree((s) => s.scene);
  const pr = useRef(preset);
  useEffect(() => {
    pr.current = preset;
  }, [preset]);
  useFrame((_, delta) => {
    if (scene.fog) {
      scene.fog.color.lerp(FOG_COLORS[pr.current], expDamp(2.5, Math.min(delta, 0.1)));
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Scene: hero material with smooth preset lerping                      */
/* ------------------------------------------------------------------ */

function HeroMaterial({ preset }) {
  const ref = useRef();
  const presetRef = useRef(preset);
  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);
  const tmp = useMemo(() => ({ a: new THREE.Color(), b: new THREE.Color() }), []);

  useFrame((_, delta) => {
    const m = ref.current;
    if (!m) return;
    const t = PRESETS[presetRef.current];
    const k = expDamp(5.5, Math.min(delta, 0.1));
    m.metalness = lerp(m.metalness, t.metalness, k);
    m.roughness = lerp(m.roughness, t.roughness, k);
    // Keep feature values epsilon-positive so the shader never recompiles
    // (USE_TRANSMISSION / USE_CLEARCOAT / USE_IRIDESCENCE / USE_SHEEN stay on).
    m.transmission = Math.max(0.001, lerp(m.transmission, t.transmission, k));
    m.thickness = Math.max(0.001, lerp(m.thickness, t.thickness, k));
    m.ior = lerp(m.ior, t.ior, k);
    m.clearcoat = Math.max(0.001, lerp(m.clearcoat, t.clearcoat, k));
    m.clearcoatRoughness = lerp(m.clearcoatRoughness, t.clearcoatRoughness, k);
    m.iridescence = Math.max(0.001, lerp(m.iridescence, t.iridescence, k));
    m.iridescenceIOR = lerp(m.iridescenceIOR, t.iridescenceIOR, k);
    m.sheen = Math.max(0.001, lerp(m.sheen, t.sheen, k));
    m.envMapIntensity = lerp(m.envMapIntensity, t.envMapIntensity, k);
    m.color.lerp(tmp.a.set(t.color), k);
    m.sheenColor.lerp(tmp.b.set(t.sheenColor), k);
  });

  return html`<meshPhysicalMaterial
    ref=${ref}
    color=${PRESETS.CHROME.color}
    metalness=${PRESETS.CHROME.metalness}
    roughness=${PRESETS.CHROME.roughness}
    transmission=${0.001}
    thickness=${0.001}
    ior=${PRESETS.CHROME.ior}
    clearcoat=${PRESETS.CHROME.clearcoat}
    clearcoatRoughness=${PRESETS.CHROME.clearcoatRoughness}
    iridescence=${0.001}
    iridescenceIOR=${PRESETS.CHROME.iridescenceIOR}
    iridescenceThicknessRange=${IRID_RANGE}
    sheen=${0.001}
    sheenRoughness=${0.5}
    sheenColor=${PRESETS.CHROME.sheenColor}
    envMapIntensity=${PRESETS.CHROME.envMapIntensity}
    attenuationColor=${"#dcd2ff"}
    attenuationDistance=${6}
  />`;
}

function Hero({ preset }) {
  return html`<mesh>
    <torusKnotGeometry args=${TK_ARGS} />
    <${HeroMaterial} preset=${preset} />
  </mesh>`;
}

/* ------------------------------------------------------------------ */
/* Scene: orbiting icosahedrons + thin floating ring                    */
/* ------------------------------------------------------------------ */

const ORBITERS = [
  { r: 2.45, speed: 0.34, phase: 0.4, tilt: 0.55, size: 0.15, spin: 0.7, color: "#dcd8d0", metal: 0.95, rough: 0.22 },
  { r: 2.85, speed: -0.24, phase: 2.2, tilt: -0.4, size: 0.1, spin: 1.1, color: ACCENT, metal: 0.55, rough: 0.3 },
  { r: 3.25, speed: 0.19, phase: 4.1, tilt: 0.25, size: 0.19, spin: 0.5, color: "#cfcabf", metal: 0.9, rough: 0.28 },
  { r: 2.1, speed: -0.42, phase: 1.1, tilt: 0.85, size: 0.08, spin: 1.4, color: "#f3f1ec", metal: 0.7, rough: 0.35 },
  { r: 3.6, speed: 0.15, phase: 5.4, tilt: -0.65, size: 0.12, spin: 0.9, color: ACCENT, metal: 0.5, rough: 0.4 },
];

function Orbiters({ reduced }) {
  const group = useRef();
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = reduced ? 0 : state.clock.elapsedTime;
    for (let i = 0; i < ORBITERS.length; i++) {
      const o = ORBITERS[i];
      const m = g.children[i];
      if (!m) continue;
      const a = t * o.speed + o.phase;
      m.position.set(
        Math.cos(a) * o.r,
        Math.sin(a + o.phase) * o.tilt,
        Math.sin(a) * o.r
      );
      m.rotation.set(t * o.spin, t * o.spin * 0.8 + o.phase, 0);
    }
  });
  return html`<group ref=${group}>
    ${ORBITERS.map(
      (o, i) => html`<mesh key=${i} scale=${o.size}>
        <icosahedronGeometry args=${ICO_ARGS} />
        <meshStandardMaterial color=${o.color} metalness=${o.metal} roughness=${o.rough} />
      </mesh>`
    )}
  <//>`;
}

function Halo({ reduced }) {
  const ref = useRef();
  useFrame((state, delta) => {
    const r = ref.current;
    if (!r || reduced) return;
    r.rotation.z += delta * 0.08;
    r.rotation.x = 1.25 + Math.sin(state.clock.elapsedTime * 0.4) * 0.08;
  });
  return html`<mesh ref=${ref} rotation=${[1.25, 0, 0.4]}>
    <torusGeometry args=${RING_ARGS} />
    <meshStandardMaterial
      color=${ACCENT}
      metalness=${0.7}
      roughness=${0.25}
      emissive=${ACCENT}
      emissiveIntensity=${0.22}
    />
  </mesh>`;
}

/* ------------------------------------------------------------------ */
/* Scene: preset pulse — a thin ring blown outward on preset switch     */
/* ------------------------------------------------------------------ */

function PulseRing({ reduced }) {
  const ref = useRef();
  const mat = useRef();
  const st = useRef({ seen: 0, age: 99 });
  useFrame((_, delta) => {
    const m = ref.current;
    const s = st.current;
    if (!m || !mat.current) return;
    if (s.seen !== fx.pulseId) {
      s.seen = fx.pulseId;
      s.age = 0;
      mat.current.color.copy(fx.glow);
    }
    if (reduced) {
      m.visible = false;
      return;
    }
    s.age += Math.min(delta, 0.1);
    const p = s.age / 0.9;
    if (p >= 1) {
      if (m.visible) m.visible = false;
      return;
    }
    m.visible = true;
    const e = 1 - Math.pow(1 - p, 3);
    m.scale.setScalar(0.45 + e * 3.8);
    mat.current.opacity = (1 - p) * 0.9;
  });
  return html`<mesh ref=${ref} visible=${false} rotation=${[1.25, 0, 0.4]}>
    <torusGeometry args=${PULSE_ARGS} />
    <meshBasicMaterial
      ref=${mat}
      color=${ACCENT}
      transparent=${true}
      opacity=${0}
      depthWrite=${false}
      side=${THREE.DoubleSide}
      toneMapped=${false}
    />
  </mesh>`;
}

/* ------------------------------------------------------------------ */
/* Scene: micro-dust — sparse depth-faded points drifting in the room   */
/* ------------------------------------------------------------------ */

/* 300 sparse depth-faded points read identically to 450 (they overlap-fade
   against the same volume); one-third fewer verts + fill per frame. */
const DUST_COUNT = 300;

const DUST_VERT = `
attribute vec4 aSeed;
uniform float uTime;
uniform float uDpr;
varying float vA;
void main() {
  vec3 p = position;
  float t = uTime;
  p.x += sin(t * aSeed.y + aSeed.x) * 0.55;
  p.z += cos(t * aSeed.y * 0.8 + aSeed.x * 2.0) * 0.4;
  p.y = mod(position.y + t * aSeed.w + 4.0, 8.0) - 4.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  vA = smoothstep(1.2, 3.0, d) * (1.0 - smoothstep(7.0, 12.5, d));
  gl_PointSize = aSeed.z * 3.4 * uDpr * (6.0 / max(d, 0.1));
  gl_Position = projectionMatrix * mv;
}
`;

const DUST_FRAG = `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.08, length(q));
  float a = m * vA * 0.5;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

function Dust({ reduced }) {
  const gl = useThree((s) => s.gl);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(DUST_COUNT * 3);
    const seed = new Float32Array(DUST_COUNT * 4);
    for (let i = 0; i < DUST_COUNT; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 7;
      seed[i * 4 + 0] = Math.random() * Math.PI * 2; // phase
      seed[i * 4 + 1] = 0.2 + Math.random() * 0.8; // speed
      seed[i * 4 + 2] = 0.5 + Math.random(); // size
      seed[i * 4 + 3] = 0.08 + Math.random() * 0.22; // rise
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uDpr: { value: 1 },
          uColor: { value: new THREE.Color(GLOW.CHROME) },
        },
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
      }),
    []
  );

  useEffect(() => {
    material.uniforms.uDpr.value = gl.getPixelRatio();
  }, [gl, material]);

  useEffect(
    () => () => {
      geo.dispose();
      material.dispose();
    },
    [geo, material]
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    if (!reduced) material.uniforms.uTime.value += dt;
    material.uniforms.uColor.value.lerp(fx.glow, expDamp(2.5, dt));
  });

  return html`<points geometry=${geo} material=${material} frustumCulled=${false} />`;
}

/* ------------------------------------------------------------------ */
/* Scene: pointer-following accent light (flashes on preset switch)     */
/* ------------------------------------------------------------------ */

function PointerLight() {
  const ref = useRef();
  const target = useMemo(() => new THREE.Vector3(2, 1, 2.4), []);
  useFrame((state, delta) => {
    const l = ref.current;
    if (!l) return;
    const dt = Math.min(delta, 0.1);
    target.set(
      (state.pointer.x * state.viewport.width) / 2,
      (state.pointer.y * state.viewport.height) / 2,
      2.4
    );
    l.position.lerp(target, expDamp(6, dt));
    fx.flash = Math.max(0, fx.flash - dt * 2.2);
    l.intensity = 28 + fx.flash * fx.flash * 110;
    l.color.lerp(fx.glow, expDamp(2.5, dt));
  });
  return html`<pointLight
    ref=${ref}
    position=${[2, 1, 2.4]}
    color=${ACCENT}
    intensity=${28}
    distance=${14}
    decay=${1.6}
  />`;
}

/* ------------------------------------------------------------------ */
/* Scene: rig — intro settle, idle spin, drag orbit, story keyframes    */
/* ------------------------------------------------------------------ */

function Rig({ reduced, children }) {
  const group = useRef();
  const gl = useThree((s) => s.gl);
  const st = useRef({
    dragging: false,
    lx: 0,
    ly: 0,
    vx: 0,
    vy: 0,
    rx: -0.12,
    ry: 0.5,
    auto: 0,
    ox: null,
    oy: null,
    t0: -1,
    kf: {},
  });

  useEffect(() => {
    const el = gl.domElement;
    const down = (e) => {
      const s = st.current;
      s.dragging = true;
      s.lx = e.clientX;
      s.ly = e.clientY;
      s.vx = 0;
      s.vy = 0;
      el.classList.add("is-grabbing");
    };
    const move = (e) => {
      const s = st.current;
      if (!s.dragging) return;
      const dx = e.clientX - s.lx;
      const dy = e.clientY - s.ly;
      s.lx = e.clientX;
      s.ly = e.clientY;
      s.vy = dx * 0.0052;
      s.vx = dy * 0.0038;
      s.ry += s.vy;
      s.rx = clamp(s.rx + s.vx, -1.1, 1.1);
    };
    const up = () => {
      st.current.dragging = false;
      el.classList.remove("is-grabbing");
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const s = st.current;
    const dt = Math.min(delta, 0.1);
    if (s.t0 < 0) s.t0 = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - s.t0;

    // Inertia after release + slow idle auto-rotation.
    if (!s.dragging) {
      const decay = Math.exp(-3.2 * dt);
      s.vx *= decay;
      s.vy *= decay;
      s.ry += s.vy;
      s.rx = clamp(s.rx + s.vx, -1.1, 1.1);
      if (!reduced) s.auto += dt * 0.12;
    }

    // Story keyframes layered on top of the drag orbit.
    const o = sampleKeys(OBJ_KEYS, story.p, s.kf);
    g.rotation.y = s.ry + s.auto + o.ry;
    g.rotation.x = s.rx + o.rx + (reduced ? 0 : Math.sin(state.clock.elapsedTime * 0.5) * 0.02);

    // Intro: scale up with a soft overshoot, then settle.
    let sc = 1;
    if (!reduced) {
      const p = clamp((t - 0.5) / 1.5, 0, 1);
      const q = p - 1;
      sc = Math.max(0.0001, 1 + 2.3 * q * q * q + 1.3 * q * q);
    }
    g.scale.setScalar(sc * o.sc);

    // Placement: story keyframes, responsive (wide vs narrow layouts).
    const wide = state.size.width > 900;
    const tx = wide ? o.x : o.nx;
    const ty = wide ? o.y : o.ny;
    const k = expDamp(4, dt);
    if (s.ox === null) {
      s.ox = tx;
      s.oy = ty;
    }
    s.ox = lerp(s.ox, tx, k);
    s.oy = lerp(s.oy, ty, k);
    g.position.x = s.ox;
    g.position.y = s.oy + (reduced ? 0 : Math.sin(state.clock.elapsedTime * 0.7) * 0.07);
  });

  return html`<group ref=${group}>${children}<//>`;
}

/* ------------------------------------------------------------------ */
/* Error boundary for the 3D scene                                      */
/* ------------------------------------------------------------------ */

class SceneBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error("[PRISM] scene failed:", err);
    if (this.props.onFail) this.props.onFail();
  }
  render() {
    if (this.state.failed) {
      return html`<div className="scene-fallback">
        <div className="fallback-card">
          <strong>The 3D scene could not start.</strong>
          <p>
            Your browser blocked WebGL or a graphics module failed to load. Try the
            latest Chrome, Edge or Firefox with hardware acceleration switched on.
          </p>
        </div>
      </div>`;
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* UI: chrome around the canvas                                         */
/* ------------------------------------------------------------------ */

function Header() {
  const nav = useCallback((e) => {
    e.preventDefault();
    const href = e.currentTarget.getAttribute("href") || "";
    if (href.length < 2) return;
    const el = document.querySelector(href);
    if (!el) return;
    if (window.__lenis) window.__lenis.scrollTo(el, { duration: 1.4 });
    else el.scrollIntoView({ behavior: "smooth" });
  }, []);
  return html`<header className="topbar">
    <a className="brand" href="#top" data-hover onClick=${nav}>
      <svg className="brand-mark" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#14120F" />
        <path d="M32 15 L51 47 L13 47 Z" fill="none" stroke="#ECEAE6" strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M32 15 L32 47" stroke="#6C4CFF" strokeWidth="4.5" />
      </svg>
      <span>PRISM</span>
    </a>
    <nav className="nav" aria-label="Primary">
      <a href="#materials" data-hover onClick=${nav}>Materials</a>
      <a href="#pipeline" data-hover onClick=${nav}>Pipeline</a>
      <a href="#docs" data-hover onClick=${nav}>Docs</a>
      <a className="cta" href="#beta" data-hover onClick=${nav}>Get the beta</a>
    </nav>
  </header>`;
}

/* Spec value that scrambles to its new number on preset switch. */
function SpecValue({ value, reduced }) {
  const ref = useRef();
  const prev = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g = window.gsap;
    if (prev.current === null || prev.current === value || reduced || !g || !window.ScrambleTextPlugin) {
      if (g) g.killTweensOf(el);
      el.textContent = value;
    } else {
      g.killTweensOf(el);
      g.to(el, {
        duration: 0.55,
        ease: "none",
        scrambleText: { text: value, chars: "0123456789", speed: 0.4 },
      });
    }
    prev.current = value;
  }, [value, reduced]);
  return html`<span className="spec-val" ref=${ref}></span>`;
}

/* ------------------------------------------------------------------ */
/* UI: the four-section scroll story                                    */
/* ------------------------------------------------------------------ */

function Story({ preset, onPreset, reduced }) {
  const p = PRESETS[preset];
  const index = PRESET_ORDER.indexOf(preset);
  const stop = useCallback((e) => e.preventDefault(), []);
  return html`<main className="story" id="story">

    <section className="sec sec-hero" id="top">
      <p className="eyebrow"><span className="eyebrow-dot"></span>Real-time material lab — public beta</p>
      <h1 className="hl">
        <span className="line"><span className="line-in">Matter,</span></span>
        <span className="line"><span className="line-in">made to <em>order.</em></span></span>
      </h1>
      <p className="copy">
        PRISM turns physically-based shading into a live instrument. Sculpt chrome,
        glass, holographic film and raw clay right here in the browser, then export
        the exact same material graph to Unity, Unreal or three.js. What you see is
        what ships.
      </p>
      <div className="scroll-cue" aria-hidden="true">
        <span className="cue-line"></span>
        <span>Scroll — the lab is open</span>
      </div>
    </section>

    <section className="sec sec-lab" id="materials" aria-label="Material lab">
      <p className="eyebrow" data-reveal><span className="eyebrow-dot"></span>01 — Material lab</p>
      <h2 className="hl hl-2" data-reveal style=${{ "--d": "0.06s" }}>
        Four bodies,<br /> one <em>shader.</em>
      </h2>
      <div className="presets" role="group" aria-label="Material presets" data-reveal style=${{ "--d": "0.14s" }}>
        <span className="presets-label">Presets — 04 <em>keys 1–4</em></span>
        <div className="chips">
          ${PRESET_ORDER.map(
            (key, i) => html`<button
              key=${key}
              className=${"chip" + (key === preset ? " is-active" : "")}
              aria-pressed=${key === preset}
              onClick=${() => onPreset(key)}
              data-hover
            >
              <span className="chip-index">0${i + 1}</span>${key}
            </button>`
          )}
        </div>
      </div>
      <div className="spec" data-reveal style=${{ "--d": "0.22s" }}>
        <div className="spec-head">
          <span>Specification</span>
          <span className="spec-name" key=${preset} aria-live="polite">
            ${p.label} · MPB-0${index + 1}
          </span>
        </div>
        <p className="spec-blurb" key=${"b-" + preset}>${p.blurb}</p>
        <ul className="spec-rows">
          ${SPEC_KEYS.map(
            ([k, name]) => html`<li key=${k}>
              <span className="spec-key">${name}</span>
              <span className="spec-bar">
                <span className="spec-fill" style=${{ width: Math.round(p[k] * 100) + "%" }}></span>
              </span>
              <${SpecValue} value=${p[k].toFixed(2)} reduced=${reduced} />
            </li>`
          )}
        </ul>
      </div>
    </section>

    <section className="sec sec-macro" id="pipeline" aria-label="Macro detail and pipeline">
      <p className="eyebrow" data-reveal><span className="eyebrow-dot"></span>02 — Macro detail</p>
      <h2 className="hl hl-2" data-reveal style=${{ "--d": "0.06s" }}>
        Down to the <em>microfacet.</em>
      </h2>
      <p className="copy" data-reveal style=${{ "--d": "0.14s" }}>
        Push in and the surface holds. PRISM evaluates the full physical BRDF every
        frame — energy-conserving speculars, true thin-film interference, refraction
        with real wall thickness — so the macro shot you art-direct here is the exact
        response your engine reproduces.
      </p>
      <ul className="stats" data-reveal style=${{ "--d": "0.22s" }}>
        <li>
          <span className="stat-num" data-final="1:1">1:1</span>
          <span className="stat-key">Engine shader parity</span>
        </li>
        <li>
          <span className="stat-num" data-final="0">0</span>
          <span className="stat-key">Baked maps shipped</span>
        </li>
        <li>
          <span className="stat-num" data-final="2.4ms">2.4ms</span>
          <span className="stat-key">Material eval budget</span>
        </li>
      </ul>
    </section>

    <section className="sec sec-cta" id="beta" aria-label="Get the beta">
      <p className="eyebrow" data-reveal><span className="eyebrow-dot"></span>03 — Public beta</p>
      <h2 className="hl hl-2" data-reveal style=${{ "--d": "0.06s" }}>
        Ship the surface,<br /> not a <em>screenshot.</em>
      </h2>
      <p className="copy" data-reveal style=${{ "--d": "0.14s" }}>
        The beta ships with all four base bodies, the full parameter graph, and
        one-click exporters for Unity HDRP, Unreal and three.js. Your material,
        byte-for-byte.
      </p>
      <div className="cta-row" data-reveal style=${{ "--d": "0.22s" }}>
        <a className="btn-primary" href="#beta" data-hover onClick=${stop}>Get the beta</a>
        <a className="btn-ghost" href="#docs" data-hover onClick=${stop}>Read the docs</a>
      </div>
    </section>

  </main>`;
}

function Foot() {
  return html`<footer className="foot">
    <span>© 2026 Prism Labs — rendered live, nothing prebaked</span>
    <span className="foot-hint">Scroll to explore · Drag to orbit · Keys 1–4</span>
  </footer>`;
}

/* ------------------------------------------------------------------ */
/* UI: custom cursor (event-driven, no extra rAF loop)                  */
/* ------------------------------------------------------------------ */

function Cursor() {
  const dot = useRef();
  const ring = useRef();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (fine && !reduced) setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    document.documentElement.classList.add("cursor-off");
    /* rAF-gated: pointermove can fire at several hundred Hz on high-poll mice;
       coalesce to one style write + one closest() walk per painted frame. */
    let raf = 0;
    let last = null;
    const paint = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const x = e.clientX;
      const y = e.clientY;
      if (dot.current) dot.current.style.transform = `translate(${x}px, ${y}px)`;
      if (ring.current) {
        ring.current.style.transform = `translate(${x}px, ${y}px)`;
        const hov = e.target instanceof Element && e.target.closest("[data-hover]");
        ring.current.classList.toggle("is-hover", !!hov);
      }
    };
    const move = (e) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const down = () => ring.current && ring.current.classList.add("is-down");
    const up = () => ring.current && ring.current.classList.remove("is-down");
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.documentElement.classList.remove("cursor-off");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, [enabled]);

  if (!enabled) return null;
  return html`<div className="cursor-layer" aria-hidden="true">
    <div className="cursor-ring" ref=${ring}></div>
    <div className="cursor-dot" ref=${dot}></div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* App                                                                  */
/* ------------------------------------------------------------------ */

function App() {
  const [preset, setPreset] = useState("CHROME");
  const [created, setCreated] = useState(false);
  const [minTime, setMinTime] = useState(false);
  const reduced = useReducedMotion();
  const ready = created && minTime;
  const presetRef = useRef(preset);
  const ambienceRef = useRef();
  const ambRgb = useRef(hexRgb(GLOW.CHROME));

  /* Preset switch: state + pulse ring + light flash + glow retarget. */
  const applyPreset = useCallback((key) => {
    if (presetRef.current === key) return;
    presetRef.current = key;
    fx.flash = 1;
    fx.pulseId += 1;
    fx.glow.set(GLOW[key]);
    setPreset(key);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setMinTime(true), 950);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const el = document.getElementById("loader");
    if (el) el.classList.add("done");
  }, [ready]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0) applyPreset(PRESET_ORDER[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyPreset]);

  /* Lenis + ScrollTrigger: smooth scroll, story progress, reveals. */
  useEffect(() => {
    const g = window.gsap;
    const ST = window.ScrollTrigger;
    const revealEls = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!g || !ST) {
      // No GSAP: never leave content hidden.
      revealEls.forEach((el) => el.classList.add("is-in"));
      return undefined;
    }
    g.registerPlugin(ST);
    if (window.ScrambleTextPlugin) g.registerPlugin(window.ScrambleTextPlugin);

    let lenis = null;
    let tick = null;
    if (!reduced && window.Lenis) {
      lenis = new window.Lenis({ duration: 1.1 });
      window.__lenis = lenis;
      lenis.on("scroll", ST.update);
      tick = (time) => lenis.raf(time * 1000);
      g.ticker.add(tick);
      g.ticker.lagSmoothing(0);
    }

    const triggers = [];

    // Story progress 0→3 drives camera + hero object inside the canvas.
    triggers.push(
      ST.create({
        trigger: "#story",
        start: "top top",
        end: "bottom bottom",
        scrub: reduced ? true : 0.35,
        onUpdate: (self) => {
          story.p = self.progress * 3;
        },
      })
    );

    // Section content reveals.
    revealEls.forEach((el) => {
      triggers.push(
        ST.create({
          trigger: el,
          start: "top 82%",
          once: true,
          onEnter: () => el.classList.add("is-in"),
        })
      );
    });

    // Macro stats scramble in once.
    document.querySelectorAll(".stat-num").forEach((el) => {
      const final = el.dataset.final || el.textContent;
      triggers.push(
        ST.create({
          trigger: el,
          start: "top 86%",
          once: true,
          onEnter: () => {
            if (reduced || !window.ScrambleTextPlugin) return;
            g.to(el, {
              duration: 0.9,
              ease: "none",
              scrambleText: { text: final, chars: "0123456789", speed: 0.35 },
            });
          },
        })
      );
    });

    const onLoad = () => ST.refresh();
    window.addEventListener("load", onLoad);

    return () => {
      window.removeEventListener("load", onLoad);
      triggers.forEach((t) => t.kill());
      if (tick) g.ticker.remove(tick);
      if (lenis) {
        lenis.destroy();
        if (window.__lenis === lenis) window.__lenis = null;
      }
    };
  }, [reduced]);

  /* Per-preset ambience: page glow gradient lerps to the preset hue. */
  useEffect(() => {
    const el = ambienceRef.current;
    if (!el) return;
    const to = hexRgb(GLOW[preset]);
    const cur = ambRgb.current;
    const paint = () => {
      const rgb = `${Math.round(cur.r)}, ${Math.round(cur.g)}, ${Math.round(cur.b)}`;
      el.style.background =
        `radial-gradient(1100px 750px at 72% 38%, rgba(${rgb}, 0.14), rgba(${rgb}, 0) 62%), ` +
        `radial-gradient(760px 620px at 14% 84%, rgba(${rgb}, 0.07), rgba(${rgb}, 0) 60%)`;
    };
    const g = window.gsap;
    if (g && !reduced) {
      g.killTweensOf(cur);
      g.to(cur, { r: to.r, g: to.g, b: to.b, duration: 1.2, ease: "power2.out", onUpdate: paint });
    } else {
      cur.r = to.r;
      cur.g = to.g;
      cur.b = to.b;
      paint();
    }
  }, [preset, reduced]);

  const onCreated = useCallback((state) => {
    // Clear-color RGB matches the page so the transmission (glass) pass picks
    // up the background tint even though the canvas itself stays transparent.
    state.gl.setClearColor(new THREE.Color(BG), 0);
    state.gl.domElement.style.touchAction = "pan-y";
    setCreated(true);
  }, []);

  const onSceneFail = useCallback(() => setCreated(true), []);

  return html`<div className=${"site" + (ready ? " is-ready" : "")}>
    <div className="ambience" ref=${ambienceRef} aria-hidden="true"></div>
    <div className="scene" aria-hidden="true">
      <${SceneBoundary} onFail=${onSceneFail}>
        <${Canvas} dpr=${DPR} camera=${CAMERA} gl=${GL_PROPS} onCreated=${onCreated}>
          <${StudioEnv} />
          <fog attach="fog" args=${FOG_ARGS} />
          <ambientLight intensity=${0.45} />
          <directionalLight position=${[5, 7, 4]} intensity=${1.5} color="#fffaf0" />
          <directionalLight position=${[-6, -2, -7]} intensity=${2.2} color="#8f74ff" />
          <${PointerLight} />
          <${CameraRig} />
          <${FogLerp} preset=${preset} />
          <${Dust} reduced=${reduced} />
          <${Rig} reduced=${reduced}>
            <${Hero} preset=${preset} />
            <${Halo} reduced=${reduced} />
            <${Orbiters} reduced=${reduced} />
            <${PulseRing} reduced=${reduced} />
          <//>
        <//>
      <//>
    </div>
    <${Header} />
    <${Story} preset=${preset} onPreset=${applyPreset} reduced=${reduced} />
    <${Foot} />
    <${Cursor} />
  </div>`;
}

export function mountApp(el) {
  createRoot(el).render(html`<${App} />`);
}
