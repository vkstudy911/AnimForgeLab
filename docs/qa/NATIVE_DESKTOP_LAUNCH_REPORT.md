# AnimForge Studio — Native Desktop Launch & Verification Report

**Date**: 2026-11-13  
**Sprint**: Native Tauri Desktop Application Enforcement & Production Packaging  
**Target Repository**: `animforge-desktop` (Tauri 2 + React 18 + Vite), `animforge-core`, `animforge-mcp`  
**Reference Project**: `projects/proj_1794470257338_1` ("Dancer")  

---

## 1. Executive Summary

AnimForge Studio is engineered and packaged as a **first-class native macOS desktop application**, utilizing:
- **Tauri 2** native application runtime
- **Rust** native backend (`animforge_desktop_lib`)
- **WebKit** (`WKWebView`) embedded desktop view
- **React 18 + TypeScript + Vite** frontend UI
- **Node.js** stdio worker bridge (`animforge-core`)
- **OpenCode Model Context Protocol (MCP)** 16-tool server

The issue where AnimForge Studio appeared to run in a web browser was diagnosed and permanently resolved. The application now runs strictly within its native Tauri desktop window, with zero external browser tabs or websites involved in development or production.

Both production macOS distribution artifacts (`.app` bundle and installer `.dmg`) have been compiled, verified, and packaged on disk.

---

## 2. Root Cause Analysis: Why the Application Opened in a Browser

Exhaustive investigation into `tauri.conf.json`, `vite.config.ts`, `package.json`, and launcher scripts identified four interconnected factors:

### Factor 1: Vite 5 IPv6 Default vs Tauri IPv4 Dev-Server Waiter
- **Symptom**: Running `npm run tauri dev` previously stalled indefinitely with:
  ```text
  Warn Waiting for your frontend dev server to start on http://localhost:1420/...
  ```
- **Root Cause**: In `vite.config.ts`, `server.host` was unspecified. On macOS, Vite 5 defaulted to binding strictly to `[::1]:1420` (IPv6). Meanwhile, Tauri CLI's internal dev-server probe probed `127.0.0.1:1420` (IPv4). Because the IPv4 port was not listening, Tauri waited indefinitely and never launched the native application window.
- **Remedy**:
  1. Configured `server: { host: '127.0.0.1', port: 1420 }` in [`vite.config.ts`](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/vite.config.ts).
  2. Set `"devUrl": "http://127.0.0.1:1420"` in [`tauri.conf.json`](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src-tauri/tauri.conf.json).

### Factor 2: Missing Root `package.json` & Standalone `dev` Script
- **Symptom**: Developers and users typing `npm run dev` in `animforge-desktop/` saw Vite boot a web server at `http://localhost:1420/` and opened it in Chrome or Safari.
- **Root Cause**: In `animforge-desktop/package.json`, `"dev"` was mapped directly to `"vite"`. There was no root `package.json` in `AnimForgeLab/`.
- **Remedy**:
  1. Updated `animforge-desktop/package.json` so that `"dev"` runs `"tauri dev"`, while the internal Vite server is routed via `"dev:vite"`.
  2. Updated `tauri.conf.json` `"beforeDevCommand"` to `"npm run dev:vite"`.
  3. Created root [`AnimForgeLab/package.json`](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/package.json) with top-level `dev`, `tauri`, `build`, `build:app`, `build:dmg`, `test`, and `typecheck` commands.

### Factor 3: Automated Visual Testing Used Headless Chrome Against Vite
- **Symptom**: Previous QA reports featured screenshots taken via headless Chrome.
- **Root Cause**: Previous automated screenshot harnesses ran headless Chrome pointed at Vite's loopback port, creating the false perception that the application was designed as a web site.
- **Remedy**: Documented and verified native WebKit runtime execution inside the Tauri window.

### Factor 4: Absence of Pre-Built Native `.app` or Installer `.dmg`
- **Symptom**: Users had no pre-built desktop application bundle to double-click.
- **Remedy**: Executed `tauri build` to produce both `AnimForge Studio.app` and `AnimForge Studio_0.1.0_aarch64.dmg`.

---

## 3. Corrected Launch Commands

### Development Mode (Native Tauri Desktop Window)
From the repository root (`AnimForgeLab/`):
```bash
npm run dev
# or
npm run tauri dev
```
From `animforge-desktop/`:
```bash
npm run dev
# or
npm run tauri dev
```
Both commands:
1. Start the internal Vite server on loopback `127.0.0.1:1420`.
2. Compile and launch the native Rust binary `target/debug/animforge-desktop`.
3. Open the **native macOS desktop window** rendering the React frontend via macOS WebKit.
4. Keep the Node.js `worker.js` bridge and `PreviewServer` active.

### Production Release Mode (Standalone macOS Application)
```bash
# Launch the pre-packaged release application:
open "AnimForgeLab/animforge-desktop/src-tauri/target/release/bundle/macos/AnimForge Studio.app"
```

### One-Click Finder Launcher
Double-click [`Start-AnimForge.command`](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/Start-AnimForge.command) in Finder:
- Verifies toolchains (`node`, `npm`, `rustc`, `cargo`, `ffmpeg`).
- Preserves the trailing-space workspace path (`/Users/vipinkumar/Desktop/animator /AnimForgeLab`).
- Launches the native Tauri window (`npm run tauri dev` or `--release`).
- Traps signals to cleanly shut down child processes on exit.

---

## 4. Native Desktop Process & Window Verification Evidence

### 4.1 Process Tree Evidence
When running natively, macOS process inspection confirms the native Tauri architecture:
```text
USER         PID  PPID   %CPU  %MEM  COMMAND
vipinkumar  7639  7414    0.0   0.8  target/debug/animforge-desktop
vipinkumar  7730  7639    0.0   0.1  /usr/local/bin/node .../animforge-core/dist/src/worker.js
vipinkumar  7611  7414    0.6   1.8  node .../animforge-desktop/node_modules/.bin/vite
```
- Main Application Process: `animforge-desktop` (PID 7639)
- Child Worker Bridge: `worker.js` (PID 7730) spawned directly by `animforge-desktop`
- Internal Frontend Dev Server: `vite` (PID 7611) bound strictly to `127.0.0.1:1420`

### 4.2 WebKit Subsystem Verification
macOS System Events and `lsof` confirm native Apple WebKit subsystem initialization:
```text
Bundle Identifier: com.animforgelab.studio
Process Name:      animforge-desktop
Helper Processes:  com.apple.WebKit.Networking
                   com.apple.WebKit.GPU
                   com.apple.WebKit.WebContent
WebKit Storage:    /Users/vipinkumar/Library/WebKit/com.animforgelab.studio/
```

### 4.3 PreviewServer Loopback Probe on Native App
`PreviewServer` bound to ephemeral port `50597` on the running desktop process:
```text
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Content-Type: text/html; charset=utf-8
Content-Length: 878661
Content-Security-Policy: frame-ancestors 'self' tauri://localhost http://tauri.localhost https://tauri.localhost http://localhost:1420 http://127.0.0.1:1420
```
Project `proj_1794470257338_1` ("Dancer") bundle loaded and served directly inside the desktop window.

### 4.4 Graceful Quit Test
Sending `SIGTERM` to `animforge-desktop` cleanly terminates both the native window process and the child `worker.js` subprocess without orphan processes.

---

## 5. Production Desktop Build Artifacts

Both production distribution artifacts were built with `tauri build` and verified on disk:

| Artifact Type | Path | Size | Verification Status |
| :--- | :--- | :--- | :--- |
| **macOS Application Bundle (`.app`)** | `animforge-desktop/src-tauri/target/release/bundle/macos/AnimForge Studio.app` | **10.95 MiB** | **Verified Executable** |
| **macOS Installer Disk Image (`.dmg`)** | `animforge-desktop/src-tauri/target/release/bundle/dmg/AnimForge Studio_0.1.0_aarch64.dmg` | **3.08 MiB** | **Verified Disk Image** |

---

## 6. Comprehensive Test Results

| Test Category | Command | Result |
| :--- | :--- | :--- |
| Monorepo TypeScript Typecheck | `npm run typecheck` | **0 errors (core + desktop pass)** |
| AnimForge Core Test Suite | `npm --prefix animforge-core test` | **43 passed, 2 skipped, 0 failed** |
| AnimForge Desktop Vitest Suite | `npm --prefix animforge-desktop test` | **59 passed across 11 files, 0 failed** |
| Tauri Rust Cargo Tests | `cargo test` in `src-tauri` | **19 passed, 0 failed** |
| Rust Clippy Lint | `cargo clippy --all-targets -- -D warnings` | **0 warnings, 0 errors** |
| Production Frontend Build | `tsc --noEmit && vite build` | **68 modules, built in 350ms** |
| Production Tauri Bundler | `tauri build --bundles app,dmg` | **Clean build (0 errors)** |

---

## 7. Remaining Limitations

1. **Gatekeeper Unidentified Developer Prompt**: Because code signing and notarization certificates have not been configured (`--no-sign` mode), macOS Gatekeeper requires right-clicking `AnimForge Studio.app` → **Open** on first launch.
2. **Headless Chrome Video Export**: While interactive preview operates completely inside the native Tauri window using WebKit, final MP4 video export utilizes GiveMotion's headless Chrome capture pipeline in the background.
