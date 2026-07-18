# 5 SITES PROJECT — a WebGL / animation showcase

Five self-contained micro-sites, each exploring a different corner of real-time graphics and motion on the web: scroll-driven animation, particle systems, declarative 3D in React, hand-written GLSL, and procedural terrain. There is no build step and no `npm install` anywhere in the project — every site runs straight off a static file server, pulls its libraries from CDNs at pinned versions, and generates all of its visuals procedurally (gradients, inline SVG, canvas textures, shaders). The dark launcher page at the root (`index.html`) links to all five.

## The five sites

| # | Site | Folder | Tech | Highlights |
|---|--------|----------------------|----------------------|------------|
| 01 | AURORA | `01-aurora-gsap/` | GSAP + Lenis | Gradient light ribbons, buttery smooth scroll, scroll-bound choreography |
| 02 | NEBULA | `02-nebula-three/` | Three.js + Bloom | Volumetric particle nebula, post-processing bloom, deep-space palette |
| 03 | PRISM | `03-prism-r3f/` | React Three Fiber | Refractive geometry, declarative 3D scenes composed as React components |
| 04 | FLUX | `04-flux-shaders/` | Raw WebGL2 GLSL | Fragment-shader fields written by hand — no framework between you and the GPU |
| 05 | TERRA | `05-terra-webgl/` | Three.js + GSAP slider | Slider gliding between procedural landscapes carved from noise |

## How to run

From the project root, start any static file server:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open **http://localhost:8000** (with `npx serve`, use the URL it prints — typically http://localhost:3000). The launcher lists all five sites; each also works directly at its own path, e.g. `http://localhost:8000/02-nebula-three/`.

> **Note:** opening `index.html` via `file://` will **not** work — the sites use ES modules, which browsers refuse to load from the local filesystem. A local HTTP server is required.
