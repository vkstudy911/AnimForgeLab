# AnimForge AI — Repository & Engine Analysis Report

**Date:** November 2026  
**Environment:** macOS (Apple Silicon arm64, 16 GB RAM)  
**Host Tools:** Node.js v24.19.0, npm 11.17.0, FFmpeg 9.0.1  
**Workspace:** `AnimForgeLab`

---

## 1. System Environment Inspection

Prior to repository evaluation, the local environment was inspected:
- **Platform Architecture:** macOS Darwin `arm64` (Apple Silicon M-series).
- **Available Disk Space:** >260 GiB available.
- **Node.js:** `v24.19.0` (meets all engine prerequisites of Node >= 20).
- **npm:** `11.17.0`.
- **pnpm:** Not installed on host PATH (can use `npm` or `npx pnpm`).
- **FFmpeg:** `9.0.1` installed at `/opt/homebrew/bin/ffmpeg` with `libx264`, Apple `videotoolbox` (hardware-accelerated encoding), `libvpx`, `libopus`, `libdav1d`, and `neon` SIMD optimizations.

All three repositories were successfully cloned into `AnimForgeLab/engines/`:
1. `engines/givemotion` (commit HEAD, ~52 MB)
2. `engines/remotion` (monorepo commit HEAD)
3. `engines/stretchystudio` (commit HEAD, ~1 MB)

---

## 2. In-Depth Engine Analysis

### A. Givemotion (`engines/givemotion`)

#### Overview & Purpose
Givemotion is an AI-first, code-driven motion graphics engine created by Leonardo Grigorio. It is designed specifically for AI agents (Claude Code, Cursor, Codex, etc.) to produce, visually inspect, test, and render video content from human prompts.

#### Architecture & Technologies
- **Runtime:** Native Node.js (>=20) with pure ECMAScript Modules (`"type": "module"`).
- **Dependencies:** **Zero external npm runtime dependencies.** Only `devDependencies` (`@types/node`, `typescript`).
- **Rendering Pipeline:**
  1. Serves composition files (HTML/CSS/JS) via a lightweight local HTTP server.
  2. Spawns headless Chrome instances running a deterministic virtual timeline clock (`runtime.js`).
  3. Captures frames (via Chrome screenshots on macOS, `beginFrame` on Linux/Windows).
  4. Encodes and stitches frames using `ffmpeg` with Apple VideoToolbox hardware acceleration on macOS.
- **Incremental Caching:** Fingerprints 1–2 second segments. When an edit is made (e.g. changing text or a color), only the affected chunks are re-rendered, producing byte-identical final output.

#### Key APIs & CLI Interface
- **CLI Binary:** `src/cli.js` (`givemotion` / `npx givemotion`)
  - `givemotion init [dir]` — Bootstrap starter project with instructions and `AGENTS.md`.
  - `givemotion dev [file]` — Interactive browser-based player with scrubbing, timeline, and frame inspection.
  - `givemotion render [file] -o out.mp4` — Render to MP4, WebM, MOV (ProRes 4444 with alpha), GIF, or PNG sequence.
  - `givemotion still [file] -t <time> -o frame.png` — Extract exact frame at timestamp.
  - `givemotion check [file]` — Automated QA: detects text overflow, low contrast, occlusions, broken assets, and pacing issues.
  - `givemotion snapshot [file]` — Contact sheet of key moments across scenes.
  - `givemotion review [file]` — Structured visual inspection report (`REVIEW.md`).
  - `givemotion inspect [file]` — Outputs timeline and DOM layout positions as JSON.
- **Programmatic API:** `src/api.js`
  ```ts
  import { render, check, snapshot, still, inspect } from 'givemotion';
  ```
- **Declarative HTML Attributes:**
  - `data-sequence`, `data-transition="fade 0.5"`, `data-camera="pan-right 1.2"`, `data-duration="3"`, `data-enter="rise"`, `data-split="words"`.

#### License & Commercial Rights
- **License:** **MIT License** (Free for personal and commercial use without seat limits, open to modification and redistribution).
- **Third-Party Fonts:** Bundled Google/SIL Open Font License fonts (Inter, JetBrains Mono, Playfair Display, Space Grotesk, Bebas Neue, Nunito, Caveat).

---

### B. Remotion (`engines/remotion`)

#### Overview & Purpose
Remotion is the industry-standard programmatic video creation framework using React. Created by Jonny Burger, it allows developers to build videos as React component hierarchies with frame-level determinism.

#### Architecture & Technologies
- **Monorepo:** Monorepo managed with Bun and Turborepo containing 140+ modular packages (`packages/*`).
- **Core Engine:** `remotion` (`packages/core`) providing `<Composition>`, `<Sequence>`, `<AbsoluteFill>`, `useCurrentFrame()`, `useVideoConfig()`, `spring()`, `interpolate()`.
- **Renderer & Bundler:**
  - `@remotion/renderer`: Node.js SSR rendering engine that renders React compositions using Puppeteer/Chromium and encodes with FFmpeg.
  - `@remotion/bundler`: Webpack-based compilation of Remotion compositions into browser-executable bundles.
- **CLI:** `@remotion/cli` providing `npx remotion preview` and `npx remotion render`.
- **Add-on Packages:** `@remotion/transitions`, `@remotion/shapes`, `@remotion/paths`, `@remotion/motion-blur`, `@remotion/three`, `@remotion/lottie`.

#### Key APIs & Interfaces
- **Composition Definition:**
  ```tsx
  import { Composition } from 'remotion';
  <Composition
    id="MyScene"
    component={MyComponent}
    durationInFrames={150}
    fps={30}
    width={1920}
    height={1080}
  />
  ```
- **Programmatic SSR API (`@remotion/renderer`):**
  ```ts
  import { bundle } from '@remotion/bundler';
  import { renderMedia, selectComposition } from '@remotion/renderer';
  
  const bundleLocation = await bundle(entryPoint);
  const composition = await selectComposition({ bundleLocation, id: 'MyScene' });
  await renderMedia({ composition, serveUrl: bundleLocation, codec: 'h264', outputLocation: 'out.mp4' });
  ```

#### License & Commercial Rights (CRITICAL)
- **License:** **Custom Two-Tier Source-Available License (`LICENSE.md`)**
  - **Free Tier:** Free for individuals, non-profits, and for-profit companies with **up to 3 employees**.
  - **Company License Required:** Any company with 4 or more employees must purchase a paid license from `remotion.pro`.
  - **Derivative Prohibition:** Explicit clause forbidding copying or modifying Remotion code for the purpose of selling, renting, licensing, or sublicensing a derivative video engine.
  - **AnimForge AI Recommendation:** Remotion must be interfaced strictly as an external runtime adapter through its official public npm packages / CLI without embedding its source code inside proprietary distributions.

---

### C. Stretchy Studio (`engines/stretchystudio`)

#### Overview & Purpose
Stretchy Studio is an open-source 2D character rigging and animation tool created by MangoLion. It is specifically engineered to bridge the gap between AI layer-decomposition models (such as the See-Through paper/model) and 2D skeletal/mesh animation.

#### Architecture & Technologies
- **Framework:** Vite + React 18 single-page application.
- **State Management:** Zustand (`projectStore.js`, `animationStore.js`, `editorStore.js`) with Immer.
- **Deformation & Graphics:**
  - Custom WebGL rendering pipeline (`transforms.js`, `scenePass.js`, `partRenderer.js`).
  - Delaunay mesh triangulation via `delaunator` for vertex warping.
  - 3D/2D affine matrix transformations via `gl-matrix`.
  - PSD layer parsing via `ag-psd`.
  - AI pose detection integration via DWPose (ONNX Runtime Web: `onnxruntime-web`).
- **Core Concepts:**
  - **Armatures & Bones:** Hierarchical parent-child bones for limbs, torso, and head.
  - **Mesh Deformers:** Mesh vertices assigned to bone weights for organic stretching, breathing, and bending.
  - **Shape Keys:** Micro-expression morphs (blinking, smiles, eyebrow angles).

#### Export Capabilities & Limitations
- **Spine 2D 4.0 Export (`src/io/exportSpine.js`):**
  - Exports bones, slots, attachments, skins, and keyframe animations into Spine JSON format.
  - Compatible with Spine runtimes (PixiJS, Phaser, Three.js, WebGL).
- **Animation Data (`src/io/exportAnimation.js`):**
  - Exports keyframes, curves, and track events.
- **Project File (`src/io/projectFile.js`):**
  - Custom `.stretch` JSON file containing node tree, mesh topology, bindings, and timeline.
- **Live2D Export (`src/io/live2d/`):**
  - Experimental partial `.cmo3` writer (20 of 41 parameters implemented).
- **Headless MP4 Rendering:**
  - **Limitation:** Stretchy Studio does **NOT** provide a standalone CLI or Node.js server-side MP4 renderer. It is an interactive browser application.
  - **Integration Strategy:** Rig and animate characters in Stretchy Studio, export Spine 2D JSON or rendered spritesheet/SVG sequences, and composite them inside Givemotion or Remotion for final MP4 rendering.

---

## 3. Comparison Matrix

| Capability | Givemotion | Remotion | Stretchy Studio |
| :--- | :--- | :--- | :--- |
| **Primary Paradigm** | HTML5 / CSS3 / JS | React Components | WebGL Mesh / Bones |
| **Target Use** | Agentic Motion Graphics | Programmatic Video UI | 2D Character Rigging |
| **CLI & Programmatic API** | Built-in CLI & Node API | Comprehensive CLI & SSR | Web UI only |
| **Server-side Rendering** | Built-in (Chrome + FFmpeg) | Built-in (Puppeteer + FFmpeg)| None (Browser Canvas/WebGL) |
| **2D Character Rigging** | Basic (CSS/SVG transforms) | Basic (CSS/Canvas/Lottie) | **Advanced (Bones & Mesh Warp)**|
| **Camera Movements** | Built-in (`gm.camera()`) | Custom (`interpolate`) | Viewport Pan/Zoom |
| **AI Agent Diagnostics** | Built-in (`check`, `review`) | ESLint plugin only | None |
| **License** | **MIT** (Unrestricted) | **Custom** (Free <=3 devs) | **MIT** (Unrestricted) |
| **Install Footprint** | Zero npm dependencies | ~237 packages + Bun/Turbo | ~40 npm packages (Vite) |

---

## 4. AnimForge AI Architectural Role Assignment

```
                               ┌──────────────────────────────────────────────────────────┐
                               │                    AnimForge AI Core                     │
                               │  (Orchestration, Storyboard, Asset & Timeline Pipeline)  │
                               └────────────────────────────┬─────────────────────────────┘
                                                            │
                       ┌────────────────────────────────────┼────────────────────────────────────┐
                       ▼                                    ▼                                    ▼
         ┌───────────────────────────┐        ┌───────────────────────────┐        ┌───────────────────────────┐
         │     Givemotion Adapter    │        │      Remotion Adapter     │        │   StretchyStudio Adapter  │
         ├───────────────────────────┤        ├───────────────────────────┤        ├───────────────────────────┤
         │ • Fast agentic motion     │        │ • High-fidelity React     │        │ • Character body-part     │
         │ • Scene transitions       │        │   component rendering     │        │   layer decomposition     │
         │ • Camera choreography     │        │ • Audio wave sync         │        │ • Bone rigging & meshes   │
         │ • Fast iterative preview  │        │ • Complex motion graphics │        │ • Spine 2D / frame export │
         │ • Automated QA & checks   │        │ • Production MP4 render   │        │ • Expression shape-keys   │
         └─────────────┬─────────────┘        └─────────────┬─────────────┘        └─────────────┬─────────────┘
                       │                                    │                                    │
                       └────────────────────────────────────┴────────────────────────────────────┘
                                                            │
                                                            ▼
                                               ┌───────────────────────────┐
                                               │      Final Video MP4      │
                                               └───────────────────────────┘
```

1. **Character Generation & Rigging:** Handled by **Stretchy Studio** (bone hierarchies, vertex meshes, eye blinks, facial expressions). Character motion data is exported as Spine JSON or segmented SVG/PNG sequences.
2. **Scene Assembly & Fast Iteration:** Handled by **Givemotion** (instant zero-dependency compilation, automatic visual QA via `givemotion check`, camera movements, and fast preview).
3. **Complex Compositions & Synchronizations:** Handled by **Remotion** (complex multi-track React compositions, typography, audio waveform sync, and broadcast-grade rendering).
