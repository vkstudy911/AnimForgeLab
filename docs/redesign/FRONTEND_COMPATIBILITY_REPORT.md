# AnimForge Studio — Frontend Compatibility & Integration Report

**Purpose:** Verify every element of the proposed UX redesign against existing Tauri 2 IPC, Rust `WorkerBridge`, `PreviewServer`, `worker.ts` Protocol v1, Zod schemas, MCP server tools, engine capabilities, CSP, trailing-space workspace paths, and existing tests.

---

## 1. Tauri IPC & Worker Protocol v1 Compatibility Matrix

All 9 existing Tauri commands (`src-tauri/src/lib.rs`) and 1 event channel (`animforge://render-progress`) remain **100% untouched** during Track A.

| Workspace / UI Action | Existing Tauri Command / Event | Core Worker Method | Exact Contract Match & Notes |
| :--- | :--- | :--- | :--- |
| System Diagnostics / Status Footer Pill | `run_doctor` | Rust native + worker `doctor` | Returns `DoctorReport` (`overall`, `workspaceRoot`, 8 checks: `os`, `rust`, `node`, `ffmpeg`, `givemotion`, `remotion`, `stretchystudio`, `directories`). Trailing-space parent path is preserved verbatim. |
| Preview Base URL | `get_preview_base_url` | Rust `PreviewServer` | Returns `http://127.0.0.1:<ephemeral_port>`. |
| Home / Project Manager List | `project_list` | `list_projects` | Returns `ProjectSummary[]` ordered by `updated_at DESC` from SQLite `projects` table. **See Caveat 3.1** regarding disk-only manifests. |
| Home / New Project Modal | `project_create_from_prompt` | `create_project` | Currently `useStudio.ts` only sends `{ name, prompt }`. `worker_bridge.rs` & `ProjectConfigSchema` **already accept optional `{ projectId, name, prompt, width, height, fps, preferredEngine }`**! Safe immediate enhancement in Track A. |
| Load Project into Studio | `project_load` | `load_project` | Validates `assertSafeId(projectId)`. Reads SQLite first, falls back to `projects/<id>/project.animforge.json`. |
| Save Storyboard, Characters, Assets Metadata, Scenes, Keyframes, Camera, Audio, Transitions | `project_save` | `save_project` | Validates full `ProjectSchema`, checks every `scene.projectId === project.id`, compiles `index.html` + `project.animforge.json` via `GivemotionAdapter.saveProjectState`, and upserts SQLite `projects`. Zero backend work needed! |
| Stage Preview & GiveMotion QA | `project_preview` | `preview_project` | Accepts `{ projectId, sceneId? }`. Note: validates `sceneId` belongs to project, then compiles/checks full `bundle/index.html` (`errors`, `warnings`, `notes`, `issues[]`). |
| Stage Render & Render Queue | `project_render` + `animforge://render-progress` | `render_project` + `render_progress` | Streams `{ jobId, projectId, phase, progress, done, total, fps, eta }` over Tauri events while spawning GiveMotion `--workers 1`. Updates `projects.status = 'rendered'` on completion. |
| Cancel Active Render | `project_cancel_render` | `cancel_render` | Handles both early `preparingRenders` state and running child process kill safely. |

---

## 2. Security, CSP & PreviewServer Compatibility (`tauri.conf.json` + `preview_server.rs`)

1. **Content Security Policy (`src-tauri/tauri.conf.json`):**
   - `script-src 'self' http://127.0.0.1:*` -> Supports app bundle AND dynamic `<script src="http://127.0.0.1:<port>/projects/<id>/bundle/gm-player.js">`.
   - `style-src 'self' 'unsafe-inline' http://127.0.0.1:*` -> Compatible with inline style vars (`--stage-aspect`), tokens CSS, and inline `<head>` FOUC-prevention script in `index.html`? **IMPORTANT CHECK:** `script-src` does **NOT** include `'unsafe-inline'`!
   - **CRITICAL FINDING FOR `index.html`:** Because `tauri.conf.json` sets `script-src 'self' http://127.0.0.1:*` WITHOUT `'unsafe-inline'`, **an inline `<script>` block inside `index.html` `<head>` will be blocked by Tauri's CSP in production bundles!**
   - **Correct Safe Solution:** Place the synchronous theme initialization code either in an external tiny classic `<script src="/theme-init.js"></script>` inside `<head>` (which matches `'self'` CSP cleanly and runs synchronously before body render without needing `'unsafe-inline'`), **and/or** initialize at the top of `src/main.tsx` before `ReactDOM.createRoot`. Using `<script src="/theme-init.js"></script>` in `public/theme-init.js` satisfies **both** strict CSP (`script-src 'self'`) AND zero-FOUC synchronous execution before first paint! *(Catching this CSP constraint here prevents a subtle production-only bug.)*
2. **PreviewServer Path Jail (`preview_server.rs`):**
   - Serves strictly `/projects/<safeId>/...` and `/assets/...`.
   - Rejects `..`, hidden dotfiles/directories, symlinks escaping root, unknown MIME extensions, non-loopback `Host` headers, and unauthorized `Origin` headers.
   - Supports `GET`, `HEAD`, and byte `Range` requests for `<video>` scrubbing (`output.mp4`).
   - **Rule for Asset Library Preview:** Only load `<img>` / `<audio>` thumbnails through `previewBaseUrl` when `asset.uri` resolves cleanly inside `assets/...` or `projects/<activeId>/assets/...` (never `file://` URLs, which CSP & WebKit sandbox block).
3. **Zero MCP Exposure over HTTP:**
   - PreviewServer remains read-only asset/bundle playback for the desktop UI. OpenCode MCP stays strictly stdio in `animforge-core/src/mcp/`.

---

## 3. Known Data & Engine Caveats (Explicitly Handled in Design)

1. **SQLite `project_list` vs. Disk-Only Manifests (`database.ts` + `worker.ts`):**
   - `list_projects` reads `SELECT data FROM projects` in SQLite, whereas `load_project` can also read `projects/<id>/project.animforge.json` if missing from DB.
   - *Design Guard:* Projects created externally on disk without touching SQLite won't appear in `Project Manager` until loaded or until Track B reconciles disk discovery in `list_projects`. Documented cleanly in `Project Manager` & `System Diagnostics`.
2. **`preview_project` Compiles Full Project Composition (`worker.ts:274-285`):**
   - Passing `sceneId` validates that the scene exists in the project, then compiles the whole multi-scene `bundle/index.html`.
   - *Design Guard:* UI buttons say **"Preview Composition"** / **"Preview Bundle"** rather than falsely claiming isolated single-scene rendering, while Timeline playhead helps scrub directly inside `<gm-player>` when supported.
3. **GiveMotion Export Constraint (`GivemotionAdapter`):**
   - Worker UI render currently dispatches `GivemotionAdapter` with `--workers 1` (safe for 2-core Acer Aspire A315-21 and M5 MacBook Air).
   - *Design Guard:* In `New Project` and `Settings`, `givemotion` is the default active engine; `remotion` and `stretchystudio` are shown accurately with status badges tied to `DoctorBar` checks until Track B wires Remotion CLI render & StretchyStudio `.stretch` persistence.
4. **Embedded `StretchyStudio` (`engines/stretchystudio`):**
   - `engines/stretchystudio` has its own Vite 5 + React + Radix + Tailwind + ONNX (`onnxruntime-web`) dependency tree and `.stretch` project store (`engines/` is frozen upstream).
   - *Design Guard:* Never copy or merge StretchyStudio dependencies into `animforge-desktop`. Keep Character Studio rig part metadata in `CharacterSchema` (Track A), and integrate StretchyStudio later via isolated Track B build/iframe bridge with explicit theme messaging (WebKit does not inherit `color-scheme` into iframes).
5. **Trailing-Space Workspace Directory (`/Users/vipinkumar/Desktop/animator /AnimForgeLab`):**
   - Never construct shell strings or unencoded `file://` URLs from `workspaceRoot`. UI displays `report.workspaceRoot` directly as text and relies solely on Rust `AppPaths` + `WorkerBridge` argv passing.

---

## 4. Existing Frontend Test Invariants Preserved 100%

All 4 existing Vitest suites (`16/16` tests currently passing) verify critical accessibility and concurrency invariants that the redesign explicitly keeps:

| Test File | Invariant Verified | How Redesign Preserves It |
| :--- | :--- | :--- |
| [App.test.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/App.test.tsx) | `<main>` + `<h1>AnimForge Studio</h1>`; Create Project form `noValidate`, keeps submit enabled, `aria-invalid` + `aria-describedby` error linkage, focus on first invalid control, `450ms` blur debounce clearing stale live text; unsaved scene title edits NOT overwritten when `project_render` completes. | Keep `<main>` + `<h1>AnimForge Studio</h1>`; preserve `useStudio` + `draftProject` separation (only `status: 'rendered'` patches on render finish); retain exact validation + `450ms` blur timer helper on Create Project & Scene Title forms. |
| [DoctorBar.test.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/components/DoctorBar.test.tsx) | Heading `Environment Diagnostics`, `run_doctor` invocation, StrictMode double-effect race sequence guard (`runSeqRef`), error `role="alert"`. | Move `DoctorBar` cleanly into `DiagnosticsWorkspace` (keeping component props/export compatible) while Footer summarizes its report. |
| [PreviewStage.test.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/components/PreviewStage.test.tsx) | Exported `defaultLoadPlayerScript` single-flight deduplication, `<gm-player src>` vs `<video src>` toggle, progress bar + cancel button, QA issue severity badges. | Enhance `PreviewStage.tsx` in-place inside `AnimationEditor`; do NOT break exported symbol names, attribute contracts, or script caching. |
| [useStudio.test.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/hooks/useStudio.test.ts) | `projectSeqRef`, `opTokensRef`, unmount cleanup, `animforge://render-progress` filtering by `activeProjectRef` & `renderingProjectIdRef`, `RENDER_CANCELLED` clean message. | Extend `useStudio` additively with `saveProjectDraft` and optional `ProjectCreateOptions`; touch zero concurrency guards. |
