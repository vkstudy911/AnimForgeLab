# AnimForge Studio — Phase 2 End-to-End Functionality Audit (M2-A)

**Repository:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab`  
**Audit Scope:** All 10 desktop workspaces, Global Shell & Shortcuts, Tauri IPC (`src-tauri`), Core Worker v1 (`animforge-core`), Engines (`GiveMotion`, `Remotion`, `StretchyStudio`), SQLite DB, `PreviewServer`, `Doctor`, OpenCode MCP integration, and existing test suites.  
**Rule Check:** Audit-only deliverable. Zero source, backend, or test files were modified during M2-A.

---

## 1. Executive Summary & Audit Metrics

> [!NOTE]
> Every row in Section 3 maps 1-to-1 to both an **Implementation Status** (`Working` | `Partial` | `Missing`) and a **Classification Bucket** (`[B1]`–`[B6]`) so counts reconcile identically across both axes.

| Metric | Count | Definition / Bucket Mapping |
| :--- | ---: | :--- |
| **Total interactive controls & workflows audited** | **94** | Sum of all audited controls/actions across Global Shell + 10 Workspaces |
| **Fully working (`Working`)** | **55** | `[B1]` Fully working end-to-end (frontend + backend/storage/DOM effect verified) |
| **Partially functional (`Partial`)** | **27** | `[B2]` + `[B3]` + partial `[B5]` |
| **Missing / unimplemented (`Missing`)** | **12** | `[B4]` + `[B6]` + non-functional `[B5]` |

### Six-Bucket Classification Breakdown (Exact Sum = 94)

1. **`[B1]` Fully working — 55:** Complete UX and persistence/runtime wiring, no hidden gap blocking core use.
2. **`[B2]` UI-only interaction — 2:** Control mutates only ephemeral/metadata state without affecting preview compilation, audio playback, or disk files (`MultiTrackTimeline` track visibility eye toggles; `AssetLibrary` manual URI metadata registration).
3. **`[B3]` Connected to backend but incomplete — 22:** Connected to Tauri/Worker/localStorage, but omits auto-save-on-run, multi-engine routing, compiler features (`backgroundAssetId`, `audioTracks`, `parameters`), `ffprobe` validation, full cue/part editing, Finder reveal, or HTTP liveness probe.
4. **`[B4]` Backend functionality missing — 5:** Core workflow groups lacking Tauri/Worker/client-architecture support (Undo/Redo history stack, Project Import/Finder/Post-create Settings, Storyboard/Beat Edit & Deterministic Regeneration, Blender/OpenToonz/Krita + Disk Probes, `animforge.config.json` Backend Config + Reset/Paths/Shortcut Overrides).
5. **`[B5]` Broken interaction — 4:** Documented or visible interaction fails or produces no/clipped effect (`Space` play/pause documented in Settings is unbound `[Missing]`; `SettingsWorkspace` Compact density sets `data-density="compact"` with zero CSS rules `[Partial]`; `SceneOutliner` clicking Character sets selection that renders empty `CueInspector` `[Partial]`; `PreviewStage` `150%` zoom clips inside `overflow: hidden` `.stage-viewport-matte` `[Partial]`).
6. **`[B6]` Planned feature — 6:** Explicitly labelled `Planned` or `disabled` in current UI (`Projects` `Duplicate`, `Projects` `Delete`, `CharacterStudio` StretchyStudio `.stretch`/Spine & Import/Export, `AssetLibrary` `asset_import`/`assets_list`, `Render` `render_jobs` SQLite History + Interactive Output Config, `AgentCenter` deterministic agent triggers & `animforge://mcp-log`).

*(Reconciliation: `Working` = 55 (`[B1]`); `Partial` = 2 (`[B2]`) + 22 (`[B3]`) + 3 (`[B5]` partial) = 27; `Missing` = 5 (`[B4]`) + 6 (`[B6]`) + 1 (`[B5]` broken/missing `Space` hotkey) = 12. `55 + 27 + 12 = 94`.)*

---

## 2. Backend, Worker, Engine & MCP Capability Audit

### 2.1 Tauri IPC Commands (`animforge-desktop/src-tauri/src/lib.rs`)
Currently exposes **only 9 commands**:
- `run_doctor`, `get_preview_base_url`, `project_list`, `project_create_from_prompt`, `project_load`, `project_save`, `project_preview`, `project_render`, `project_cancel_render`.
- **Capabilities (`src-tauri/capabilities/default.json` & `Cargo.toml`):** Only `core:default` is configured (`tauri-plugin-dialog` / `tauri-plugin-opener` are absent).
- **Missing IPC needed for Phase 2:** `project_delete`, `project_duplicate`, `project_import`, `project_export_bundle` / reveal-in-Finder, `assets_list`, `asset_import`, `list_render_jobs`, `probe_preview_server`, `regenerate_storyboard` / `plan_scenes`, `run_deterministic_agent`, `config_get` / `config_save`, native file pick/save helper.

### 2.2 Worker Protocol v1 & Persistence (`animforge-core/src/worker.ts`, `database.ts`)
- **Single-Engine Bottleneck:** `worker.ts` constructs only `GivemotionAdapter`. `RemotionAdapter` (`animforge-core/adapters/remotion.adapter.ts`) and `StretchyStudioAdapter` (`animforge-core/adapters/stretchystudio.adapter.ts`) exist and have unit tests (`remotion.adapter.test.ts`), **but are never invoked by `worker.ts`**. Selecting `remotion` or `stretchystudio` in New Project or Settings still compiles and renders via GiveMotion.
- **Disk Manifest Partial Save Bug (`worker.ts`):** `DiskManifestSchema` writes only `{ config, characters, scenes }` to `project.animforge.json`, dropping `assets` and `storyboard`. SQLite `projects.data` saves the full `ProjectSchema`, so fallback disk loads silently return `assets: []` and omit `storyboard`.
- **Database Methods (`database.ts`):** Has `createProject`, `getProject`, `listProjects`, `updateProject`, `saveRenderJob`, `getRenderJob`. Missing `deleteProject`, `listRenderJobs`, `getLatestRenderJobForProject`.
- **Missing Render Verification:** `worker.ts` runs GiveMotion render and saves the `RenderJob`, **but never runs `ffprobe` validation on UI renders** (whereas `mcp/tools.ts` already implements `probeVideo`).
- **Reusable MCP Logic (`animforge-core/src/mcp/tools.ts` & `validation.ts`):** Already implements path-jailed `listSafeFilesRecursive`, `importAsset` (copying into `projects/<id>/assets/`), and `probeVideo` (`ffprobe` stream/duration metadata). Phase 2 should extract/share these functions rather than reimplementing them.

### 2.3 GiveMotion Compiler Fidelity (`animforge-core/adapters/givemotion.compiler.ts`)
- Currently compiles `scenes` (`title`, `description`, `duration`, `characterIds`, `characterActions`, `cameraMoves`, `transition`) and `characters` (`colorPalette`, basic mouth smile flag).
- **Ignored Project Data:**
  - `scene.backgroundAssetId` is completely ignored in compiled HTML/CSS (`backgrounds` never render on stage or in MP4).
  - `scene.timeline.audioTracks` is completely ignored in compiled HTML (`<audio>` tracks never play or mix in MP4).
  - Multi-parameter `characterActions.parameters` (beyond `hasSmile`) and `Character.parts` custom geometry/pivots are not reflected cleanly per-part in compiled frames.

### 2.4 Doctor & PreviewServer (`src-tauri/src/doctor.rs`, `preview_server.rs`)
- `doctor.rs` verifies 8 core dependencies cleanly (`os`, `rust`, `node`, `ffmpeg`, `givemotion`, `remotion`, `stretchystudio`, `directories`) and preserves trailing-space paths. Missing: optional creative tool checks (**Blender**, **OpenToonz**, **Krita**), workspace disk-free/writability probe, and remediation hints.
- `preview_server.rs` is production-hardened (path jail, symlink rejection, range requests, CSP, trailing-space tests), **but UI Diagnostics never executes an actual loopback HTTP `GET`/`HEAD` health probe** — it prints `"Listening"` solely because `previewBaseUrl` string is non-empty.

### 2.5 Deterministic Backend Agents (`animforge-core/agents/`)
- `StoryDirectorAgent`, `CharacterManagerAgent`, `ScenePlannerAgent` are **pure deterministic TypeScript template generators** (no external LLM runtime/API exists). Phase 2 wiring must expose them honestly as deterministic planning helpers rather than fake AI streams.

---

## 3. Complete Interactive Control Inventory

### 3.1 Global Shell, Dialogs & Keyboard Shortcuts
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Global | `StudioHeader` | Project Selector popover trigger (`Switch active project`) | `[B1]` Toggles workspace projects dropdown | Toggle switcher menu cleanly | `project_list` | Working | `App.test.tsx` |
| Global | `StudioHeader` | Popover `+ New` button | `[B1]` Closes popover & opens `NewProjectDialog` | Open New Project dialog | None | Working | `StudioHeader.tsx` (untested) |
| Global | `StudioHeader` | Popover project list items | `[B1]` Calls `openProject` with dirty-state guard | Switch project safely | `project_load` | Working | `App.test.tsx` |
| Global | `StudioHeader` | Unsaved pill `Save` button | `[B1]` Calls `saveDraft()` | Persist draft to SQLite & disk | `project_save` | Working | `StudioHeader.tsx` (tested via `Save Changes`) |
| Global | `StudioHeader` | Top nav tabs (`Projects`, `Story`, `Studio`, `Render`) | `[B1]` Navigates active workspace & URL hash | Switch workspace | None | Working | `App.test.tsx` |
| Global | `StudioHeader` | Health pill (`Healthy`/`Warnings`/`Issues`) | `[B1]` Navigates to `diagnostics` | Jump to Diagnostics | `run_doctor` | Working | `App.test.tsx` |
| Global | `StudioHeader` | Theme cycle button | `[B1]` Cycles `dark` -> `light` -> `system` & saves to `localStorage` | Switch theme cleanly | None | Working | `App.test.tsx`, `useThemePreference.test.ts` |
| Global | `StudioHeader` | `Preview` button | `[B3]` Navigates to `studio` & previews last *saved* backend state; ignores unsaved `draftProject` | Flush/save or warn before bundling so preview matches draft edits | `project_save` + `project_preview` | Partial | `App.test.tsx` (only tests post-save) |
| Global | `StudioHeader` | `Export MP4` / `Cancel Export` button | `[B3]` Renders last *saved* backend state & lacks `ffprobe` check | Flush/save dirty draft before export & validate output MP4 via `ffprobe` | `project_save` + `project_render` + `ffprobe` | Partial | `App.test.tsx`, `useStudio.test.ts` |
| Global | `StudioHeader` | Undo / Redo buttons | `[B4]` No Undo/Redo controls or history stack exist anywhere in Studio | Undo/Redo edits across Studio, Story, Characters, Assets (`Cmd/Ctrl+Z`) | Client history stack in `StudioContext` | Missing | None |
| Global | `WorkspaceRail` | 10 workspace rail buttons | `[B1]` Switches workspace & sets `aria-current="page"` | Navigate all 10 workspaces | None | Working | `WorkspaceRail.test.tsx`, `App.test.tsx` |
| Global | `App` | Error alert `Dismiss` button | `[B1]` Clears active error banner | Dismiss error alert | None | Working | `App.tsx` |
| Global | `App` | Background render status chip `Cancel` button | `[B1]` Calls `cancelRender()` for active rendering project | Cancel background render | `project_cancel_render` | Working | `useStudio.test.ts` |
| Global | `App` | Footer `Quick Search (Cmd/Ctrl+K)` button | `[B1]` Opens Command Palette dialog | Open Command Palette | None | Working | `App.tsx` |
| Global | `App` | Unsaved Changes modal (`Cancel`, `Discard Changes`, `Save & Switch`) | `[B1]` Blocks/discards/saves pending project switch reliably | Protect unsaved edits | `project_save`, `project_load` | Working | `App.test.tsx` |
| Global | `NewProjectDialog` | Inputs (`Name`, `Prompt`, `Aspect`, `FPS`, `Engine`) & `Create & Open` | `[B3]` Creates project via worker; `remotion`/`stretchystudio` choice saved on record but ignored at preview/render time | Route preview/render to selected engine or surface clear engine support | `project_create_from_prompt` | Partial | `ManagementWorkspaces.test.tsx` (Projects form), dialog untested directly |
| Global | `CommandPaletteDialog` | Filter `<input>`, `New Project...`, command items | `[B3]` Executes nav/project/save/preview/render; Preview/Render can run stale state if dirty | Auto-save/guard on preview/render & expose Undo/timeline commands | `project_*` | Partial | None |
| Global | `StudioContext` | Global hotkeys (`Cmd/Ctrl+K`, `S`, `N`, `Alt+1..0`, `[`, `]`) & `Space` | `[B5]` `Cmd/Ctrl+K/S/N`, `Alt+1..0`, `[` / `]` work; **`Space` (Play/Pause listed in Settings) & `ArrowLeft/Right` frame step are NOT wired**; `Cmd/Ctrl+Z` missing | Implement `Space` playback toggle outside text inputs, frame step, & `Cmd/Ctrl+Z` | None | Missing | None (shortcut handlers untested) |
| Global | `WorkspaceErrorBoundary` | `Try Again` & `Return to Home` buttons | `[B1]` Resets error boundary or navigates Home | Recover gracefully from subtree throw | None | Working | `primitives.test.tsx` |

### 3.2 Home Workspace (`HomeDashboard.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Home | `HomeDashboard` | `+ New Project` button | `[B1]` Opens `NewProjectDialog` | Launch new project flow | None | Working | `HomeDashboard.tsx` |
| Home | `HomeDashboard` | Quick Nav buttons (`Projects`, `Story`, `Studio`, `Render`, `Diagnostics`) | `[B1]` Navigates to chosen workspace | Quick workspace switching | None | Working | `ManagementWorkspaces.test.tsx` (`Diagnostics`) |
| Home | `HomeDashboard` | Active Render `View Render` / `Cancel` | `[B1]` Opens Render page or cancels active job | Monitor/cancel live render | `project_cancel_render` | Working | Covered via `useStudio.test.ts` |
| Home | `HomeDashboard` | 4 Starter `Launch Template` buttons | `[B1]` Calls `createAndOpenProject` & opens Studio | One-click template project creation | `project_create_from_prompt` | Working | None |
| Home | `HomeDashboard` | Environment Health `Full Diagnostics` button | `[B1]` Navigates to `diagnostics` | Open Diagnostics workspace | `run_doctor` | Working | `ManagementWorkspaces.test.tsx` |
| Home | `HomeDashboard` | Recent Projects `Manage All` & `Open` buttons | `[B1]` Navigates to `projects` or calls `openProject(id, 'studio')` | Open recent project cleanly | `project_load` | Working | `ManagementWorkspaces.test.tsx` |

### 3.3 Projects Workspace (`ProjectManager.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Projects | `ProjectManager` | Search `<input>` & Status `<select>` | `[B1]` Filters loaded projects list client-side | Filter by name/prompt/status | None (`project_list`) | Working | None |
| Projects | `ProjectManager` | Alert `Dismiss` button | `[B1]` Clears `actionError` banner | Dismiss local error | None | Working | None |
| Projects | `ProjectManager` | `Open` button | `[B1]` Loads project into Studio (with dirty-state guard) | Open selected project | `project_load` | Working | None directly (uses shared `openProject`) |
| Projects | `ProjectManager` | `Rename` inline form (`input`, `Save`, `Cancel`) | `[B1]` Loads + saves new name via `project_save` and syncs active dirty draft | Rename project persistently | `project_load`, `project_save` | Working | None |
| Projects | `ProjectManager` | `Export JSON` button | `[B3]` Uses browser `<a download>` blob; no native Save dialog or Finder reveal (unreliable in macOS WKWebView) | Save `.animforge.json` via native dialog / backend file write + reveal | `project_load` + native save/opener | Partial | None |
| Projects | `ProjectManager` | `Duplicate` button | `[B6]` Explicitly `disabled` (`Planned` tooltip) | Clone project under new ID & open/list | Missing `project_duplicate` RPC | Missing | `ManagementWorkspaces.test.tsx` (asserts disabled) |
| Projects | `ProjectManager` | `Delete` button | `[B6]` Explicitly `disabled` (`Planned` tooltip); SQLite lacks `deleteProject` | Confirm & delete SQLite row + disk project folder | Missing `project_delete` RPC & DB method | Missing | `ManagementWorkspaces.test.tsx` (asserts disabled) |
| Projects | `ProjectManager` | Inline New Project Form (`Name`, `Prompt`, `Aspect`, `FPS`, `Create Project`) | `[B1]` Validates with accessible focus/live region & creates via worker | Create project from Projects page | `project_create_from_prompt` | Working | `ManagementWorkspaces.test.tsx` |
| Projects | `ProjectManager` | Import Project JSON / Open Folder in Finder / Edit Resolution & FPS post-create | `[B4]` Controls & backend IPCs absent | Import `.animforge.json`, reveal project folder, edit project settings | `project_import`, opener, `project_save` | Missing | None |

### 3.4 Story & Scenes Workspace (`StoryScenesWorkspace.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Story & Scenes | `StoryScenesWorkspace` | Empty state `New Project` / `Browse Projects` | `[B1]` Opens dialog or navigates to Projects | Provide empty-state recovery | None | Working | None |
| Story & Scenes | `StoryScenesWorkspace` | Header `+ Add Scene`, `Discard`, `Save Story` buttons | `[B1]` Adds scene to draft, discards changes, or saves via `project_save` | Manage scene list & persist | `project_save` | Working | `ManagementWorkspaces.test.tsx` |
| Story & Scenes | `StoryScenesWorkspace` | Scene card select buttons | `[B1]` Selects active scene in Studio context | Select scene for editing | None | Working | `ManagementWorkspaces.test.tsx` |
| Story & Scenes | `StoryScenesWorkspace` | Scene `↑` / `↓` reorder buttons | `[B1]` Swaps scenes & reindexes `sequenceIndex` | Reorder scene progression | `project_save` on Save | Working | `ManagementWorkspaces.test.tsx` |
| Story & Scenes | `StoryScenesWorkspace` | Scene Editor (`Title`, `Description`, `Duration`, `Transition`, `Transition Duration`) | `[B1]` Mutates draft scene & syncs `timeline.duration` | Edit scene narrative & timing | `project_save` on Save | Working | `ManagementWorkspaces.test.tsx` |
| Story & Scenes | `StoryScenesWorkspace` | Form `Save Story` & `Edit in Studio` buttons | `[B1]` Saves story or jumps to Studio preserving `selectedSceneId` | Save & transition to Animation Studio | `project_save` | Working | `ManagementWorkspaces.test.tsx` |
| Story & Scenes | `StoryScenesWorkspace` | Storyboard `logline`/`artStyle`/Beat editors + Delete/Duplicate Scene + Regenerate Story/Scenes | `[B4]` Storyboard panel is read-only; no Delete or Duplicate scene buttons; `StoryDirectorAgent`/`ScenePlannerAgent` not wired | Edit logline/beats, delete/duplicate scenes, apply beat -> scene, regenerate storyboard | `regenerate_storyboard` / `plan_scenes` worker RPCs | Missing | None |

### 3.5 Animation Studio (`AnimationEditor.tsx`, `PreviewStage.tsx`, `SceneOutliner.tsx`, `CueInspector.tsx`, `MultiTrackTimeline.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Studio | `AnimationEditor` | Empty state `New Project` / `Browse Projects` | `[B1]` Opens modal or Projects page | Recover when no project is open | None | Working | `AnimationEditor.test.tsx` |
| Studio | `AnimationEditor` | Left/Right Collapse buttons & 3 Pane Resizers (drag + keyboard) | `[B1]` Resizes/collapses panes & saves to `localStorage` | Responsive custom dock proportions | None | Working | None |
| Studio | `PreviewStage` | View switch (`Interactive Player` / `Rendered MP4`) | `[B1]` Switches `<gm-player>` and `<video>`, resets playback badge cleanly | Compare live bundle vs rendered MP4 | `PreviewServer` | Working | `PreviewStage.test.tsx` |
| Studio | `PreviewStage` | `Preview Bundle`, `Export MP4`, `Cancel Render` buttons | `[B3]` Runs `project_preview` / `project_render` / `project_cancel_render`; **stales on dirty draft**; **non-GiveMotion engines not routed** | Auto-save dirty draft (or prompt), route preferredEngine, run `ffprobe` on MP4 | `project_save`, `project_preview`, `project_render`, `ffprobe` | Partial | `PreviewStage.test.tsx`, `App.test.tsx` |
| Studio | `PreviewStage` | `Zoom` `<select>` (`Fit`, `50%`, `100%`, `150%`) | `[B5]` Sets `--stage-zoom`, **but `.stage-viewport-matte` has `overflow: hidden` so `150%` clips stage with no pan/scrollbars** | Scrollable/pannable zoomed matte when zoom > `100%` | None | Partial | None |
| Studio | `PreviewStage` | `Safe Zones` toggle button | `[B1]` Toggles safe-zone overlay (initialized from Settings) | Toggle title/action safe guides | None | Working | None |
| Studio | `PreviewStage` | `Fullscreen` button | `[B1]` Calls DOM `requestFullscreen`/`exitFullscreen` | Toggle fullscreen stage | None | Working | None |
| Studio | `PreviewStage` | `QA Issues` button & drawer | `[B1]` Opens/closes GiveMotion check error/warning/note list | Inspect compile/QA issues | `project_preview` | Working | `PreviewStage.test.tsx` |
| Studio | `PreviewStage` | `Retry Player` button & `Active Scene Script` `<details>` | `[B1]` Retries `gm-player.js` script load; toggles scene script notes | Recover script load failures & read beats | `PreviewServer` | Working | `PreviewStage.test.tsx` |
| Studio | `PreviewStage` | Transport (`Jump Start`, `Play/Pause`, `Jump End`, Scrubber `<input type="range">`) | `[B3]` Plays/seeks `<gm-player>` & `<video>`; **missing Stop, +/-1 Frame step, Mute, Playback Rate, Loop controls** | Full frame-accurate transport & audio/speed controls | `<gm-player>` / `<video>` DOM | Partial | `PreviewStage.test.tsx` |
| Studio | `SceneOutliner` | `Scenes` tab (`+ Add Scene`, Select scene, Move `↑`/`↓`) | `[B3]` Adds/reorders scenes in draft; **selecting scene does NOT seek stage playhead**; **no Delete, Duplicate, or Inline Rename** | Full scene CRUD + playhead sync on selection | `project_save` on Save | Partial | `AnimationEditor.test.tsx` |
| Studio | `SceneOutliner` | `Characters` tab (Select char, `In Active Scene`/`Add to Scene`, `Manage Rigs`) | `[B5]` Toggle presence & nav work; **clicking character name sets `selection.kind='character'` which shows blank `CueInspector`** | Render character summary/actions in Inspector or focus char in Studio | `project_save` on Save | Partial | `AnimationEditor.test.tsx` |
| Studio | `SceneOutliner` | `Assets` tab (Select asset, `Add Audio Cue`, `Set Background`, `Open Assets`) | `[B3]` Writes `backgroundAssetId`/`audioTracks` in draft, **but `selection.kind='asset'` shows blank `CueInspector` AND compiler ignores both background & audio** | Show asset info in Inspector AND compile background/audio in GiveMotion | `givemotion.compiler.ts`, `project_save` | Partial | `AnimationEditor.test.tsx` |
| Studio | `CueInspector` | Selected Action Cue (`Delete`, `Action`, `Start (s)`, `Duration (s)`) | `[B3]` Edits timing/name & deletes action; **cannot change target `characterId` or `parameters` payload** | Full action property editing | `project_save` on Save | Partial | `AnimationEditor.test.tsx` |
| Studio | `CueInspector` | Selected Camera Cue (`Delete`, `Type`, `Start Zoom`, `End Zoom`, `Duration (s)`) | `[B3]` Edits type/zoom/duration; **cannot edit `startX/Y`, `endX/Y`, or `easing` per selected camera cue** | Full camera pan/zoom/easing keyframe editing | `project_save` on Save | Partial | `AnimationEditor.test.tsx` |
| Studio | `CueInspector` | Selected Audio Cue (`Delete`, `Start (s)`, `Volume`, `Loop`) | `[B3]` Edits cue fields in draft; **audio cue has no compiled audio output in preview/MP4; cannot swap `assetId`** | Render & hear audio cues in stage/MP4 + swap track | `givemotion.compiler.ts` | Partial | None |
| Studio | `CueInspector` | Active Scene Details (`Title`, `Description`, `Duration`, `Transition`, `Transition Duration`, `Cam[0]`, `Add Action`, `Save Changes`) | `[B3]` Updates scene/actions/`cameraMoves[0]` and saves; **cannot add 2nd+ camera move directly; blank on `character`/`asset` selection** | Multi-camera `+ Add Camera Cue` & Inspector cards for all selection types | `project_save` | Partial | `AnimationEditor.test.tsx` |
| Studio | `MultiTrackTimeline` | Header `Zoom -`, `Zoom +`, `Collapse/Expand` buttons | `[B1]` Zooms timeline 50%–400% & collapses dock cleanly | Navigate dense multi-track timeline | None | Working | `AnimationEditor.test.tsx` |
| Studio | `MultiTrackTimeline` | Track Visibility Eye buttons (`Scene`, `Actions`, `Camera`, `Audio`) | `[B2]` **Pure UI state fade/hide only; does NOT mute audio or exclude track from preview/MP4; lost on unmount** | Mute/solo tracks or persist track visibility cleanly | Stage / compiler if mute affects output | Partial | `AnimationEditor.test.tsx` |
| Studio | `MultiTrackTimeline` | Ruler (`role="slider"`) click & Left/Right/Home/End | `[B3]` Seeks `playheadTime`; **no pointer drag scrubbing, no snap-to-grid/playhead, no split-at-playhead** | Smooth drag scrub, snap, & split at playhead | None / `<gm-player>` | Partial | None |
| Studio | `MultiTrackTimeline` | Clips (`Scene`, `Action`, `Camera`, `Audio`) click | `[B3]` Selects clip into `CueInspector`; **no pointer drag-to-move, no trim/resize edge handles, no `Delete` key shortcut** | Drag move, trim handles, & `Delete`/`Backspace` removal | Draft mutation (`StudioContext`) | Partial | `AnimationEditor.test.tsx` |

### 3.6 Character Studio (`CharacterStudio.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Characters | `CharacterStudio` | Empty state `New Project` / `Browse Projects` | `[B1]` Opens modal or navigates | Empty-project recovery | None | Working | None |
| Characters | `CharacterStudio` | Header `Add Character`, `Discard`, `Save Changes` | `[B1]` Adds character, discards draft, saves via `project_save` | Manage character roster | `project_save` | Working | `SecondaryWorkspaces.test.tsx` |
| Characters | `CharacterStudio` | Character Roster list select & `Remove Character` buttons | `[B1]` Switches or deletes character in draft | Switch & remove characters | `project_save` on Save | Working | `SecondaryWorkspaces.test.tsx` |
| Characters | `CharacterStudio` | Metadata (`Name`, `Default Rig ID`, `Description`) & Color Palette (`+ Add Color`, color picker, hex input, `Remove`) | `[B1]` Updates character properties & palette cleanly | Configure character look & rig ID | `project_save` on Save | Working | `SecondaryWorkspaces.test.tsx` |
| Characters | `CharacterStudio` | Rig Schematic SVG joints (`role="button"`, click/Enter/Space) | `[B3]` Selects rig part in editor; **no pointer-drag pivot repositioning directly on schematic** | Drag joint pivots interactively on canvas | Draft mutation | Partial | `SecondaryWorkspaces.test.tsx` (presence) |
| Characters | `CharacterStudio` | Quick Animation Actions (`Target Scene <select>`, `+ Idle`..`+ Look Around`) | `[B3]` Appends cue to target scene & jumps to Studio; **does not update `selectedSceneId` to match target scene or auto-save quick action** | Switch Studio focus to target scene & keep clip highlighted cleanly | `project_save` on Save | Partial | `SecondaryWorkspaces.test.tsx` |
| Characters | `CharacterStudio` | Rig Parts (`Add Part`, Part list, `Remove Part`, `Name`, `Layer`, `Pivot X/Y`, `Z-Index`, `Parent Part`) | `[B1]` Full CRUD on rigged parts hierarchy saved via `project_save` | Build & reorder rigged parts | `project_save` on Save | Working | `SecondaryWorkspaces.test.tsx` |
| Characters | `CharacterStudio` | StretchyStudio `.stretch`/Spine Bridge, Duplicate Character, Character JSON Import/Export | `[B6]` Explicitly marked `Planned` callout; no StretchyStudio rig IPC or export/import buttons | Clone character, export/import character JSON, wire StretchyStudio adapter | `stretchystudio` worker RPCs | Missing | `SecondaryWorkspaces.test.tsx` (asserts callout) |

### 3.7 Asset Library (`AssetLibrary.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Assets | `AssetLibrary` | Empty state `New Project` / `Browse Projects` | `[B1]` Opens modal or navigates | Empty-project recovery | None | Working | None |
| Assets | `AssetLibrary` | `Target Scene <select>`, `Discard`, `Save Changes`, Category tabs, Search `<input>` | `[B1]` Selects target scene, filters `assets[]`, discards or saves | Browse & manage asset metadata | `project_save` | Working | `SecondaryWorkspaces.test.tsx` |
| Assets | `AssetLibrary` | Asset Card Media Preview (`<img>` / `<audio>` via `PreviewServer`) | `[B1]` Streams preview images & audio from loopback server (note: no broken-file badge if file missing on disk) | Preview visual & audio assets inline | `PreviewServer` | Working | `SecondaryWorkspaces.test.tsx` |
| Assets | `AssetLibrary` | Card `Set Scene Background` & `Add to Scene Audio` buttons | `[B3]` Sets `backgroundAssetId` / appends `audioTracks` & auto-saves via `useEffect`, **but compiled GiveMotion output ignores both fields** | Assign background/audio AND render them visibly/audibly in preview & MP4 | `project_save`, `givemotion.compiler.ts` | Partial | `SecondaryWorkspaces.test.tsx` |
| Assets | `AssetLibrary` | Card `Remove` button | `[B3]` Removes asset from `draftProject.assets`, **leaving stale `backgroundAssetId` / `audioTracks` references on scenes** | Remove asset AND clean up dangling scene references | `project_save` on Save | Partial | None |
| Assets | `AssetLibrary` | Register Asset Form (`Asset Name`, `Category`, `Workspace URI`, `Register Asset`) | `[B2]` Manual string registration only; **does NOT copy files or check disk existence** | Validate URI exists or import file cleanly | `assets_list` / `asset_import` | Partial | `SecondaryWorkspaces.test.tsx` |
| Assets | `AssetLibrary` | Native File Picker Upload (`asset_import`), Workspace Disk Scan (`assets_list`), Reveal in Finder | `[B6]` Explicitly `Planned`; `importAsset` & `listSafeFilesRecursive` already exist in `mcp/tools.ts` but aren't exposed to UI/Worker | Native file picker upload, workspace disk rescan, reveal in Finder | Reuse `mcp/tools.ts` in `worker.ts` + Tauri dialog/opener | Missing | `SecondaryWorkspaces.test.tsx` (asserts callout) |

### 3.8 Render & Export Workspace (`RenderWorkspace.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Render | `RenderWorkspace` | Empty state `New Project` / `Browse Projects` | `[B1]` Opens modal or navigates | Empty-project recovery | None | Working | None |
| Render | `RenderWorkspace` | `Render MP4` / `Cancel` buttons | `[B3]` Triggers `project_render` / `project_cancel_render` with live ring/ETA; **ignores dirty draft, lacks `ffprobe` validation, & ignores non-GiveMotion engine routing** | Auto-save/flush draft, execute selected engine, verify MP4 with `ffprobe` | `project_render`, `ffprobe`, adapters | Partial | `ManagementWorkspaces.test.tsx` |
| Render | `RenderWorkspace` | Output Preview `<video>` & path readout | `[B1]` Plays generated MP4 via `PreviewServer` with byte-range seek | Scrub/verify exported video | `PreviewServer` | Working | `ManagementWorkspaces.test.tsx` |
| Render | `RenderWorkspace` | Output Config Panel, SQLite `render_jobs` History, Retry Failed Job & Open/Reveal MP4 | `[B6]` Output Config is read-only `<dl>`; Render History explicitly shows `SQLite render_jobs query: Planned` (in-memory session list only); no reveal-in-Finder | Editable render presets/FPS/codec/path, persistent SQLite job history, retry & reveal MP4 | `list_render_jobs` DB/worker RPC, opener | Missing | `ManagementWorkspaces.test.tsx` (asserts Planned text) |

### 3.9 Diagnostics Workspace (`DiagnosticsWorkspace.tsx` & `DoctorBar.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Diagnostics | `DiagnosticsWorkspace` & `DoctorBar` | `Refresh` & `Re-check` buttons | `[B1]` Invokes `run_doctor` & refreshes 8 Rust system checks | Live dependency & workspace health audit | `run_doctor` (`doctor.rs`) | Working | `DoctorBar.test.tsx`, `ManagementWorkspaces.test.tsx` |
| Diagnostics | `DoctorBar` | Check `Details` `<details>` toggles | `[B1]` Expands/collapses detail text per check | Inspect versions, GPU/x264 notes & paths | `run_doctor` | Working | `DoctorBar.test.tsx` |
| Diagnostics | `DiagnosticsWorkspace` | `Copy URL` button & PreviewServer status badge | `[B3]` Copies URL to clipboard cleanly, **but reports `"Listening"` whenever string exists without running a real loopback HTTP health probe** | Execute actual HTTP `HEAD`/`GET` probe & show true live/offline status + latency | New `probe_preview_server` Tauri command | Partial | `ManagementWorkspaces.test.tsx` |
| Diagnostics | `DiagnosticsWorkspace` & `DoctorBar` | Optional Creative Tool Probes (Blender, OpenToonz, Krita), Disk Space/Write Check & Logs/Fix Drawer | `[B4]` Not probed in `doctor.rs`; no disk-free or log inspection controls exist | Honestly detect Blender/OpenToonz/Krita (report absent as optional info/warn) + disk space/write check | `doctor.rs` extensions | Missing | None |

### 3.10 Settings Workspace (`SettingsWorkspace.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Settings | `SettingsWorkspace` | `Theme` segmented group (`Dark`, `Light`, `System`) | `[B1]` Updates `data-resolved-theme`, `<meta color-scheme>`, & `localStorage` | Immediate theme change & persistence | None | Working | `SecondaryWorkspaces.test.tsx` |
| Settings | `SettingsWorkspace` | `Interface Density` (`Comfortable`, `Compact`) | `[B5]` Writes `data-density` to `<html>` & `localStorage`, **but ZERO CSS selectors target `[data-density="compact"]` — zero visual effect** | Compact spacing tokens/rules change padding & row heights across shell/panels | `tokens.css` / `shell.css` | Partial | `SecondaryWorkspaces.test.tsx` (tests attribute only) |
| Settings | `SettingsWorkspace` | `Reduced Motion & Effects` checkbox | `[B1]` Sets `data-reduced-effects="true"` & disables CSS animations/transitions | Disable motion cleanly | `base.css` | Working | None |
| Settings | `SettingsWorkspace` | `Show Safe Zones by Default` checkbox | `[B1]` Persists preference & seeds `PreviewStage` default | Default safe-zone overlay state | None | Working | None |
| Settings | `SettingsWorkspace` | Project Defaults (`Aspect Ratio`, `FPS`, `Default Engine`) | `[B3]` Saves prefs & seeds new projects; **`Default Engine` (`remotion`/`stretchystudio`) ignored by worker preview/render** | Enforce selected engine or clarify adapter capabilities | `worker.ts` engine routing | Partial | `SecondaryWorkspaces.test.tsx` |
| Settings | `SettingsWorkspace` | Workspace/Engine Paths, `Reset to Defaults`, Backend Config File (`animforge.config.json`) & Editable Shortcuts | `[B4]` No Reset button, no workspace/engine path config, `SHORTCUTS` list is read-only static `<ul/>` (with unbound `Space` shortcut) | Persist studio config on disk (`animforge.config.json`), Reset Defaults, configure workspace paths | `config_get`/`config_save` worker RPC | Missing | None |

### 3.11 Agent Center Workspace (`AgentCenterWorkspace.tsx`)
| Workspace | Component | Control | Current behavior | Expected behavior | Backend dependency | Implementation status | Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Agent Center | `AgentCenterWorkspace` | Empty state `New Project` / `Browse Projects` | `[B1]` Opens modal or navigates | Empty-project recovery | None | Working | None |
| Agent Center | `AgentCenterWorkspace` | `Open Story & Scenes` & `Open Animation Studio` buttons | `[B1]` Navigates with active project loaded | Jump to planning/editing workspaces | None | Working | None |
| Agent Center | `AgentCenterWorkspace` | Copy MCP Command button, Trigger Deterministic Agents (`StoryDirector`, `CharacterManager`, `ScenePlanner`), & Live `animforge://mcp-log` | `[B6]` Explicitly `Planned`; CLI snippet lacks copy button; deterministic core agents lack UI worker RPCs; MCP log stream absent | Copy CLI snippet, run deterministic backend agents on active project, view MCP log/server status | `run_deterministic_agent`, MCP telemetry | Missing | `SecondaryWorkspaces.test.tsx` (asserts Planned badges) |

---

## 4. Highest-Priority Missing Functionality (Ranked)

1. **P0 — Save-before-Preview/Render + Undo/Redo (`Cmd/Ctrl+Z`) + Missing Studio Playback Shortcuts (`Space`, Frame Step):**
   - Today, clicking `Preview` or `Export MP4` while dirty silently renders stale saved data, `Space` documented in Settings does nothing, and accidental cue/scene deletes have no Undo/Redo recovery.
2. **P0 — Real Multi-Engine Worker Routing (`Remotion` / `StretchyStudio`) + `GiveMotion` Background & Audio Compilation + `ffprobe` Post-Render Check:**
   - Assigning a Background or Audio track in `SceneOutliner` / `AssetLibrary` saves JSON but produces silence/blank background in actual GiveMotion HTML & MP4! Selecting Remotion/StretchyStudio silently runs GiveMotion, and UI MP4 exports skip `ffprobe` validation.
3. **P0 — Project Lifecycle Operations (`project_delete`, `project_duplicate`, `project_import`, Reveal in Finder, Preservation of `assets`/`storyboard` in `project.animforge.json`):**
   - `Delete` and `Duplicate` sit visibly disabled in Projects, `Export JSON` uses browser `<a download>` instead of native Save, and fallback disk loads drop `assets`/`storyboard`.
4. **P1 — Workspace Asset Upload & Disk Scan (`asset_import`, `assets_list`) + Dangling Asset Reference Cleanup:**
   - Reusing `animforge-core/src/mcp/tools.ts` (`importAsset`, `listSafeFilesRecursive`) eliminates manual URI typing and validates real workspace files safely inside the path jail.
5. **P1 — Timeline Direct Manipulation & Full Scene/Cue CRUD (`SceneOutliner` Delete/Duplicate/Rename, `MultiTrackTimeline` Drag/Trim/Split/Delete, `CueInspector` Character/Asset/Camera X-Y-Easing Editing):**
   - Transforms Animation Studio from form-only inspection into a responsive NLE workbench.
6. **P1 — Render Job SQLite History, Interactive Output Config, Output Reveal, & Live PreviewServer/Optional Tool Diagnostics:**
   - Unlocks persistent job history (`listRenderJobs`), resolution/FPS/codec overrides, real `PreviewServer` HTTP probe, and honest Blender/OpenToonz/Krita + disk-space checks in `doctor.rs`.
7. **P2 — Storyboard/Beat Editing & Deterministic Regeneration, Character Rig Interactive Drag/Import/Export, Compact Density CSS (`[data-density="compact"]`), & Agent Center Deterministic Actions.**

---

## 5. Recommended Implementation Order & Plan Reference

Full task-by-task execution specifications, file ownership boundaries across the 6 Phase 2 subagents, shared-file conflict mitigation, and verification gates are documented in:
- [2026-11-12-phase2-functionality.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/superpowers/plans/2026-11-12-phase2-functionality.md)

**Summary Execution Sequence:**
1. **`M2-B` + `M2-D` Backend Foundation (Integration Agent first):** Shared TypeScript/Rust/Worker contracts (`worker.ts`, `database.ts`, `lib.rs`, `worker_bridge.rs`, `givemotion.compiler.ts`, `types.ts`, `useStudio.ts`, `StudioContext.tsx`).
2. **Parallel UI/Domain Wave (Agents 1–5 concurrently on disjoint owned files):**
   - **Agent 1 (Project & Story):** `M2-B` UI + `M2-E` (`ProjectManager.tsx`, `StoryScenesWorkspace.tsx`, `NewProjectDialog.tsx`)
   - **Agent 2 (Animation Studio):** `M2-C` (`AnimationEditor.tsx`, `PreviewStage.tsx`, `SceneOutliner.tsx`, `CueInspector.tsx`, `MultiTrackTimeline.tsx`)
   - **Agent 3 (Render & Diagnostics):** `M2-F` + `M2-H` (`RenderWorkspace.tsx`, `DiagnosticsWorkspace.tsx`, `DoctorBar.tsx`, `src-tauri/src/doctor.rs`)
   - **Agent 4 (Creative Workspaces):** `M2-G` (`CharacterStudio.tsx`, `AssetLibrary.tsx`)
   - **Agent 5 (System & Agent Center):** `M2-I` + `M2-J` (`SettingsWorkspace.tsx`, `AgentCenterWorkspace.tsx`, `useThemePreference.ts`, `base.css`, `shell.css`)
3. **Final Integration & Verification (`Integration Agent`):** Cross-workspace shortcuts, header/dialog polish (`StudioHeader.tsx`, `App.tsx`, `CommandPaletteDialog.tsx`), full Vitest + `tsc` + `cargo test` + `clippy -D warnings` + live `tauri` & `ffprobe` verification.
