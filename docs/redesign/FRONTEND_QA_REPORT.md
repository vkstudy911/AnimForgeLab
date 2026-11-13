# AnimForge Studio — Frontend Redesign QA & Verification Report

**Date:** 2026-11-12  
**Target Reference:** Uploaded Studio Workbench Design (`dark` Charcoal + Warm Amber desktop shell)  
**Environment:** macOS (`aarch64`, Apple Silicon), Rust `1.99.1`, Node `v24.19.0`, Vite `5.4.21`, Vitest `2.1.9`, Google Chrome `157.0.8103.38`

---

## 1. Automated Verification Summary

All suites ran **fresh after the final UI & CSS fixes** (`Shell`, `MultiTrackTimeline`, `CharacterStudio`, `ProjectManager`):

| Check | Command | Scope & Mode | Result |
| :--- | :--- | :--- | :--- |
| **Desktop Unit & Integration Tests** | `npm --prefix "AnimForgeLab/animforge-desktop" test` | 10 Vitest suites (`App`, `DoctorBar`, `PreviewStage`, `useStudio`, `useThemePreference`, `WorkspaceRail`, `primitives`, `AnimationEditor`, `ManagementWorkspaces`, `SecondaryWorkspaces`) | **PASS — 10/10 files, 35/35 tests** (`1.44s`) |
| **Desktop TypeScript Check** | `npm --prefix "AnimForgeLab/animforge-desktop" run typecheck` | `tsc --noEmit` across all React components, hooks, context, and tests | **PASS — 0 errors** |
| **Desktop Production Build** | `npm --prefix "AnimForgeLab/animforge-desktop" run build` | `tsc --noEmit && vite build` | **PASS — 64 modules**, `dist/assets/index-CxGKapZJ.css` (`25.78 kB`), `dist/assets/index-DztnG4WP.js` (`305.47 kB`) (`295ms`) |
| **Rust Clippy Lint** | `cargo clippy --manifest-path ".../src-tauri/Cargo.toml" --all-targets -- -D warnings` | Desktop Tauri backend (`lib.rs`, `doctor.rs`, `worker_bridge.rs`, `preview_server.rs`) | **PASS — 0 warnings** |
| **Rust Unit & Loopback Tests** | `cargo test --manifest-path ".../src-tauri/Cargo.toml"` | Full Rust suite (`BypassSandbox: true` required for `127.0.0.1` loopback HTTP test; 15/16 pass inside sandbox) | **PASS — 16/16 tests** (`0.75s`) |
| **Core TypeScript & Unit Tests** | `npm --prefix "AnimForgeLab/animforge-core" run typecheck && test` | Schema validation, path jail, compiler, adapters, worker stdio protocol, 16-tool OpenCode MCP server | **PASS — 28/28 unit tests** (2 Chrome/FFmpeg integration tests cleanly gated) |

---

## 2. Live Desktop & Visual Verification

### Live Native Tauri Launch
- Launched via `npm --prefix "AnimForgeLab/animforge-desktop" run tauri dev` (`BypassSandbox: true`, `task-2766`).
- Verified `Vite` dev server (`http://localhost:1420/`) compiled and booted the native `target/debug/animforge-desktop` macOS window (`PID 20168`) and bound `PreviewServer` on loopback TCP `127.0.0.1:53322`.
- Verified security boundaries directly against running `PreviewServer`: `GET /../etc/passwd` -> `403`, `GET /projects/animforge.db` -> `403`.
- Verified clean shutdown: cancelling the Tauri task left zero orphaned `animforge-desktop`, `vite`, or `worker.js` processes (`CLEAN_ZERO_PROCESSES`).

### Headless Chromium Visual & Layout Audit (Real `animforge.db` Project Data)
Rendered the live compiled app at `1280x820` (`Dark`, `Light`) and `960x640` (`Dark`) using real project data from `projects/animforge.db` (`proj_bobo_magic_flower` + `proj_1794470257338_1`) and real GiveMotion `preview_project` bundles served by the live `PreviewServer`:

- **Console/Runtime Errors:** `0` uncaught errors or warnings (`consoleErrors: []`).
- **Horizontal / Vertical Overflow:** `docScrollW === innerW` (`1280/1280`, `960/960`) and `docScrollH === innerH` (`820/820`, `640/640`) across all tested routes (`#/studio`, `#/projects`, `#/story`, `#/render`, `#/diagnostics`, `#/characters`).
- **Interactive `<gm-player>` & QA Drawer:** Verified `Preview Bundle` loaded `gm-player.js`, initialized player (`Ready 0:00 / 0:08`), and displayed the collapsible `GiveMotion QA Check` (`PASS · 0 errors · 0 warnings · 1 notes`) drawer cleanly inside the Studio center column.

### Visual Bugs Found & Fixed During Visual QA
1. **Studio Workbench Height Collapse (`MultiTrackTimeline.tsx` + `shell.css`):** Inline `style={{ height: '100%' }}` on `.studio-timeline-dock` overrode `height: var(--timeline-h, 212px)`, collapsing `.studio-top-row` to `0px`. Removed inline `height: 100%` and added `flex-shrink: 0` on `.studio-timeline-dock`.
2. **`960x640` Outliner Overlap & Tab Clipping (`shell.css`):** Added `display: flex; flex-direction: column; overflow: hidden;` to `.studio-tabpanels` / `.studio-tabpanel` and `flex-shrink: 0` to `.project-info-box`, plus compact `@media (max-width: 1160px)` tab & stage toolbar rules so `Scenes | Characters | Assets` and `Stage Preview` never collide at `960x640`.
3. **Character Rig Schematic Clustering (`CharacterStudio.tsx`):** Real backend `parts[].pivot` values use normalized `[0..1]` coordinates (`{ x: 0.5, y: 0.8 }`), whereas `clampCoord` assumed `[0..240]` pixel coordinates. Updated SVG mapping (`toSvgCoord`) to auto-scale normalized rigs onto the `240x240` schematic grid while preserving pixel rig support.
4. **Projects Search Icon Alignment & Unstyled Utility Classes (`ProjectManager.tsx`, `shell.css`):** Aligned `SearchIcon` inline beside the search field and added missing CSS classes for `.stage-actions`, `.view-switch`, `.qa-*`, `.scene-description-*`, and `.workspace-fallback`. Removed orphaned legacy `src/styles.css`.

---

## 3. Known Scope Boundaries & Honest Limitations

- **macOS `WKWebView` GUI Automation:** Direct DOM clicking/scraping *inside* the native `WKWebView` window remains gated by macOS Assistive Access TCC permissions, so interactive UI behavior was verified via split proof: (a) live native Tauri process launch + `PreviewServer` security checks + clean exit, (b) Vitest + Testing Library integration suite (`35/35`), and (c) real Headless Chromium CDP screenshot & DOM geometry verification against live Vite + `PreviewServer`.
- **Linux `WebKitGTK 4.1`:** Not tested natively on this macOS `aarch64` host; `[data-resolved-theme]` fallbacks alongside `light-dark()` are included in `src/styles/tokens.css` for WebKitGTK compatibility, pending Linux verification.
- **Unimplemented Backend RPCs (`Planned` UI markers):** Project Delete/Duplicate, native OS Asset File Picker/Directory Scanner, persistent SQLite `render_jobs` history query, StretchyStudio `.stretch` rig bridge, and live MCP log streaming remain intentionally surfaced as `Planned` states rather than mocked.
