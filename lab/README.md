# 5 SITES PROJECT - a WebGL / animation showcase

Five self-contained micro-sites, each exploring a different corner of real-time graphics and motion on the web: scroll-driven animation, particle systems, declarative 3D in React, hand-written GLSL, and procedural terrain. There is no build step and no `npm install` anywhere in the project - every site runs straight off a static file server, pulls its libraries from CDNs at pinned versions, and generates all of its visuals procedurally (gradients, inline SVG, canvas textures, shaders). The dark launcher page at the root (`index.html`) links to all five; each row carries a small **live WebGL2 thumbnail** running a bespoke fragment shader that previews its site (animating on hover and during a brief attract loop, frozen otherwise - hidden entirely if WebGL2 is unavailable).

## The five sites

| # | Site | Folder | Tech | Highlights |
|---|--------|----------------------|----------------------|------------|
| 01 | AURORA | `01-aurora-gsap/` | GSAP suite + Flip | Full GSAP plugin choreography, Flip layout morphs, live WebGL aurora backdrop |
| 02 | NEBULA | `02-nebula-three/` | Three.js | Volumetric nebula, pointer gravity warp, post-processing bloom |
| 03 | PRISM | `03-prism-r3f/` | React Three Fiber | PMREM reflections, refractive prisms, scroll-driven story |
| 04 | FLUX | `04-flux-shaders/` | Raw WebGL2 GLSL | Ping-pong feedback simulation - no framework between you and the GPU |
| 05 | TERRA | `05-terra-webgl/` | Three.js + GSAP | Height-parallax terrain, film-grade post, field reports |

## How to run

From the project root, start any static file server:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open **http://localhost:8000** (with `npx serve`, use the URL it prints - typically http://localhost:3000). The launcher lists all five sites; each also works directly at its own path, e.g. `http://localhost:8000/02-nebula-three/`.

> **Note:** opening `index.html` via `file://` will **not** work - the sites use ES modules, which browsers refuse to load from the local filesystem. A local HTTP server is required.
