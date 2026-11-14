# AnimForge Studio — OpenCode MCP Integration Plan

> **For agentic workers:** Follow `superpowers:executing-plans` + `superpowers:test-driven-development` + `superpowers:verification-before-completion` + `ponytail` discipline. Steps follow strict TDD (RED -> verify fail -> GREEN -> verify pass -> refactor) in small, independently tested tasks.

**Goal:** Expose AnimForge Studio's real project, scene, asset, timeline, preview QA, cancellation, and MP4 export capabilities to OpenCode via an official TypeScript MCP stdio server in `animforge-core/src/mcp/`.

**Architecture:** `animforge-core/src/mcp/` reuses `AnimForgeDatabase`, `AnimForgePipeline`, `GivemotionAdapter`, `RemotionAdapter`, `StretchyStudioAdapter`, `compileProjectHtml`, `process-runner.ts`, and `utils/paths.ts` behind `@modelcontextprotocol/sdk`'s `McpServer` + `StdioServerTransport`, keeping `stdout` strictly JSON-RPC, directing all diagnostics to `stderr`, and never exposing `PreviewServer` HTTP serving or arbitrary host filesystem access.

**Tech Stack:** TypeScript 5 (`NodeNext`), `@modelcontextprotocol/sdk ^1.32.2`, Zod `^3.25` (v3), Node.js `v24` (`node:sqlite`, `node:test`, `node:child_process`), GiveMotion CLI, `ffprobe`.

**Workspace Root:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` *(preserve trailing ASCII `0x20`)*

---

## Global Constraints

1. **Reuse Existing Core:** Extend `animforge-core/`; preserve M1 `worker.ts` Protocol v1, Rust `WorkerBridge`, Rust `PreviewServer`, and `engines/{givemotion,remotion,stretchystudio}` unmodified.
2. **Never Expose `PreviewServer`:** `PreviewServer` is strictly a loopback HTTP static/Range server for the local Tauri WebView. Do not invoke it, mirror its HTTP file endpoints, or treat it as an RPC backend in MCP.
3. **Zero Fake Tools:** All 16 MCP tools operate on real state and real binaries. Partially supported or Milestone 2 features are honestly scoped or documented as unavailable below.
4. **Strict Security Boundary:** No shell command strings (`shell: false` + arg arrays only), no arbitrary FS read/write, no arbitrary HTTP calls, no `.env`/`.venv`/secret config access, strict `/^[a-zA-Z0-9_-]{1,64}$/` IDs, canonical path jail inside `AnimForgeLab/`, and explicit confirmation (`confirm: true` / `confirmOverwrite: true`) on overwrites and expensive renders.
5. **Stdio Hygiene:** Redirect `console.log`/`info`/`warn`/`debug` to `stderr`; never write non-JSON-RPC text to `stdout`.
6. **Do Not Auto-Edit OpenCode Config or Start M2:** Document OpenCode configuration cleanly in `OPENCODE_MCP_SETUP.md`; leave `~/.config/opencode/opencode.json` untouched.

## Review Focus

- **Trailing-space & traversal paths:** Workspace `/Users/vipinkumar/Desktop/animator /AnimForgeLab`, `../`, `%2e%2e`, NUL bytes, Windows drive prefixes, `.env`/`.venv`/hidden dotfiles, and external symlinks must all preserve valid spaces while failing closed outside jail.
- **Stdout contamination:** Any library or `AnimForgePipeline` call emitting `console.log` must be routed to `stderr` before `StdioServerTransport` connects so JSON-RPC never corrupts.
- **Unconfirmed expensive/overwrite mutations:** `animforge_export_video` without `confirm: true`, or overwriting existing project/asset files without `confirmOverwrite: true`, must fail cleanly with explicit confirmation errors.
- **Active render cancellation & timeout cleanup:** Cancelling via `animforge_cancel_render`, MCP `AbortSignal`, or server `SIGINT`/`SIGTERM`/stdin EOF must terminate child Chrome/FFmpeg processes cleanly without leaving orphan processes or wedged `activeRenders`.
- **Real MP4 & `ffprobe` truth:** `animforge_export_video` must verify actual `.mp4` existence and real `ffprobe` stream metadata rather than returning mocked/assumed dimensions or durations.

---

## Phase 1 Inspection — Reusable APIs vs. Unsupported Surfaces

| Existing Component | Verified Capabilities | Reusable in MCP |
| :--- | :--- | :--- |
| `AnimForgeDatabase` (`src/database.ts`) | SQLite CRUD (`saveProject`, `getProject`, `listProjects`, `saveRenderJob`, `getRenderJob`) in `projects/animforge.db` | Yes (shared DB + disk fallback matching `worker.ts`) |
| `AnimForgePipeline` (`src/pipeline.ts`) | Prompt -> Storyboard -> Character -> Scenes (`planProject`) | Yes |
| `GivemotionAdapter` (`adapters/givemotion.adapter.ts`) | `getDoctorInfo()`, `saveProjectState()`, `compileProjectHtml()`, `previewProject()` (`check` + `bundle`), `render()` (`--workers 1`), `getRenderStatus()`, `exportVideo()`, `cancelRender()`, `dispose()` | Yes (primary real engine) |
| `RemotionAdapter` / `StretchyStudioAdapter` | `initialize()` readiness checks cleanly without mutating upstream repos | Yes (`doctor` checks; headless multi-scene editing/rendering unsupported) |
| `utils/paths.ts` | `assertSafeId`, `resolveWorkspacePath`, `resolveProjectDir` with `lstat` + `realpathSync.native` symlink jail | Yes (primary security boundary) |
| Rust `WorkerBridge` & `PreviewServer` (`animforge-desktop/`) | Desktop Tauri IPC & loopback WebView HTTP asset/Range server | **Not** invoked by Node MCP server; documented as separate desktop host boundary |

### MCP Tool Inventory (16 Real Tools)

1. `animforge_doctor` — Real host/engine probe (`node`, `chrome`, `ffmpeg`, `ffprobe`, GiveMotion, Remotion, StretchyStudio, workspace directories).
2. `animforge_list_projects` — Lists projects synced between `projects/animforge.db` and `projects/*/project.animforge.json`.
3. `animforge_create_project` — Creates & plans project from prompt (`projectId` validated; requires `confirmOverwrite: true` if target project already exists).
4. `animforge_get_project` — Returns full `Project` record (`storyboard`, `characters`, `assets`, `scenes`, metadata).
5. `animforge_get_project_status` — Returns workflow status, scene/asset/character counts, active/latest render job, and `output.mp4` status.
6. `animforge_list_scenes` — Lists ordered scenes (`sequenceIndex`) for a project.
7. `animforge_create_scene` — Adds a validated scene (`id`, `title`, `description`, `duration`, `sequenceIndex`, `characterIds`, `transition`, optional initial timeline) and recompiles `index.html`.
8. `animforge_update_scene` — Updates scene metadata/duration/sequence/transition/characters (requires `confirmOverwrite: true` if replacing an existing scene) and recompiles `index.html`.
9. `animforge_list_assets` — Lists registered project assets plus jailed files inside `assets/` and `projects/<id>/assets/`.
10. `animforge_import_asset` — Imports an allowlisted media/rig asset from inside approved workspace directories (`assets/...` or `projects/<id>/assets/...`) into `projects/<id>/assets/`, rejecting outside paths, dotfiles, `.env*`, `.venv*`, and symlinks (`confirmOverwrite: true` required to overwrite an existing asset file/ID).
11. `animforge_create_animation` — Attaches a GiveMotion-supported `CharacterAction` (`idle`, `walk`, `run`, `wave`, `smile`, `blink`, `look_around`) to a scene timeline & recompiles `index.html`.
12. `animforge_update_keyframes` — Updates `Scene.timeline` (`characterActions`, `cameraMoves`, `audioTracks`, `duration`, `fps`; requires `confirmOverwrite: true` when replacing timeline tracks) and recompiles `index.html`.
13. `animforge_generate_preview` — Runs `GivemotionAdapter.previewProject()` (`check --json --fast` + `bundle`) returning QA issue counts and generated bundle file paths (does not expose `PreviewServer` HTTP).
14. `animforge_get_render_status` — Polls active/persisted `RenderJob` status (`queued`, `rendering`, `completed`, `failed`, `progress`, `outputFilePath`, `error`).
15. `animforge_cancel_render` — Cancels active render for `projectId` (`SIGTERM` -> `SIGKILL`).
16. `animforge_export_video` — Requires `confirm: true`; runs real GiveMotion Chrome + FFmpeg MP4 render (supporting cancellation + timeout), runs `ffprobe` (`shell: false`), updates DB/project status, and returns `videoPath`, `fileSizeBytes`, and parsed stream metadata.

### Explicitly Unsupported Features (No Fake Tools Created)

- **Project deletion / arbitrary workspace file CRUD:** Out of scope / omitted rather than faked.
- **`StretchyStudio` WebGL2 mesh rigging / DWPose auto-rigging / `.stretch` vertex keyframe rendering:** Milestone 2 desktop GUI work; `animforge_update_keyframes` handles canonical scene timeline `characterActions`, `cameraMoves`, and `audioTracks` cleanly, not `.stretch` mesh deformation weights.
- **`PreviewServer` HTTP streaming / remote screenshots:** Local Tauri WebView only; not exposed over MCP.
- **Full Remotion TSX scene synthesis:** Requires external project scaffolding & custom commercial license gate.

---

## Implementation Micro-Tasks

### Task 1: MCP Errors, Path Jail & Validation Helpers (`src/mcp/errors.ts`, `src/mcp/validation.ts`)
- **Files:** Create `animforge-core/src/mcp/errors.ts`, `animforge-core/src/mcp/validation.ts`; Test `animforge-core/test/mcp.validation.test.ts`
- **Interfaces:** `McpToolError` (`code`, `message`, `details?`), `toToolErrorResult(err)`, `validateWorkspaceRoot`, `assertApprovedSourcePath`, `assertImportExtension`, `requireConfirmation`
- **Steps:** TDD tests for symlink/traversal/`.env`/outside-root rejection, allowlisted extensions (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.mp3`, `.wav`, `.ogg`, `.m4a`, `.json`, `.stretch`), confirmation gating, and workspace trailing space preservation -> verify RED -> implement minimal code -> verify GREEN.

### Task 2: Strict Input/Output Zod Schemas (`src/mcp/schemas.ts`)
- **Files:** Create `animforge-core/src/mcp/schemas.ts`; Test `animforge-core/test/mcp.validation.test.ts`
- **Interfaces:** Zod input schemas + inferred TS types for all 16 `animforge_*` tools (`safeIdSchema`, finite positive numbers, explicit `confirm`/`confirmOverwrite` booleans, bounded `timeoutMs`).
- **Steps:** Write failing schema validation tests (invalid IDs, negative duration, unknown action names, missing confirm) -> verify RED -> implement `schemas.ts` -> verify GREEN.

### Task 3: Core MCP Tool Service & 16 Handlers (`src/mcp/tools.ts`, `src/mcp/server.ts`, `src/mcp/index.ts`)
- **Files:** Create `animforge-core/src/mcp/tools.ts`, `animforge-core/src/mcp/server.ts`, `animforge-core/src/mcp/index.ts`; Modify `animforge-core/package.json` (`bin` + `mcp:start`); Test `animforge-core/test/mcp.server.test.ts`
- **Interfaces:** `createAnimForgeMcpServer(options)` returning `{ server, close, getActiveRenders }`, CLI entrypoint `dist/src/mcp/index.js [workspaceDir]` reading `ANIMFORGE_WORKSPACE_DIR` fallback, stdout clean JSON-RPC guarantee, graceful `SIGINT`/`SIGTERM`/stdin EOF cleanup.
- **Steps:**
  - **RED (`mcp.server.test.ts`):** Spawn real `StdioClientTransport` against `dist/src/mcp/index.js` in temp workspace with trailing space: verify initialize, 16 tools in `listTools()`, real `animforge_doctor`, `animforge_create_project`, `animforge_create_scene`, `animforge_update_scene`, `animforge_import_asset`, `animforge_list_assets`, `animforge_create_animation`, `animforge_update_keyframes`, `animforge_generate_preview`, invalid path rejection (`../evil`, `.env`), invalid input rejection, `confirm: true` gate, render cancellation (`animforge_cancel_render`), zero non-JSON stdout contamination, and clean shutdown exit `0`.
  - **GREEN:** Implement `tools.ts`, `server.ts`, `index.ts` and pass `npm run typecheck && npm test`.

### Task 4: Real Chrome + FFmpeg MCP E2E Integration Test (`test/mcp.integration.test.ts`)
- **Files:** Create `animforge-core/test/mcp.integration.test.ts`; Modify `animforge-core/package.json` (`test:integration` script includes both integration tests)
- **Steps:** Gate under `ANIMFORGE_INTEGRATION=1`; spawn real MCP stdio client in temp workspace; execute project -> scene -> animation -> preview -> real `animforge_export_video` (`confirm: true`) -> verify real `.mp4` + `ffprobe` dimensions/codec/duration -> test real mid-render `animforge_cancel_render` -> verify clean exit and temp cleanup.

### Task 5: OpenCode Documentation, Progress Update & Final Verification
- **Files:** Create `OPENCODE_MCP_SETUP.md`, `MCP_INTEGRATION_REPORT.md`; Modify `documentation/plans/ANIMFORGE_PROGRESS.md`
- **Steps:** Run `npm --prefix animforge-core run typecheck`, `npm --prefix animforge-core test`, `npm --prefix animforge-core run test:integration` (unsandboxed), `npm --prefix animforge-desktop test && npm --prefix animforge-desktop run build`, `cargo test` (unsandboxed), `cargo clippy --all-targets -- -D warnings`, and verify clean workspace & untouched `engines/*`.
