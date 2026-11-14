# AnimForge Studio — Frontend Architecture Audit

**Audit Scope:** `animforge-desktop/` (Tauri 2 + React 18 desktop shell), plus upstream integration points in `animforge-core/`.  
**Audit Mode:** Read-only inspection; zero source files modified.  
**Date:** 2026-11-12

---

## 1. Framework & Runtime Stack

Verified from [package.json](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/package.json), [Cargo.toml](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src-tauri/Cargo.toml), and [tsconfig.json](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/tsconfig.json):

| Layer | Package / Tool | Declared / Verified Version | Config / Purpose |
| :--- | :--- | :--- | :--- |
| Desktop Shell | Tauri CLI / Rust `tauri` | `^2.0.0` (`2.12.4` CLI / `2.12.5` crate verified) | Native macOS `WKWebView` / Linux WebKitGTK wrapper |
| Tauri JS API | `@tauri-apps/api` | `^2.0.0` (`core` `invoke`, `event` `listen`) | Typed IPC calls & event listener |
| UI Library | `react`, `react-dom` | `^18.3.1` (`StrictMode` enabled) | Component rendering |
| Language | `typescript` | `^5.4.5` (`ES2022`, `strict: true`, `react-jsx`) | Static typechecking |
| Bundler | `vite`, `@vitejs/plugin-react` | `^5.4.0`, `^4.3.1` | Dev server on `:1420` (`strictPort: true`), dist `../dist` |
| Tests | `vitest`, `@testing-library/react`, `jsdom` | `^2.1.8`, `^16.1.0`, `^25.0.1` | DOM/hook tests (mocked Tauri IPC) |
| Styling | Vanilla CSS (`src/styles.css`) | Native CSS Custom Properties | No Tailwind, CSS Modules, or UI kit installed |
| Icons / Animation | None installed | `—` | No `lucide-react` or UI motion library installed |

*(Note: Upstream submodule `engines/stretchystudio` bundles React 18 + Tailwind + Radix + Lucide + Zustand for its standalone rig editor, but `animforge-desktop` shares **zero** UI packages with it.)*

---

## 2. Application Entry Points

1. **HTML Document:** [index.html](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/index.html)
   - Sets `<meta name="color-scheme" content="dark" />`, `<title>AnimForge Studio</title>`, mounts `<div id="root"></div>`, and loads `/src/main.tsx`.
2. **React Bootstrap:** [main.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/main.tsx)
   - Mounts `<React.StrictMode><App /></React.StrictMode>` and imports `./styles.css`.
3. **Root UI Component:** [App.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/App.tsx)
   - Single-screen studio shell containing header, polite live announcement region, global error banner, 2-column workspace (`studio-sidebar` + `studio-stage-col`), and bottom `DoctorBar`.
4. **Native Desktop Host Entry:** [main.rs](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src-tauri/src/main.rs) -> [lib.rs](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src-tauri/src/lib.rs)
   - Resolves workspace root (preserving trailing space in `/Users/vipinkumar/Desktop/animator `), manages `WorkerBridge` and `PreviewServer`, opens single `1280x820` (`minWidth: 960`, `minHeight: 640`) main window configured in [tauri.conf.json](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src-tauri/tauri.conf.json).

---

## 3. Main Layout & Navigation Architecture

- **Routing:** **None.** There is no `react-router`, URL router, tab bar, modal stack, drawer toggle, or multi-view navigation controller.
- **Layout Hierarchy (`App.tsx` + `styles.css`):**
  1. `.studio-shell` (`min-height: 100vh`, vertical flex column)
  2. `<header className="studio-header">` — Brand title (`AnimForge Studio`), static tag (`macOS / Linux Desktop`), and optional `Active: <name> (<status>)` metadata text.
  3. `<main className="studio-main">` — CSS Grid holding:
     - `.studio-status` (`aria-live="polite"`)
     - Optional `[role="alert"].studio-alert` global error banner with `Dismiss`
     - `.studio-workspace` (2-column CSS grid: `minmax(300px, 380px) minmax(0, 1fr)`, collapsing to `1fr` under `960px`):
       - **Left Column (`.studio-sidebar`):** 3 stacked `<section className="panel">` cards (`Projects`, `Create Project`, `Selected Scene`).
       - **Right Column (`.studio-stage-col`):** `<PreviewStage />` panel (`Stage Preview`).
     - **Bottom Row:** `<DoctorBar />` (`Environment Diagnostics` spanning full main width).

---

## 4. State Management

State is split cleanly into three local scopes without Redux/Zustand/Context:

1. **Workspace & Pipeline Hook (`src/hooks/useStudio.ts`):**
   - Owns `previewBaseUrl`, `projects`, `activeProject`, `renderingProjectId`, `previewResult`, `previewRev`, `videoRev`, `renderProgress`, `error`, `statusMessage`, and granular `busy` flags (`loadingList`, `loadingProject`, `creating`, `saving`, `previewing`, `rendering`, `cancelling`).
   - Uses sequence refs (`projectSeqRef`, `opTokensRef`, `activeProjectRef`, `renderingProjectIdRef`, `unmountedRef`) to guarantee StrictMode safety, stale async cancellation, and accurate target selection when switching projects during background operations.
   - Derives HTTP preview URLs (`bundleUrl`, `playerScriptUrl`, `videoUrl`) from Rust `PreviewServer` base URL + cache-busting `?v=` revisions.
2. **Form & Scene Selection UI State (`src/App.tsx`):**
   - Local controlled form state for Create Project (`projectName`, `projectPrompt`, touched/error flags) and Selected Scene (`selectedSceneId`, `sceneTitleInput`, touched/error flags).
   - Syncs `sceneTitleInput` using `lastSyncedSceneKeyRef` (`${projectId}:${updatedAt}:${sceneId}`) so in-progress title edits are preserved when background `renderProject()` updates `project.status` (`App.test.tsx` regression coverage).
   - Manages debounced blur error announcements (`scheduleBlurAnnouncement` at `450ms`).
3. **Component-Local State (`DoctorBar.tsx`, `PreviewStage.tsx`):**
   - `DoctorBar` manages `report`, `loading`, `error`, and `runSeqRef` StrictMode guard.
   - `PreviewStage` manages `scriptReady`, `scriptError`, `retryNonce`, `playbackState`, `timeSummary`, and `viewMode` (`'bundle' | 'video'`), plus module-scoped `inFlightScripts` map for deduplicated `<script>` injection of `gm-player.js`.

---

## 5. Styling System & CSS Architecture

- **Single global stylesheet:** [styles.css](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/styles.css) (`534` lines).
- **CSS Strategy:** Flat BEM-like semantic class names (`.studio-shell`, `.panel`, `.doctor-item`, `.project-button`, `.stage-viewport`, `.badge-*`) plus CSS custom properties on `:root`.
- **Responsive & Accessibility Built-ins:**
  - Media query `@media (max-width: 960px)` collapses the sidebar/stage grid to a single column.
  - `@media (forced-colors: active)` provides Windows High Contrast fallbacks (`CanvasText`, `Highlight`, `HighlightText`).
  - Uses CSS `accent-color: var(--accent)` with `@supports not (accent-color: #38bdf8)` fallback rules for `<progress>`.
  - `<gm-player:not(:defined)>` fails open after `2s` so uninitialized custom elements never stay permanently invisible.

---

## 6. Component Organization & Type Contracts

```text
animforge-desktop/src/
├── main.tsx                     # React 18 StrictMode root mount
├── App.tsx                      # Top-level single-page studio shell & forms
├── App.test.tsx                 # Shell, form validation & preview/render integration tests
├── styles.css                   # All design tokens, layout grids, controls, forced-colors
├── types.ts                     # IPC DTOs + <gm-player> JSX intrinsic element typing
├── hooks/
│   ├── useStudio.ts             # Tauri invoke/listen orchestration & race-safe state
│   └── useStudio.test.ts        # Concurrency, cancellation & revision URL tests
└── components/
    ├── DoctorBar.tsx            # 8-category system health diagnostic grid
    ├── DoctorBar.test.tsx       # StrictMode stale-response & alert tests
    ├── PreviewStage.tsx         # <gm-player> / <video> stage, render progress, QA panel
    └── PreviewStage.test.tsx    # Script loader dedup, retry & playback state tests
```

---

## 7. Desktop Integration (Tauri), Backend & MCP Communication

- **Desktop App -> Rust -> Worker:**
  - All frontend communication goes through `@tauri-apps/api/core`'s `invoke()` and `@tauri-apps/api/event`'s `listen('animforge://render-progress')`.
  - Tauri capabilities ([capabilities/default.json](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src-tauri/capabilities/default.json)) enable `core:default` on window `main`.
  - Tauri CSP ([tauri.conf.json](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src-tauri/tauri.conf.json)) restricts origins to `'self'`, `ipc:`, `http://ipc.localhost`, and `http://127.0.0.1:*` (for `PreviewServer` bundles, `<script>` injection of `gm-player.js`, and `<video>` MP4 playback).
  - Rust backend exposes **9 commands**: `run_doctor`, `get_preview_base_url`, `project_list`, `project_create_from_prompt`, `project_load`, `project_save`, `project_preview`, `project_render`, `project_cancel_render`.
- **MCP Separation:**
  - The desktop frontend does **not** communicate with [animforge-core/src/mcp/](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-core/src/mcp/index.ts).
  - Instead, OpenCode (external MCP host) spawns `animforge-core/dist/src/mcp/index.js` over stdio, while the Tauri desktop app spawns `animforge-core/dist/src/worker.js` via Rust `WorkerBridge`. Both share the underlying workspace DB (`projects/animforge.db`) and disk manifests (`projects/<id>/project.animforge.json`).

---

## 8. Theme Implementation

- **Current theme:** **Dark mode only.**
  - Declared via `<meta name="color-scheme" content="dark" />` in [index.html](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/index.html) and `color-scheme: dark;` in `:root` of [styles.css](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/styles.css).
  - **No light mode palette, `data-theme` attribute, `prefers-color-scheme` media query, or theme toggle control exists.**
  - Note also that the existing dark palette is **cool slate navy + sky blue** (`#0b0f17`, `#131926`, `#38bdf8`), **not** Charcoal + Warm Amber.
