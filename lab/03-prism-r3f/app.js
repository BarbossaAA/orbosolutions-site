/* PRISM — React 18 + React Three Fiber, no JSX (htm bound to createElement). */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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

/* Stable prop constants so R3F never reconstructs geometry/camera/etc. */
const DPR = [1, 2];
const CAMERA = { position: [0, 0, 8], fov: 40 };
const GL_PROPS = { alpha: true, antialias: true, powerPreference: "high-performance" };
const TK_ARGS = [1.05, 0.34, 256, 40];
const ICO_ARGS = [1, 0];
const RING_ARGS = [2.6, 0.018, 12, 220];
const IRID_RANGE = [120, 480];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const expDamp = (lambda, delta) => 1 - Math.exp(-lambda * delta);

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
/* Scene: procedural studio environment (PMREM, no external assets)     */
/* ------------------------------------------------------------------ */

function StudioEnv() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new THREE.Scene();
    const materials = [];

    // Gradient dome for a soft base illumination.
    const domeGeo = new THREE.SphereGeometry(24, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color("#ffffff").multiplyScalar(1.15) },
        mid: { value: new THREE.Color("#e9e5dd") },
        bottom: { value: new THREE.Color("#aaa49a") },
      },
      vertexShader:
        "varying vec3 vDir;" +
        "void main(){ vDir = normalize(position);" +
        "gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader:
        "varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;" +
        "void main(){ float h = vDir.y;" +
        "vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.8)) : mix(mid, bottom, pow(-h, 0.8));" +
        "gl_FragColor = vec4(c, 1.0); }",
    });
    env.add(new THREE.Mesh(domeGeo, domeMat));

    // Emissive panels: a softbox studio, one violet strip for character.
    const panelGeo = new THREE.PlaneGeometry(1, 1);
    const addPanel = (color, intensity, w, h, pos) => {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide,
      });
      materials.push(mat);
      const mesh = new THREE.Mesh(panelGeo, mat);
      mesh.scale.set(w, h, 1);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.lookAt(0, 0, 0);
      env.add(mesh);
    };
    addPanel("#ffffff", 6, 14, 5, [0, 9, 0]); // ceiling softbox
    addPanel("#ffe9d2", 3, 3, 10, [-11, 1, 2]); // warm strip, left
    addPanel(ACCENT, 4, 2.4, 9, [10, 0, -3]); // violet strip, right
    addPanel("#ffffff", 2, 8, 3, [0, -1, -12]); // back fill
    addPanel("#dcd7cd", 1.4, 12, 12, [0, -8, 0]); // floor bounce

    const rt = pmrem.fromScene(env, 0.035);
    scene.environment = rt.texture;

    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
      domeGeo.dispose();
      domeMat.dispose();
      panelGeo.dispose();
      materials.forEach((m) => m.dispose());
    };
  }, [gl, scene]);
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
/* Scene: pointer-following accent light                                */
/* ------------------------------------------------------------------ */

function PointerLight() {
  const ref = useRef();
  const target = useMemo(() => new THREE.Vector3(2, 1, 2.4), []);
  useFrame((state, delta) => {
    const l = ref.current;
    if (!l) return;
    target.set(
      (state.pointer.x * state.viewport.width) / 2,
      (state.pointer.y * state.viewport.height) / 2,
      2.4
    );
    l.position.lerp(target, expDamp(6, Math.min(delta, 0.1)));
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
/* Scene: rig — intro settle, idle spin, hand-rolled drag orbit         */
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
    g.rotation.y = s.ry + s.auto;
    g.rotation.x = s.rx + (reduced ? 0 : Math.sin(state.clock.elapsedTime * 0.5) * 0.02);

    // Intro: scale up with a soft overshoot, then settle.
    let sc = 1;
    if (!reduced) {
      const p = clamp((t - 0.5) / 1.5, 0, 1);
      const q = p - 1;
      sc = Math.max(0.0001, 1 + 2.3 * q * q * q + 1.3 * q * q);
    }
    g.scale.setScalar(sc);

    // Responsive placement: right of the copy on wide screens, above it on narrow.
    const wide = state.size.width > 900;
    const tx = wide ? 1.5 : 0;
    const ty = wide ? 0 : 0.7;
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
  const stop = useCallback((e) => e.preventDefault(), []);
  return html`<header className="topbar">
    <a className="brand" href="#top" data-hover onClick=${stop}>
      <svg className="brand-mark" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#14120F" />
        <path d="M32 15 L51 47 L13 47 Z" fill="none" stroke="#ECEAE6" strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M32 15 L32 47" stroke="#6C4CFF" strokeWidth="4.5" />
      </svg>
      <span>PRISM</span>
    </a>
    <nav className="nav" aria-label="Primary">
      <a href="#materials" data-hover onClick=${stop}>Materials</a>
      <a href="#pipeline" data-hover onClick=${stop}>Pipeline</a>
      <a href="#docs" data-hover onClick=${stop}>Docs</a>
      <a className="cta" href="#beta" data-hover onClick=${stop}>Get the beta</a>
    </nav>
  </header>`;
}

function Panel({ preset, onPreset }) {
  const p = PRESETS[preset];
  const index = PRESET_ORDER.indexOf(preset);
  return html`<main className="panel" id="top">
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

    <div className="presets" role="group" aria-label="Material presets">
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

    <div className="spec">
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
            <span className="spec-val">${p[k].toFixed(2)}</span>
          </li>`
        )}
      </ul>
    </div>
  </main>`;
}

function Foot() {
  return html`<footer className="foot">
    <span>© 2026 Prism Labs — rendered live, nothing prebaked</span>
    <span className="foot-hint">Drag to orbit · Keys 1–4 switch materials</span>
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
    const move = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      if (dot.current) dot.current.style.transform = `translate(${x}px, ${y}px)`;
      if (ring.current) {
        ring.current.style.transform = `translate(${x}px, ${y}px)`;
        const hov = e.target instanceof Element && e.target.closest("[data-hover]");
        ring.current.classList.toggle("is-hover", !!hov);
      }
    };
    const down = () => ring.current && ring.current.classList.add("is-down");
    const up = () => ring.current && ring.current.classList.remove("is-down");
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
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
      if (i >= 0) setPreset(PRESET_ORDER[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onCreated = useCallback((state) => {
    // Clear-color RGB matches the page so the transmission (glass) pass picks
    // up the background tint even though the canvas itself stays transparent.
    state.gl.setClearColor(new THREE.Color(BG), 0);
    state.gl.domElement.style.touchAction = "pan-y";
    setCreated(true);
  }, []);

  const onSceneFail = useCallback(() => setCreated(true), []);

  return html`<div className=${"site" + (ready ? " is-ready" : "")}>
    <div className="scene" aria-hidden="true">
      <${SceneBoundary} onFail=${onSceneFail}>
        <${Canvas} dpr=${DPR} camera=${CAMERA} gl=${GL_PROPS} onCreated=${onCreated}>
          <${StudioEnv} />
          <ambientLight intensity=${0.45} />
          <directionalLight position=${[5, 7, 4]} intensity=${1.5} color="#fffaf0" />
          <directionalLight position=${[-6, -2, -7]} intensity=${2.2} color="#8f74ff" />
          <${PointerLight} />
          <${Rig} reduced=${reduced}>
            <${Hero} preset=${preset} />
            <${Halo} reduced=${reduced} />
            <${Orbiters} reduced=${reduced} />
          <//>
        <//>
      <//>
    </div>
    <${Header} />
    <${Panel} preset=${preset} onPreset=${setPreset} />
    <${Foot} />
    <${Cursor} />
  </div>`;
}

export function mountApp(el) {
  createRoot(el).render(html`<${App} />`);
}
