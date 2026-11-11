# AnimForge Studio — Milestone 1 Report (Through M1-T10)

**Date:** 2026-11-11  
**Workspace Root:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` *(trailing space preserved)*  
**Branch:** `feat/milestone-1-core` (`HEAD` at implementation commit `af92c9b` + docs commit)  
**Scope Status:** `M1-T01` through `M1-T10` **DONE**; `M1-T11` (Workstream H: Worker bridge, `127.0.0.1` preview server, `<gm-player>` stage) **PENDING** and intentionally not started (live GUI window not launched).

---

## 1. Pre-Installation Host Checks (`M1-T09` Step 1)

| Check | Exact Result | Status |
| :--- | :--- | :--- |
| **OS & Architecture** | `macOS 27.2` (`Build 26B123`, `arm64`, Apple Silicon) | **PASS** |
| **Disk Space (`/`)** | `259Gi` available pre-install (`244Gi` available on `460Gi` volume after Cargo + npm installs) | **PASS** |
| **Existing Rust State** | `~/.cargo` and `~/.rustup` absent before install; `.zprofile` (`260B`) & `.zshrc` (`26B`) free of prior Cargo PATH overrides | **PASS** |
| **Xcode Command Line Tools** | `/Library/Developer/CommandLineTools` (`com.apple.pkg.CLTools_Executables` `27.2.0.0.1792721180`, `Apple clang 21.0.0`) | **PASS** |
| **Secret & Workspace Hygiene** | `.env` / `.venv` untouched; `engines/` untouched | **PASS** |

---

## 2. Official Rust Toolchain Installation & Verification (`M1-T09` Steps 2–3)

Installed via official `https://sh.rustup.rs` (`rustup-init 1.29.3`, `stable` toolchain, default profile) in unsandboxed shell (`task-1020`, installer script cleaned immediately after install):

| Command | Verified Output | Status |
| :--- | :--- | :--- |
| `rustup --version` | `rustup 1.29.3 (edbc831ce 2026-11-02)` | **PASS** |
| `rustc --version` | `rustc 1.99.1 (58cf8f9c3 2026-10-13)` | **PASS** |
| `cargo --version` | `cargo 1.99.1 (5f94df478 2026-08-27)` | **PASS** |
| `rustup show` | Default host `aarch64-apple-darwin`; active toolchain `stable-aarch64-apple-darwin` | **PASS** |

> [!NOTE]
> Unsandboxed login shells (`zsh -l -c`) locate `rustup`/`rustc`/`cargo` via `~/.cargo/bin` on `PATH`. Inside the agent terminal sandbox, reading `~/.zshenv` returns `Operation not permitted`, so sandboxed verification invokes `/Users/vipinkumar/.cargo/bin/cargo` directly.

---

## 3. Tauri 2 Prerequisites Report (`M1-T09` Step 4)

| Component | Detected Version / Location | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Xcode Command Line Tools** | `/Library/Developer/CommandLineTools` · `Apple clang 21.0.0` | **PASS** | Sufficient for native macOS builds; full `Xcode.app` omitted (only needed for iOS/App Store distribution). |
| **macOS WebView** | `MacOSX.sdk/System/Library/Frameworks/WebKit.framework` | **PASS** | System `WKWebView` built into macOS SDK. No Linux packages (`libwebkit2gtk-4.1-dev` etc.) installed on macOS. |
| **Tauri CLI & Core Crate** | `@tauri-apps/cli 2.12.4`, `@tauri-apps/api 2.12.4`, `tauri 2.12.5`, `tauri-build 2.7.4` | **PASS** | Local `./node_modules/.bin/tauri --version` reports `tauri-cli 2.12.4`. (`tauri info` attempts network version lookups and hangs when sandbox blocks network.) |
| **Frontend Toolchain** | Node.js `v24.19.0`, npm `11.17.0`, `react 18.3.1`, `vite 5.4.21`, `vitest 2.1.9`, `typescript 5.9.3` | **PASS** | `npm install` logged an `esbuild` install-script warning under npm 11 policy; `vite build` & `vitest` run cleanly. |

---

## 4. Delivered Work (`M1-T09` & `M1-T10`)

- **`M1-T09` (`4815167`, reviewer `03d343c8: Ship`):** Scaffolded `animforge-desktop/` with Tauri 2 + React 18 + Vite 5 + TypeScript, desktop icons, CSP scoped to `'self'` and `http://127.0.0.1:*` for future `<gm-player>` preview, and `resolve_workspace_root_with` using `OsStr` / `PathBuf` without `.trim()` to preserve `/Users/vipinkumar/Desktop/animator `.
- **`M1-T10` (`af92c9b`, reviewer `fe0ae7d2: Ship`):**
  - **Rust Backend (`animforge-desktop/src-tauri/src/doctor.rs` & `lib.rs`):** Added async `run_doctor` Tauri command (`spawn_blocking`) probing 8 categories (`os`, `rust`, `node`, `ffmpeg`, `givemotion`, `remotion`, `stretchystudio`, `directories`) using shell-free `Command::new(...).args(...)`, `OsStr` paths, filtered `search_path_dirs_with` (appending `$HOME/.cargo/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, omitting empty segments) propagated to child `.env("PATH", ...)` so GUI launches resolve `npm` (`#!/usr/bin/env node`) and `node cli.js doctor`.
  - **React UI & Accessibility (`src/components/DoctorBar.tsx`, `src/styles.css`, `index.html`):** Dark theme (`<meta name="color-scheme" content="dark">` + `:root { color-scheme: dark; }`), explicit `PASS`/`WARN`/`FAIL` text badges (not color alone), `role="alert"` error banner, `role="list"` for WebKit grid lists, `--control-border: #64748b` boundary contrast, `@media (forced-colors: active)`, and `runSeqRef` concurrency guard across `<React.StrictMode>` & unmount cleanup.

---

## 5. Verification Matrix (Post-Fix `HEAD` `af92c9b`)

| Check / Suite | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Rust Clippy** | `/Users/vipinkumar/.cargo/bin/cargo clippy --manifest-path .../Cargo.toml --all-targets -- -D warnings` | **PASS** | `0` warnings across lib, binary, and unit tests. |
| **Rust Unit & Workspace Tests** | `/Users/vipinkumar/.cargo/bin/cargo test --manifest-path .../Cargo.toml` | **PASS** | `7/7` pass (`0.26s`): trailing-space root resolver, GiveMotion doctor parser, 8-category mock evaluator, missing/unbuilt `WARN`/`FAIL`, child-`PATH` propagation, and live workspace 8-category `cli.js doctor` probe. |
| **Desktop Frontend Tests** | `npm --prefix .../animforge-desktop test` | **PASS** | `6/6` pass (`2` files, `397ms`): landmark structure, 8 badges, Re-check + alert error, `<React.StrictMode>` stale-first & stale-after-fresh ordering, initial error fallback subtitle. |
| **Desktop Typecheck & Bundle** | `npm --prefix .../animforge-desktop run build` | **PASS** | `tsc --noEmit && vite build` succeeded in `207ms` (`34 modules`). |
| **Core Typecheck & Unit Suite** | `npm --prefix .../animforge-core run typecheck && test` | **PASS** | `22/22` unit tests pass (`1` integration test skipped by `ANIMFORGE_INTEGRATION` gate). |
| **Real MP4 Integration (`M1-T08`)** | `ANIMFORGE_INTEGRATION=1` (unsandboxed `task-930`, commit `3cffcbb`) | **PASS** | `1/1` pass (`13.1s`): real GiveMotion Chrome + FFmpeg + `ffprobe` H.264 `1280x720` MP4 export. |
| **Upstream Engines Untouched** | `git -C engines/{givemotion,remotion,stretchystudio} status --short` | **PASS** | Empty working tree diff on all 3 upstream repos. |

---

## 6. Pending Work (`M1-T11` Next)

Per explicit boundary instructions, execution stopped after `M1-T10`:
- **Not started:** `M1-T11` (`worker_bridge.rs`, path-jailed `127.0.0.1` `preview_server.rs`, `useStudio.ts`, `<gm-player>` `PreviewStage.tsx`).
- **Not launched:** Live `tauri dev` / desktop GUI window smoke test (and Linux WebKitGTK build, not applicable on macOS).
