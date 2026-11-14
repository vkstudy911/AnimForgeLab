# AnimForge Studio — Navigation Map & Route Architecture

**Navigation Paradigm:** Single-window Desktop Workbench with zero external router dependencies (`ponytail` principle — lightweight state + `window.location.hash` sync, zero `react-router-dom` bloat).

---

## 1. Three-Group / Ten-Workspace Information Architecture

Every existing and planned creative capability maps to **exactly one** primary workspace. Duplicate standalone tabs for Scene Editor, Timeline, Keyframes, Audio, Camera, or Preview are intentionally consolidated inside **Animation Editor** so editors manipulate all temporal layers in context against the Stage.

| Group | # | Workspace ID (`route`) | Shortcut | Primary Purpose | Active-Project Required? | Backend Readiness |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Home & Management** | 1 | `home` (**Home Dashboard**) | `Alt+1` | Recent projects, quick prompt starter, active render summary, compact system health status | No | **Track A** (100% Ready) |
| | 2 | `projects` (**Project Manager**) | `Alt+2` | Search/filter/sort all projects (`16:9` / `9:16` / `1:1` presets), New Project modal (`width`, `height`, `fps`, `engine`), open/clone/export JSON | No | **Track A** (Delete/Clone = **Track B**) |
| **2. Creative Workspace** | 3 | `storyboard` (**Storyboard**) | `Alt+3` | Edit project `logline`, `artStyle`, ordered `StoryBeat` cards (`visualSummary`, `characterInteractions`, `cameraNotes`, `soundNotes`, `targetDurationSeconds`), promote beat to Animation Editor | Yes (guided empty state if none) | **Track A** (`project_save`) / **Track B** (AI Re-generate) |
| | 4 | `characters` (**Character Studio**) | `Alt+4` | Character cast roster, color palette swatches, `CharacterPart` hierarchy (`layerName`, `pivot`, `zIndex`, `parentPartId`), rig/StretchyStudio bridge launch | Yes (guided empty state if none) | **Track A** (`project_save`) / **Track B** (`.stretch` rig bridge) |
| | 5 | `assets` (**Asset Library**) | `Alt+5` | Project `assets[]` inspector (`character`, `background`, `prop`, `audio`, `font`, `model`, `reference`), assign background/audio to active scene; Workspace shared `assets/` browser & import | Partial (Read/Edit Project `assets[]` = Track A; Disk browse/import = Track B) | **Track A** (Project `assets[]`) + **Track B** (`assets_list`, `asset_import`) |
| | 6 | `editor` (**Animation Editor**) | `Alt+6` | **Core Studio:** Stage Viewport (`<gm-player>` + MP4 toggle + safe-zones/zoom + GiveMotion QA drawer) + Scene Outliner + Multi-Track Timeline (`CharacterAction`, `CameraMovement`, `AudioTrack`, transitions) + Inspector | Yes (auto-selects Scene 1; empty state creates/opens project) | **Track A** (`project_load`, `project_save`, `project_preview`, `project_render`, `project_cancel_render`) |
| **3. Production & System** | 7 | `render-queue` (**Render Queue**) | `Alt+7` | Trigger MP4 render, live frame/FPS/ETA telemetry, Cancel active render, view output MP4 & export specs (`ffprobe` + past job history in Track B) | Partial (Live active job = Track A; History list/`ffprobe` = Track B) | **Track A** (Live single render) + **Track B** (`render_jobs_list`, `project_ffprobe`, Remotion toggle) |
| | 8 | `agents` (**Agent Center**) | `Alt+8` | Inspect planned StoryDirector/ScenePlanner/CharacterManager output artifacts on active project; configure/monitor OpenCode MCP connection (`animforge-core` MCP server setup & tool catalog) | No | **Track A** (Static MCP guide + artifact viewer) / **Track B** (Live agent triggers & MCP telemetry) |
| | 9 | `settings` (**Settings**) | `Alt+9` | Theme (**System / Dark / Light**), Reduced Motion, Low-Spec Hardware Profile, Default Canvas (`1280x720`, `1920x1080`, `30/24/60fps`), Engine Preference (`givemotion` / `remotion` / `stretchystudio`) | No | **Track A** (`localStorage` persisted desktop prefs) |
| | 10 | `diagnostics` (**System Diagnostics**) | `Alt+0` | Full 8-check `DoctorBar` (`os`, `rust`, `node`, `ffmpeg`, `givemotion`, `remotion`, `stretchystudio`, `directories`), Workspace Root verification (trailing-space safe), Preview Server URL/port telemetry | No | **Track A** (`run_doctor`, `get_preview_base_url`) |

---

## 2. Navigation Semantics & Accessibility Contract

1. **Semantic `<nav>` Landmark (Not `role="tablist"`):**
   - Left Rail renders `<nav aria-label="Studio Workspaces">` containing 3 `<section>` groups with group headings (`id`-linked `aria-labelledby`), each holding `<button>` workspace triggers.
   - The active workspace button sets **`aria-current="page"`** (never `aria-selected`, which is strictly reserved for `role="tab"`).
   - Keyboard navigation within Left Rail follows standard vertical Tab / Shift+Tab button focus + direct `Alt+1..0` global shortcuts.
2. **Hash Synchronization (Optional Deep Links, Zero Server Calls):**
   - Active workspace & selected scene mirror into `window.location.hash` as `#/editor?scene=scene_1` or `#/home`.
   - On reload inside Vite dev mode, reading the initial hash restores the workspace seamlessly while still hydrating `projects` and `previewBaseUrl` cleanly via `useStudio`. Never use `window.history.pushState('/pathname')` because Tauri's `tauri://localhost` asset protocol resolves relative paths from `/`.

---

## 3. Cross-Workspace Deep-Link Flows

Users never hit dead ends when moving between creative stages:

```
[Home Dashboard]
   |-- Click "New Animation" --------> Opens <NewProjectDialog> -> On create: routes to [Animation Editor] (or [Storyboard] if "Review Storyboard First" checked)
   |-- Click Recent Project Card ----> Calls project_load -> routes to [Animation Editor] (active Scene 1)
   |-- Click Doctor Pill (Header/Footer) -------------------------> routes to [System Diagnostics]

[Storyboard]
   |-- Click "Edit Scene in Stage" on Beat N --> Selects matching Scene (sequenceIndex = N-1) -> routes to [Animation Editor]
   |-- Dirty unsaved edits ----------> Prompts Save / Keep Draft before switching projects (in-memory draft retained across workspaces of SAME project!)

[Character Studio]
   |-- Click Character -> "Jump to Action Keyframes" -> Selects Character filter -> routes to [Animation Editor]

[Asset Library]
   |-- Click Background/Audio Asset -> "Assign to Current Scene" -> Updates Scene draft -> routes to [Animation Editor]

[Animation Editor]
   |-- Click "Render MP4" -----------> Starts render inline on Stage (or click "View in Render Queue" pill to monitor [Render Queue])
   |-- Click "Bundle Failed QA" -----> Expands Stage QA Drawer directly under Viewport

[Render Queue]
   |-- Click "Open in Stage" on completed MP4 ---------> switches to Video Mode inside [Animation Editor]
```

---

## 4. Dirty-State & Active Render Navigation Rules

1. **Switching Workspaces Within the Same Project (`Home` <-> `Storyboard` <-> `Character Studio` <-> `Animation Editor` <-> `Settings`):**
   - **Never destroys unsaved edits!** Unsaved scene title, beat edits, character edits, or timeline track drafts live in `StudioContext` (`draftProject` overlaid on `activeProject`) so switching to `Character Studio` to inspect a rig and returning to `Animation Editor` preserves every unsaved tweak (`Unsaved changes` indicator pill stays lit in Zone 1).
2. **Switching to a Different Project (`selectProject(otherId)`) While `isDirty === true`:**
   - Opens native `<dialog>` confirmation: **Save & Switch**, **Discard Changes**, or **Cancel Switch**.
   - Preserves existing `App.test.tsx` behavior when the user edits an active scene while a render is running: completing `project_render` updates `status: 'rendered'` and `videoUrl` **without overwriting in-progress draft edits**.
3. **Navigating Away While `renderingProjectId !== null`:**
   - Allowed freely! Because `useStudio` holds the Tauri event listener `animforge://render-progress` at app root, navigating to `Storyboard`, `Settings`, or `Render Queue` keeps the render alive and updates Zone 5 footer progress in real time.
