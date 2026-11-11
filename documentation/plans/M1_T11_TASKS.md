# AnimForge Studio — M1-T11 Implementation Plan & Micro-Tasks

> **For agentic workers:** Follow `superpowers:executing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`, and `ponytail` (`full`) / `ponytail-review`. Execute one micro-task at a time (`M1-T11.1` -> `M1-T11.5`), write failing tests first (RED -> verify RED -> GREEN -> verify GREEN), delegate independent subagent review after each task, update `ANIMFORGE_PROGRESS.md`, and commit each verified micro-task before starting the next.

**Goal:** Connect the Tauri 2 + React 18 desktop shell (`animforge-desktop/`) to `animforge-core/dist/src/worker.js` via a versioned Rust stdio bridge, serve project bundles & assets over a path-jailed `127.0.0.1` HTTP server, mount the real `<gm-player>` custom element in the Studio stage, and verify the live desktop workflow end-to-end.

**Architecture:** `animforge-core/src/worker.ts` formalizes stdio NDJSON protocol v1 (`version: 1`, structured `{ code, error }`, and `cancel_render`). On the Rust side, `worker_bridge.rs` supervises a single child `node` process with dedicated `stdout`/`stderr` threads and clean teardown, while `preview_server.rs` binds `127.0.0.1:0` with strict prefix/canonicalization/MIME/range/concurrency guards. React (`useStudio` + `PreviewStage`) drives worker IPC, subscribes to `"animforge://render-progress"`, dynamically loads `gm-player.js`, and mounts `<gm-player>` cleanly beside the existing `DoctorBar`.

**Tech Stack:** Rust (`std` + `tauri 2.12.5` + `serde`/`serde_json` — **zero new crates**), Node.js `v24.19.0` + TypeScript + Zod (`animforge-core`), React `18.3.1` + Vite `5.4.21` + Vitest `2.1.9` + GiveMotion `gm-player.js` (MIT, unbundled runtime asset).

**Spec:**
- [ANIMFORGE_MASTER_PLAN.md](./ANIMFORGE_MASTER_PLAN.md) (`M1-T11`)
- [ANIMFORGE_PROGRESS.md](./ANIMFORGE_PROGRESS.md)
- [MILESTONE_1_REPORT.md](./MILESTONE_1_REPORT.md)

## Global Constraints

- **Preserve trailing-space workspace path:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` ends its parent directory with literal ASCII `0x20`; never `.trim()` filesystem paths and never use shell interpolation.
- **No unnecessary dependencies:** Keep `animforge-desktop/src-tauri/Cargo.toml` and `package.json` free of extra crates/packages unless blocked by a verified defect.
- **Preserve upstream repos & secrets:** Never modify files inside `engines/givemotion`, `engines/remotion`, `engines/stretchystudio`, or existing sample `projects/`; never access `.env` or `.venv`.
- **Clean quality gates:** Every task must pass Rust `cargo clippy --all-targets -- -D warnings` + `cargo test`, `animforge-core` `npm run typecheck && npm test`, and `animforge-desktop` `npm test && npm run build`.
- **Honest verification & stop boundary:** Live GUI/loopback smoke checks requiring unsandboxed execution must request permission explicitly; do **not** start M1-T12 automatically.

## Review Focus

1. **Path jail & symlink escapes (`preview_server.rs`):** Traversal (`..`), percent-encoded `%2e%2e` / double-encoded `%252e`, backslashes, NUL bytes, dotfiles (`.env`, `.gm-parts`), disallowed extensions (`.db`, `.sqlite`, `.sh`), non-loopback `Host:` headers, disallowed HTTP methods (`POST`/`DELETE`), and symlinks targeting outside `projects/<id>/` or `assets/`.
2. **Stdio framing, crashes & cancellation (`worker.ts`, `worker_bridge.rs`):** Non-JSON noise on stdout, stderr pipe saturation, unsupported protocol `version != 1`, early worker crash failing all pending waiters and clearing stale child state for respawn, and `cancel_render` stopping an active child Chrome/FFmpeg process cleanly.
3. **Trailing-space preservation:** End-to-end Rust -> Node worker -> HTML/HTTP round-trip inside temp/workspace paths ending in ASCII `0x20`.
4. **Real `<gm-player>` lifecycle (`PreviewStage.tsx`):** Re-bundling same project busts attribute equality via query revision (`?v=<rev>`) and fresh React `key` so internal `_error()` banners clear and updated bundles reload without duplicating `<script>` tags.
5. **Non-blocking IPC & Exit Cleanup (`lib.rs`):** Slow render/preview RPCs run off the main UI thread; `RunEvent::Exit` and `Drop` terminate both `WorkerBridge` (stdin EOF grace -> `SIGTERM`/`kill`) and `PreviewServer` accept loop without orphan processes.

---

### `M1-T11.1`: Versioned Worker Protocol, Structured Errors & Active Render Cancellation

- **Objective:** Formalize protocol `v1` on `animforge-core/src/worker.ts`, document the wire contract, and support targeted `cancel_render` termination in `GivemotionAdapter` + `worker.ts`.
- **Exact Files Involved:**
  - Create: `documentation/specs/WORKER_PROTOCOL.md`
  - Modify: `animforge-core/adapters/adapter.interface.ts`
  - Modify: `animforge-core/adapters/givemotion.adapter.ts`
  - Modify: `animforge-core/src/worker.ts`
  - Modify: `animforge-core/test/givemotion.adapter.test.ts`
  - Modify: `animforge-core/test/worker.test.ts`
- **Dependencies:** `M1-T10`.
- **Implementation Steps (TDD):**
  1. **RED:** Add failing unit tests in `worker.test.ts` and `givemotion.adapter.test.ts` asserting:
     - Responses & progress events include `version: 1`; sending `{ id, version: 2, method: 'doctor' }` fails cleanly with `ok: false`, `code: 'UNSUPPORTED_PROTOCOL_VERSION'`.
     - Invalid project ID returns `code: 'INVALID_ID'` or structured error code; unknown method returns `code: 'UNKNOWN_METHOD'`; invalid params return `code: 'INVALID_PARAMS'`.
     - Calling `cancel_render` (`{ projectId }`) while `render_project` is mid-flight terminates the active `givemotion render` child process, rejects the in-flight `render_project` call with a cancellation error (`cancelled: true` / `code: 'RENDER_CANCELLED'`), and returns `{ cancelled: true, projectId }`; cancelling when idle returns `{ cancelled: false, projectId }`.
  2. Verify RED: run `npm --prefix ".../animforge-core" test` -> fails cleanly on missing `version`/`code`/`cancel_render`.
  3. **GREEN:**
     - Document protocol v1 messages, lifecycle, and error codes in `documentation/specs/WORKER_PROTOCOL.md`.
     - Track `activeRenderByProject: Map<string, { child: SpawnedProcess; jobId: string; cancel: () => void }>` in `GivemotionAdapter`, implement `cancelRender(projectId: string): Promise<boolean>` (`SIGTERM` + settle job failure `"Render cancelled by user"` cleanly, preventing post-cancel `"completed"` override).
     - Update `worker.ts`: `WORKER_PROTOCOL_VERSION = 1`, validate optional `version` (`undefined` treated as `1`, non-`1` rejected cleanly), attach `version: 1` to every JSON reply/event, add typed `WorkerError` (`code`), and wire `case 'cancel_render':`. Rebuild `dist/` (`npm --prefix .../animforge-core run build`).
  4. Verify GREEN + Ponytail self-check.
- **Tests to Run:**
  - `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" run typecheck`
  - `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" test`
- **Expected Output:** `typecheck` exits `0`; all unit tests in `animforge-core` pass (`>= 25` pass, `1` gated `test:integration` skipped cleanly).
- **Acceptance Criteria:** Protocol v1 documented and enforced on worker stdio; `cancel_render` reliably kills slow child render processes; compiled `animforge-core/dist/src/worker.js` is up-to-date.
- **Rollback Strategy:** `git revert` commit for `M1-T11.1` (rebuild `animforge-core`).

---

### `M1-T11.2`: Non-Blocking Rust Worker Stdio Bridge & Tauri Commands

- **Objective:** Implement `worker_bridge.rs` in `animforge-desktop/src-tauri/` managing a persistent child Node worker process (`animforge-core/dist/src/worker.js <workspace_root>`) with background I/O threads, progress event streaming, crash recovery, and clean exit teardown.
- **Exact Files Involved:**
  - Create: `animforge-desktop/src-tauri/src/worker_bridge.rs`
  - Modify: `animforge-desktop/src-tauri/src/lib.rs`
- **Dependencies:** `M1-T11.1`, `M1-T10`.
- **Implementation Steps (TDD):**
  1. **RED:** Write failing Rust unit tests inside `worker_bridge.rs` (`#[cfg(test)] mod tests`) covering:
     - `classify_worker_line`: distinguishes `version: 1` RPC reply (`ok: true` & structured `ok: false` + `code`), `"event": "render_progress"`, and ignores non-JSON/malformed stdout lines without panicking or breaking routing.
     - `WorkerBridge::call` against a real spawned Node script (and real `dist/src/worker.js` in a trailing-space temp workspace!): verifies request `version: 1` sent on stdin, concurrent requests correlate by `id`, streaming progress events reach the registered progress callback before `render_project` finishes, stderr output doesn't deadlock, worker crash (`process.exit(1)`) fails pending callers cleanly and resets child state so a subsequent call respawns cleanly, and `shutdown()` waits briefly on EOF before force-killing stragglers.
     - Cancellation test: `project_cancel_render` / `cancel_render` stops an active fake/real slow render and returns cleanly without hanging.
     - `validate_project_id` / extracting project ID cleanly from workspace `.animforge.json` inputs without `.trim()`.
  2. Verify RED: `/Users/vipinkumar/.cargo/bin/cargo test ...` fails (module not implemented).
  3. **GREEN:**
     - Implement `WorkerBridge` (injectable command/script path for tests; default resolves `doctor::resolve_binary("node")`, sets normalized `.env("PATH", ...)` from `doctor::search_path_dirs()`, resolves `<workspace_root>/animforge-core/dist/src/worker.js`, passes `workspace_root` verbatim via `.arg(workspace_root)`).
     - Dedicated stdout reader thread parses lines into an abstract `WorkerEventSink` (`Arc<dyn Fn(RenderProgressPayload) + Send + Sync>`, wired in `lib.rs` to `app.emit("animforge://render-progress", ...)`), dedicated stderr drain thread buffers last lines for diagnostics, `Mutex<WorkerRuntime>` coordinates lazy spawn/respawn + `pending` `mpsc::Sender` map + monotonic request IDs + optional caller wait timeout / disconnect safety.
     - Implement `WorkerBridge::shutdown(&self)` (close `stdin` -> brief join poll -> kill child if still alive) called in `Drop` and `lib.rs` `RunEvent::Exit`.
     - Wire non-blocking `#[tauri::command] pub async fn` commands (`spawn_blocking`) in `lib.rs`: `project_list`, `project_create_from_prompt`, `project_load`, `project_save`, `project_preview`, `project_render`, `project_cancel_render`.
  4. Verify GREEN + `cargo clippy --all-targets -- -D warnings`.
- **Tests to Run:**
  - `/Users/vipinkumar/.cargo/bin/cargo clippy --manifest-path "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml" --all-targets -- -D warnings`
  - `/Users/vipinkumar/.cargo/bin/cargo test --manifest-path "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml"`
- **Expected Output:** Zero clippy warnings; all Rust unit tests pass (existing `7` + new `worker_bridge` tests passing).
- **Acceptance Criteria:** Bridge never blocks Tauri UI thread, survives malformed worker lines & worker crashes cleanly, streams real progress events, supports cancellation, preserves trailing spaces, and cleans up worker on exit.
- **Rollback Strategy:** Remove `worker_bridge.rs`, revert `lib.rs` command/state hooks (`git revert`).

---

### `M1-T11.3`: Path-Jailed Loopback (`127.0.0.1`) HTTP Preview & Asset Server

- **Objective:** Implement `preview_server.rs` bound exclusively to `127.0.0.1:0` to serve authorized `projects/<projectId>/...` bundles/videos and `assets/...` files safely over HTTP/1.1 with strict canonicalization, method/MIME/request limits, `Range` support, and clean shutdown.
- **Exact Files Involved:**
  - Create: `animforge-desktop/src-tauri/src/preview_server.rs`
  - Modify: `animforge-desktop/src-tauri/src/lib.rs` (add `pub mod preview_server;`, manage `PreviewServer`, expose `get_preview_base_url`, stop cleanly on `RunEvent::Exit`)
- **Dependencies:** `M1-T09`, `M1-T10`.
- **Implementation Steps (TDD):**
  1. **RED:** Write failing Rust unit tests in `preview_server.rs` covering:
     - `resolve_safe_asset(workspace_root, rel_path)` allows valid paths under `/projects/<safeId>/bundle/index.html`, `/projects/<safeId>/output.mp4`, `/assets/characters/pip.svg` (preserving trailing spaces on workspace parent).
     - Rejects (`403`/`400`/`404` per class): `/`, `/engines/givemotion/package.json`, `/../.env`, `/projects/proj_1/%2e%2e/%2e%2e/.env`, `/projects/proj_1/%252e%252e/x`, `/projects/proj_1/file\0.html`, `/projects/proj_1\\evil`, `/projects/.hidden/a.html`, `/projects/proj_1/.env`, `/projects/proj_1/evil.db`, `/projects/animforge.db`, `/assets/.DS_Store`, `/projects/proj_1/escape_symlink` pointing outside `projects/<id>/` (real symlink test on Unix), and directory paths.
     - Live `TcpStream` tests against `PreviewServer::start(workspace_root)` bound to `127.0.0.1:<ephemeral_port>`:
       - `GET /projects/p1/bundle/gm-player.js` with loopback `Host` -> `200 OK`, `text/javascript; charset=utf-8`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
       - `HEAD /projects/p1/output.mp4` -> `200 OK`, `Content-Length` with empty body; `GET` with `Range: bytes=0-3` -> `206 Partial Content`, `Content-Range: bytes 0-3/...`.
       - `POST /projects/p1/bundle/index.html` -> `405 Method Not Allowed`.
       - `GET` with non-loopback `Host: evil.example` -> `403 Forbidden`.
       - Oversized request URI (`> 2048` bytes) / oversized headers (`> 8192` bytes) -> `414` / `431` (or `400`).
       - `shutdown()` cleanly terminates listener & port stops accepting new connections.
  2. Verify RED: `cargo test` fails cleanly before implementation.
  3. **GREEN:**
     - Bind `TcpListener::bind(("127.0.0.1", 0))`, spawn named accept thread using short poll/self-connect wakeup (`shutdown: Arc<AtomicBool>`), cap concurrent handler workers via RAII slot counter (`MAX_CONCURRENT_REQUESTS = 32`, `503` when saturated), set read/write socket timeouts (`5s` / `10s`), parse HTTP/1.1 request line + headers with strict byte caps (`2048` target, `8192` headers), validate loopback `Host` (`127.0.0.1[:port]` or `localhost[:port]`), allow `GET`/`HEAD` only, strip query/fragment, decode single-layer `%XX` safely while forbidding double-encoding/control/`..`/dotfiles/backslashes, validate `/projects/<safeProjectId>/...` or `/assets/...`, canonicalize roots & target (`fs::canonicalize`) verifying containment (`starts_with`) + `is_file()` + strict extension->MIME map (never `.db`/`.sqlite`/scripts/dotfiles), support `Range: bytes=start-end` (`206` / `416`), and wire `PreviewServer` + `get_preview_base_url` + `RunEvent::Exit` shutdown in `lib.rs`.
  4. Verify GREEN + `cargo clippy --all-targets -- -D warnings`.
- **Tests to Run:**
  - `/Users/vipinkumar/.cargo/bin/cargo clippy --manifest-path "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml" --all-targets -- -D warnings`
  - `/Users/vipinkumar/.cargo/bin/cargo test --manifest-path "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml"`
- **Expected Output:** `0` clippy warnings; all Rust unit + loopback `TcpStream` tests pass cleanly inside sandbox (`127.0.0.1` loopback test should be checked inside sandbox first; request unsandboxed permission only if sandbox blocks `TcpListener::bind`).
- **Acceptance Criteria:** Server binds solely `127.0.0.1`, blocks traversal/symlinks/hidden/unapproved files/methods/Host rebinding, enforces request & concurrency bounds, supports byte-range `.mp4` streaming, and shuts down cleanly.
- **Rollback Strategy:** Remove `preview_server.rs`, revert `lib.rs` (`git revert`).

---

### `M1-T11.4`: GiveMotion `<gm-player>` Stage, Studio Hook & Accessible Desktop UI

- **Objective:** Build React state hook (`useStudio.ts`) and unified `<PreviewStage />` integrating the real `<gm-player>` web component served from the local HTTP server, with loading/QA/rendering/cancellation/playback/error states beside `DoctorBar`.
- **Exact Files Involved:**
  - Create: `animforge-desktop/src/types.ts`
  - Create: `animforge-desktop/src/hooks/useStudio.ts`
  - Create: `animforge-desktop/src/hooks/useStudio.test.ts`
  - Create: `animforge-desktop/src/components/PreviewStage.tsx`
  - Create: `animforge-desktop/src/components/PreviewStage.test.tsx`
  - Modify: `animforge-desktop/src/App.tsx`
  - Modify: `animforge-desktop/src/App.test.tsx`
  - Modify: `animforge-desktop/src/styles.css`
- **Dependencies:** `M1-T11.2`, `M1-T11.3` *(plus mandatory pre-step: run `modern-web-guidance` search/retrieve for forms, custom elements / media playback before editing HTML/CSS/React)*.
- **Implementation Steps (TDD):**
  1. Run `modern-web-guidance` search/retrieve for web component/media/form/live-progress accessibility rules first.
  2. **RED:** Write failing Vitest suites in `useStudio.test.ts` and `PreviewStage.test.tsx` covering:
     - `useStudio`: loads `previewBaseUrl` + `projectList` on mount; handles `createProject`, `loadProject`, `saveProject`, `previewProject` (computes `bundleUrl = ${baseUrl}/projects/${id}/bundle/index.html?v=${rev}` & `playerScriptUrl = ${baseUrl}/projects/${id}/bundle/gm-player.js`); handles `"animforge://render-progress"` listener (`phase`, `progress`, `fps`, `eta`, ignoring stale events for other projects/stale unmount), `renderProject` setting `videoUrl`, and `cancelRender` invoking `project_cancel_render`.
     - `PreviewStage`: injects deduped `gm-player.js` `<script>` once, renders real `<gm-player src={...} controls>` element, handles script load error via `role="alert"`, renders loading/idle/QA-error list (`check` issues with severity badges), live `<progress>` render bar + Cancel button during render, and toggles MP4 `<video controls src={videoUrl}>` output cleanly once completed.
  3. Verify RED: `npm --prefix .../animforge-desktop test` fails cleanly before implementation.
  4. **GREEN:** Implement `types.ts` (strict TS types + React JSX IntrinsicElements `'gm-player'` + optional `loadPlayerScript` seam defaulting to real DOM `<script>` injection), `useStudio.ts`, `PreviewStage.tsx`, dark studio CSS extensions in `styles.css`, and `App.tsx` layout uniting `<DoctorBar />`, project switcher/creator/scene editor, and `<PreviewStage />`.
  5. Verify GREEN: Vitest + `tsc --noEmit && vite build` + update `App.test.tsx` cleanly.
- **Tests to Run:**
  - `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop" test`
  - `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop" run build`
- **Expected Output:** Zero TypeScript errors, all Vitest tests pass (`>= 12` tests), Vite production build succeeds cleanly.
- **Acceptance Criteria:** Real `<gm-player>` element renders & reacts to bundle revisions/events cleanly with zero mocks in production UI, preserving `DoctorBar`, dark theme, keyboard focus, and WCAG contrast/landmark rules.
- **Rollback Strategy:** `git revert` commit for `M1-T11.4`.

---

### `M1-T11.5`: Live Tauri Smoke Test, Independent Reviews & Milestone 1 Finalization

- **Objective:** Boot the real Tauri 2 desktop application (unsandboxed if sandbox blocks Chrome/loopback/GUI), exercise the complete live E2E workflow (React load -> Doctor -> Create/Preview -> HTTP asset + security rejection -> `<gm-player>` live playback & MP4 render -> clean exit cleanup), perform independent security & integration Ponytail review, and finalize `ANIMFORGE_PROGRESS.md` & `MILESTONE_1_REPORT.md`.
- **Exact Files Involved:**
  - Modify: `documentation/plans/ANIMFORGE_PROGRESS.md`
  - Modify: `documentation/plans/MILESTONE_1_REPORT.md`
- **Dependencies:** `M1-T11.1`..`M1-T11.4`.
- **Implementation Steps:**
  1. Build `animforge-core` (`npm run build`) and desktop release/debug artifacts (`npm run build`, `cargo build`).
  2. Start the actual Tauri desktop application (`tauri dev` or debug binary + Vite dev server, requesting explicit `BypassSandbox: true` when WebView/loopback/Chrome requires unsandboxed host execution) and verify all Section D criteria:
     - React Studio UI loads in WebView; `<DoctorBar />` receives all 8 checks from Rust.
     - Rust worker bridge responds to `project_create_from_prompt` / `project_list` / `project_preview` / `project_render` (using real `animforge-core` worker inside `/Users/vipinkumar/Desktop/animator /AnimForgeLab`).
     - Local `127.0.0.1` HTTP server serves authorized `gm-player.js`, `bundle/index.html`, and `output.mp4` (`200`/`206`), and rejects unauthorized/malicious requests (`403`/`405`).
     - `<gm-player>` loads `bundle/index.html`, fires `ready` / `play` / `timeupdate` in WebView, and plays a real animation cleanly (clean up temporary smoke project after verification if created inside `projects/`).
     - Closing the app terminates both the Node worker (`worker.js` / any child) and unbinds the HTTP server cleanly (`ps` / `lsof` verify zero orphans).
  3. Dispatch independent Ponytail reviewer subagent for security & integration audit of full M1-T11 diff.
  4. Run full verification commands (`cargo clippy -- -D warnings`, `cargo test`, `animforge-desktop` `test` + `build`, `animforge-core` `typecheck` + `test`, `git status` on upstream `engines/*`), update `ANIMFORGE_PROGRESS.md` and `MILESTONE_1_REPORT.md`, commit, and **STOP before M1-T12**.
- **Tests to Run:** Live Tauri smoke verification + full Rust, Node core, and Vitest/Vite suites.
- **Expected Output:** Every automated & live smoke check passes and is logged with exact outputs in `MILESTONE_1_REPORT.md`; `engines/{givemotion,remotion,stretchystudio}` remain unmodified.
- **Acceptance Criteria:** Verified E2E desktop vertical slice works end-to-end with zero leftover child processes or orphaned files, full docs updated, clean `git status`.
- **Rollback Strategy:** Clean up temporary smoke-test project files under `projects/proj_*` if any remain; revert doc commit if corrections needed.
