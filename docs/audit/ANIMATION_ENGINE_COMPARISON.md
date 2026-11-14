# AnimForge Studio — Animation Engine Audit & Capability Analysis

**Audit Date:** 2026-11-14  
**Auditor:** Animation Pipeline Specialist & Systems Architect  
**Engines Inspected:** GiveMotion, Rigby2D, StretchyStudio, Remotion, TextRig.

---

## 1. Engine Capability Comparison Matrix

| Capability / Metric | GiveMotion | Rigby2D | StretchyStudio | Remotion | TextRig |
|---------------------|------------|---------|----------------|----------|---------|
| **Core Paradigm** | CSS/HTML5 Scene Sequencer | 2D Skeletal & Mesh Engine | WebGL2 Mesh Warping | React Code Video | Declarative Text Rigging |
| **Current Integration** | **DEEPLY INTEGRATED** (`givemotion.adapter.ts`) | **DEEPLY INTEGRATED** (core bundled in `animforge-core`) | **INTEGRATED** (`stretchystudio.adapter.ts`) | **ADAPTER ONLY** (`remotion.adapter.ts`, unbuilt) | **STANDALONE** (in `engines/textrig/`) |
| **License** | **MIT** (Open source) | **Apache-2.0 / MIT** (Dual open source) | **MIT** (Open source) | **Custom Source-Available** (>3 staff commercial fee) | **MIT** (Open source) |
| **Disk Footprint** | 109 MB | 105 MB | 425 MB (394MB node_modules) | 893 MB (unbuilt monorepo) | 32 MB |
| **Input Formats** | JSON manifest, HTML/CSS, SVG | PNG, JSON, Spine 3.8/4.2 | PNG, WebGL meshes, JSON | React JSX/TSX | Plain text `.rig` format |
| **Output Formats** | HTML bundle, PNG frames, MP4 | JSON, Spine JSON, Canvas 2D/WebGL | JSON, WebGL Canvas | MP4, WebM, ProRes | Rendered frames, SVG |
| **Supports PNG Characters** | Yes (as layered SVG/HTML elements) | **Yes (Direct bitmap attachment & mesh)** | **Yes (Direct bitmap warping)** | Yes (via `<Img />`) | Limited |
| **Auto-Rigging** | No (requires defined SVG elements) | **Yes (21-bone bipedal autorig built-in)** | Semi (Grid-based auto-mesh) | No | No (manual text script) |
| **Body-Part Segmentation** | No | **Yes (via `segmentation.ts` integration)** | No | No | No |
| **Skeletal Animation** | Primitive (CSS rotate/translate) | **Advanced (Bones, hierarchy, transforms)** | No (Mesh-only) | Primitive (CSS/Spring) | Text-based bones |
| **IK Constraints** | No | **Yes (2-bone analytic IK with mix/bend)** | No | No | No |
| **Mesh Deformation** | No | **Yes (Planar Delaunay triangulation & skinning)** | **Yes (Advanced WebGL2 deformation)** | No | No |
| **Procedural Motion** | Basic CSS keyframe presets | **Yes (11 procedural keyframe actions in `motion_planner`)** | No | Yes (Spring physics) | No |
| **Timeline / Keyframes** | Yes (Scene-level CSS timing) | **Yes (Sub-frame bone transform keyframes)** | Keyframe poses | Yes (Frame-accurate React) | Text keyframe blocks |
| **MP4 Video Rendering** | **Yes (Headless Chrome + FFmpeg)** | Indirect (renders to canvas -> capture) | No | **Yes (Remotion CLI / Bundler)** | Yes (via internal renderer) |
| **Runtime Dependencies** | Node.js, Chrome, FFmpeg | Pure TypeScript / JavaScript | React 18, Vite, WebGL2 | Node.js, Bun, Chromium, FFmpeg | Python / Rust |

---

## 2. Deep Engine Profiles

### 2.1 GiveMotion (`engines/givemotion`)
- **What it does:** Provides scene compilation, sequencing, camera transitions (cut, fade, pan, zoom), audio cues, and HTML5 browser player.
- **Strengths:** 
  - Zero external GUI dependency; compiles into a clean, standalone `index.html` + `givemotion.json` bundle.
  - Headless Chrome frame capture + FFmpeg assembly is battle-tested and powers the main project export pipeline.
  - MIT licensed.
- **Weaknesses:** 
  - Not designed for complex character rigging. Its character model is an SVG stick/puppet with limited articulation.
  - Video rendering speed is bound to headless Chrome screenshot capture latency.

### 2.2 Rigby2D (`engines/rigby2d` & `animforge-core/src/character/engine/rigby/`)
- **What it does:** Complete 2D skeletal animation runtime inspired by Spine / DragonBones. Handles bone hierarchies, parent-child forward kinematics, 2-bone inverse kinematics, mesh triangulation, vertex skinning weights, pose interpolation, and Spine JSON import/export.
- **Strengths:** 
  - Its core runtime is pure TypeScript/JavaScript with **zero native dependencies**.
  - Direct integration into `animforge-core` is complete and verified with extensive unit and vertical-slice tests.
  - Supports 21-bone bipedal autorigging, landmark detection, and 11 procedural animation clips.
  - Dual Apache-2.0 / MIT license guarantees commercial safety.
- **Weaknesses:** 
  - Does not include a standalone video encoder; relies on canvas frame extraction or browser host for video capture.

### 2.3 StretchyStudio (`engines/stretchystudio`)
- **What it does:** Standalone React 18 + WebGL2 application for interactive 2D mesh deformation and rubbery squash-and-stretch warping.
- **Strengths:** 
  - Superb squash-and-stretch organic deformation for whole, unsegmented character sprites (perfect for "Quick Animate" mode).
  - MIT licensed.
- **Weaknesses:** 
  - Heavy repository footprint: 425 MB (including 394 MB in `node_modules`).
  - Currently exists as a standalone web application; its WebGL2 shaders are not yet extracted into a headless Node.js rendering utility.

### 2.4 Remotion (`engines/remotion`)
- **What it does:** Industry-standard programmatic React video rendering framework.
- **Strengths:** 
  - Highly frame-accurate, supports audio waveforms, complex motion graphics, and parallelized rendering.
- **Weaknesses:** 
  - **Licensing constraint:** Remotion requires a commercial Company License for organizations with more than 3 people.
  - Repository size is massive (**893 MB**).
  - Upstream monorepo is currently unbuilt; requires `bun` and complex tooling to build from source.
  - AnimForge's native desktop architecture works cleanly without requiring Remotion.

### 2.5 TextRig (`engines/textrig`)
- **What it does:** Experimental declarative text-based 2D character rigging tool (Blackout Interactive).
- **Strengths:** Compact plain-text rig representation.
- **Weaknesses:** Early-stage project; python-dependent pipeline; no web-ready runtime adapter.

---

## 3. Recommended Engine per Pipeline Stage

Based on empirical testing, license compatibility, and minimal overhead, the optimal architecture assignments are:

```
┌───────────────────────────────────────┬──────────────────────────┬────────────────────────────────────────────────────────┐
│ Pipeline Stage                        │ Recommended Engine       │ Architectural Rationale                                │
├───────────────────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. PNG Decoding & Silhouette Analysis │ animforge-core (Native)  │ Pure TS zlib decoder; instant, 0-dependency.           │
│ 2. Anatomical Part Segmentation       │ animforge-core (Native)  │ Pure TS rule-based segmentation in `segmentation.ts`. │
│ 3. Quick Animate (Whole Image)        │ StretchyStudio Core Math │ 2D affine squash & stretch without bone complexity.    │
│ 4. Smart Character Rigging            │ Rigby2D                  │ 21-bone hierarchy, 2-bone IK, mesh triangulation.     │
│ 5. Motion Preset Generation           │ Rigby2D Motion Planner   │ Keyframe generation for Idle, Walk, Run, Dance, etc.   │
│ 6. Viewport Interactive Preview       │ HTML5 Canvas 2D / WebGL  │ Lightweight 60 FPS real-time rendering in WebView.     │
│ 7. Scene Sequencing & Composition     │ GiveMotion               │ Multi-track timeline, camera cues, audio cues.         │
│ 8. MP4 / GIF Video Rendering          │ GiveMotion + FFmpeg      │ Headless Chrome frame capture + FFmpeg H.264/GIF.      │
└───────────────────────────────────────┴──────────────────────────┴────────────────────────────────────────────────────────┘
```

> **Recommendation regarding Remotion & TextRig:**  
> Neither Remotion nor TextRig should be used in the core desktop pipeline. Remotion's license and 893MB size impose unnecessary legal and bundle penalties. TextRig lacks a browser runtime. GiveMotion + Rigby2D fully cover the entire workflow under permissive MIT / Apache-2.0 licenses.
