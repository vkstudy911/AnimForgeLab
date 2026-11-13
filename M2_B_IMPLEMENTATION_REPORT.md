# AnimForge Studio — M2-B Implementation Report

**Milestone:** M2-B — Shared API Foundation & Backend Integration (Resource-Aware Mode)  
**Date:** 2026-11-12  
**Repository:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab`  
**Status:** Complete & Verified (sequential Core + Desktop + Rust + Clippy + Production Vite build pass)

---

## 1. Tasks Completed

| Task ID | Summary of Implemented Work | Status |
| :--- | :--- | :--- |
| **Step 1C** | Extended shared frontend contract (`types.ts`), React IPC wrappers (`useStudio.ts` with JSDOM-compatible `FileReader` fallback in `fileToBase64`, conditional `previewRev`/`videoRev` gating, `preferredEngine` preservation on save), and `StudioContext.tsx` (StrictMode-safe settings disk persistence outside state updaters, SQLite-synced render history, stable destructured callbacks preventing re-render loops) | `DONE` |
| **B1** | Fixed `DiskManifestSchema` in `worker.ts` and synced `givemotion.adapter.ts` to persist/load `assets` and `storyboard`, accept `null`/missing optional fields (`nullish().transform(...)`) for legacy manifests, validate scene IDs/`projectId`, and reject corrupt JSON/asset records honestly | `DONE` |
| **B2** | Implemented transactional `deleteProject` (including cleanup of child `render_jobs` rows and `hasProjectRow` existence check for corrupt-JSON cleanup), `ROLLBACK` error guard, and SQLite-backed `listRenderJobs(projectId?)` ordering newest-first in `animforge-core/src/database.ts` | `DONE` |
| **B3** | Implemented & hardened Tauri IPC commands (`project_delete`, `project_duplicate`, `project_import`, `project_list_render_jobs`, `project_assets_list`, `project_import_asset`, `project_import_asset_bytes`, `run_deterministic_agent`, `config_get`, `config_save`, `reveal_in_workspace`) with ID validation, workspace jail preserving trailing space, symlink escape rejection, macOS `open -R` on all targets, and Windows UNC verbatim stripping; `PreviewServer` jail left intact | `DONE` |
| **B4** | Connected `RemotionAdapter`, `StretchyStudioAdapter`, and `GivemotionAdapter` dispatch inside `worker.ts`; added fast local Remotion binary resolution (`findLocalRemotionBinary`) avoiding >5s `npx --no-install` stalls, wired `remotionAdapter.cancelRender` & `dispose()`, surfaced honest `ENGINE_UNAVAILABLE` errors, and avoided fabricated outputs for non-MP4 Spine JSON exports (`artifactKind: 'spine_json'`) and composite stubs | `DONE` |
| **B5** | Compiled `scene.backgroundAssetId` (`<img>` background layer) and `scene.timeline.audioTracks` (`<audio data-start data-volume loop preload="auto">`) in `givemotion.compiler.ts` while excluding muted tracks, missing asset refs, raw traversal segments, and percent-encoded traversal sequences (`%2e`/`%2f`/`%5c`/`%25`); wrapped `writeProjectFiles` destination path checks safely and added `evictProjectCache` | `DONE` |

---

## 2. Files Modified & Added

### `animforge-core`
- Modified:
  - `animforge-core/src/database.ts` (`deleteProject`, `listRenderJobs`, `hasProjectRow`, `ROLLBACK` guard)
  - `animforge-core/src/worker.ts` (`DiskManifestSchema`, `delete_project` disk-first removal + cache eviction, `duplicate_project`, `import_project`, `list_render_jobs`, `assets_list`, workspace-jailed `asset_import`/`asset_import_bytes` with overwrite dedup, `run_deterministic_agent`, `get_config`/`save_config`, Remotion/StretchyStudio/Composite preview/render/cancel dispatch)
  - `animforge-core/adapters/givemotion.adapter.ts` (`nullish` manifest compat, `try/catch` dest jail, `lstat` non-symlink check, `evictProjectCache`)
  - `animforge-core/adapters/givemotion.compiler.ts` (`toSafeProjectAssetRelPath`, percent-encoded traversal block, background image + audio track compilation)
  - `animforge-core/adapters/remotion.adapter.ts` (`findLocalRemotionBinary`, direct binary invocation, `cancelRender`)
  - `animforge-core/test/givemotion.adapter.test.ts` (added encoded-traversal & cache-eviction coverage)
  - `animforge-core/test/givemotion.compiler.test.ts` (added background/audio & `%2e%2e` block coverage)
  - `animforge-core/test/worker.test.ts` (added B1 null/corrupt manifest, B2/B3 asset overwrite/jail, corrupt SQLite delete, `list_render_jobs`/`assets_list` `INVALID_ID`, StretchyStudio/Remotion/Composite engine dispatch checks)
- Added:
  - `animforge-core/test/database.test.ts`

### `animforge-desktop` & Tauri Rust Backend
- Modified:
  - `animforge-desktop/src/types.ts` (nullable `FfprobeMetadata` fields + M2-B result/config types)
  - `animforge-desktop/src/hooks/useStudio.ts` (all new IPC wrappers, `FileReader` fallback, `previewRev`/`videoRev` gating, `preferredEngine` summary update)
  - `animforge-desktop/src/context/StudioContext.tsx` (StrictMode-safe settings persistence, SQLite `refreshRenderHistory`, immediate `deleteProject` history filter, stable destructured effect deps)
  - `animforge-desktop/src/hooks/useStudio.test.ts` (added tests for CRUD, byte upload, preview probe, reveal, Spine JSON `videoUrl === null`, non-bundle `bundleUrl === null`, and `preferredEngine` summary update)
  - `animforge-desktop/src-tauri/src/lib.rs` (`reveal_in_workspace` command registration, macOS `open -R`, Windows `\\?\` prefix strip, jail unit test with trailing-space fixture & symlink escape test)
  - `animforge-desktop/src-tauri/src/worker_bridge.rs` (M2-B Tauri IPC bridge commands + `import_project` validation)

### Documentation Updated in M2-B
- Added: `AnimForgeLab/M2_B_IMPLEMENTATION_REPORT.md`
- Updated: `AnimForgeLab/documentation/plans/ANIMFORGE_PROGRESS.md`, `AnimForgeLab/docs/redesign/PAGE_IMPLEMENTATION_STATUS.md`

*(Untouched by design: `engines/*`, `animforge-core/src/mcp/*`, `animforge-core/test/mcp.*.test.ts`, `animforge-desktop/src-tauri/src/preview_server.rs` path jail.)*

---

## 3. Backend Operations & Tauri IPC Commands Verified

- **SQLite (`AnimForgeDatabase`):** `deleteProject(id)`, `hasProjectRow(id)`, `listRenderJobs(projectId?)`
- **Worker Protocol v1 RPCs (`worker.ts`):** `delete_project`, `duplicate_project`, `import_project`, `list_render_jobs`, `assets_list`, `asset_import` (workspace-jailed, `allowExternalSource` removed), `asset_import_bytes`, `run_deterministic_agent`, `get_config`, `save_config`, `preview_project` & `render_project` (`givemotion` / `remotion` / `stretchystudio` / `composite`), `cancel_render`
- **Tauri IPC Commands (`lib.rs` / `worker_bridge.rs`):** `project_delete`, `project_duplicate`, `project_import`, `project_list_render_jobs`, `project_assets_list`, `project_import_asset`, `project_import_asset_bytes`, `run_deterministic_agent`, `config_get`, `config_save`, `reveal_in_workspace`, `probe_preview_server`

---

## 4. Verification Results (Sequential Low-Resource Execution)

All checks below ran sequentially after the final code edit (no concurrent Vitest or Cargo processes):

| Suite / Command | Passed | Failed | Skipped | Notes |
| :--- | :---: | :---: | :---: | :--- |
| `npm --prefix "AnimForgeLab/animforge-core" run typecheck` | — | 0 | 0 | Clean exit `0` |
| `npm --prefix "AnimForgeLab/animforge-core" run build` | — | 0 | 0 | Clean exit `0` (`tsc`) |
| `npm --prefix "AnimForgeLab/animforge-core" test` | **31** | **0** | **2** | 2 opt-in Chrome+FFmpeg E2E integration tests skipped (`ANIMFORGE_INTEGRATION=1` required) |
| `npm --prefix "AnimForgeLab/animforge-desktop" run typecheck` | — | 0 | 0 | Clean exit `0` |
| Desktop Vitest (10 files, sequential `--poolOptions.forks.singleFork`) | **37** | **0** | **0** | `App.test.tsx` (3), `useStudio.test.ts` (6), `useThemePreference.test.ts` (1), `DoctorBar.test.tsx` (5), `PreviewStage.test.tsx` (4), `WorkspaceRail.test.tsx` (1), `primitives.test.tsx` (3), `AnimationEditor.test.tsx` (5), `ManagementWorkspaces.test.tsx` (5), `SecondaryWorkspaces.test.tsx` (4) |
| `cargo test --manifest-path "AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml"` (sandboxed) | 16 | 1 | 0 | `loopback_http_server_serves_assets_ranges_and_security_rejections` blocked by Seatbelt loopback TCP restriction inside sandbox |
| `cargo test --manifest-path "AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml"` (`BypassSandbox: true`) | **17** | **0** | **0** | Full unit + loopback + real worker round-trip pass |
| `cargo clippy ... --all-targets -- -D warnings` | — | **0** | — | Zero warnings |
| `npm --prefix "AnimForgeLab/animforge-desktop" run build` | — | **0** | — | `64` modules built in `307ms` (`tsc --noEmit && vite build`) |

---

## 5. Unavailable External Dependencies & Honest Runtime Behavior

- **Remotion CLI (`engines/remotion`):** Not installed locally (`node_modules/.bin/remotion` absent; repo contains `bun.lock` only). `RemotionAdapter.initialize()` now detects missing local binaries in `<1ms` via `findLocalRemotionBinary()` without network installs or `npx` timeouts and surfaces structured `ENGINE_UNAVAILABLE`.
- **Composite Engine:** Explicitly returns `ENGINE_UNAVAILABLE` until multi-engine compositing is scheduled in a later milestone.
- **StretchyStudio:** Produces `.spine.json` rig exports (`artifactKind: 'spine_json'`) and preview notices honestly without fabricating MP4 outputs or attaching `<video>` preview URLs.

---

## 6. Resource & Memory Observations (MacBook Air M5, 16GB RAM)

- Enforced single-file sequential Vitest execution with `--poolOptions.forks.singleFork` (one Node test runner at a time, ~300–980ms per file) instead of full multi-worker Vitest runs.
- Eliminated a `[studio]` dependency loop in `StudioContext.tsx` and eliminated a >5s `npx --no-install` stall in `RemotionAdapter`.
- Post-verification `ps` & `vm_stat` snapshot:
  - Active dev processes remaining: **0** (`node`, `vitest`, `vite`, `tauri`, `cargo`, `rustc`, and `worker.js` processes all exited cleanly). Only Antigravity `language_server` (PID 8423, ~2.50 GB RSS) remained.
  - `vm_stat` (16KB pages): `39,558` free pages (~618 MB), `125,456` pages occupied by compressor (~1.96 GB), `2,850` pageouts.

---

## 7. Remaining Issues / Notes

- UI components added in earlier redesign (`ProjectManager`, `StoryScenesWorkspace`, `CharacterStudio`, `AssetLibrary`, `RenderWorkspace`, `SettingsWorkspace`, `AgentCenterWorkspace`) still need page-by-page Phase 2 wiring in **M2-C** onward so every visible control invokes these M2-B APIs cleanly and removes obsolete `Planned` banners as each page lands.
- Opt-in `npm run test:integration` (Chrome+FFmpeg E2E) and interactive GUI launch were intentionally not re-run in M2-B to avoid spawning extra Chrome/Tauri processes under Resource Optimization Mode.

---

## 8. Recommended Next Milestone

Proceed to **M2-C: Page-Level Wiring — `HomeDashboard` & `ProjectManager` (Projects Workspace)** per `docs/superpowers/plans/2026-11-12-phase2-functionality.md`, wiring `deleteProject`, `duplicateProject`, `importProject`, and `revealInWorkspace` controls to real handlers while continuing sequential `--poolOptions.forks.singleFork` verification.
