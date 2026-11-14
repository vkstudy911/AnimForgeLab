# AnimForge Studio — Feature Status Matrix & Inventory

**Audit Date:** 2026-11-14  
**Audit Scope:** 22 Core Functional Modules  
**Evaluation Standard:** Verified through actual source inspection, test suite execution, and runtime data flow analysis.

---

## Summary Matrix

| # | Feature / Module | Status | Primary Source Files | Primary Functions / Components |
|---|------------------|--------|----------------------|--------------------------------|
| 1 | Project Manager | **WORKING** | `ProjectManager.tsx`, `database.ts` | `ProjectManager`, `saveProject`, `listProjects` |
| 2 | Character Studio | **WORKING** | `CharacterStudio.tsx`, `rigby2d.adapter.ts` | `CharacterStudio`, `Rigby2DAdapter` |
| 3 | PNG Import | **PARTIALLY WORKING** | `CharacterStudio.tsx`, `png_decoder.ts` | `analyzeCharacterPng`, `decodePng` |
| 4 | Image Segmentation | **PARTIALLY WORKING** | `segmentation.ts`, `CharacterStudio.tsx` | `segmentCharacter`, `getSilhouetteBounds` |
| 5 | Automatic Rigging | **WORKING** | `autorig.ts`, `rigby2d.adapter.ts` | `autoRigCharacter`, `importCharacter` |
| 6 | Bone & Skeleton Editing | **WORKING** | `CharacterStudio.tsx`, `rigby/index.js` | `Skeleton`, `makeBone`, `handleUpdateBone` |
| 7 | Mesh Generation | **WORKING** | `meshgen.js`, `meshgeom.js` | `triangulateMesh`, `generateMeshGeometry` |
| 8 | Weight Painting | **PARTIALLY WORKING** | `autorig.ts`, `meshgen.js` | `calculateBoneWeights` |
| 9 | IK System | **WORKING** | `constraints.js`, `autorig.ts` | `RigbyIKConstraint`, `solveTwoBoneIK` |
| 10 | Animation Generation | **WORKING** | `motion_planner.ts` | `generateAnimationClip` |
| 11 | Animation Library | **WORKING** | `CharacterStudio.tsx`, `motion_planner.ts` | `ANIMATION_CARDS`, `generateDefaultClips` |
| 12 | Timeline & Keyframes | **WORKING** | `MultiTrackTimeline.tsx`, `CharacterStudio.tsx` | `MultiTrackTimeline`, `handleTimelineScrub` |
| 13 | Animation Preview | **WORKING** | `PreviewStage.tsx`, `preview_server.rs` | `PreviewStage`, `PreviewServer` |
| 14 | Video Rendering | **WORKING** | `givemotion.adapter.ts`, `worker.ts` | `renderProject`, `renderFrames` |
| 15 | MP4 Export | **PARTIALLY WORKING** | `RenderWorkspace.tsx`, `CharacterStudio.tsx` | `project_render` vs `handleStartVideoExport` |
| 16 | GIF Export | **NOT IMPLEMENTED** | `CharacterStudio.tsx` | `handleStartVideoExport` (mock blob download) |
| 17 | Storyboard | **WORKING** | `StoryScenesWorkspace.tsx`, `storyDirector.ts` | `StoryScenesWorkspace`, `generateStoryboard` |
| 18 | Asset Library | **WORKING** | `AssetLibrary.tsx`, `workspaceAssets.ts` | `AssetLibrary`, `importAsset` |
| 19 | MCP Server | **WORKING** | `mcp/server.ts`, `mcp/tools.ts` | `AnimForgeMcpServer`, `character_tools.ts` |
| 20 | Save and Reopen | **WORKING** | `StudioContext.tsx`, `database.ts` | `saveDraft`, `openProject`, `reconcileDiskProjects` |
| 21 | Native Desktop Launcher | **WORKING** | `Start-AnimForge.command`, `src-tauri/src/main.rs` | Tauri 2 WebKit WebView, `run()` |
| 22 | Application Packaging | **WORKING** | `tauri.conf.json`, `bundle_dmg.sh` | DMG (3.2MB) and `.app` (11MB) |

---

## Detailed Module Evaluations

### 1. Project Manager
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src/workspaces/ProjectManager.tsx`, `animforge-core/src/database.ts`
- **Main Components/Functions:** `ProjectManager`, `AnimForgeDatabase.listProjects()`, `AnimForgeDatabase.saveProject()`, `AnimForgeDatabase.deleteProject()`.
- **Implementation:** React state displays projects retrieved from SQLite via Tauri IPC `project_list`. Supports inline renaming, metadata editing (resolution, FPS, preferred engine), duplication, and deletion with confirmation modal.
- **Dependencies:** `StudioContext.tsx`, `worker_bridge.rs`, `database.ts`.
- **Test Coverage:** `ManagementWorkspaces.test.tsx` (passes duplicate, rename, delete, reveal).
- **Limitations:** Large project lists do not have pagination or virtualization.

---

### 2. Character Studio
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src/workspaces/CharacterStudio.tsx`, `animforge-core/adapters/rigby2d.adapter.ts`
- **Main Components/Functions:** `CharacterStudio`, `SimpleStudioWorkspace`, `AdvancedStudioWorkspace`.
- **Implementation:** Dual-mode workspace. Default Simple mode provides 1-click preset motions, auto-framed canvas preview, and duration/speed controls. Advanced mode mounts full 3-panel bone hierarchy, IK list, part inspector, and timeline.
- **Dependencies:** `rigby2d.adapter.ts`, `StudioContext.tsx`, `Icons.tsx`.
- **Test Coverage:** `CharacterStudio.test.tsx` (16/16 tests pass).
- **Limitations:** Character canvas in Simple mode uses 2D vector wireframe/bone overlay when custom image slices are not available.

---

### 3. PNG Import
- **Status:** **PARTIALLY WORKING**
- **Source Files:** `animforge-desktop/src/workspaces/CharacterStudio.tsx` (`analyzeCharacterPng`), `animforge-core/src/character/png_decoder.ts` (`decodePng`)
- **Main Components/Functions:** `analyzeCharacterPng()`, `handlePngImport()`, `decodePng()`.
- **Implementation:** Frontend uses heuristic analysis (filename detection and dimensional ratio) for instant responsiveness without server round-trip. Backend has complete pure-TypeScript `decodePng` (zlib inflate, RGBA extraction, alpha channel extraction).
- **Dependencies:** Node `zlib` (backend).
- **Test Coverage:** `CharacterStudio.test.tsx` (transparent & opaque PNG tests pass), `png_decoder.test.ts` (passes).
- **Limitations:** The frontend analysis does not yet feed the actual binary pixel buffer to `decodePng` in core, relying on default humanoid aspect ratio heuristics.

---

### 4. Image Segmentation
- **Status:** **PARTIALLY WORKING**
- **Source Files:** `animforge-core/src/character/segmentation.ts`
- **Main Components/Functions:** `segmentCharacter()`, `getSilhouetteBounds()`, `segmentFlatSilhouette()`, `segmentLayeredArtwork()`.
- **Implementation:** Real alpha threshold scanning calculates tight bounding boxes. Decomposes humanoid silhouettes into 17 body parts (head, eyes, mouth, torso, pelvis, upper arms, forearms, hands, thighs, shins, feet).
- **Dependencies:** `schemas/character.rigby.ts`.
- **Test Coverage:** `character.vertical_slice.test.ts`, `character.autorig.test.ts`.
- **Limitations:** Uses rule-based bounding box slicing. Does not perform semantic AI segmentation (SAM/Mask-RCNN) or contour polygon tracing on complex non-humanoid creatures.

---

### 5. Automatic Rigging
- **Status:** **WORKING**
- **Source Files:** `animforge-core/src/character/autorig.ts`, `animforge-core/adapters/rigby2d.adapter.ts`
- **Main Components/Functions:** `autoRigCharacter()`, `Rigby2DAdapter.importCharacter()`.
- **Implementation:** Generates a 21-bone hierarchy rooted at character base (`root` -> `hip` -> `chest` -> `neck` -> `head`, plus bilateral arm and leg chains). Establishes IK targets, attachments, slots, and default animation clips.
- **Dependencies:** `rigby/index.js`, `schemas/character.rigby.ts`.
- **Test Coverage:** `character.autorig.test.ts`, `character.vertical_slice.test.ts`.
- **Limitations:** Hardcoded for bipedal humanoid skeletons; quadrupeds or props require manual bone creation in Advanced mode.

---

### 6. Bone & Skeleton Editing
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src/workspaces/CharacterStudio.tsx`, `animforge-core/src/character/engine/rigby/model.js`
- **Main Components/Functions:** `Skeleton`, `makeBone`, `handleUpdateBone`, `handleAddBone`, `handleDeleteBone`.
- **Implementation:** Interactive bone tree hierarchy with parent-child linkage, length, setup transform (x, y, rotation, scale), color coding, and selection synchronization with viewport.
- **Dependencies:** React state, Rigby2D core data structures.
- **Test Coverage:** `CharacterStudio.test.tsx` (navigates bone hierarchy, adds bone, updates inspector).
- **Limitations:** Manual bone parenting drag-and-drop in tree UI is not yet implemented; parent is selected via dropdown.

---

### 7. Mesh Generation
- **Status:** **WORKING**
- **Source Files:** `animforge-core/src/character/engine/rigby/meshgen.js`, `meshgeom.js`
- **Main Components/Functions:** `triangulateMesh()`, `generateMeshGeometry()`.
- **Implementation:** Computes 2D Delaunay-style planar triangulation from polygon boundary points and interior grid vertices. Generates index buffers, UV mappings, and vertex arrays.
- **Dependencies:** `animforge-core/src/character/engine/rigby/`.
- **Test Coverage:** `rigby2d.adapter.test.ts`, `character.vertical_slice.test.ts`.
- **Limitations:** Meshes are generated at import time; interactive vertex addition/removal tool is only available in external StretchyStudio engine.

---

### 8. Weight Painting
- **Status:** **PARTIALLY WORKING**
- **Source Files:** `animforge-core/src/character/autorig.ts`, `animforge-core/src/character/engine/rigby/meshgen.js`
- **Main Components/Functions:** `calculateBoneWeights()`.
- **Implementation:** Distance-based automatic skinning assigning vertex influence to closest 1-2 bones with distance falloff.
- **Dependencies:** Rigby2D core.
- **Test Coverage:** `character.vertical_slice.test.ts`.
- **Limitations:** Interactive brush-based weight painting in the desktop viewport is NOT implemented. Weights can only be recalculated automatically or adjusted numerically.

---

### 9. IK System (Inverse Kinematics)
- **Status:** **WORKING**
- **Source Files:** `animforge-core/src/character/engine/rigby/constraints.js`, `autorig.ts`
- **Main Components/Functions:** `solveTwoBoneIK()`, `RigbyIKConstraint`.
- **Implementation:** 2-bone analytic IK solver with bend direction (positive/negative) and blend mix factor (0.0 to 1.0). Configured automatically for left arm, right arm, left leg, right leg.
- **Dependencies:** Rigby2D core constraint engine.
- **Test Coverage:** `character.vertical_slice.test.ts`, `rigby2d.adapter.test.ts`.
- **Limitations:** Multi-bone (>2) CCD/FABRIK spine chains are not active; limited to 2-bone limb pairs.

---

### 10. Animation Generation
- **Status:** **WORKING**
- **Source Files:** `animforge-core/src/character/motion_planner.ts`
- **Main Components/Functions:** `generateAnimationClip()`.
- **Implementation:** Procedural keyframe generator for 11 motion actions: `idle`, `walk`, `run`, `wave`, `jump`, `dance`, `breathing`, `blink`, `head_turn`, `smile`, `hand_gesture`. Evaluates rotation, translation, and scale tracks with smooth sinusoidal/cubic curves.
- **Dependencies:** `schemas/character.rigby.ts`.
- **Test Coverage:** `character.vertical_slice.test.ts`, `motion_planner` tests.
- **Limitations:** Purely procedural keyframe generator; does not intake video pose estimation or natural language generative diffusion motions.

---

### 11. Animation Library
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src/workspaces/CharacterStudio.tsx`, `animforge-core/src/character/motion_planner.ts`
- **Main Components/Functions:** `ANIMATION_CARDS`, `generateDefaultClips()`, `POSE_PRESETS`, `EXPRESSION_PRESETS`.
- **Implementation:** 9 visual preset cards (Idle, Walk, Run, Dance, Jump, Wave, Happy, Sad, Surprise) with category tags, descriptions, and 1-click preview triggers.
- **Dependencies:** React state, `generateAnimationClip`.
- **Test Coverage:** `CharacterStudio.test.tsx` (tests card rendering, selection, and instant playback).
- **Limitations:** User cannot currently save a custom keyframed motion as a reusable card preset in the library.

---

### 12. Timeline & Keyframes
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src/components/timeline/MultiTrackTimeline.tsx`, `CharacterStudio.tsx`
- **Main Components/Functions:** `MultiTrackTimeline`, `handleTimelineScrub`, `handlePlayPause`.
- **Implementation:** Multi-track visual timeline supporting scene duration, playhead scrubber, FPS control, zoom levels, track selection, and action blocks. Character Studio has integrated transport scrubber and duration sliders.
- **Dependencies:** CSS grid, React pointer events.
- **Test Coverage:** `AnimationEditor.test.tsx`, `CharacterStudio.test.tsx`.
- **Limitations:** Curve/graph editor for bezier easing interpolation is not exposed in the simple UI.

---

### 13. Animation Preview
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src/components/PreviewStage.tsx`, `animforge-desktop/src-tauri/src/preview_server.rs`, `CharacterStudio.tsx`
- **Main Components/Functions:** `PreviewStage`, `PreviewServer`, Canvas 2D render loop.
- **Implementation:** 
  1. *Project Preview:* `PreviewStage` loads `http://127.0.0.1:<port>/projects/<id>/bundle/index.html` via loopback HTTP server with zero cross-origin issues.
  2. *Character Studio Preview:* 60 FPS `requestAnimationFrame` 2D HTML5 canvas loop rendering auto-framed bone hierarchy and character parts in real time.
- **Dependencies:** `preview_server.rs`, HTML5 Canvas.
- **Test Coverage:** `PreviewStage.test.tsx`, `CharacterStudio.test.tsx`.
- **Limitations:** WebGL2 mesh deformation is currently bypassed in favor of Canvas 2D affine transforms for lightweight performance.

---

### 14. Video Rendering
- **Status:** **WORKING**
- **Source Files:** `animforge-core/adapters/givemotion.adapter.ts`, `animforge-core/src/worker.ts`
- **Main Components/Functions:** `renderProject()`, `compileProjectHtml()`, `renderFrames()`.
- **Implementation:** Compiles project scenes into standalone HTML/CSS bundle, launches headless Chromium to capture frame-by-frame PNG chunks, and pipes them to FFmpeg.
- **Dependencies:** Chrome/Chromium, FFmpeg, Node.js child process runner.
- **Test Coverage:** `givemotion.adapter.test.ts`, `pipeline.test.ts`.
- **Limitations:** Requires external Google Chrome and FFmpeg installed on host machine.

---

### 15. MP4 Export
- **Status:** **PARTIALLY WORKING**
- **Source Files:** `animforge-desktop/src/workspaces/RenderWorkspace.tsx`, `animforge-desktop/src/workspaces/CharacterStudio.tsx`
- **Main Components/Functions:** `project_render` (Tauri IPC), `handleStartVideoExport`.
- **Implementation:**
  - *Full Projects:* Fully working via `RenderWorkspace.tsx` and `project_render` IPC. Produces verified H.264 MP4 with `ffprobe` metadata validation.
  - *Character Studio:* Partially working / Mock. `handleStartVideoExport` creates a dummy text blob download instead of calling backend `project_render`.
- **Dependencies:** FFmpeg `libx264`.
- **Test Coverage:** `critical_repair_workflows.test.ts` (verifies full pipeline).
- **Limitations:** Character Studio 1-click export does not yet link to the GiveMotion/FFmpeg render worker.

---

### 16. GIF Export
- **Status:** **NOT IMPLEMENTED**
- **Source Files:** `animforge-desktop/src/workspaces/CharacterStudio.tsx`
- **Main Components/Functions:** `handleStartVideoExport`
- **Implementation:** UI option exists in Export Video dialog, but triggers a dummy text blob download. Neither `gifski` nor FFmpeg palettegen GIF encoding is wired up.
- **Dependencies:** None currently wired.
- **Test Coverage:** UI dialog option tested in `CharacterStudio.test.tsx`.
- **Limitations:** Completely missing backend implementation.

---

### 17. Storyboard
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src/workspaces/StoryScenesWorkspace.tsx`, `animforge-core/agents/storyDirector.ts`
- **Main Components/Functions:** `StoryScenesWorkspace`, `StoryDirectorAgent.planStoryboard()`.
- **Implementation:** Interactive storyboard beat editor with thumbnail previews, beat reordering, camera cues, and character casting.
- **Dependencies:** `schemas/storyboard.ts`, `StudioContext.tsx`.
- **Test Coverage:** `StoryScenesAndCharacterStudio.test.tsx`.
- **Limitations:** Automated image generation for storyboard frames requires external image generation plugin/API.

---

### 18. Asset Library
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src/workspaces/AssetLibrary.tsx`, `animforge-core/src/assets/workspaceAssets.ts`
- **Main Components/Functions:** `AssetLibrary`, `importAsset()`, `resolveProjectAssetDestPath()`.
- **Implementation:** Workspace-wide and project-specific asset repository. Handles file upload, conflict overwrite confirmation, asset type inference, and disk persistence under `assets/` and `projects/<id>/assets/`.
- **Dependencies:** Tauri IPC `project_assets_list`, `project_import_asset`.
- **Test Coverage:** `SecondaryWorkspaces.test.tsx`.
- **Limitations:** Audio waveform preview is not rendered for sound assets.

---

### 19. MCP Server
- **Status:** **WORKING**
- **Source Files:** `animforge-core/src/mcp/server.ts`, `tools.ts`, `character_tools.ts`
- **Main Components/Functions:** `AnimForgeMcpServer`, 31 MCP tool handlers.
- **Implementation:** Standard Model Context Protocol server over `stdio`. Provides full bidirectional manipulation of projects, scenes, assets, characters, bones, and rendering.
- **Dependencies:** `@modelcontextprotocol/sdk`, `zod`.
- **Test Coverage:** `mcp.server.test.ts`, `character_mcp.test.ts`, `integration_mcp_gui.test.ts`.
- **Limitations:** Runs over stdio only; SSE (Server-Sent Events) HTTP transport is not enabled.

---

### 20. Save and Reopen
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src/context/StudioContext.tsx`, `animforge-core/src/database.ts`
- **Main Components/Functions:** `saveDraft()`, `openProject()`, `reconcileDiskProjects()`.
- **Implementation:** Clean dirty tracking, explicit save, automatic manifest write to disk (`project.animforge.json`), and instant SQLite sync. Reopening projects restores all scene tracks, characters, and settings.
- **Dependencies:** `database.ts`, `worker_bridge.rs`.
- **Test Coverage:** `critical_repair_workflows.test.ts`, `ManagementWorkspaces.test.tsx`.
- **Limitations:** Undo/redo history is limited to in-memory state; no persistent event-sourcing journal.

---

### 21. Native Desktop Launcher
- **Status:** **WORKING**
- **Source Files:** `Start-AnimForge.command`, `animforge-desktop/src-tauri/src/main.rs`, `dev.sh`
- **Main Components/Functions:** macOS Terminal launch command, Tauri 2 application runner.
- **Implementation:** Verified native macOS desktop application running inside native Cocoa WebKit WebView window. Binds to `127.0.0.1:1420` and launches native desktop window (NOT external Safari/Chrome browser).
- **Dependencies:** macOS WebKit, Tauri 2.
- **Test Coverage:** `NATIVE_DESKTOP_LAUNCH_REPORT.md` (verified in commit `13573a2`).
- **Limitations:** Requires initial `cargo build` on new developer machines.

---

### 22. Application Packaging
- **Status:** **WORKING**
- **Source Files:** `animforge-desktop/src-tauri/tauri.conf.json`, `target/release/bundle/dmg/bundle_dmg.sh`
- **Main Components/Functions:** `cargo tauri build`, macOS DMG bundler.
- **Implementation:** Produces verified signed native release artifacts:
  - macOS App Bundle: `AnimForge Studio.app` (**11 MB**)
  - macOS Disk Image: `AnimForge Studio_0.1.0_aarch64.dmg` (**3.2 MB**)
- **Dependencies:** `tauri-cli` v2.
- **Test Coverage:** Production build verified; bundle binaries exist on disk.
- **Limitations:** Code signing uses ad-hoc local certificate; Apple Developer ID signing is required for Gatekeeper distribution.
