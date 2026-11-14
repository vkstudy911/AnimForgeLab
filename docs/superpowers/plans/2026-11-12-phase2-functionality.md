# AnimForge Studio — Phase 2 Functionality Implementation Plan (M2-B through M2-J)

**Audit Baseline:** [FUNCTIONALITY_AUDIT.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/FUNCTIONALITY_AUDIT.md)  
**Target Repository:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` (preserve trailing ASCII space in `animator `)  
**Methodology:** Superpowers TDD (`test-driven-development`), `writing-plans`, `verification-before-completion`, and Ponytail (`full` mode: reuse existing `animforge-core` / `mcp/tools.ts` helpers, smallest complete diffs, zero unrequested abstractions).

---

## 1. Execution Phases & Subagent Ownership

> [!IMPORTANT]
> To avoid merge collisions on shared hub files (`types.ts`, `useStudio.ts`, `StudioContext.tsx`, `worker.ts`, `database.ts`, `src-tauri/src/lib.rs`, `worker_bridge.rs`), **Phase A (Integration Foundation)** lands backend/shared context primitives first. Then **Phase B (5 Parallel Domain Agents)** executes concurrently on strictly disjoint UI/module files. Finally, **Phase C (Integration & Verification)** wires global chrome, resolves cross-workspace flows, and runs full test suites + live native Tauri / `ffprobe` smoke verification.

### Subagent Ownership Matrix (Zero File Overlap During Parallel Phase B)

| Agent | Exclusive Owned Files (Phase B) | Milestones Covered |
| :--- | :--- | :--- |
| **1. Project & Story Agent** | `animforge-desktop/src/workspaces/ProjectManager.tsx`, `animforge-desktop/src/workspaces/StoryScenesWorkspace.tsx`, `animforge-desktop/src/components/layout/NewProjectDialog.tsx`, `animforge-desktop/src/workspaces/ManagementWorkspaces.test.tsx` (Project/Story blocks) | `M2-B` (UI), `M2-E` |
| **2. Animation Studio Agent** | `animforge-desktop/src/workspaces/AnimationEditor.tsx`, `animforge-desktop/src/components/PreviewStage.tsx`, `animforge-desktop/src/components/timeline/SceneOutliner.tsx`, `animforge-desktop/src/components/timeline/CueInspector.tsx`, `animforge-desktop/src/components/timeline/MultiTrackTimeline.tsx`, `animforge-desktop/src/workspaces/AnimationEditor.test.tsx`, `animforge-desktop/src/components/PreviewStage.test.tsx` | `M2-C` |
| **3. Render & Diagnostics Agent** | `animforge-desktop/src/workspaces/RenderWorkspace.tsx`, `animforge-desktop/src/workspaces/DiagnosticsWorkspace.tsx`, `animforge-desktop/src/components/DoctorBar.tsx`, `animforge-desktop/src-tauri/src/doctor.rs`, `animforge-desktop/src/components/DoctorBar.test.tsx` | `M2-F` (UI), `M2-H` |
| **4. Creative Workspaces Agent** | `animforge-desktop/src/workspaces/CharacterStudio.tsx`, `animforge-desktop/src/workspaces/AssetLibrary.tsx` | `M2-G` |
| **5. System & Agent Center Agent** | `animforge-desktop/src/workspaces/SettingsWorkspace.tsx`, `animforge-desktop/src/workspaces/AgentCenterWorkspace.tsx`, `animforge-desktop/src/hooks/useThemePreference.ts`, `animforge-desktop/src/styles/base.css`, `animforge-desktop/src/styles/shell.css`, `animforge-desktop/src/workspaces/SecondaryWorkspaces.test.tsx`, `animforge-desktop/src/hooks/useThemePreference.test.ts` | `M2-I`, `M2-J` |
| **6. Integration Agent** | `animforge-desktop/src/types.ts`, `animforge-desktop/src/hooks/useStudio.ts`, `animforge-desktop/src/context/StudioContext.tsx`, `animforge-desktop/src/components/layout/StudioHeader.tsx`, `animforge-desktop/src/components/layout/CommandPaletteDialog.tsx`, `animforge-desktop/src/App.tsx`, `animforge-desktop/src/App.test.tsx`, `animforge-desktop/src/hooks/useStudio.test.ts`, `animforge-core/src/{worker,database}.ts`, `animforge-core/adapters/givemotion.compiler.ts`, `animforge-desktop/src-tauri/src/{lib,worker_bridge,preview_server}.rs`, `animforge-desktop/src-tauri/Cargo.toml`, `animforge-desktop/src-tauri/capabilities/default.json` | Foundation (`M2-B`–`M2-J` shared contracts), `M2-D`, Final Integration |

### Shared-File Conflict Analysis
- **Shared Core Hub (`worker.ts`, `database.ts`, `givemotion.compiler.ts`):** Owned exclusively by Integration Agent in Phase A before UI agents reference new IPC return types. All new Worker v1 JSON-lines methods must include `assertSafeId` / `resolveWorkspacePath` checks.
- **Shared State Hub (`types.ts`, `useStudio.ts`, `StudioContext.tsx`):** Integration Agent defines typed props/actions (`undo`, `redo`, `canUndo`, `canRedo`, `deleteProject`, `duplicateProject`, `importProject`, `revealPath`, `pickFiles`, `listWorkspaceAssets`, `importAssetFile`, `listRenderJobs`, `probePreviewServer`, `runDeterministicAgent`, `getConfig`, `saveConfig`) in Phase A with clean TypeScript signatures so Phases B agents only consume context hooks cleanly.
- **Shared CSS (`shell.css`, `base.css`):** Agent 5 owns `[data-density="compact"]` rules & stage zoom overflow fix coordination (or Integration Agent checks final stylesheet merges before build).

---

## 2. Detailed Milestone Task Breakdown (`M2-B` through `M2-J`)

### M2-B — Project Lifecycle, Manifest Preservation & Native File/Finder Integration
- **B1 — Full Manifest Persistence & SQLite Extensions (`animforge-core/src/worker.ts`, `database.ts`)**
  - *Problem:* `DiskManifestSchema` currently drops `assets` and `storyboard`; `database.ts` lacks `deleteProject()` and `listRenderJobs()`.
  - *Implementation:* Extend `DiskManifestSchema` to optionally persist `storyboard` and `assets` alongside `{ config, characters, scenes }` cleanly (backward-compatible with existing files). Add `deleteProject(projectId)` (transactional delete of `render_jobs` + `projects`) and `listRenderJobs(projectId?)` to `database.ts`. Add `delete_project`, `duplicate_project`, `import_project`, and `list_render_jobs` to `worker.ts` inside `resolveProjectDir` / `assertSafeId` jail.
  - *Test:* `animforge-core/test/worker.test.ts` verifying round-trip save preserves `assets`+`storyboard`, `delete_project` removes DB row & project dir only inside `projects/<id>`, `duplicate_project` clones ID cleanly, and traversal IDs fail with `INVALID_ID`.
- **B2 — Tauri IPC Commands, Native File Picker / Save Dialog & Safe Reveal (`src-tauri/Cargo.toml`, `capabilities/default.json`, `lib.rs`, `worker_bridge.rs`)**
  - *Implementation:* Add typed commands `project_delete`, `project_duplicate`, `project_import`, `project_list_render_jobs`. Add macOS safe `reveal_in_workspace` (strictly jailed within canonicalized `workspaceRoot` — rejects paths outside workspace or escaping via symlinks) using `open -R` / Finder reveal without shell interpolation (`Command::new("open").arg("-R").arg(&canonical)`). For native file pick/save, evaluate minimal `tauri-plugin-dialog` OR `rfd` / safe single-purpose Tauri command (Ponytail check: use Tauri's sanctioned `tauri-plugin-dialog` capability scoped cleanly, avoiding shell `osascript`).
  - *Test:* `worker_bridge.rs` test for `delete_project` / `duplicate_project` / `list_render_jobs` + unit test for canonical workspace-jailed path validation on `reveal_in_workspace` including trailing space paths.
- **B3 — Frontend `Projects` Actions & Post-Create Project Metadata (`ProjectManager.tsx`, `useStudio.ts`)**
  - *Implementation:* Enable `Duplicate` and confirmed `Delete` buttons in `ProjectManager.tsx` (with confirmation prompt protecting dirty active project), add `Import Project (.animforge.json)` button, native `Export JSON` save flow with fallback, `Reveal Folder`, and allow editing active project `width`/`height`/`fps` in Studio Info or Project details via `saveDraft`.
  - *Test:* `ManagementWorkspaces.test.tsx` testing Duplicate, confirmed Delete, Import JSON validation, and active-project switch when deleting active project.

### M2-C — Animation Studio Direct Manipulation, Undo/Redo & Transport Shortcuts
- **C1 — Undo/Redo History Stack & Global Playback Shortcuts (`StudioContext.tsx`, `StudioHeader.tsx`)**
  - *Implementation:* Add bounded undo/redo stack (`past: ProjectDetail[]`, `future: ProjectDetail[]`, cap ~50 snapshots) in `StudioContext.tsx` clearing on `openProject`/`createProject`/`discardDraft`. Bind `Cmd/Ctrl+Z` (undo), `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` (redo), `Space` (play/pause toggle when outside `input`/`textarea`/`select`/`[contenteditable]` and no `<dialog open>`), and `ArrowLeft`/`ArrowRight` (1-frame step when outside inputs/dialogs and focus is not on timeline/slider already handling arrows). Add Undo/Redo buttons in `StudioHeader.tsx`.
  - *Test:* `App.test.tsx` verifying `Cmd+Z` / `Cmd+Shift+Z` undo/redo across scene/cue edits and verifying `Space` toggles playback outside inputs while typing spaces normally inside `<input>`/`<textarea>`.
- **C2 — Auto-Save Dirty Draft Guard on Preview/Render & `PreviewStage` Complete Transport (`useStudio.ts`, `PreviewStage.tsx`, `shell.css`)**
  - *Implementation:* When `isDirty` is true and user triggers `previewProject()` or `renderProject()`, automatically invoke `saveDraft()` first (aborting preview/render if save fails so stale disk state is never rendered). Fix `.stage-viewport-matte` `overflow: auto` so `150%` zoom pans cleanly instead of clipping. Add Stop (seek 0 + pause), `-1 Frame`, `+1 Frame`, Mute toggle, Playback Rate (`0.5x`, `1x`, `2x`), and Loop toggle wired cleanly to `<gm-player>` and `<video>`.
  - *Test:* `PreviewStage.test.tsx` & `useStudio.test.ts` testing auto-save-before-preview/render, zoom overflow, frame step +/-1/FPS, mute/rate/loop attributes.
- **C3 — SceneOutliner CRUD & Playhead Sync (`SceneOutliner.tsx`)**
  - *Implementation:* Clicking a scene card seeks `playheadTime` to that scene's cumulative timeline start time (`sum(prev durations)`). Add Duplicate Scene, Delete Scene (guarded when 1 scene remains or clean empty state), and Double-click / Inline Rename. Fix Character & Asset selection clicks to display dedicated Inspector summaries in `CueInspector.tsx`.
  - *Test:* `AnimationEditor.test.tsx` testing scene delete, duplicate, inline rename, and playhead jump on scene switch.
- **C4 — CueInspector Complete Cue & Selection Editors (`CueInspector.tsx`)**
  - *Implementation:* Implement Inspector views for `selection.kind === 'character'` (show character quick-actions + scene presence toggle) and `'asset'` (show asset metadata, preview URI, & quick-assign buttons). Enhance Action editor (reassign `characterId`, edit expression/parameters JSON/smile toggle), Camera editor (add `+ Add Camera Cue` button, edit `startX/startY/endX/endY`, `easing` on any selected camera cue), Audio editor (swap `assetId` across audio assets).
  - *Test:* `AnimationEditor.test.tsx` verifying multi-camera add/edit, character/asset inspector rendering, and parameter editing persistence.
- **C5 — MultiTrackTimeline Drag Move, Resize Handles, Snap & Delete (`MultiTrackTimeline.tsx`)**
  - *Implementation:* Add pointer-drag horizontal move & right-edge resize (duration trim) handles on Action, Camera, Audio, and Scene clips (with grid/playhead snapping toggle), Drag-scrub on ruler, `Split at Playhead` button (splits action/audio/scene cleanly), `Delete`/`Backspace` shortcut on focused selected clip, and track Mute/Lock state (audio mute syncs with stage preview / compiler track filter when muted).
  - *Test:* `AnimationEditor.test.tsx` verifying clip pointer drag delta updates `startTime`, resize handle updates `duration`, `Delete` removes selected clip, and Undo restores it.

### M2-D — GiveMotion Compiler Fidelity & Real Multi-Engine Worker Routing
- **D1 — Background Images, Audio Cues & Action Parameters in `givemotion.compiler.ts`**
  - *Implementation:* Resolve `scene.backgroundAssetId` against `project.assets` cleanly (strictly validated workspace-relative URLs served via `PreviewServer` / local asset copy into bundle so headless Chromium/GiveMotion loads background imagery deterministically without network access). Compile `scene.timeline.audioTracks` into HTML `<audio>` / synchronized WebAudio or FFmpeg audio-mix inputs respected during bundle playback and MP4 export (`volume`, `startTime`, `loop`, excluding muted tracks). Honor `characterActions.parameters` (pose/expression presets).
  - *Test:* `animforge-core/test/givemotion.compiler.test.ts` verifying background URL markup/asset copy, audio cue compilation, and path-traversal rejection on malformed asset URIs.
- **D2 — Route `preferredEngine` (`remotion`, `stretchystudio`) in `animforge-core/src/worker.ts`**
  - *Implementation:* Reuse existing `RemotionAdapter` and `StretchyStudioAdapter` inside `worker.ts` (`preview_project` & `render_project` inspect `project.preferredEngine`). When Remotion/StretchyStudio engine binaries or dependencies are unavailable at runtime, return a structured, honest error code (`ENGINE_UNAVAILABLE` with doctor remediation details) instead of silently faking GiveMotion output—and succeed when the adapter's real render/preview command passes.
  - *Test:* `animforge-core/test/worker.test.ts` testing engine dispatch for `givemotion`, `remotion`, and `stretchystudio` + honest failure propagation when optional CLI dependencies are missing.

### M2-E — Story & Scenes Editable Storyboard & Deterministic Agents (`StoryScenesWorkspace.tsx`, `worker.ts`, `lib.rs`)
- **E1 — Editable Storyboard, Beats & Scene Actions**
  - *Implementation:* Make Storyboard `logline`, `artStyle`, and individual `StoryBeat` cards editable in `StoryScenesWorkspace.tsx` (`Save Story` persists via `project_save`). Add Delete Scene, Duplicate Scene, and "Create Scene from Beat" button on each beat card.
- **E2 — Deterministic Regenerate Storyboard / Plan Scenes RPC**
  - *Implementation:* Expose `regenerate_storyboard` and `regenerate_scenes` in `worker.ts` + `lib.rs` calling existing `StoryDirectorAgent` + `ScenePlannerAgent`. UI clearly labels this action **"Regenerate Deterministic Plan (Template)"** with confirm prompt if existing scenes will be replaced—never pretending to call an external LLM.
  - *Test:* `ManagementWorkspaces.test.tsx` + `worker.test.ts`.

### M2-F — Render Config Overrides, SQLite History, Finder Reveal & `ffprobe` Validation
- **F1 — `ffprobe` Verification on UI Renders (`worker.ts`)**
  - *Implementation:* Extract `probeVideo` helper from `animforge-core/src/mcp/tools.ts` into a shared utility (`animforge-core/src/media/ffprobe.ts`) and run it at the end of `worker.ts` `render_project`, attaching verified video metadata (`codec`, `width`, `height`, `fps`, `durationSeconds`) to the returned result. Fail or mark `RenderJob` failed if `ffprobe` detects corrupt/empty video stream.
- **F2 — Persistent `render_jobs` History & Interactive Config (`RenderWorkspace.tsx`, `lib.rs`, `worker_bridge.rs`)**
  - *Implementation:* Load persistent job history from SQLite (`project_list_render_jobs`), support Retry on failed jobs, and add `Reveal MP4 in Finder` (reusing safe workspace-jailed `reveal_in_workspace`). Convert `Output Config` `<dl>` into interactive override inputs (`width`, `height`, `fps`, preset quality/CRF or format notes) synced/saved cleanly before rendering.
  - *Test:* `worker.test.ts`, `ManagementWorkspaces.test.tsx`, plus real MP4 `ffprobe` integration check.

### M2-G — Character Rig Interactivity & Workspace Asset Pipeline Reuse
- **G1 — Interactive Pivot Drag & Character JSON Import/Export (`CharacterStudio.tsx`)**
  - *Implementation:* Support SVG pointer drag (`pointerdown`/`pointermove`/`pointerup` normalized to viewBox 240x240 bounds) updating `selectedPart.pivot` live with Undo support. Add `Duplicate Character`, `Export Character JSON`, `Import Character JSON` (validated schema check). Keep StretchyStudio bridge honest: export valid rig schema compatible with `StretchyStudioAdapter` or clearly show what external export covers.
- **G2 — Reuse MCP `assets_list` & `asset_import` in Desktop (`worker.ts`, `lib.rs`, `AssetLibrary.tsx`)**
  - *Implementation:* Move/share `listSafeFilesRecursive` & `importAsset` from `animforge-core/src/mcp/tools.ts` + `mcp/validation.ts` into `animforge-core/src/assets/workspaceAssets.ts` so both MCP server and Worker v1 reuse identical path-jailed file scanning/copying! Expose `assets_list` and `asset_import` in `lib.rs` & `AssetLibrary.tsx`: add "Scan Workspace Assets", native "Import File...", "Reveal Asset", inline Rename/Category edit, broken-file status indicator when file isn't found on disk, and fix `handleRemoveAsset` to clean up dangling scene `backgroundAssetId`/`audioTracks`. Also eliminate `pendingSaveMsgRef` race by invoking explicit `saveDraft` with merged next-project payload.
  - *Test:* `SecondaryWorkspaces.test.tsx`, `worker.test.ts`, `mcp.validation.test.ts`.

### M2-H — Live PreviewServer Probe & Honest External Tool / Disk Checks (`doctor.rs`, `DiagnosticsWorkspace.tsx`, `DoctorBar.tsx`)
- **H1 — Active `PreviewServer` Loopback Probe (`preview_server.rs` / `lib.rs` & `DiagnosticsWorkspace.tsx`)**
  - *Implementation:* Add `probe_preview_server` Tauri command performing an actual loopback TCP/HTTP `HEAD` check (e.g., `/assets/...` or `OPTIONS`/status check — wait: `preview_server.rs` rejects `/` with 403, so an HTTP response from loopback listener OR adding a dedicated lightweight `/__health` loopback-only read-only endpoint strictly validated by `Host` header proves live responsiveness!). Report live `Reachable (latency ms)` vs `Offline` honestly in `DiagnosticsWorkspace.tsx`.
- **H2 — Honest Optional Creative Tools & Disk Checks (`doctor.rs`)**
  - *Implementation:* Extend `doctor.rs` to probe optional external tools (`blender`, `opentoonz`, `krita`) via `resolve_binary` / standard macOS `/Applications/*.app` paths—reporting present versions or honest `WARN` ("Optional external app not installed — built-in GiveMotion pipeline unaffected"). Add `fs::metadata` / `statvfs` free-space & write-test probe on workspace directories.
  - *Test:* Rust unit tests in `doctor.rs` & `preview_server.rs`, React tests in `DoctorBar.test.tsx` / `ManagementWorkspaces.test.tsx`.

### M2-I — Settings Backend Config Persistence & Compact Density CSS
- **I1 — Fix Broken `[data-density="compact"]` & Add Reset Defaults (`base.css`, `shell.css`, `useThemePreference.ts`, `SettingsWorkspace.tsx`)**
  - *Implementation:* Add real CSS rules for `:root[data-density="compact"]` reducing panel padding, header height, list gaps, and timeline row height cleanly. Add `Reset to Defaults` button in `SettingsWorkspace.tsx`.
- **I2 — Persist Studio Preferences & Workspace Paths on Disk (`worker.ts`, `lib.rs`, `SettingsWorkspace.tsx`)**
  - *Implementation:* Add `config_get` and `config_save` writing validated JSON to `<workspaceRoot>/animforge.config.json` (default resolution/FPS/engine, default render output options), syncing with `localStorage` fallback. Keep shortcut table accurate with active hotkeys (or add per-action customizable keybind overrides).
  - *Test:* `SecondaryWorkspaces.test.tsx`, `useThemePreference.test.ts`, `worker.test.ts`.

### M2-J — Agent Center Copy UX & Deterministic Workflow Actions (`AgentCenterWorkspace.tsx`)
- **J1 — Copy MCP Command & Trigger Deterministic Core Agents**
  - *Implementation:* Add `Copy Command` button with accessible confirmation badge on the OpenCode MCP launch block. Wire 3 real buttons for the deterministic TypeScript agents (`Run StoryDirectorAgent`, `Run CharacterManagerAgent`, `Run ScenePlannerAgent`) calling the new `run_deterministic_agent` worker RPC on active project with clear labels noting they are deterministic template generators (no external LLM calls). Display live last-executed MCP/worker activity log entries where available without fabricating telemetry.
  - *Test:* `SecondaryWorkspaces.test.tsx` verifying copy button + deterministic agent invocation & state update.

---

## 3. Mandatory Review Focus & Quality Gates

Before Phase 2 implementation is accepted as complete, the **Integration Agent** and reviewer must verify every gate below:

1. **Trailing-Space Workspace Preservation:** All new Rust (`doctor.rs`, `lib.rs`, `worker_bridge.rs`, `preview_server.rs`) and Node (`worker.ts`, `workspaceAssets.ts`, `ffprobe.ts`) file helpers must pass unit tests under temporary directories ending in `' '` (mirroring `/Users/vipinkumar/Desktop/animator /AnimForgeLab`). Never `.trim()` filesystem paths!
2. **Path Jail & Command Safety:** `asset_import`, `assets_list`, `reveal_in_workspace`, `project_delete`, `project_duplicate`, and `project_import` must canonicalize paths, reject `..` / null bytes / hidden files / escaping symlinks, and never invoke shell interpolation (`sh -c`).
3. **Dirty-State Protection & Preview/Render Freshness:** Clicking `Preview` or `Export MP4` from Header, Stage, Render, or Command Palette when `isDirty` must flush `saveDraft()` first (and cancel preview/render cleanly if save fails). Project switches/deletes continue to guard unsaved drafts.
4. **`ffprobe` Verification on UI Renders:** Every UI MP4 export verifies non-zero video/audio streams and duration via `ffprobe` (`animforge-core/src/media/ffprobe.ts`) before marking the `RenderJob` completed.
5. **Shortcut-vs-Input Isolation:** `Space`, `ArrowLeft`, `ArrowRight`, `Delete`/`Backspace`, `[` / `]`, and `Alt+1..0` MUST be suppressed inside `<input>`, `<textarea>`, `<select>`, `[contenteditable]`, and open `<dialog open>`.
6. **Honest Capability Reporting:** Absent optional binaries (Blender, OpenToonz, Krita, unconfigured Remotion CLI) and deterministic TS agents must never display simulated outputs or fake PASS badges.
7. **Full Final Verification Commands (Run Before Claiming Done):**
   - `animforge-core`: `npm run typecheck && npm test` (including trailing-space + `ffprobe` integration)
   - `animforge-desktop`: `npm run typecheck && npm test && npm run build`
   - `animforge-desktop/src-tauri`: `cargo test` and `cargo clippy --all-targets -- -D warnings`
   - Live Tauri launch smoke check (`npm run tauri dev` / Start-AnimForge verification) + `ffprobe` check on real exported MP4 + clean process shutdown (zero orphan `worker.js` processes).
