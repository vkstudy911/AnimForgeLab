# AnimForge Character Studio — Rigby2D Engine Integration Report

**Date:** 2026-11-13  
**Sprint:** Rigby2D Skeletal Animation Engine Integration & AI Auto-Rig Sprint  
**Format Version:** `animforge-character/2.0`  
**Target Upstream Repositories:**
- **Rigby2D:** [https://github.com/jaisurya-dev-art/rigby2d](https://github.com/jaisurya-dev-art/rigby2d) (MIT License)
- **TextRig:** [https://github.com/blackoutbuild/textrig](https://github.com/blackoutbuild/textrig) (MIT License)

---

## 1. Architectural Boundary & Invariants

### 1.1 Host-Engine Relationship
AnimForge Studio remains the single, top-level native desktop application (Tauri 2 + Rust + React 18 + Vite). Under no circumstance was Rigby2D integrated as a competing GUI shell, nor was a second Tauri instance nested.

Instead, the computational core of Rigby2D was isolated, adapted into TypeScript/JavaScript modules within `animforge-core/src/character/engine/rigby/`, and integrated through a first-class `Rigby2DAdapter` conforming to AnimForge's existing `AnimationEngineAdapter` interface.

```
+-------------------------------------------------------------------------------+
|                             AnimForge Desktop (Tauri 2)                       |
|   +-----------------------------------------------------------------------+   |
|   |                      Character Studio Workspace (React)               |   |
|   |  - Dual Engine: Rigby2D Canvas Viewport & StretchyStudio Schematic    |   |
|   |  - Bone Hierarchy Tree, Rig Inspector, 11-Motion Generator Toolbar    |   |
|   +-----------------------------------------------------------------------+   |
+---------------------------------------+---------------------------------------+
                                        | Tauri IPC (`character_invoke`)
                                        v
+-------------------------------------------------------------------------------+
|                          Rust Desktop Core (`src-tauri`)                      |
|                  Path-Jailed Worker Bridge (`worker_bridge.rs`)               |
+---------------------------------------+---------------------------------------+
                                        | Stdio NDJSON RPC
                                        v
+-------------------------------------------------------------------------------+
|                       AnimForge Core Worker (`worker.ts`)                     |
|  - IPC Handlers: `character_list`, `character_load`, `character_save`,        |
|                  `character_import`, `character_generate_motion`, etc.        |
|  - MCP Tool Server: 15 `animforge_character_*` stdio tools                    |
+---------------------------------------+---------------------------------------+
                                        |
     +----------------------------------+----------------------------------+
     |                                  |                                  |
     v                                  v                                  v
+-----------------------+   +-----------------------+   +-----------------------+
|  Rigby2D Core Adapter |   |  AI Auto-Rig Service  |   |   AI Motion Planner   |
| (rigby2d.adapter.ts)  |   | (autorig/segmentation)|   |  (motion_planner.ts)  |
| - Math, Model, Pose   |   | - Zero-dep PNG dec/enc|   | - 11 Parametric       |
| - Forward/Inverse Kin |   | - Silhouette detection|   |   Action Generators   |
| - Spine 3.8/4.2 Interop|  | - Delaunay triangulation|  (idle, walk, wave, etc.)|
+-----------------------+   +-----------------------+   +-----------------------+
```

### 1.2 Preservation of Existing Systems
- **Reference Project:** `projects/proj_1794470257338_1` ("Dancer") remains completely intact and uncorrupted, verified continuously across test runs.
- **Multi-Engine Dispatch:** GiveMotion, Remotion, StretchyStudio, and Rigby2D exist side-by-side with zero cross-contamination.
- **Path Jails:** All character assets and JSON documents are confined strictly to the workspace directory (`characters/` and `projects/`), supporting paths with whitespace (e.g. `/Users/.../animator /AnimForgeLab`).

---

## 2. Integrated Modules & Capabilities

### 2.1 Rigby2D Engine Core (`animforge-core/src/character/engine/rigby/`)
The following pure computational modules were adapted from Rigby2D:

| Module | Source File | Responsibilities |
| :--- | :--- | :--- |
| **Math** | `math.js` | 2D vector operations, $3 \times 3$ affine transform matrices, world matrix decomposition, angle normalization, and bounding boxes. |
| **Model** | `model.js` | Rigby skeleton structure, bone hierarchy with parent-child links, slots, attachments, and deformable mesh definitions. |
| **Pose & IK** | `pose.js` | Local-to-world transform evaluation, forward kinematics (FK), and 2-bone FABRIK inverse kinematics (IK) solver with angle limits. |
| **Animation** | `animation.js` | Keyframe timeline evaluation, hermite/bezier curve interpolation, multi-track bone rotation and translation playback. |
| **Autorig** | `autorig.js` | Procedural bone positioning and bone hierarchy generation from anatomical joints. |
| **Bodyparts** | `bodyparts.js` | Standard humanoid anatomical hierarchy definitions and default joint constraint ranges. |
| **Meshgeom** | `meshgeom.js` | Delaunay triangulation, interior mesh subdivision, boundary vertex generation, and skinning weight computations. |
| **Interop** | `interop.js` | Full bidirectional serialization with Spine 3.8 and Spine 4.2 JSON formats. |
| **Draw** | `draw.js` | Pure Canvas2D rendering functions for bone axes, joints, wireframes, deform meshes, and IK visual indicators. |

### 2.2 Silhouette Segmentation & PNG Decoder (TextRig Integration)
- **Zero-Dependency PNG Codec (`png_decoder.ts`):** Custom pure TypeScript PNG chunk parser and uncompressed/deflate reader (`IHDR`, `IDAT`, `IEND`), enabling RGBA pixel buffer extraction and generation without external C++ binary dependencies or Canvas DOM access.
- **Silhouette Segmentation (`segmentation.ts`):** Analyzes alpha channels of flat 2D character artwork to identify connected components, bounding boxes, centroids, and anatomical landmarks (head, torso, arms, hands, legs, feet).
- **Auto-Rig & Mesh Generation (`autorig.ts`):** Generates a full 21+ bone humanoid skeleton with parent-child hierarchy, Delaunay triangular mesh with interior vertices, and distance-weighted bone influence skinning weights.

### 2.3 AI Motion Planner (`motion_planner.ts`)
Generates production-grade skeletal keyframes across 11 distinct animation actions:
1. **`idle`**: Natural torso bobbing and subtle spine sway ($1.5\text{s}$ seamless loop).
2. **`walk`**: Alternating dual-leg stride, hip counter-rotation, arm swing ($1.2\text{s}$ seamless loop).
3. **`run`**: High-cadence athletic stride, forward spine lean, exaggerated leg lifts ($0.8\text{s}$ loop).
4. **`wave`**: Shoulder elevation, elbow lift, rapid forearm/hand oscillation ($2.0\text{s}$ loop).
5. **`jump`**: Three-phase motion: anticipation squat, vertical apex extension, landing cushion ($1.2\text{s}$).
6. **`dance`**: Rhythmic hip swaying, alternating arm pumps, bouncing motion ($1.6\text{s}$ loop).
7. **`breathing`**: Chest/torso expansion and shoulder relaxation ($2.5\text{s}$ loop).
8. **`blink`**: Eye slot opacity and facial attachment scale pulsing.
9. **`head_turn`**: Subtle neck rotation and head offset easing.
10. **`smile`**: Mouth slot control parameter keyframing.
11. **`hand_gesture`**: Wrist rotation, hand attachment switching, finger poses.

### 2.4 Spine 3.8 / 4.2 Interoperability
The engine provides full round-trip import and export with Esoteric Software Spine format:
- **Export:** Transforms `AnimForgeCharacterV2` skeletons, slots, skins, meshes, IK constraints, and animation clips into standard Spine 3.8/4.2 JSON schemas.
- **Import:** Reads external Spine JSON files, parses bone hierarchies and timelines, and converts them into native AnimForge character documents.

---

## 3. The 15 MCP Character Tools

All 15 character tools are registered over stdio in `animforge-core/src/mcp/character_tools.ts` and available to desktop agents and AI workflows:

1. `animforge_character_list`: Lists all characters in workspace storage with metadata.
2. `animforge_character_import`: Imports PNG or SVG artwork into the workspace.
3. `animforge_character_analyze`: Inspects visual complexity, transparency, and dimensions.
4. `animforge_character_detect_parts`: Segments character artwork into anatomical components.
5. `animforge_character_get_rig`: Retrieves the complete bone hierarchy, slots, and IK definitions.
6. `animforge_character_create_bone`: Adds a new bone to a character's skeleton.
7. `animforge_character_update_bone`: Modifies bone position, length, rotation, or parent.
8. `animforge_character_update_weights`: Adjusts mesh vertex skinning weights.
9. `animforge_character_create_ik`: Configures a 2-bone IK constraint with target.
10. `animforge_character_generate_animation`: Generates skeletal keyframes using the AI motion planner.
11. `animforge_character_update_keyframes`: Edits or injects keyframes into an animation clip.
12. `animforge_character_preview`: Computes evaluated bone poses at a given timestamp.
13. `animforge_character_validate`: Audits bone loops, detached vertices, and constraint bounds.
14. `animforge_character_save`: Persists the character document to disk storage.
15. `animforge_character_export`: Exports the character to Spine 3.8 or 4.2 JSON.

---

## 4. Desktop UI Integration (`CharacterStudio.tsx`)

The Character Studio UI workspace provides an interactive interface matching AnimForge's Charcoal + Warm Amber design system:
- **Dual-Engine Workspace:** Seamlessly hosts both the new **Rigby2D 2D Skeletal Canvas Viewport** and the legacy **StretchyStudio Schematic HUD**.
- **Interactive Canvas Stage:** Provides zoom ($0.25\times - 3\times$), pan, transparency checkerboard, and live layer toggles (Bones, Meshes, Parts, IK Targets, Grid).
- **Outliner & Inspector:** Visual tree hierarchy of bones and slots, with real-time numeric inputs for bone length, angle, coordinates, and parent linkage.
- **Animation Transport:** Scrubbable timeline with play/pause, timecode indicator, FPS selection, and one-click AI motion generation presets.
