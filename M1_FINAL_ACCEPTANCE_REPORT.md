# AnimForge Studio — Milestone 1 Final Acceptance Audit Report

**Audit Date:** 2026-11-12  
**Repository Root:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` *(parent folder contains trailing ASCII `0x20`)*  
**Audited Branch / Commit:** `feat/milestone-1-core` @ `49adf6a`  
**Host Platform:** macOS `27.2` (`Build 26B123`, `aarch64`, Apple Silicon)  
**Final Verdict:** **ACCEPTED (macOS Verified Baseline)** — All `M1-T01`–`M1-T11` deliverables, automated test suites, real Chrome+FFmpeg MP4 rendering, worker RPC lifecycle, loopback HTTP path jail, and `<gm-player>` playback verified with honest `WARN`/`SKIPPED` scope notes documented below. **Milestone 2 has NOT been started.**

---

## Summary Scorecard

| Area | Pass | Warn | Fail | Skipped | Summary |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1. Repository Verification** | 4 | 0 | 0 | 0 | All 18 commits verified in order; clean working tree; `engines/*` clean; trailing-space paths preserved |
| **2. Automated Verification** | 8 | 0 | 0 | 0 | Clippy (`0` warn), Rust (`16/16` unsandboxed), Desktop Vitest (`16/16`), Vite build, Core `tsc` + unit (`22/22` + `1` gated), real MP4 integration (`1/1` unsandboxed), `ffprobe` |
| **3. Native Desktop Verification** | 7 | 1 | 0 | 1 | Release binary launch, `DoctorBar`/IPC (`8/8`), `WorkerBridge`, progress & cancellation, `PreviewServer`, `<gm-player>`, clean quit (`PASS`); live WKWebView DOM automation (`WARN`, TCC blocked — covered via split proof); Linux WebKitGTK (`SKIPPED` on macOS host) |
| **4. Security Review** | 5 | 2 | 0 | 0 | Traversal, symlinks, HTTP methods, smuggling, IDs, cleanup (`PASS`); local loopback exposure / HTML-SVG bundle hardening + doc/timeout items noted as non-blocking `WARN`s for M2 |

---

## 1. Repository Verification

| Check | Status | Command / Method | Observed Result & Evidence |
| :--- | :--- | :--- | :--- |
| **18-Commit Sequence** | **PASS** | `git -C ".../AnimForgeLab" log --reverse --format="%h %ad %s" --date=short` | All 18 M1 commits (`5cffc9e` through `49adf6a`) present in exact chronological dependency order (`feat/milestone-1-core` @ `49adf6a`). Full list in Appendix A. |
| **Root Git Cleanliness** | **PASS** | `git -C ".../AnimForgeLab" status --short --untracked-files=all` | Clean working tree (`0` modified, `0` untracked files prior to generating `M1_FINAL_ACCEPTANCE_REPORT.md`); `projects/` contains only the 4 original project directories (`cybersecurity-explainer`, `demo-animation`, `givemotion-test`, `remotion-test`). |
| **Upstream Engines Untouched** | **PASS** | `git -C ".../engines/<name>" status --short --untracked-files=all` | Empty diff (`0` modified, `0` untracked) across `engines/givemotion`, `engines/remotion`, and `engines/stretchystudio`. |
| **Trailing-Space Workspace Handling** | **PASS** | Static code audit + Rust/Node unit & live process verification | Zero `.trim()` calls on filesystem paths across `animforge-core/{src,adapters,utils}` and `animforge-desktop/src-tauri/src`. `lib.rs:34-71` preserves `OsStr`/`PathBuf` verbatim; `resolveWorkspacePath` and `assertSafeId` enforce canonical path-prefix containment; live release binary spawned `/usr/local/bin/node .../animforge-core/dist/src/worker.js /Users/vipinkumar/Desktop/animator /AnimForgeLab`. |

---

## 2. Automated Verification

*(Note on terminal sandbox: commands opening `127.0.0.1` TCP sockets or launching `/Applications/Google Chrome.app` fail inside the Seatbelt sandbox with `Operation not permitted`; these two suites were executed both sandboxed and unsandboxed (`BypassSandbox: true`) to record both behaviors transparently.)*

| Check | Status | Exact Command Run | Actual Output / Evidence | Remaining Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Rust Clippy (`-D warnings`)** | **PASS** | `/Users/vipinkumar/.cargo/bin/cargo clippy --manifest-path "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml" --all-targets -- -D warnings` | Exit `0`: `Finished 'dev' profile [unoptimized + debuginfo] target(s) in 0.29s`, `0` warnings across lib, binary, and unit tests. | Low (macOS target checked; Linux `WebKitGTK` target untested on host). |
| **Rust Unit & Loopback Tests** | **PASS** | `/Users/vipinkumar/.cargo/bin/cargo test --manifest-path "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml"` *(unsandboxed)* | Exit `0`: **`16 passed; 0 failed; 0 ignored`** (`0.74s` lib tests; `0` main/doc tests). Covers `lib.rs` (2), `doctor.rs` (4), `worker_bridge.rs` (4, incl. real `worker.js` concurrency/crash/timeout/cancel/EOF), `preview_server.rs` (6, incl. live TCP loopback traversal/symlink/Host/Origin/smuggling/Range). *(Inside sandbox: `15/16` pass; loopback test fails on `connect loopback: Operation not permitted`.)* | Loopback TCP requires non-sandboxed execution. |
| **Desktop Frontend Tests (Vitest)** | **PASS** | `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop" test` | Exit `0`: **`4` test files, `16 passed`** (`727ms`): `App.test.tsx` (`3`), `DoctorBar.test.tsx` (`5`), `PreviewStage.test.tsx` (`4`), `useStudio.test.ts` (`4`). | Uses mocked Tauri IPC (`invoke`/`listen`) and synthetic `<gm-player>` DOM events in JSDOM; real `<gm-player>` tested in Chromium below. |
| **Desktop Production Build** | **PASS** | `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop" run build` | Exit `0`: `tsc --noEmit && vite build` built `37 modules` (`238ms`) -> `dist/index.html` (`0.45 kB`), `dist/assets/index-D69Y7z01.css` (`7.73 kB`), `dist/assets/index-DD43zR4e.js` (`163.81 kB`). Release binary `target/release/animforge-desktop` (`10M`) compiled and verified live. | None for M1 shell. |
| **Core TypeScript Typecheck** | **PASS** | `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" run typecheck` | Exit `0`: `tsc --noEmit` with zero errors. | `database.ts:1` carries `@ts-expect-error` for Node 24 built-in `node:sqlite`. |
| **Core Unit Tests** | **PASS** | `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" test` | Exit `0`: `23` total: **`22 passed; 0 failed; 1 skipped`** (gated `ANIMFORGE_INTEGRATION` test cleanly skipped). Covers paths, schemas, compiler, NDJSON parser, adapter, worker RPC/cancellation. | None for M1 unit scope. |
| **Core Real MP4 Integration Test** | **PASS** | `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" run test:integration` *(unsandboxed)* | Exit `0`: **`1 passed; 0 failed`** (`12719.46ms`): `"GiveMotion real Chrome + FFmpeg MP4 export and ffprobe validation in trailing-space workspace"`. *(Inside sandbox: exit `1`, Chrome `sandbox_extension_issue_file_to_process failed ... Operation not permitted`.)* | Chrome headless capture requires non-sandboxed execution. |
| **`ffprobe` MP4 Validation** | **PASS** | `ffprobe -v error -show_format -show_streams -of json ".../projects/demo-animation/demo-pip-adventure.mp4"` | Exit `0`: container `mov,mp4,m4a,3gp,3g2,mj2` (`1,185,284` bytes, `790,189 bps`), video stream `codec_name: "h264"` (`High`, `avc1`), `1280x720`, `yuv420p`, `r_frame_rate: "30/1"`, `duration: "12.000000"`, `nb_frames: "360"`, encoder `Lavc63.1.101 libx264`. E2E rendered MP4 also verified at `1280x720`, `duration: 11.5s`. | None. |

---

## 3. Native Desktop & End-to-End Verification

Live native execution combined:
1. Direct launch of the compiled release binary `animforge-desktop/src-tauri/target/release/animforge-desktop` (`10M`, unsandboxed).
2. Live `verify_e2e.mjs` end-to-end harness (`task-2159`, unsandboxed) compiling and executing a Rust driver directly against the real `doctor`, `WorkerBridge`, and `PreviewServer` modules paired with real Chromium (`157.0.8103.38`) CDP playback matching `tauri.conf.json` CSP (`default-src 'self'; script-src 'self' http://127.0.0.1:*; ...`).

| Requirement | Status | Verification Evidence | Caveat / Remaining Risk |
| :--- | :--- | :--- | :--- |
| **Independent Tauri Launch** | **PASS** | Executed `animforge-desktop` directly (`PID 10222`); verified `WKWebView` process launch, spawned `/usr/local/bin/node .../animforge-core/dist/src/worker.js /Users/vipinkumar/Desktop/animator /AnimForgeLab` (`PID 10229`), and bound listener `TCP 127.0.0.1:50122 (LISTEN)`. *(Release binary honors `ANIMFORGE_WORKSPACE_DIR` at `lib.rs:56`, walking parent dirs automatically when unset.)* | Verified on macOS `aarch64`. |
| **React UI Inside Native Window** | **WARN** | **Split proof:** Native `WKWebView` window boots and renders production `dist/` assets (`37` Vite modules, `tauri.conf.json:10`), React component DOM/IPC/state transitions pass Vitest (`16/16`), and real Chromium (`157.0.8103.38`) executes the preview stage cleanly under matching `tauri.conf.json:23` CSP. | Live UI DOM scraping/clicking inside the running `macOS WKWebView` window was blocked by macOS Assistive Access TCC (`-1728`), so interactive UI behavior inside `WKWebView` itself is inferred from the three-part split proof rather than direct native GUI automation. |
| **DoctorBar Actual Environment Status** | **PASS** | Live `doctor::run_doctor` (`DOCTOR_OK`, `8/8` `Pass`): `os` (`macos (aarch64)`), `rust` (`rustc 1.99.1 / cargo 1.99.1`), `node` (`node v24.19.0 / npm 11.17.0`), `ffmpeg` (`ffmpeg version 9.0.1`), `givemotion` (`/Applications/Google Chrome.app/... 157.0.8103.38`), `remotion` (`External CLI ready (projects/remotion-test)`), `stretchystudio` (`Built MIT React 18 + WebGL2 rig engine ready`), `directories` (`assets/, projects/, animforge-core/ verified`). `DoctorBar.tsx` + `DoctorBar.test.tsx` (`5/5`) render `PASS`/`WARN`/`FAIL` badges and alerts accurately. | Low: `doctor.rs:200-217,411` calls blocking `cmd.output()` without a watchdog timeout if `node` or `ffmpeg` hangs. |
| **Rust `WorkerBridge` Communication** | **PASS** | `WorkerBridge` spawns `worker.js` with `version: 1` NDJSON protocol (`worker_bridge.rs:12,337-345`); verified project `create_project` -> `list_projects` -> `load_project` -> `save_project` -> `preview_project` -> `render_project` -> `cancel_render` on real workspace (`PHASE1_READY http://127.0.0.1:50126 proj_1794469658233_1`), plus crash recovery and wedged-worker timeout cleanup (`worker_bridge.rs:531-548`). | Doc mismatch only (`MILESTONE_1_REPORT.md:42` mentions `RENDER_IN_PROGRESS`, whereas `worker.ts:20-28,290-292` emits `INTERNAL_ERROR`). |
| **Progress & Cancellation** | **PASS** | Live render streamed **`19` progress events** (`RENDER_OK`, `animforge://render-progress` path) to `projects/proj_1794469658233_1/output.mp4`. Concurrent `cancel_render` returned `CANCEL_OK [RENDER_CANCELLED] Render cancelled by user` cleanly without leaving orphaned Chrome/FFmpeg children or locked `activeRenders`. Second full render completed (`PHASE2_RENDER_DONE`) with `1280x720`, `11.5s` video verified via HTTP `206` Range + `ffprobe`. | None for single-render workflow. |
| **`PreviewServer` Unauthorized Rejections** | **PASS** | Live `curl` against `animforge-desktop` (`:50122`): `GET /../etc/passwd` -> **`403`**, `GET /projects/animforge.db` -> **`403`**, `POST /projects/...` -> **`405`**. E2E `HTTP_SECURITY_CHECKS_PASS`: verified `403` on traversal, `.db`, `engines/`, bad `Host`; `405` on `POST`; `200` on JS/HTML + `frame-ancestors`; `206` partial byte-range on `.mp4`. | Local-machine / `:1420` origin threat notes in Section 4. |
| **`<gm-player>` Load & Real Playback** | **PASS** | Headless Chromium CDP (`GM_PLAYER_BROWSER_PASS`, CSP-matched origin) loaded `gm-player.js` + project bundle over `PreviewServer`: zero console/page errors (`errors: []`), `defined: true`, `hasShadowIframe: true`, `readyInfo: { duration: 11.5, paused: true }`, events recorded: `script_loaded`, `ready`, `play`, and `7x` `timeupdate` advancing `maxCurrentTime > 0`. | First frame playback latency depends on local Chrome/WebView decode speed. |
| **Clean Quit & Zero Orphans** | **PASS** | Sending `SIGTERM` to `animforge-desktop` (`PID 10222`) exited with code `143`, dropped `PreviewServer` (`127.0.0.1:50122` unbound) and `WorkerBridge` via `RunEvent::Exit` (`lib.rs:111-120`) + `Drop`. Post-E2E `SHUTDOWN_OK`, `PORT_UNBOUND_PASS`, clean `projects/` dir, and `pgrep -fl "animforge-desktop\|worker\.js\|live_smoke_driver\|givemotion"` returned `NO_MATCHING_PROCESSES`. | None on graceful exit (`SIGTERM`/`Drop`). Sudden `SIGKILL` of desktop app relies on child stdin EOF detection (`worker.ts:482-484`). |
| **Linux Desktop (`WebKitGTK 4.1`)** | **SKIPPED** | Not built or executed — audit machine is `macOS 27.2 aarch64`. Code uses portable Rust (`preview_server.rs`, `worker_bridge.rs`, `doctor.rs`) with `#[cfg(unix)]` signal cleanup ready for Linux. | Cross-platform UI rendering (`WebKitGTK` `<gm-player>` / `media-src`) and distro library deps remain unverified until Linux CI/hardware run. |

---

## 4. Security Review

| Category | Status | Implementation Controls Verified | Findings & Risk Rating |
| :--- | :--- | :--- | :--- |
| **1. Path Traversal** | **PASS** | `worker.ts` & `worker_bridge.rs:137-148` validate project/scene IDs against strict `^[a-zA-Z0-9_-]{1,64}$`. `preview_server.rs:121-174,286-319` caps URIs at `2048B` (`414`), performs single-pass percent decoding rejecting `%25`, `%2f`, `%5c`, `%00`, `\\`, and control chars (`403`), blocks `.`, `..`, empty, and `.`-prefixed hidden segments (`403`), and confines roots strictly to `projects/<safe_id>/...` and `assets/...`. | **Low:** None in M1. |
| **2. Symlink Escapes** | **PASS** | `preview_server.rs:204-284` verifies with `symlink_metadata` that jail roots (`projects/<id>`, `assets`) are non-symlinks and eagerly canonicalizes **every** relative segment against `canon_jail` so escaping directory symlinks fail with `403` rather than leaking host existence via `404`. `animforge-core/utils/paths.ts` likewise checks `lstat` + canonical prefix before file writes/reads. | **Medium (M2 prerequisite):** Upstream `engines/givemotion/src/{server.js,bundle.js}` only checks `SECRET_DIRS` / `.dotfiles` (`linkIsSafe`). Before M2 allows importing untrusted third-party bundles/assets, AnimForge must pre-scan `projects/<id>` for external symlinks prior to calling `givemotion bundle`/`check`. |
| **3. HTTP Method Restrictions & Smuggling** | **PASS** | `preview_server.rs:763-889,934-945` allows only `HTTP/1.0` & `HTTP/1.1` `GET`/`HEAD` (`405` + `Allow: GET, HEAD`), enforces `MAX_HEADER_BYTES = 8192` (`431`), rejects `Transfer-Encoding` (`400`), rejects duplicate/non-zero/malformed `Content-Length` (`400`), and caps concurrency at `32` connections (`503`) with `5s` read / `10s` write timeouts. | **Low:** Local denial-of-service is bounded by `MAX_CONCURRENT_REQUESTS = 32` + timeouts. |
| **4. Local Server Exposure** | **WARN** | `preview_server.rs:359,528-555,904-932` binds strictly `127.0.0.1:0` (ephemeral loopback port, non-routable on LAN), rejects non-loopback `Host` headers (`403` against DNS rebinding), and validates `Origin` against Tauri/loopback allowlist (`403`). | **Low/Medium:** **(a)** Like most local media servers (`<video>`/`<script>` without custom headers), unauthenticated `GET` without an `Origin` header is readable by other processes running under the same OS user account; **(b)** `is_allowed_origin` (`preview_server.rs:553-554`) unconditionally allows `http://localhost:1420` and `http://127.0.0.1:1420` even in release builds — gate `:1420` behind `#[cfg(debug_assertions)]` before production distribution. |
| **5. Worker & IPC Input Validation** | **PASS** | `capabilities/default.json:6` stays minimal (`core:default` only; no broad `fs`/`shell` plugin exposure). `worker_bridge.rs` validates IDs (`validate_safe_id`) and non-empty prompts/names before dispatch and passes args cleanly without shell interpolation (`process-runner.ts` uses `execFile`/`spawn(..., { shell: false })`). `worker.ts` enforces `version: 1`, Zod request/project schemas, and strict error envelopes. | **Low:** `doctor.rs:200-217,411` invokes `cmd.output()` on `node engines/givemotion/src/cli.js doctor` without a timeout; add a bounded wait (`~10s`) in M2. Also align `MILESTONE_1_REPORT.md:42` error-code doc (`RENDER_IN_PROGRESS` vs `INTERNAL_ERROR`). |
| **6. Process Cleanup** | **PASS** | `lib.rs:111-120` invokes `bridge.shutdown()` and `server.shutdown()` on `RunEvent::Exit`; `worker_bridge.rs:261-295,680-693` closes worker stdin, waits `300ms`, escalates `SIGTERM` -> `SIGKILL`, and joins reader threads. `givemotion.adapter.ts:489-505,573-581` tracks child processes and escalates `SIGTERM` -> `SIGKILL` (`2s`) on cancellation and disposal. | **Low:** Verified clean `0` lingering processes after both `SIGTERM` and clean driver exit. |
| **7. Untrusted Asset & HTML Handling** | **WARN** | `givemotion.compiler.ts:18-23,129-213,359-420` escapes all text (`escapeHtml`), checks scene/project IDs (`assertSafeId`), validates hex colors (`SAFE_HEX_COLOR`), and clamps numeric inputs. Preview bundles run on `http://127.0.0.1:<port>`, origin-isolated from `tauri://localhost` (`__TAURI_INTERNALS__`). `preview_server.rs:76-110,1045-1054` sets `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, excludes `.db`/`.sqlite`/executables, and attaches `frame-ancestors` on `.html`. | **Low in M1 / Medium before M2 User Imports:** `.svg` is served as `image/svg+xml` and `gm-player.js:44` mounts an unsandboxed `<iframe>`; inline scripts inside user-imported HTML/SVG would execute on origin `http://127.0.0.1:<port>` (isolated from Tauri IPC, yet able to fetch other workspace assets over that loopback server). Before M2 user HTML/SVG/asset import, sandbox preview iframes/SVGs and sanitize imported SVGs. |

---

## 5. Final Verdict & Recommended Milestone 2 Architecture

### M1 Acceptance Verdict
**ACCEPTED (macOS Verified Baseline).** Milestone 1 meets all functional and reliability objectives on `macOS aarch64`: a clean `animforge-core` + Tauri 2 + React 18 foundation, strict trailing-space workspace support, zero modification of upstream `engines/*`, real Chrome+FFmpeg H.264 MP4 rendering with progress/cancellation, jailed loopback HTTP streaming with byte ranges, and working `<gm-player>` integration.

Remaining open gaps are clearly bounded: (1) Linux `WebKitGTK 4.1` build/runtime verification on target hardware, (2) interactive macOS `WKWebView` GUI harness automation (TCC-gated), and (3) minor security/reliability hardenings (`:1420` `cfg!(debug_assertions)` gate, `doctor.rs` timeout, SVG/bundle sanitization before M2 user file imports).

### Recommended Milestone 2 Architecture (Next Phase — Not Started)

Grounded in `documentation/plans/ANIMFORGE_MASTER_PLAN.md`, `documentation/REPOSITORY_AUDIT.md`, `documentation/architecture.md`, and `documentation/integration-plan.md`:

1. **Dark Cinematic 4-Zone Studio Workspace (`M2-T01`–`M2-T03`, `M2-T05`–`M2-T09`):**
   - **Left Dock:** Asset Library (`assets/{characters,backgrounds,props,audio,references}`) & Scene/Layer hierarchy with lazy thumbnail generation and jailed project import.
   - **Center Viewport:** Unified Stage switching cleanly between Interactive Rigging Canvas (`StretchyStudio` WebGL2 viewport), Composition Preview (`<gm-player>` + `0.5x`/`1.0x` preview scale), and Safe-Zone/Frame QA overlays.
   - **Right Inspector:** Character rig properties, PSD layers, and keyframed camera controls (`push`, `pull`, `zoom`, `pan`, `shake`).
   - **Bottom Dock:** Unified multi-track Timeline & Keyframe Editor (bone + mesh + camera + audio playhead synchronization with `Space`, `Cmd/Ctrl+S`, `Cmd/Ctrl+Z`).
2. **`StretchyStudio` Rigging Engine Integration (`M2-T04`):**
   - Embed the MIT `engines/stretchystudio` React 18 + Vite 5 + WebGL2 + Zustand editor cleanly inside `animforge-desktop`.
   - Replace browser-only `showDirectoryPicker()`, `<a download>`, and IndexedDB (`projectDb.js`) with native Tauri dialogs (`tauri-plugin-dialog`) and jailed project storage (`projects/<id>/rigs/*.stretch`).
   - Lazy-load the `~25 MB` `ort-wasm` auto-rigging runtime on demand so cold startup stays fast, and bake rigged character animations into transparent PNG/WebP sprite sheets or SVG/CSS keyframe layers consumable by `givemotion.compiler.ts`.
3. **Canonical IR, Undo/Redo & Persistence Hardening (`M2-T02`):**
   - Unify StretchyStudio millisecond bone tracks and GiveMotion scene graphs under canonical Zod-validated IR (`project.animforge.json`), backed by an explicit command-pattern Undo/Redo stack and debounced autosave.
   - Migrate primary workspace SQLite metadata out of experimental `node:sqlite` (`animforge-core/src/database.ts:1`) into Rust (`rusqlite` / `tauri-plugin-sql`) or formalize schema versioning & WAL locking.
4. **Hardware-Conscious Performance & Engine Isolation (`M2-T01`, `M2-T10`):**
   - Keep render queue concurrency defaulted to **`--workers 1`** with `0.5x` preview scaling and explicit `libx264` fallback to remain responsive on both macOS Apple Silicon and dual-core Linux targets (`Acer Aspire A315-21`).
   - Keep custom-licensed `Remotion` isolated behind an opt-in external CLI adapter & license acknowledgement gate (`animforge-core/adapters/remotion.adapter.ts`), while preserving `GiveMotion` (MIT) as the zero-friction default.
5. **Pre-Import Security & Protocol Alignment:**
   - Before exposing M2 user file import (`PSD`, `SVG`, HTML templates), gate `:1420` `Origin` on `#[cfg(debug_assertions)]`, strip/sandbox active scripts in imported SVGs and bundle iframes, pre-check `projects/<id>` for external symlinks prior to `givemotion bundle`, bound `doctor.rs` subprocess probes with a timeout, add explicit `RENDER_IN_PROGRESS` handling in `worker.ts`, and keep Worker Protocol v1 aligned with M3's `animforge-core/src/mcp.ts` server.

---

## Appendix A — Verified Commit Sequence (`feat/milestone-1-core`)

1. `5cffc9e` `2026-11-11` — `chore(repo): baseline snapshot, .gitignore, master plan and core test scripts`
2. `da99008` `2026-11-11` — `feat(core): add workspace path jail, symlink checks, and space-safe path utilities`
3. `84304c5` `2026-11-11` — `feat(core): enforce canonical projectId contract, strict types, and HTML safety`
4. `8819d7b` `2026-11-11` — `feat(givemotion): add pure HTML/SVG scene and character compiler`
5. `8be6904` `2026-11-11` — `feat(adapters): replace shell exec with shell-free spawn/execFile and chunked NDJSON progress`
6. `9ab6234` `2026-11-11` — `feat(worker): add NDJSON stdio worker RPC bridge with SQLite/disk persistence and signal-safe lifecycle`
7. `3cffcbb` `2026-11-11` — `test(integration): add real GiveMotion Chrome/FFmpeg MP4 test and surface check runtime errors`
8. `1c2f618` `2026-11-11` — `docs(plans): record M1-T08 completion and M1-T09 rustup blocker`
9. `4815167` `2026-11-11` — `feat(desktop): scaffold Tauri 2 React 18 Vite desktop shell and Rust workspace resolver`
10. `af92c9b` `2026-11-11` — `feat(desktop): add native 8-category Rust doctor command and accessible DoctorBar`
11. `290aed6` `2026-11-11` — `docs(plans): add MILESTONE_1_REPORT and update progress through M1-T10`
12. `29dc4b3` `2026-11-11` — `docs(plans): add M1_T11_TASKS breakdown for worker bridge, HTTP server, and gm-player stage`
13. `576444b` `2026-11-11` — `feat(core): add versioned worker protocol v1, error codes, and cancel_render`
14. `49c231c` `2026-11-11` — `feat(desktop): add non-blocking Rust worker stdio bridge and project commands`
15. `331e462` `2026-11-12` — `feat(desktop): add path-jailed loopback HTTP preview and range server`
16. `61e7678` `2026-11-12` — `feat(desktop): add Studio UI hook, PreviewStage, and accessible gm-player integration`
17. `6ce2515` `2026-11-12` — `fix(m1-t11): harden render double-trigger guard, worker timeout cleanup, and unused field`
18. `49adf6a` `2026-11-12` — `docs(plans): finalize Milestone 1 report and mark M1-T11 complete`
