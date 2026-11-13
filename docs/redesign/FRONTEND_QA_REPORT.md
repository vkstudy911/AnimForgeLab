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

---

## 4. Phase 1 Verification & Visual Sign-Off (2026-11-13)

**Phase 1 Scope:** Design Foundation (Tokens, Themes, Primitives) & Global Desktop Shell (Header, Rail, Main Workbench, Panel System, 10-Workspace Navigation).

### 4.1 Phase 1A Design Foundation Primitives Added
1. **Tokens (`src/styles/tokens.css`):**
   - `--shadow-sm`: `light-dark(0 1px 2px rgba(24, 22, 18, 0.08), 0 1px 3px rgba(0, 0, 0, 0.25))`
   - `--shadow-md`: `light-dark(0 4px 12px rgba(24, 22, 18, 0.1), 0 4px 14px rgba(0, 0, 0, 0.35))`
   - Explicit overrides for `:root[data-resolved-theme="dark"]` and `:root[data-resolved-theme="light"]`.
2. **CSS Component Styles (`src/styles/base.css`):**
   - `.studio-tooltip`, `.studio-tooltip-wrapper`, and 4 position variants (`top`, `bottom`, `left`, `right`).
   - `.studio-notification`, `.studio-notification-info`, `.studio-notification-success`, `.studio-notification-warning`, `.studio-notification-error`.
   - `.btn-secondary` variant matching surface elevated palette.
3. **Reusable Primitives (`src/components/ui/`):**
   - `StudioButton.tsx`: Variants (`primary`, `secondary`, `ghost`, `danger`), sizes (`sm`, `md`), icon, loading, `aria-busy`.
   - `StudioTooltip.tsx`: Accessible hover/focus trigger, dynamic `aria-describedby` linkage, `role="tooltip"`, `Escape` dismissal.
   - `StudioNotification.tsx`: Semantic role (`alert` for error, `status` for info/warn/success), optional action button, accessible dismiss button.
4. **Unit Tests (`src/components/ui/primitives.test.tsx`):**
   - 6 test suites covering Tabs roving tabindex, Dialog dirty cancellation guards, ErrorBoundary recovery, Button states & variants, Tooltip interactions & ARIA bindings, and Notification roles & callbacks.

### 4.2 Automated Test Matrix
| Suite | Command | Result | Duration |
| :--- | :--- | :--- | :--- |
| **Desktop Vitest** | `npm --prefix animforge-desktop test` | **PASS — 10/10 files, 49/49 tests** | 3.62s |
| **Desktop TypeScript** | `npm --prefix animforge-desktop run typecheck` | **PASS — 0 errors** | 1.1s |
| **Desktop Vite Build** | `npm --prefix animforge-desktop run build` | **PASS — 65 modules**, `dist/index.html` (0.50 kB), `dist/assets/index-DbiU5hXu.css` (29.55 kB), `dist/assets/index-CazFTiX5.js` (368.15 kB) | 607ms |
| **Rust Clippy** | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | **PASS — 0 warnings** | 0.55s |
| **Rust Backend Tests** | `cargo test --manifest-path src-tauri/Cargo.toml` | **PASS — 19/19 tests** | 1.35s |
| **Core TS & Tests** | `npm --prefix animforge-core run typecheck && npm test` | **PASS — 31/31 unit tests** (2 opt-in E2E tests cleanly skipped) | 2.15s |

### 4.3 Phase 1 Desktop Shell Visual Screenshots
Captured via headless Google Chrome (`1280x820`) running against the production build:
- `01-desktop-shell-studio-dark.png`: Animation Studio workbench in Charcoal + Warm Amber dark mode, showing Outliner, Safe-Zone Preview Stage, MultiTrack Timeline, and Cue Inspector.
- `02-desktop-shell-studio-light.png`: Animation Studio workbench in Warm Paper light mode (`--bg-app: #f5f3ee`, `--accent-amber: #b45309`).
- `03-workspace-projects.png`: Projects Workspace card grid, search bar, and New Project inline creation.
- `04-workspace-story.png`: Story & Scenes Workspace with storyboard logline, beat cards, and scene sequence order.
- `05-workspace-home.png`: Home Dashboard with health status, recent projects, and quick navigation.
- `06-workspace-diagnostics.png`: Diagnostics Workspace with PreviewServer status and live 10-category Doctor checks.
