# AnimForge Studio — Milestone 1 Final Report (Through M1-T11)

**Date:** 2026-11-12  
**Workspace Root:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` *(trailing ASCII `0x20` preserved end-to-end)*  
**Branch:** `feat/milestone-1-core` (`HEAD` at implementation commit `6ce2515` + final `M1-T11.5` docs commit)  
**Scope Status:** `M1-T01` through `M1-T11` **DONE**; stopped cleanly before `M1-T12`.

---

## 1. Pre-Installation Host Checks (`M1-T09` Step 1)

| Check | Exact Result | Status |
| :--- | :--- | :--- |
| **OS & Architecture** | `macOS 27.2` (`Build 26B123`, `arm64`, Apple Silicon) | **PASS** |
| **Disk Space (`/`)** | `259Gi` available pre-install (`244Gi` available on `460Gi` volume after Cargo + npm installs) | **PASS** |
| **Existing Rust State** | `~/.cargo` and `~/.rustup` absent before install; `.zprofile` (`260B`) & `.zshrc` (`26B`) free of prior Cargo PATH overrides | **PASS** |
| **Xcode Command Line Tools** | `/Library/Developer/CommandLineTools` (`com.apple.pkg.CLTools_Executables` `27.2.0.0.1792721180`, `Apple clang 21.0.0`) | **PASS** |
| **Secret & Workspace Hygiene** | `.env` / `.venv` untouched; `engines/{givemotion,remotion,stretchystudio}` untouched | **PASS** |

---

## 2. Official Rust Toolchain & Tauri 2 Prerequisites (`M1-T09` Steps 2–4)

Installed via official `https://sh.rustup.rs` (`rustup-init 1.29.3`, `stable` toolchain, default profile) in unsandboxed shell (`task-1020`, installer script cleaned immediately):

| Component / Command | Verified Version / Output | Status | Notes |
| :--- | :--- | :--- | :--- |
| `rustup --version` | `rustup 1.29.3 (edbc831ce 2026-11-02)` | **PASS** | Host `aarch64-apple-darwin`, active toolchain `stable-aarch64-apple-darwin` |
| `rustc --version` | `rustc 1.99.1 (58cf8f9c3 2026-10-13)` | **PASS** | — |
| `cargo --version` | `cargo 1.99.1 (5f94df478 2026-08-27)` | **PASS** | Invoked as `/Users/vipinkumar/.cargo/bin/cargo` when sandbox blocks `~/.zshenv` |
| **Xcode Command Line Tools** | `/Library/Developer/CommandLineTools` · `Apple clang 21.0.0` | **PASS** | Sufficient for native macOS builds |
| **macOS WebView** | `MacOSX.sdk/System/Library/Frameworks/WebKit.framework` | **PASS** | System `WKWebView`; zero Linux packages installed on macOS |
| **Tauri CLI & Core Crate** | `@tauri-apps/cli 2.12.4`, `@tauri-apps/api 2.12.4`, `tauri 2.12.5`, `tauri-build 2.7.4` | **PASS** | Zero extra third-party crates added beyond scaffold |
| **Frontend Toolchain** | Node.js `v24.19.0`, npm `11.17.0`, `react 18.3.1`, `vite 5.4.21`, `vitest 2.1.9`, `typescript 5.9.3` | **PASS** | Zero extra npm dependencies added |

---

## 3. Delivered Architecture (`M1-T09` – `M1-T11`)

- **`M1-T09` Desktop Shell (`4815167`):** Tauri 2 + React 18 + Vite 5 + TypeScript scaffold with `resolve_workspace_root_with` using `OsStr` / `PathBuf` without `.trim()` so `/Users/vipinkumar/Desktop/animator ` is preserved verbatim, plus CSP permitting `'self'` and `http://127.0.0.1:*`.
- **`M1-T10` Native 8-Category Doctor (`af92c9b`):** Shell-free `Command::new(...).args(...)` probing `os`, `rust`, `node`, `ffmpeg`, `givemotion`, `remotion`, `stretchystudio`, and `directories`, propagating normalized `PATH` to child processes, paired with `<DoctorBar />` (`PASS`/`WARN`/`FAIL` text badges, `role="alert"`, StrictMode sequencing).
- **`M1-T11.1` Worker Protocol v1 & Cancellation (`576444b`):** Specified in [WORKER_PROTOCOL.md](../specs/WORKER_PROTOCOL.md). Enforces `version: 1` envelopes, structured `{ code, error }` error codes (`INVALID_ID`, `INVALID_PARAMS`, `UNKNOWN_METHOD`, `UNSUPPORTED_PROTOCOL_VERSION`, `RENDER_IN_PROGRESS`, `RENDER_CANCELLED`, `INTERNAL_ERROR`), redirects accidental `console.log`/`info` to `stderr`, and implements targeted `cancel_render` in `GivemotionAdapter` + `worker.ts` (tracking both `preparingRenders` and active child processes with `SIGTERM` -> `SIGKILL` escalation and `RENDER_CANCELLED` settlement).
- **`M1-T11.2` Persistent Rust `WorkerBridge` (`49c231c`, hardened `6ce2515`):** Supervises `node .../animforge-core/dist/src/worker.js <workspace_root>` off the Tauri UI thread (`spawn_blocking`), drains `stdout` (`classify_worker_line`) and `stderr` on dedicated lossy-UTF-8 reader threads without pipe deadlocks, emits `"animforge://render-progress"` events, respawns crashed workers automatically, tears down wedged workers & children on request timeout (`RecvTimeoutError::Timeout`) so `activeRenders` cannot stay locked, and shuts down cleanly via stdin EOF -> `SIGTERM`/`kill` on `Drop` and `RunEvent::Exit`. Exposes `project_list`, `project_create_from_prompt`, `project_load`, `project_save`, `project_preview`, `project_render`, `project_cancel_render`.
- **`M1-T11.3` Path-Jailed Loopback HTTP Server (`331e462`, trimmed `6ce2515`):** `PreviewServer` binds `127.0.0.1:0` with bounded concurrency (`MAX_CONCURRENT_REQUESTS = 32` -> `503`), socket timeouts (`408`), header/URI caps (`431`/`414`), HTTP smuggling rejection (`Transfer-Encoding`, non-zero/duplicate `Content-Length`), strict loopback `Host:` and Tauri/dev `Origin:` enforcement, `frame-ancestors` header on HTML bundles, `GET`/`HEAD` method allowlist (`405`), single-layer URI decoding rejecting `%25`/`%2f`/`%5c`/`%00`/backslashes/dotfiles/`.`/`..`, per-segment jail verification preventing symlinked roots and 404 oracle escapes, strict MIME extension map (excluding `.db`/`.sqlite`/scripts/dotfiles), single-byte `Range` `206`/`416` streaming, and `RunEvent::Exit` + `Drop` shutdown. Exposes `get_preview_base_url`.
- **`M1-T11.4` Studio UI & Real `<gm-player>` Stage (`61e7678`, hardened `6ce2515`):**
  - `useStudio.ts`: Synchronizes `get_preview_base_url`, `project_list`, CRUD (`project_create_from_prompt`, `project_load`, `project_save`), revision-busted `bundleUrl` (`?v=${previewRev}`) and `playerScriptUrl`, live `"animforge://render-progress"` filtering, same-tick double-render guard (`renderingProjectIdRef`), active-project cancellation across project switches, and unmount cleanup.
  - `PreviewStage.tsx`, `App.tsx`, `styles.css`: Injects deduped `gm-player.js`, mounts `<gm-player key=... src=... controls>` directly inside Studio, surfaces QA issue badges, native `<progress>` bar + Cancel Render during export, `<video controls>` preview + Interactive/MP4 toggle after export, explicit form submit validation with focus routing, separated status vs blur announcements in `[aria-live="polite"]`, and high-contrast `@media (forced-colors: active)` outlines.

---

## 4. Verification Matrix (Post-Audit `HEAD` `6ce2515`)

| Check / Suite | Command / Harness | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Rust Clippy** | `/Users/vipinkumar/.cargo/bin/cargo clippy --manifest-path ".../Cargo.toml" --all-targets -- -D warnings` | **PASS** | `0` warnings across lib, binary, and unit tests |
| **Rust Unit & Loopback Tests** | `/Users/vipinkumar/.cargo/bin/cargo test --manifest-path ".../Cargo.toml"` (`BypassSandbox: true`) | **PASS** | `16/16` pass (`0.73s`): trailing-space paths, 8-category Doctor, WorkerBridge concurrency/crash/timeout-kill/EOF-escalation/real `worker.js`, symlink/traversal/Host/Origin/smuggling/Range HTTP loopback tests *(inside sandbox `15/16` pass; loopback TCP connect hits sandbox `Operation not permitted`)* |
| **Desktop Frontend Tests & Build** | `npm --prefix ".../animforge-desktop" test && npm --prefix ".../animforge-desktop" run build` | **PASS** | `16/16` Vitest tests across `4` files (`590ms`) + `tsc --noEmit && vite build` (`37 modules`, `216ms`) |
| **Core Typecheck & Unit Suite** | `npm --prefix ".../animforge-core" run typecheck && test` | **PASS** | `22/22` unit tests pass (`1` `ANIMFORGE_INTEGRATION` test skipped cleanly) |
| **Live E2E `<gm-player>` + MP4 Smoke** | Scratch `live_smoke_driver` (wrapping real `doctor`, `PreviewServer`, `WorkerBridge`) + `verify_e2e.mjs` + headless Chrome `157.0.8103.38` (`BypassSandbox: true`, `task-1956`) | **PASS** | `DOCTOR_OK` (`8/8` `Pass`), `PHASE1_READY` (create/list/load/save/preview in trailing-space repo), `HTTP_SECURITY_CHECKS_PASS` (`200` JS/HTML + `frame-ancestors`, `403` traversal/`animforge.db`/`engines/`/evil `Host`, `405` `POST`), `GM_PLAYER_BROWSER_PASS` (CSP-matched `http://127.0.0.1:1420` page, `ready` `duration: 11.5s`, `play`, `8x timeupdate`, `maxCurrentTime > 0`, `errors: []`), `RENDER_OK` (`19` streamed progress events), `CANCEL_OK` (`[RENDER_CANCELLED]`), `MP4_RANGE_FFPROBE_VIDEO_PASS` (`206 bytes=0-63` `ftyp`, `ffprobe` H.264 `1280x720`, browser `<video>` metadata), `SHUTDOWN_OK`, `PORT_UNBOUND_PASS` |
| **Standalone Desktop Release Build & Boot/Exit** | `npm --prefix ".../animforge-desktop" run tauri -- build --no-bundle --ci` + live launch of `target/release/animforge-desktop` (`BypassSandbox: true`) | **PASS** | Compiled optimized release binary (`animforge-desktop`); live boot spawned WKWebView + `node .../worker.js "/Users/vipinkumar/Desktop/animator /AnimForgeLab"` + bound `TCP 127.0.0.1:49783 (LISTEN)`; `SIGTERM` exited cleanly with `POST EXIT: CLEAN` (`0` orphan `worker.js`/`animforge-desktop` processes) |
| **Independent Audits** | Subagent reviews across `M1-T11.1`..`M1-T11.5` (`af86fb2a`, `53b8a10f`, `179c1eca`, `668dc8f7`, `204fd0bf`, `26c20698`) | **PASS** | Final full-diff audit (`26c20698`) identified 2 must-fix edge cases & 1 dead field; all 3 fixed in `6ce2515` and re-verified (`Verdict: Ship.`) |
| **Workspace & Upstream Hygiene** | `git status` on `engines/*` and root; `ls -la projects/` | **PASS** | Upstream `engines/{givemotion,remotion,stretchystudio}` empty diff; temporary smoke `projects/proj_*` and `projects/animforge.db*` removed (`projects/` contains only original `.DS_Store`, `cybersecurity-explainer`, `demo-animation`, `givemotion-test`, `remotion-test`) |

---

## 5. Known Limits & Untested Surfaces

- **Platform Coverage:** Built and verified natively on **macOS (`aarch64`, `WKWebView`, Chrome `157`)**; Linux `WebKitGTK` build and Linux runtime playback were not executed on this macOS host.
- **WKWebView GUI Automation Split:** macOS `osascript` Assistive Access (`-1728`) prevented scripted UI clicking inside the native Tauri window (`WKWebView`), so live testing verified: (1) booting the standalone `animforge-desktop` release binary (`WKWebView` + `WorkerBridge` auto-spawn + `127.0.0.1` HTTP bind + `SIGTERM` teardown), and (2) driving the exact compiled Rust `PreviewServer` + `WorkerBridge` + real `worker.js` + real `<gm-player>` under matching CSP headers in headless Chrome (`verify_e2e.mjs`). Interactive button clicks inside React are covered by JSDOM/Vitest (`16/16`), not live mouse-driven WKWebView inspection.
- **Boundary:** Stopped cleanly at Milestone 1 completion; `M1-T12` (Remotion/StretchyStudio desktop wiring / Milestone 2 features) has **not** started.
