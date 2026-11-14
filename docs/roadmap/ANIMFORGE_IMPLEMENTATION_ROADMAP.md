# AnimForge Studio — Implementation Roadmap

**Product Vision:** A simple, approachable native desktop animation studio where anyone can:  
`Import 1 PNG → Auto-Prepare → Choose Animation → Preview → Export Video`  
without needing to understand bones, meshes, weights, IK, or keyframes.

---

## Roadmap Overview & Sequence

```
Sequential Core Track:
[M0: Critical Fixes] ──► [M1: UI Simplification] ──► [M2: PNG Analysis] ──► [M3: Prep Engine]
                                                                                   │
                 ┌─────────────────────────────────────────────────────────────────┴─────────────────┐
                 ▼                                                                                   ▼
    [M4: Quick Animate Mode]                                                            [M5: Smart Rig Mode]
    (Parallel Track A)                                                                  (Parallel Track B)
                 │                                                                                   │
                 └─────────────────────────────────┬─────────────────────────────────────────────────┘
                                                   │
                                                   ▼
                                        [M6: Animation Library]
                                                   │
                                                   ▼
                                        [M7: Transport & Preview]
                                                   │
                                                   ▼
                                        [M8: Real MP4/GIF Export]
                                                   │
                                                   ▼
                                        [M9: Advanced Mode Polish]
                                                   │
                                                   ▼
                                        [M10: Size & Packaging]
```

---

## Milestone Specifications

### Milestone M0: Fix Existing Critical Bugs & Video Wiring
- **Objective:** Replace mock video blob download in Character Studio with real backend GiveMotion/FFmpeg video rendering pipeline.
- **Required Changes:**
  1. Add `character_render_video` IPC handler in `worker.ts` and `worker_bridge.rs`.
  2. Wire `handleStartVideoExport` in `CharacterStudio.tsx` to invoke Tauri `project_render`.
  3. Add FFmpeg palettegen GIF encoding filter in `givemotion.adapter.ts`.
- **Files Affected:**
  - `animforge-desktop/src/workspaces/CharacterStudio.tsx`
  - `animforge-core/src/worker.ts`
  - `animforge-core/adapters/givemotion.adapter.ts`
  - `animforge-desktop/src-tauri/src/worker_bridge.rs`
- **Complexity:** Medium
- **Technical Risks:** Video rendering latency for high frame count.
- **Acceptance Criteria:** Exporting MP4 or GIF from Character Studio produces a verified, playable video file with valid H.264 stream or GIF header.
- **Automated Tests:** Add test in `CharacterStudio.test.tsx` verifying IPC invocation of `project_render` with correct duration and format.

---

### Milestone M1: Simplify Character Studio UI Baseline
- **Objective:** Ensure the default view is 100% focused on the 5-step beginner workflow while keeping the professional 3-panel editor in a clean toggle.
- **Required Changes:**
  1. Default `viewMode` to `'simple'`.
  2. Large centered character viewport canvas auto-fitted to window.
  3. Top bar: Character name, quick switch, Import PNG button, Mode toggle (`⚡ Simple Studio` vs `🛠 Advanced Rig Editor`).
  4. Bottom section: 9 visual animation cards and transport bar.
- **Files Affected:** `animforge-desktop/src/workspaces/CharacterStudio.tsx`, `animforge-desktop/src/styles/`
- **Complexity:** Small
- **Dependencies:** None (Completed in commit `db9238f`).
- **Acceptance Criteria:** All technical inspectors (Bone Inspector, IK list, Part Inspector) hidden by default.

---

### Milestone M2: Reliable Pixel-Level PNG Analysis
- **Objective:** Replace filename-based heuristics with actual alpha channel scanning to detect transparency and silhouette dimensions accurately.
- **Required Changes:**
  1. Use offscreen canvas `getImageData` or core `decodePng` to evaluate exact alpha channel ratio.
  2. Calculate true non-zero bounding box `[minX, maxX, minY, maxY]`.
- **Files Affected:**
  - `animforge-desktop/src/workspaces/CharacterStudio.tsx` (`analyzeCharacterPng`)
  - `animforge-core/src/character/png_decoder.ts`
- **Complexity:** Small
- **Technical Risks:** JSDOM tests do not support full HTML5 Canvas `getImageData` without mock.
- **Acceptance Criteria:** Correctly detects transparency even if file is named `character_opaque.png`.

---

### Milestone M3: Automatic Character Preparation Engine
- **Objective:** Provide the user with an intelligent auto-preparation dialog recommending either **Quick Animate** or **Smart Character Rig**.
- **Required Changes:**
  1. Open Auto-Preparation Report dialog immediately on PNG drop/selection.
  2. Display image dimensions, file size, transparency ratio, and confidence score.
  3. Recommend Quick Animate for opaque art; recommend Smart Rig for transparent art.
- **Files Affected:** `CharacterStudio.tsx` (`autoPrepReport` modal)
- **Complexity:** Small
- **Dependencies:** M2
- **Acceptance Criteria:** User can select either mode with 1 click and confirm.

---

### Milestone M4: Quick Animate Mode (Whole-Image Deformation)
- **Objective:** Allow any flat image (even opaque art, memes, or photos) to animate smoothly without limb slicing.
- **Required Changes:**
  1. Implement single-mesh affine squash-and-stretch deformation matrix.
  2. Apply rhythmic bounce, sway, jump, and breathing animations to the whole image.
  3. Guarantee zero missing parts or background holes.
- **Files Affected:**
  - `animforge-core/adapters/stretchystudio.adapter.ts`
  - `animforge-desktop/src/workspaces/CharacterStudio.tsx`
- **Complexity:** Medium
- **Technical Risks:** Must run at 60 FPS in Canvas 2D without requiring heavy WebGL initialization.
- **Acceptance Criteria:** Opaque PNGs bounce, squash, and hop with zero visual artifacts.

---

### Milestone M5: Smart Character Rig Mode (Cutout Puppet)
- **Objective:** Automatically segment transparent humanoid PNGs and attach to 21-bone Rigby2D skeletal hierarchy with IK.
- **Required Changes:**
  1. Invoke core `autoRigCharacter` via Tauri IPC.
  2. Generate 17 segmented parts and 21 bones with 2-bone IK.
  3. Apply 2px transparent boundary padding to prevent seam tearing on joint rotation.
- **Files Affected:**
  - `animforge-core/src/character/segmentation.ts`
  - `animforge-core/src/character/autorig.ts`
  - `CharacterStudio.tsx`
- **Complexity:** Large
- **Technical Risks:** Overlapping limbs can look detached if joint pivots are off.
- **Acceptance Criteria:** Transparent character articulates limbs independently during Walk and Dance.

---

### Milestone M6: Visual Animation Library
- **Objective:** Provide 9 visual cards covering common character animation needs.
- **Required Changes:**
  1. 9 Cards: **Idle, Walk, Run, Dance, Jump, Wave, Happy, Sad, Surprise**.
  2. Card attributes: Icon emoji, category badge, title, subtitle description.
  3. Motion intensity slider (50% to 150%) and speed multiplier (0.5x, 1x, 1.5x, 2x).
- **Files Affected:** `CharacterStudio.tsx`, `motion_planner.ts`
- **Complexity:** Small (Completed in commit `db9238f`).
- **Acceptance Criteria:** Clicking any card immediately applies motion and begins playback.

---

### Milestone M7: Transport Bar & Auto-Framed Viewport
- **Objective:** Beginner-friendly playback transport and framing controls.
- **Required Changes:**
  1. Scrubber slider with current time and total duration.
  2. Duration adjustment slider (2.0s to 30.0s).
  3. Auto-fit camera framing keeping character centered regardless of aspect ratio.
- **Files Affected:** `CharacterStudio.tsx`
- **Complexity:** Small (Completed in commit `db9238f`).
- **Acceptance Criteria:** Play/Pause, loop toggle, and scrubber respond with instant visual feedback.

---

### Milestone M8: 1-Click Video Export (MP4 & GIF)
- **Objective:** Finalize the video rendering bridge so 1-click export from Character Studio generates real video files.
- **Required Changes:**
  1. Add export format selection (MP4, GIF, WebM).
  2. Add resolution selection (1080p, 720p, 1080x1080 Square).
  3. Stream rendering progress bar (0% to 100%) during headless frame capture.
  4. Automatically download the finished video file.
- **Files Affected:**
  - `CharacterStudio.tsx`
  - `worker.ts`
  - `givemotion.adapter.ts`
- **Complexity:** Medium
- **Dependencies:** M0, M4, M5
- **Acceptance Criteria:** Generates genuine 1080p MP4 and animated GIF viewable in any system player.

---

### Milestone M9: Advanced Editor Seamless Synchronization
- **Objective:** Ensure professional users can seamlessly switch to the Advanced Rig Editor to fine-tune bones, IK, and weights without losing simple animation state.
- **Required Changes:**
  1. Keep advanced DOM mounted offscreen in Simple mode to preserve canvas contexts.
  2. Two-way sync: bone adjustments in Advanced mode immediately update Simple mode previews.
- **Files Affected:** `CharacterStudio.tsx`
- **Complexity:** Small (Completed in commit `db9238f`).
- **Acceptance Criteria:** Switching back and forth between Simple and Advanced maintains 100% state fidelity.

---

### Milestone M10: Performance, Size & Packaging Optimization
- **Objective:** Optimize repository and distribution footprint.
- **Required Changes:**
  1. Remove unbuilt `engines/remotion` monorepo (-893 MB).
  2. Clean development `node_modules` in `engines/stretchystudio` (-394 MB).
  3. Verify release `.dmg` is under 15 MB and cold startup time is under 1.5 seconds.
- **Files Affected:** `engines/`, `package.json`, `tauri.conf.json`
- **Complexity:** Small
- **Dependencies:** All previous milestones.
- **Acceptance Criteria:** Repository size reduced by >1.2 GB; standalone DMG builds cleanly.
