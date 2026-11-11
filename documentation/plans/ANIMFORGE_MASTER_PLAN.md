# AnimForge Studio — Master Implementation Plan

> **For agentic workers:** Follow `superpowers:executing-plans` + `superpowers:subagent-driven-development` + `superpowers:test-driven-development` + `ponytail` / `ponytail-review`. Execute one micro-task at a time, run tests after every meaningful change, delegate independent review via `invoke_subagent`, update `ANIMFORGE_PROGRESS.md` after every verified task, and commit verified logical units once Git is initialized.

**Goal:** Transform `AnimForgeLab/` (preserving existing `engines/givemotion`, `engines/remotion`, `engines/stretchystudio`) into **AnimForge Studio**, a resource-aware native macOS & Linux desktop cartoon animation application powered by `Tauri 2 + Rust + React 18 + TypeScript + Vite`.

**Specs & Baseline Inputs:**
- [REPOSITORY_AUDIT.md](../REPOSITORY_AUDIT.md)
- [TASK_01_ENVIRONMENT_REPORT.md](./TASK_01_ENVIRONMENT_REPORT.md)
- [architecture.md](../architecture.md)
- [integration-plan.md](../integration-plan.md)

---

## Global Constraints & Hardware Profile

1. **Preserve Upstream Engines:** Never reclone, overwrite, or modify upstream files inside `engines/givemotion/`, `engines/remotion/`, `engines/stretchystudio/`, or existing sample `.mp4`/source assets in `projects/{givemotion-test,remotion-test,demo-animation,cybersecurity-explainer}`.
2. **Trailing-Space Workspace Path:** Workspace parent `/Users/vipinkumar/Desktop/animator /` ends with literal ASCII `0x20`. **Never** call `.trim()` on filesystem paths; **never** use `exec` shell string interpolation (`execAsync`); always pass argument arrays (`spawn`/`execFile` with `shell: false` in Node; `Command::new(...).arg(...)` in Rust).
3. **Path Jail & Security:** Validate IDs cleanly (`/^[a-zA-Z0-9_-]{1,64}$/`) and resolve all project reads/writes/HTTP assets inside `AnimForgeLab/projects/<projectId>/` (or declared `AnimForgeLab/assets/`), rejecting traversal (`../`, URL-encoded `%2e%2e`, NUL bytes, symlink escapes). Never read `.env` or `.venv`.
4. **Target Stack & License Boundary:** Tauri 2 + Rust + React 18.3.x + TypeScript 5.x + Vite 5.4.x (`zod ^3.23.8`). Embed only MIT engines (`GiveMotion`, `StretchyStudio` with attribution); keep Custom-licensed `Remotion` isolated as an optional external CLI adapter.
5. **Resource-Aware Hardware Design:** Primary dev/render on MacBook Air M5 (16 GB RAM); secondary Linux target Acer Aspire A315-21 (2-core CPU, 12 GB RAM, AMD Radeon E9000). Default render concurrency to **`--workers 1`**, support low-resolution previews, lazy-load heavy assets (DWPose WASM / renders), and terminate child processes cleanly on exit.
6. **Honest Status & Verification:** Never mark `BLOCKED`, `FAILED`, or `SKIPPED` work as complete; never pass mocks off as real video renders.

---

## Visual Design Direction (Milestone 1 Shell -> Milestone 2 Studio)

- **Dark Cinematic Studio Layout:** Deep slate/charcoal panels (`#0b0f17`–`#131926`), compact icon+label top toolbar (Doctor badge bar, project actions, preview/render status, zoom/transport controls), three-pane studio layout:
  - **Left Dock:** Asset & Scene / Character Layer Browser
  - **Center Stage:** Large primary Animation / Rig / `<gm-player>` Viewport
  - **Right Dock:** Properties & Camera / Keyframe Inspector
  - **Bottom Dock:** Timeline, Keyframes & Audio Strip
- **Responsiveness & Ergonomics:** Collapsible docks for smaller laptop viewports (1280px–1440px), keyboard shortcuts (`Space` play/pause, `Cmd/Ctrl+S` save, `Cmd/Ctrl+Z` undo), undo/redo history, and throttled autosave.

---

# MILESTONE 1 — CORE FOUNDATION (Workstreams A–H)

## `M1-T01`: Environment & Repository Verification *(COMPLETED)*
- **Status:** Verified in [TASK_01_ENVIRONMENT_REPORT.md](./TASK_01_ENVIRONMENT_REPORT.md).

---

## `M1-T02` (Workstream A): Repository Safety, `.gitignore` & Root Git Initialization
- **Objective:** Inspect non-engine files cleanly, protect secrets/caches/engines/large artifacts with a strict `.gitignore`, update `animforge-core` test script discovery, and initialize the root Git repository at `AnimForgeLab/`.
- **Exact Files Involved:**
  - Create: `AnimForgeLab/.gitignore`
  - Modify: `AnimForgeLab/animforge-core/package.json`
- **Dependencies:** `M1-T01`.
- **Implementation Steps:**
  1. Scan filenames (never `.env`/`.venv` contents) across `AnimForgeLab/` to confirm no secrets or unexpected large artifacts exist outside `engines/` and sample `projects/`.
  2. Write `AnimForgeLab/.gitignore` excluding `.env*`, `.venv*`, `*.pem`, `*.key`, `.DS_Store`, `.superpowers/`, `engines/`, `**/node_modules/`, `**/dist/`, `projects/proj_*/`, `projects/**/.gm-parts/`, `projects/**/.remotion/`, `projects/**/snapshots/`, `projects/**/out*`, `projects/**/bundle/`, `*.mp4`, `*.mov`, `*.webm`, `*.wav`, `*.mp3`, `*.onnx`, `*.db`, `*.sqlite*`, `animforge-desktop/src-tauri/target/`.
  3. Update `animforge-core/package.json` `"scripts"` so `"test": "tsc && node --test dist/test/*.unit.test.js dist/test/pipeline.test.js"` (or pattern excluding `*.integration.test.js` unless `ANIMFORGE_INTEGRATION=1`) and `"test:integration": "tsc && ANIMFORGE_INTEGRATION=1 node --test dist/test/givemotion.integration.test.js"`.
  4. Initialize `git init` in `AnimForgeLab/`, verify `git status --short` excludes `engines/`, `node_modules/`, `dist/`, `.DS_Store`, `*.mp4`, and commit baseline snapshot + updated scripts cleanly.
- **Tests:**
  - `git status --short` confirms clean exclusion of `engines/` and artifacts.
  - `cd animforge-core && npm run typecheck && npm test` passes baseline `5/5` tests.
- **Acceptance Criteria:**
  - Root `.git` exists in `AnimForgeLab/` with clean baseline commit; `engines/` untouched & ignored; `npm test` discovers unit suites automatically while gating browser integration tests explicitly.
- **Rollback Strategy:** Remove `AnimForgeLab/.git`, `.gitignore`, and revert `animforge-core/package.json` to restore pre-Task state without touching `engines/`.

---

## `M1-T03` (Workstream B): Node.js & TypeScript Safe Path Utilities & Path Jail
- **Objective:** Implement path-jail protection and HTML escaping in `animforge-core/utils/paths.ts` that preserves leading/trailing whitespace on workspace paths (including `/Users/vipinkumar/Desktop/animator `) and stops traversal/NUL/symlink escapes.
- **Exact Files Involved:**
  - Create: `AnimForgeLab/animforge-core/utils/paths.ts`
  - Modify: `AnimForgeLab/animforge-core/src/index.ts` (export path utilities)
  - Create: `AnimForgeLab/animforge-core/test/paths.test.ts`
- **Dependencies:** `M1-T02`.
- **Implementation Steps (TDD):**
  1. **RED:** Write `animforge-core/test/paths.test.ts` covering:
     - `assertSafeId` accepts `proj_123-abc` and rejects `""`, `"../evil"`, `"a/b"`, `"a\\b"`, `".hidden"`, `"foo\0bar"`, IDs `> 64` chars, and preserves valid IDs without trimming whitespace.
     - `resolveProjectDir('/Users/vipinkumar/Desktop/animator /AnimForgeLab', 'proj_42')` preserves exact trailing space on `/Users/vipinkumar/Desktop/animator ` and returns `.../AnimForgeLab/projects/proj_42`.
     - `resolveWorkspacePath(baseDir, relPath)` rejects absolute paths, `..` traversal, URL-encoded `%2e%2e`, NUL bytes, and symlinks pointing outside `baseDir` (tested with real symlink in temp dir containing spaces!).
     - `escapeHtml('<script attr="x">&\'test\'</script>')` escapes `< > & " '`.
  2. Run `npm test` -> verify RED failure.
  3. **GREEN:** Implement `assertSafeId`, `resolveProjectDir`, `resolveWorkspacePath` (using `path.resolve` + `fs.realpathSync` when path/parent exists + `path.sep` containment check, ZERO `.trim()` calls on filesystem paths), and `escapeHtml`.
  4. Run `npm run typecheck && npm test` -> verify GREEN + clean.
- **Tests:** `animforge-core/test/paths.test.ts` + `pipeline.test.ts` via `npm test`.
- **Acceptance Criteria:** Zero `.trim()` calls on any filesystem path; all traversal, encoded traversal, symlink escape, and trailing-space unit tests pass.
- **Rollback Strategy:** `git revert` commit (only new `utils/paths.ts` & `paths.test.ts` added).

---

## `M1-T04` (Workstream C): Canonical Deterministic `projectId` Contract & Strict Type Safety
- **Objective:** Establish a single caller-supplied `projectId` contract across `AnimationEngineAdapter`, `AnimForgePipeline`, `GivemotionAdapter`, `RemotionAdapter`, and `StretchyStudioAdapter`, eliminate unsafe type assertions (`as any`), and prevent XSS/template injection in adapters.
- **Exact Files Involved:**
  - Modify: `AnimForgeLab/animforge-core/adapters/adapter.interface.ts`
  - Modify: `AnimForgeLab/animforge-core/src/pipeline.ts`
  - Modify: `AnimForgeLab/animforge-core/src/database.ts`
  - Modify: `AnimForgeLab/animforge-core/adapters/givemotion.adapter.ts`
  - Modify: `AnimForgeLab/animforge-core/adapters/remotion.adapter.ts`
  - Modify: `AnimForgeLab/animforge-core/adapters/stretchystudio.adapter.ts`
  - Create: `AnimForgeLab/animforge-core/test/project-contract.test.ts`
- **Dependencies:** `M1-T03`.
- **Implementation Steps (TDD):**
  1. **RED:** Write `animforge-core/test/project-contract.test.ts` verifying:
     - `AnimForgePipeline.execute` creates one `projectId` (`/^proj_\d+$/`), passes `createProject(projectId, config, [character])`, passes identical `scene.projectId` to every `createScene(scene)`, calls `render(projectId, progressCb)`, and saves matching `project.id === renderJob.projectId` in SQLite.
     - `RemotionAdapter.createProject`, `StretchyStudioAdapter.createProject`, and `GivemotionAdapter.createProject` all accept & return the exact supplied `projectId`, reject traversal IDs (`../escape`), write strictly inside `projects/<projectId>/`, and safely escape `config.name`.
  2. Run `npm test` -> verify RED failure.
  3. **GREEN:**
     - Export `RenderProgressUpdate` (`phase: 'open' | 'frames' | 'encode' | 'done'`, `progress`, `done?`, `total?`, `fps?`, `eta?`) and optional `dispose?(): Promise<void>` in `adapter.interface.ts`; update `createProject(projectId: string, config: ProjectConfig, characters?: Character[]): Promise<string>` and `render(projectId: string, onProgress?: (info: RenderProgressUpdate) => void): Promise<RenderJob>`.
     - Refactor `database.ts` to replace `as any` with typed `unknown` row parsing (`RenderJobSchema` / typed helper guards).
     - Refactor `pipeline.ts` to remove `as any` (`unknown` data in `PipelineProgressCallback`), pass `projectId` + `[character]` + progress forwarding.
     - Update all 3 adapters to use `assertSafeId` + `resolveProjectDir` + `escapeHtml`/`JSON.stringify`.
- **Tests:** `npm run typecheck && npm test` (including `project-contract.test.ts`).
- **Acceptance Criteria:** Zero unsafe `as any` casts in modified `src/`/`adapters/`; all 3 adapters obey `createProject(projectId, config, characters?)` inside the path jail.
- **Rollback Strategy:** `git revert` commit for `M1-T04`.

---

## `M1-T05` (Workstream D1): Pure GiveMotion HTML & SVG Scene Compiler
- **Objective:** Replace stub `<h2>/<p>` HTML output with a deterministic pure compiler (`Scene` + `Character` -> GiveMotion HTML/SVG/CSS composition) capable of passing `givemotion check` visual QA and rendering animated cartoon scenes.
- **Exact Files Involved:**
  - Create: `AnimForgeLab/animforge-core/adapters/givemotion.compiler.ts`
  - Create: `AnimForgeLab/animforge-core/test/givemotion.compiler.test.ts`
- **Dependencies:** `M1-T03`, `M1-T04`.
- **Implementation Steps (TDD):**
  1. **RED:** Write unit tests in `givemotion.compiler.test.ts` verifying `<html data-width data-height data-fps>`, `<main data-sequence>`, `<section class="scene" id="..." data-duration data-camera data-transition>`, CSS keyframes matching `CharacterActionSchema` actions (`walk`, `run`, `wave`, `smile`, `blink`, `look_around`, `idle`), `<svg>` body parts using `character.colorPalette` & `parts`, camera mapping (`zoom`/`push`/`pull`/`pan`/`shake`/`static`), HTML escaping (`escapeHtml`), and empty-character fallback rendering.
  2. **GREEN:** Implement `compileProjectHtml` and `buildCharacterSvg` with high-contrast dark stage backdrop, >= 60px safe margins, and deterministic CSS animations.
- **Tests:** `npm run typecheck && npm test` (`givemotion.compiler.test.ts`).
- **Acceptance Criteria:** Zero disk I/O in compiler; all scenes, characters, camera moves, transitions, and XSS strings compile cleanly.
- **Rollback Strategy:** `git revert` commit for `M1-T05`.

---

## `M1-T06` (Workstream D2): Safe `spawn` Process Runners, `--progress json` & Adapter Verification
- **Objective:** Eliminate all shell-interpolated `execAsync` calls in `GivemotionAdapter` and `RemotionAdapter`, replacing them with `node:child_process` `execFile`/`spawn` (`shell: false` + argument arrays), partial-chunk NDJSON `--progress json` parsing, resource-aware `--workers 1` default, non-zero exit & error-event handling, `check --json` + `bundle`, and child cleanup.
- **Exact Files Involved:**
  - Create: `AnimForgeLab/animforge-core/adapters/givemotion.ndjson.ts`
  - Modify: `AnimForgeLab/animforge-core/adapters/givemotion.adapter.ts`
  - Modify: `AnimForgeLab/animforge-core/adapters/remotion.adapter.ts`
  - Create: `AnimForgeLab/animforge-core/test/givemotion.adapter.test.ts`
  - Create: `AnimForgeLab/animforge-core/test/remotion.adapter.test.ts`
- **Dependencies:** `M1-T03`, `M1-T04`, `M1-T05`.
- **Implementation Steps (TDD):**
  1. **RED:** Write failing tests covering:
     - `parseDoctorStdout`, `createNdjsonLineParser` (JSON objects split across 3 chunks + partial lines + non-JSON stderr noise), `progressPercent`.
     - `GivemotionAdapter` with temp workspace whose path contains a trailing space (`".../ws /"`): verifies `shell: false`, argument arrays (never `/bin/sh`), idempotent `createScene` + `givemotion.json` + `project.animforge.json` persistence, `preview()` handling `check --json` exit code `1` with parsed QA issues vs clean `ok: true` + `bundle`, `render()` streaming chunked NDJSON progress + `--workers 1` -> `completed` -> `exportVideo()`, and failure handling on spawn `error` event, stderr error JSON event, or non-zero exit code.
     - `RemotionAdapter` safe `spawn`/`execFile` (`shell: false`, `cwd: projectDir` without `cd "..." &&`) in a space-containing workspace path.
  2. **GREEN:** Implement `givemotion.ndjson.ts`, refactor `givemotion.adapter.ts` & `remotion.adapter.ts` with injectable process runner seam (`spawn`, `execFile`) and `dispose()`.
- **Tests:** `npm run typecheck && npm test`.
- **Acceptance Criteria:** Zero `exec(` or `/bin/sh` calls anywhere in `animforge-core/`; tests pass cleanly for paths containing leading/internal/trailing spaces and split NDJSON stderr chunks.
- **Rollback Strategy:** `git revert` commit for `M1-T06`.

---

## `M1-T07` (Workstream D3 / IPC Bridge): NDJSON Stdio Worker Process (`src/worker.ts`)
- **Objective:** Expose core operations (`doctor`, `create_project`, `load_project`, `save_project`, `preview_project`, `render_project`, `list_projects`) over clean line-delimited JSON stdio for Tauri Rust IPC (and future MCP transport), with Zod validation and clean EOF/`SIGTERM` child teardown.
- **Exact Files Involved:**
  - Create: `AnimForgeLab/animforge-core/src/worker.ts`
  - Create: `AnimForgeLab/animforge-core/test/worker.test.ts`
- **Dependencies:** `M1-T06`.
- **Implementation Steps (TDD):**
  1. **RED:** Write `worker.test.ts` spawning real `node dist/src/worker.js <tempWorkspaceWithTrailingSpace>`: test malformed JSON resilience, `../evil` path traversal rejection, `create_project` -> `load_project` -> `save_project` persistence across `projects/<id>/project.animforge.json`, `index.html`, and `projects/animforge.db`, and exit `0` within `2000ms` on `stdin` close.
  2. **GREEN:** Implement `src/worker.ts` with `readline`, Zod RPC request validation, serialized JSON line writer, and cleanup on `close`/`SIGTERM`.
- **Tests:** `npm run typecheck && npm test`.
- **Acceptance Criteria:** Spawning worker in a trailing-space workspace passes all RPC & lifecycle tests without network or Chrome.
- **Rollback Strategy:** `git revert` commit for `M1-T07`.

---

## `M1-T08` (Workstream E): Real Animation MP4 Export Integration Test & `ffprobe` Verification
- **Objective:** Execute a real unmocked GiveMotion HTML -> Chrome capture -> FFmpeg H.264 MP4 render inside `AnimForgeLab/` (whose parent contains a trailing space), verify `<gm-player>` bundle creation, and validate the resulting MP4 with `ffprobe` (format, `h264`, duration, width, height).
- **Exact Files Involved:**
  - Create: `AnimForgeLab/animforge-core/test/givemotion.integration.test.ts`
- **Dependencies:** `M1-T06`, Chrome + FFmpeg + `ffprobe` on host. *(Note: Requires unsandboxed execution approval if terminal sandbox blocks Chrome launch or `127.0.0.1` loopback sockets.)*
- **Implementation Steps:**
  1. Implement `givemotion.integration.test.ts` gated on `ANIMFORGE_INTEGRATION=1` (cleaning up temporary `proj_int_*` folder after verification, or writing reproducible output check).
  2. Verify `adapter.initialize()`, `createProject`, `createScene` (`1280x720`, `30fps`), `preview` (`check` passes with `errors === 0`, `bundleDir/gm-player.js` & `index.html` exist), `render` emits real NDJSON progress events (`0 < p < 100` -> `100`), `ffprobe` confirms `format_name` includes `mp4`, `codec_name === 'h264'`, `width === 1280`, `height === 720`, `duration >= 1.5`.
- **Tests:**
  - `cd animforge-core && npm test` (confirms unit tests pass & integration gates cleanly)
  - `cd animforge-core && npm run test:integration` (real Chrome + FFmpeg + `ffprobe` execution — request unsandboxed approval if sandbox blocks Chrome)
- **Acceptance Criteria:** Real MP4 produced on disk and independently verified via `ffprobe` output; no mocks used.
- **Rollback Strategy:** `git revert` commit and remove temporary `projects/proj_int_*` test directory.

---

## `M1-T09` (Workstream F): Rust Toolchain & Tauri 2 + React 18 + Vite Desktop Shell *(BLOCKED pending Rust install approval)*
- **Objective:** Install `rustup` (`rustc` + `cargo`) with user permission, scaffold `animforge-desktop/` (`Tauri 2`, `Rust`, `React 18.3.x`, `TypeScript`, `Vite 5.4.x`) targeting macOS & Linux (WKWebView / WebKitGTK 4.1).
- **Exact Files Involved:**
  - Create: `AnimForgeLab/animforge-desktop/{package.json,tsconfig.json,vite.config.ts,vitest.config.ts,index.html}`
  - Create: `AnimForgeLab/animforge-desktop/src/{main.tsx,App.tsx,styles.css}`
  - Create: `AnimForgeLab/animforge-desktop/src-tauri/{Cargo.toml,build.rs,tauri.conf.json,capabilities/default.json,src/main.rs,src/lib.rs}`
- **Dependencies:** `M1-T07`, `M1-T08`, **`rustup`/`rustc`/`cargo` installation approval**.
- **Implementation Steps:** Request user permission for `rustup` install; verify `rustc --version` & `cargo --version`; scaffold React 18 + Vite 5.4 + Tauri 2 shell; configure CSP for local `127.0.0.1` preview; verify `cargo test && cargo check && npm run build`.
- **Tests:** `cargo check && cargo test`, `npm test && npm run build` inside `animforge-desktop/`.
- **Acceptance Criteria:** Clean Tauri 2 build + dark desktop shell window opens on macOS without errors (and Cargo deps/config cross-compatible with Linux WebKitGTK).
- **Rollback Strategy:** Remove `animforge-desktop/` and revert commit.

---

## `M1-T10` (Workstream G): Native Rust `doctor` Dependency Checker
- **Objective:** Implement structured Rust health checks across OS/arch, Rust/Cargo, Node/npm, FFmpeg/ffprobe, GiveMotion, Remotion, StretchyStudio, and `assets/` & `projects/` directories returning `PASS`/`WARN`/`FAIL`.
- **Exact Files Involved:**
  - Create: `AnimForgeLab/animforge-desktop/src-tauri/src/doctor.rs`
  - Modify: `AnimForgeLab/animforge-desktop/src-tauri/src/lib.rs`
  - Create: `AnimForgeLab/animforge-desktop/src/components/DoctorBar.tsx`
- **Dependencies:** `M1-T09`.
- **Tests:** `cargo test` (pure fixture unit tests + missing-binary & space-in-path cases) + Vitest `DoctorBar.test.tsx`.
- **Acceptance Criteria:** All 8 check categories return accurate `PASS`/`WARN`/`FAIL` badges in Rust and React UI without shell interpolation.
- **Rollback Strategy:** `git revert` commit for `M1-T10`.

---

## `M1-T11` (Workstream H): Rust Worker Bridge, Jailed Localhost Preview & Real `<gm-player>` Stage
- **Objective:** Connect Tauri commands & `"animforge://render-progress"` events to `animforge-core/dist/src/worker.js`, serve `projects/<id>/bundle/` + `.mp4` (with Range requests) over path-jailed `127.0.0.1`, and mount real `<gm-player>` with loading, playback, pause, seek, QA diagnostics, and error states.
- **Exact Files Involved:**
  - Create: `AnimForgeLab/animforge-desktop/src-tauri/src/{worker_bridge.rs,preview_server.rs}`
  - Modify: `AnimForgeLab/animforge-desktop/src-tauri/src/lib.rs`
  - Create: `AnimForgeLab/animforge-desktop/src/{types.ts,hooks/useStudio.ts,components/PreviewStage.tsx}`
  - Modify: `AnimForgeLab/animforge-desktop/src/App.tsx`
  - Tests: Rust unit tests (`preview_server.rs`, `worker_bridge.rs`) + `useStudio.test.ts` + `PreviewStage.test.tsx`
- **Dependencies:** `M1-T10`.
- **Tests:** `cargo test`, Vitest `npm test`, `npm run build`, and live Tauri desktop smoke verification.
- **Acceptance Criteria:** Real `<gm-player>` loads bundled composition over `127.0.0.1`, plays/pauses smoothly, displays QA errors when `check` fails, streams live MP4 render progress, and cleans up worker/child processes on exit.
- **Rollback Strategy:** `git revert` commit for `M1-T11`.

---

# MILESTONE 2 — ANIMATION STUDIO GUI

Planned in detail once Milestone 1 passes (`M2-T01` .. `M2-T10`), delivering the dark cinematic 4-zone Studio workspace:
- `M2-T01`: **Home Dashboard & Resource Profile** (Recent projects, quick-start templates, hardware concurrency cap `1` / low-res toggle, system doctor drawer)
- `M2-T02`: **Project Manager** (`projects/` index, native open/save `.animforge.json`, autosave + undo/redo command stack)
- `M2-T03`: **Storyboard Editor** (Prompt-to-beats board editing, pacing duration controls)
- `M2-T04`: **Character Studio** (Embed MIT `engines/stretchystudio` PSD/DWPose/bone/mesh canvas with Tauri FS replacing `showDirectoryPicker` & lazy-loaded ONNX WASM)
- `M2-T05`: **Asset Library** (Left dock browser indexing `assets/{characters,backgrounds,props,audio,references}` with lazy thumbnails & path-jailed asset import)
- `M2-T06`: **Animation Canvas** (Center interactive stage uniting GiveMotion composition + baked character overlays + safe-zone guides)
- `M2-T07`: **Timeline & Keyframe Editor** (Bottom dock multi-track timeline, keyframes, easing curves, audio tracks, synced playhead, `Space` shortcut)
- `M2-T08`: **Camera Controls** (Right inspector keyframed `push`/`pull`/`zoom`/`pan`/`shake` trajectories)
- `M2-T09`: **Preview Studio** (Low-res preview scale toggle `0.5x`/`1.0x` for Acer A315-21, real `<gm-player>` scrub, visual `check` QA overlays, frame `still` inspector)
- `M2-T10`: **Render & Export Studio** (Queue with default concurrency `1`, GiveMotion primary / external Remotion optional license-guarded plugin, MP4/WebM/ProRes/GIF + `ffprobe` metadata card)

---

# MILESTONE 3 — AI & AGENT INTEGRATION

- `M3-T01`: **Path-Jailed MCP Server Core** (`animforge-core/src/mcp.ts` stdio transport implementing Zod-validated workspace jail with zero arbitrary shell access)
- `M3-T02`: **Project, Storyboard & Character Tools** (`create_project`, `import_assets`, `create_storyboard`, `create_character`, `rig_character` per `integration-plan.md`)
- `M3-T03`: **Scene, Animation, Camera & Visual QA Tools** (`create_scene`, `generate_animation`, `add_camera_motion`, `preview_scene`, `inspect_frames`)
- `M3-T04`: **Render Queue, Export Tools & End-to-End Agent Tests** (`render_video`, `check_render_status`, `export_video`, concurrency=1 lock, regression test suite)
