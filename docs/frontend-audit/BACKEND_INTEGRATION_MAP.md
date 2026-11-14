# AnimForge Studio — Backend Integration Map

**Audit Scope:** Complete data & control flow across `animforge-desktop` UI, Tauri Rust host, `animforge-core` stdio worker, animation engine adapters, `PreviewServer`, and standalone OpenCode MCP server.

---

## 1. End-to-End Architecture Diagram

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ React 18 Desktop Frontend (animforge-desktop/src/)                            │
│  App.tsx ──► useStudio.ts (invoke/listen)    DoctorBar.tsx (invoke)           │
│  PreviewStage.tsx (<gm-player> & <video> HTTP fetch to 127.0.0.1:<port>)      │
└───────────────┬──────────────────────────────────────────▲────────────────────┘
                │ Tauri IPC (invoke + event)               │ HTTP/1.1 GET/HEAD + Range
                ▼                                          │
┌──────────────────────────────────────────────────────────┴────────────────────┐
│ Tauri 2 Rust Host (animforge-desktop/src-tauri/src/)                          │
│  doctor.rs (8 local OS/binary/dir probes; spawns `node engines/givemotion doctor`)
│  preview_server.rs (127.0.0.1:0 path-jailed static + Range HTTP server)       │
│  worker_bridge.rs (persistent child stdin/stdout NDJSON v1 + `kill -TERM`)    │
│    └─ emits Tauri event `animforge://render-progress`                         │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │ stdin/stdout JSON Lines (WORKER_PROTOCOL_VERSION = 1)
                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ Node.js Worker (animforge-core/dist/src/worker.js <workspaceDir>)             │
│  Methods: doctor, list_projects, create_project, load_project, save_project,  │
│           preview_project, render_project, cancel_render                      │
│  Uses: AnimForgeDatabase (SQLite projects/animforge.db)                       │
│        AnimForgePipeline (StoryDirector -> CharacterManager -> ScenePlanner)  │
│        GivemotionAdapter -> compileProjectHtml() -> GiveMotion CLI            │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │ child_process spawn / execFile (shell: false, --workers 1)
                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ GiveMotion Engine (engines/givemotion/src/cli.js)                             │
│  doctor | check --json --fast | bundle | render --progress json --workers 1   │
│  External Binaries: Google Chrome (headless frame capture) + FFmpeg (H.264)   │
└───────────────────────────────────────────────────────────────────────────────┘

══════════════════ SEPARATE EXTERNAL CHANNEL (NOT CALLED BY UI) ═════════════════
OpenCode CLI ──(stdio MCP JSON-RPC)──► animforge-core/dist/src/mcp/index.js
  16 tools (`animforge_*`) -> AnimForgeMcpService -> same DB/Pipeline/Adapter + ffprobe
```

---

## 2. Frontend-to-Backend Integration Matrix

| Frontend Component / Hook | IPC / HTTP Call | Rust / Worker Handler | Engine / Dependency | Return / UI Result |
| :--- | :--- | :--- | :--- | :--- |
| `DoctorBar.tsx` | `invoke('run_doctor')` | `doctor::run_doctor` -> `collect_doctor_report_with` | Local OS, `rustc`/`cargo`, `node`/`npm`, `ffmpeg`/`ffprobe`, `engines/givemotion/src/cli.js doctor`, fs checks for Remotion/StretchyStudio/dirs | Renders 8 `DoctorCheckItem` cards + `workspaceRoot` |
| `useStudio.ts` (mount) | `invoke('get_preview_base_url')` | `preview_server::get_preview_base_url` | `PreviewServer` (`127.0.0.1:<ephemeral_port>`) | Stores base URL to compose `bundleUrl`, `playerScriptUrl`, `videoUrl` |
| `useStudio.ts` (mount & after create) | `invoke('project_list')` | `worker_bridge::project_list` -> worker `list_projects` | `AnimForgeDatabase` (`projects/animforge.db`) | Populates `Projects` sidebar list (`ProjectSummary[]`) |
| `App.tsx` (`selectProject`) | `invoke('project_load', { projectId })` | `worker_bridge::project_load` -> worker `load_project` | SQLite DB or disk fallback `projects/<id>/project.animforge.json` | Populates `activeProject` & scene tabs |
| `App.tsx` (`createProject`) | `invoke('project_create_from_prompt', { input })` | `worker_bridge::project_create_from_prompt` -> worker `create_project` | `AnimForgePipeline.planProject` -> `GivemotionAdapter.saveProjectState` (`index.html`, `givemotion.json`, `project.animforge.json`) + SQLite | Creates & selects new project |
| `App.tsx` (`saveSceneTitle`) | `invoke('project_save', { project })` | `worker_bridge::project_save` -> worker `save_project` | `GivemotionAdapter.saveProjectState` (recompiles `index.html` + JSON) + SQLite | Updates `activeProject` + list item summary |
| `PreviewStage.tsx` (`Preview Bundle`) | `invoke('project_preview', { projectId, sceneId? })` | `worker_bridge::project_preview` -> worker `preview_project` | `GivemotionAdapter.previewProject` -> GiveMotion CLI `check --json --fast` (Chrome) + `bundle` | Sets `previewResult` (QA issues) + increments `previewRev` (`bundle/index.html?v=N`) |
| `PreviewStage.tsx` (script + stage + video) | HTTP `GET`/`HEAD` over `127.0.0.1` | `preview_server::handle_client` (`resolve_safe_asset`) | Static jailed files in `projects/<id>/...` (`gm-player.js`, `bundle/index.html`, `output.mp4` with HTTP `Range`) | Runs `<gm-player>` and `<video>` in WebView |
| `PreviewStage.tsx` (`Render MP4`) | `invoke('project_render', { projectId })` + `listen('animforge://render-progress')` | `worker_bridge::project_render` -> worker `render_project` + progress events | `GivemotionAdapter.render` (`--workers 1`, headless Chrome + FFmpeg `output.mp4`) | Live progress bar -> sets `videoRev` -> `<video>` plays `output.mp4?v=N` |
| `PreviewStage.tsx` (`Cancel Render`) | `invoke('project_cancel_render', { projectId })` | `worker_bridge::project_cancel_render` -> worker `cancel_render` | `GivemotionAdapter.cancelRender` (`SIGTERM` -> `SIGKILL`) | Aborts render job; resets state & surfaces `"Render cancelled."` |

---

## 3. Engine Dependency Breakdown

| Engine / Tool | Frontend Runtime Usage | Rust `doctor.rs` Usage | `worker.ts` Usage | `src/mcp/` Usage |
| :--- | :--- | :--- | :--- | :--- |
| **GiveMotion** | Active (`<gm-player>` + QA issues + MP4 playback) | Probed (`node cli.js doctor`) | Primary engine for compile, preview (`check`/`bundle`), render, cancel | Primary engine for all 16 tools |
| **FFmpeg / ffprobe** | Indirect (produces `output.mp4` for `<video>`) | Probed (`ffmpeg -version`, `ffprobe -version`) | FFmpeg used via GiveMotion `render` | FFmpeg via GiveMotion + **`ffprobe`** directly in `animforge_export_video` |
| **Remotion** | **None in desktop UI** | File check (`projects/remotion-test/node_modules/@remotion/cli` or `engines/remotion/package.json`) | Not dispatched by `worker.ts` (no adapter wiring there) | Checked in `animforge_doctor` (`remotionAvailable`); `export_video` returns `UNSUPPORTED` |
| **StretchyStudio** | **None in desktop UI** | Build check (`engines/stretchystudio/dist/index.html` & `node_modules`) | Not dispatched by `worker.ts` | Checked in `animforge_doctor` (`stretchyStudioAvailable`); `.stretch` file extension allowed in `import_asset`, mesh/bone editing unsupported |
| **AnimForge MCP (`animforge_*`)** | **Zero direct connection** (GUI & MCP run as sibling clients against the same `projects/animforge.db` and `projects/<id>/` workspace) | Independent | Independent | 16 tools exposed to OpenCode over stdio JSON-RPC |

---

## 4. Critical Architectural Constraints for Redesign

1. **Dual-Writer Shared Workspace (`worker.ts` & `mcp/index.ts`):** Because OpenCode MCP edits the exact same `projects/animforge.db` and `projects/<id>/` directory externally, the redesigned frontend will go stale unless a **Refresh / Workspace Watch** mechanism is added (without touching MCP behavior).
2. **`PreviewServer` Security & CSP Coupling:** All local HTTP assets MUST remain served under `http://127.0.0.1:<port>/projects/<safeId>/...` or `/assets/...` (preserving `tauri.conf.json` CSP and symlink/path jail checks).
3. **`worker.ts` Protocol v1 Scope Gap:** Right now `worker.ts` only exposes 8 RPC methods (`doctor`, `list_projects`, `create_project`, `load_project`, `save_project`, `preview_project`, `render_project`, `cancel_render`). Notably, **`save_project` already persists full `Project` schemas** (scenes, actions, camera moves, audio tracks, assets, characters, resolution, fps!), so a richer desktop Scene/Timeline/Camera/Character-action editor can already serialize changes through `project_save`—while **Asset listing/importing (`assets/`), Storyboard regeneration, `ffprobe` metadata, or StretchyStudio rig authoring** would require additive worker v1 methods or Tauri commands in M2.
4. **Low-Spec Linux & M-Series Mac Hardware Budget:** Any redesigned stage/timeline UI must keep memory low (no eager multi-video decoding), default render concurrency at `--workers 1`, and support light/low-res preview modes cleanly inside `960x640` minimum windows.
