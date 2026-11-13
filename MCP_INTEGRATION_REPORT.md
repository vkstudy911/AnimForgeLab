# AnimForge Studio — OpenCode MCP Integration Report

**Date:** 2026-11-12  
**Repository:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` (`feat/milestone-1-core`)  
**SDK:** `@modelcontextprotocol/sdk@^1.32.2` (`McpServer` + `StdioServerTransport`) + `zod@3.25.76`

---

## 1. Architecture Summary

The MCP server extends `animforge-core/` directly without altering the Milestone 1 desktop `WorkerBridge`, `worker.ts` Protocol v1, Rust `PreviewServer`, or upstream `engines/{givemotion,remotion,stretchystudio}` repositories.

### Implemented Files

| File | Responsibility |
| :--- | :--- |
| [errors.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-core/src/mcp/errors.ts) | Structured `McpErrorCode` taxonomy, error classification, and clean JSON tool response helpers |
| [validation.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-core/src/mcp/validation.ts) | Canonical workspace check, `assets/`/`projects/` path jail, hidden/dotfile/`.env`/`.venv`/symlink rejection, extension allowlist, confirmation gating |
| [schemas.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-core/src/mcp/schemas.ts) | `.strict()` Zod input schemas for all 16 `animforge_*` tools (`safeIdSchema`, finite bounds, explicit `confirm`/`confirmOverwrite`) |
| [tools.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-core/src/mcp/tools.ts) | `AnimForgeMcpService` wrapping `AnimForgeDatabase`, `AnimForgePipeline`, `GivemotionAdapter`, `ffprobe`, active render cancellation, and timeout/abort tracking |
| [server.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-core/src/mcp/server.ts) | `createAnimForgeMcpServer()` registering all 16 tools with MCP annotations and `notifications/progress` forwarding |
| [index.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-core/src/mcp/index.ts) | Stdio binary (`dist/src/mcp/index.js`) routing all `console.*` diagnostics to `stderr` and tearing down child renders/DB on `SIGINT`/`SIGTERM`/stdin EOF |
| [OPENCODE_MCP_SETUP.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/OPENCODE_MCP_SETUP.md) | Verified OpenCode `opencode.json` schema, trailing-space-safe `command` array, merge guidance, and handshake verification commands |

---

## 2. Implemented MCP Tools (16)

1. `animforge_doctor`
2. `animforge_list_projects`
3. `animforge_create_project`
4. `animforge_get_project`
5. `animforge_get_project_status`
6. `animforge_list_scenes`
7. `animforge_create_scene`
8. `animforge_update_scene`
9. `animforge_list_assets`
10. `animforge_import_asset`
11. `animforge_create_animation`
12. `animforge_update_keyframes`
13. `animforge_generate_preview`
14. `animforge_get_render_status`
15. `animforge_cancel_render`
16. `animforge_export_video`

All 16 tools delegate to existing `animforge-core` APIs and real local binaries (`node`, Chrome, `ffmpeg`, `ffprobe`, GiveMotion CLI) — zero fake tools or stubbed outputs.

---

## 3. Security & Guardrails Verified

- **No Arbitrary Shell / FS / HTTP:** All subprocess execution uses `execFile` / `spawn` with `shell: false` and explicit argument arrays via `ProcessRunner`.
- **Canonical Workspace Jail:** Preserves `/Users/vipinkumar/Desktop/animator /AnimForgeLab` trailing ASCII space while rejecting `../`, URL-encoded traversal, NUL bytes, Windows drive prefixes, hidden dotfiles, `.env*`, `.venv*`, and external symlinks.
- **`PreviewServer` Excluded:** Rust `PreviewServer` is untouched and unexposed (`animforge_doctor` explicitly returns `previewServerExposed: false`).
- **Explicit Confirmations:** `animforge_export_video` requires `confirm: true`; destructive overwrites in `animforge_create_project`, `animforge_create_scene`, `animforge_update_scene`, `animforge_import_asset`, `animforge_create_animation`, and `animforge_update_keyframes` require `confirmOverwrite: true`.
- **Clean Shutdown & Cancellation:** `animforge_cancel_render`, MCP `AbortSignal`, timeouts, stdin EOF, and `SIGINT`/`SIGTERM` send `SIGTERM` -> `SIGKILL` to child Chrome/FFmpeg processes and close SQLite cleanly.
- **User OpenCode Config Untouched:** `~/.config/opencode/opencode.json` was left unmodified.

---

## 4. Intentionally Unsupported Surfaces (Honest Scope)

- **Preview HTTP Server / Remote Screenshots:** Desktop Tauri WebView only (`PreviewServer`).
- **`StretchyStudio` WebGL2 Mesh / Bone / `.stretch` Rig Keyframes & DWPose Auto-Rigging:** Deferred to Milestone 2 desktop workflows; `animforge_update_keyframes` operates on `Scene.timeline` (`characterActions`, `cameraMoves`, `audioTracks`, `duration`, `fps`).
- **Remotion Headless Export via MCP:** `animforge_export_video` validates `preferredEngine === 'givemotion'` and returns structured `UNSUPPORTED` for other engines.
- **Project Deletion / Arbitrary File CRUD:** Intentionally omitted.

---

## 5. Verification Summary

All checks passed freshly after final edits:

| Suite | Command | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| Core TypeScript Typecheck & Unit Tests | `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" run typecheck && npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" test` | `28/28` PASS (`2` integration tests skipped) | Covers trailing-space paths, validation/path jail/symlink/`.env` checks, all 16 strict schemas, `StdioClientTransport` child process lifecycle & happy/error tool calls, `animforge_cancel_render` (`SIGTERM`) |
| Core Real Chrome + FFmpeg Integration (`ANIMFORGE_INTEGRATION=1`) | `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" run test:integration` | `2/2` PASS (`0` failed, `0` skipped, `21.5s`) | Real stdio handshake -> `animforge_doctor` -> project/scene/animation -> GiveMotion Chrome QA/bundle -> real MP4 `animforge_export_video` (`1280x720` `h264`, `ffprobe` verified) -> mid-render `animforge_cancel_render` -> clean shutdown |
| Desktop Vitest & Production Build | `npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop" test && npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop" run build` | `16/16` PASS; `vite build` `234ms` | M1 UI, `useStudio`, `<DoctorBar />`, `<PreviewStage />` intact |
| Rust Clippy (`-D warnings`) | `cargo clippy --manifest-path ".../animforge-desktop/src-tauri/Cargo.toml" --all-targets -- -D warnings` | `0` warnings (`0.37s`) | M1 Rust backend intact |
| Rust Unit & Loopback Tests | `cargo test --manifest-path ".../animforge-desktop/src-tauri/Cargo.toml"` | `16/16` PASS (`1.07s`) | `WorkerBridge`, `PreviewServer`, and 8-category `doctor` intact |
| Repository & Upstream Hygiene | `git status` on root + `engines/*`; `ls -la ~/.config/opencode/opencode.json` | Clean | `engines/{givemotion,remotion,stretchystudio}` unmodified; `~/.config/opencode/opencode.json` untouched; zero stray `projects/` test folders or orphan processes |

---

## 6. Start / Verify Command

Build and launch over stdio:

```bash
npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" run build
npm --prefix "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core" run mcp:start -- "/Users/vipinkumar/Desktop/animator /AnimForgeLab"
```

Note: `opencode` CLI was not installed on `PATH` on this machine during verification (`which opencode` -> not found), so live OpenCode CLI UI invocation was not executed directly; protocol compliance was verified against OpenCode's `opencode.json` schema and `@modelcontextprotocol/sdk`'s real `StdioClientTransport` + `Client` over spawned stdio pipes.
