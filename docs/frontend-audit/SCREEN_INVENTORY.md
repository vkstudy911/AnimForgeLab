# AnimForge Studio — Complete Screen Inventory

**Audit Scope:** Exhaustive check of all 14 candidate functional areas against actual files in `animforge-desktop/src/`.  
**Actual Implemented Screens:** **1 single-page workspace screen** (`App.tsx`) containing 4 stacked/grid functional panels. There is no router, multi-page navigation, modal dialog system, drawer, or settings view.

---

## 1. Existing Implemented Screen

### Screen 1: Main Studio Workspace (`App.tsx`)
- **Route / Navigation Entry:** Root render `/` ([main.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/main.tsx) -> `<App />`); no router or sub-routes exist.
- **Main Purpose:** End-to-end Milestone 1 workbench for listing/creating projects, renaming scenes, bundling & inspecting GiveMotion previews in `<gm-player>`, rendering MP4 video, and checking system dependencies.
- **Layout Structure:**
  - Top bar (`.studio-header`)
  - Live status + error banner strip (`.studio-status`, `.studio-alert`)
  - 2-column `.studio-workspace` (`minmax(300px, 380px)` sidebar + `1fr` stage column):
    - Left sidebar: `Projects` panel, `Create Project` panel, `Selected Scene` panel
    - Right stage: `<PreviewStage />` (`Stage Preview`)
  - Bottom full-width section: `<DoctorBar />` (`Environment Diagnostics`)
- **Components Used:** `App` ([App.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/App.tsx)), `PreviewStage` ([PreviewStage.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/components/PreviewStage.tsx)), `DoctorBar` ([DoctorBar.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/components/DoctorBar.tsx)), `useStudio` ([useStudio.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/hooks/useStudio.ts)).
- **Available Buttons & Actions:**
  - Dismiss global error (`Dismiss`)
  - Select project button per list item
  - Submit Create Project (`Create Project` -> triggers prompt planner + HTML compile)
  - Switch scene tabs (`Scene 1`, `Scene 2`, ...) when `scenes.length > 1`
  - Save scene title (`Save Scene`)
  - Switch view (`Interactive Player` / `Rendered MP4`) when both bundle & MP4 exist
  - Compile & QA (`Preview Bundle`)
  - Start render (`Render MP4`)
  - Abort render (`Cancel Render`)
  - Retry script load (`Retry Player` on `gm-player.js` failure)
  - Expand/collapse `<details>` (`Accessible Scene Description & Script`)
  - Re-run diagnostics (`Re-check`)
- **Data Displayed:**
  - Active project name + status in header
  - Project list (`name`, `status` badge)
  - Selected scene title input & scene index tabs
  - Active project resolution & fps (`width x height @ fps`)
  - Real `<gm-player>` interactive bundle or `<video>` MP4 output
  - Render progress (`phase`, `%`, `Frames done/total`, `fps`, `eta`)
  - GiveMotion QA report (`PASS`/`ERRORS`, error/warning/note counts, issue list with `severity`, `code`, `message`)
  - Scene script summary (`title`, `duration`, `description`)
  - 8 system diagnostic cards (`id`, `label`, `PASS`/`WARN`/`FAIL`, `summary`, `detail`, `workspaceRoot`)
- **Backend / MCP Dependencies:**
  - Calls Tauri commands `get_preview_base_url`, `project_list`, `project_load`, `project_create_from_prompt`, `project_save`, `project_preview`, `project_render`, `project_cancel_render`, `run_doctor` + listens to `animforge://render-progress` + fetches bundle/video HTTP from Rust `PreviewServer` (`127.0.0.1:<port>`).
  - **Zero direct MCP dependencies.**
- **Implementation Status:** **Implemented (M1 Scope)** — Functional within Milestone 1 limits; lacks multi-screen navigation and full authoring editors.

---

## 2. Requested Areas Check (14-Area Coverage Matrix)

| # | Requested Area | Exists as Separate Screen/Panel? | Actual Implementation Finding | Status |
| :-: | :--- | :--- | :--- | :--- |
| 1 | **Home / Dashboard** | No | No welcome dashboard, recent project grid, templates, or hardware metrics. Landing view shows the full 2-column editor immediately with `"No project active."` on the stage. | **Not Implemented** |
| 2 | **Project Manager** | Partial (Sidebar Panel) | `.panel` titled `Projects` in `App.tsx` lists project buttons (`name` + `status` badge) and loads selected project (`project_load`). No search, sort, duplicate, delete, or resolution/fps display in list. | **Partially Implemented** |
| 3 | **Project Creation** | Yes (Sidebar Panel) | `.panel` titled `Create Project` in `App.tsx` accepts `Project Name` and `Animation Prompt`. Width/height/fps/engine cannot be picked in UI (backend defaults to `1280x720`, `30 fps`, `givemotion`). | **Partially Implemented** |
| 4 | **Storyboard** | No | Prompt planner (`StoryDirectorAgent`) populates `project.storyboard` in backend JSON/SQLite, and `PreviewStage` renders read-only `<details>` scene descriptions, but there is **no Storyboard screen or beat editor**. | **Not Implemented** (Read-only scene description foldout only) |
| 5 | **Scene Editor** | Minimal (Title Only) | `.panel` titled `Selected Scene` in `App.tsx` lets users switch scene tabs and edit/save **only `scene.title`**. Cannot add/delete/reorder scenes or edit `description`, `duration`, `transition`, or `backgroundAssetId`. | **Minimal / Partially Implemented** |
| 6 | **Character Studio** | No | No UI for viewing `project.characters`, editing segmented parts/palettes, or hosting `engines/stretchystudio` WebGL2 rigging / DWPose. | **Not Implemented** |
| 7 | **Asset Library** | No | `AnimForgeLab/assets/{audio,backgrounds,characters,props,references}` exists on disk and in `ProjectDetail.assets` + MCP tools, but **zero UI** lists, previews, or imports assets. | **Not Implemented** |
| 8 | **Animation Canvas** | No | Stage only hosts read-only playback (`<gm-player>` or `<video>`). There is no interactive spatial canvas for positioning/transforming characters or props, nor character action authoring UI. | **Not Implemented** (Playback stage only) |
| 9 | **Timeline / Keyframe Editor** | No | Backend schema (`Scene.timeline`) and MCP (`animforge_update_keyframes`) support actions/camera/audio, but **zero timeline scrubber, tracks, or keyframe controls exist in UI** (beyond native `<gm-player controls>` playbar). | **Not Implemented** |
| 10 | **Preview Player** | Yes (Main Stage Panel) | `PreviewStage.tsx` mounts real `<gm-player src="http://127.0.0.1:.../bundle/index.html?v=..." controls>` plus `Interactive Player` / `Rendered MP4` toggle, `Ready/Playing/Paused/Ended` badge, time readout, script retry, and GiveMotion QA check list. | **Implemented & Functional** |
| 11 | **Render / Export** | Partial (Stage Controls + Progress) | `Render MP4` button + native `<progress>` bar + frame/fps/ETA metadata + `Cancel Render` + inline `<video controls>` playback. Missing export format picker, resolution/quality selector, worker cap settings, output folder reveal/download button, or `ffprobe` card. | **Partially Implemented** |
| 12 | **Agent Center** | No | No UI panel for AI agents (`StoryDirector`, `CharacterManager`, `ScenePlanner`), OpenCode MCP connection status, MCP logs, or prompt-iteration chat. | **Not Implemented** |
| 13 | **Settings** | No | No settings screen/modal for workspace path override, theme (dark/light), hardware concurrency (`--workers`), preview scale (`0.5x`), or Remotion license/engine selection. | **Not Implemented** |
| 14 | **System Doctor / Diagnostics** | Yes (Bottom Full Panel) | `DoctorBar.tsx` displays `workspaceRoot`, `Re-check` button, error alert, and 8 diagnostic cards (`OS & Arch`, `Rust & Cargo`, `Node & npm`, `FFmpeg & ffprobe`, `GiveMotion`, `Remotion`, `StretchyStudio`, `Workspace Paths`) with `PASS`/`WARN`/`FAIL` badges. | **Implemented & Functional** |

---

## 3. Visual Capture Note (`docs/frontend-audit/screenshots/`)

- During this audit, the compiled standalone Tauri release binary (`animforge-desktop/src-tauri/target/release/animforge-desktop`) was launched cleanly and confirmed opening native window **ID `1151` (`AnimForge Studio`)** before clean `SIGTERM` shutdown.
- Automated `screencapture -x -o -l 1151` failed with exit code `1` (`could not create image from window`) because macOS Screen Recording (TCC) authorization is required to capture pixels of native macOS windows from a background terminal process.
- Per safety rules (never bypass OS permissions and never substitute mockups for the actual running desktop app), `docs/frontend-audit/screenshots/` was left without fake screenshots. Interactive visual capture can be collected directly inside an authorized macOS user session or after granting Screen Recording permission.
