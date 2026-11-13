# AnimForge Studio — Frontend Audit Final Report

**Date:** 2026-11-12  
**Repository:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` (`animforge-desktop/` + `animforge-core/`)  
**Mode:** Strictly Read-Only Audit & Redesign Preparation (zero source/config files modified)

---

## 1. Executive Summary

The existing **AnimForge Studio** frontend (`animforge-desktop/src/`) is a clean, well-tested **Milestone 1 vertical-slice prototype** (`1,400` lines of TypeScript/React + `534` lines of CSS across 5 source files). Its core plumbing—race-safe Tauri IPC orchestration, `<gm-player>` custom element bundling over a path-jailed `127.0.0.1` HTTP server, live FFmpeg/Chrome render progress & cancellation, and 8-category native Rust diagnostics—is solid and genuinely functional.

However, as a creative animation application, the frontend currently exposes only **~15%** of AnimForge's underlying core schema capabilities and **0%** of the finalized **Charcoal + Warm Amber (dark & light mode)** visual direction.

---

## 2. Architecture Overview

- **Stack:** Tauri `2.x` (`WKWebView` / WebKitGTK), React `18.3.1` (`StrictMode`), TypeScript `5.4.5`, Vite `5.4.0`, Vitest `2.1.8`, vanilla CSS custom properties. Zero UI kit, router, state library, or icon library installed.
- **Entry & Layout:** Single-root render (`main.tsx` -> `App.tsx`) with zero routing. Uses a static 2-column CSS grid (left fixed `300–380px` sidebar stacking 3 form/list panels + right stage column) above a full-width bottom `DoctorBar` diagnostics grid.
- **Backend Boundary:** Desktop frontend talks exclusively to **9 Rust Tauri commands** (`run_doctor`, `get_preview_base_url`, and 7 `WorkerBridge` RPC wrappers forwarding NDJSON v1 to `animforge-core/dist/src/worker.js`) plus Tauri event `animforge://render-progress`. OpenCode MCP (`animforge-core/src/mcp/`) runs separately against the same SQLite/disk workspace (`projects/animforge.db`) and is not called by the desktop UI.

---

## 3. Existing Screens vs. Requested Surfaces

- **Implemented Screens:** **1 single-page workspace** (`App.tsx`).
- **Implemented Functional Areas:** `Preview Player` (`PreviewStage`), `System Doctor / Diagnostics` (`DoctorBar`), minimal `Project Manager` (list + select), minimal `Project Creation` (name + prompt only), minimal `Scene Editor` (`title` edit only), and basic `Render / Export` (`Render MP4`, progress bar, cancel, inline `<video>`).
- **Missing Screens (10 areas not implemented in UI):** Home/Dashboard, full Storyboard Editor, Character Studio (or StretchyStudio embed), Asset Library, Spatial Animation Canvas, Timeline/Keyframe Editor, Camera Controls Inspector, Agent/MCP Status Center, Settings, and Theme Switcher.

---

## 4. Component Inventory Highlights

- **Existing Components/Hooks (`4` code units):** `App` ([App.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/App.tsx)), `PreviewStage` ([PreviewStage.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/components/PreviewStage.tsx)), `DoctorBar` ([DoctorBar.tsx](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/components/DoctorBar.tsx)), `useStudio` ([useStudio.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/hooks/useStudio.ts)) plus external `<gm-player>` element typed in [types.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/types.ts).
- **Missing UI Primitives:** Zero extracted `Button`, `Input`, `Select`, `Modal`, `Tabs`, `Toast`, `DockPanel`, `Timeline`, or `ErrorBoundary` primitives.

---

## 5. Functional vs. Placeholder Matrix

- **No dead/placeholder buttons exist** — every rendered button works against live Rust/Node execution.
- **Core Capabilities Hidden by Missing UI:**
  - `worker_bridge.rs` (`CreateProjectInput`) already accepts `width`, `height`, `fps`, and `preferredEngine`, but the UI hardcodes defaults by omitting those fields.
  - `ProjectDetail` already delivers `storyboard`, `characters`, `scenes[].{description,duration,transition,characterIds,timeline.{characterActions,cameraMoves,audioTracks}}`, and `save_project` already recompiles HTML for all of them—yet the UI only lets the user edit `scene.title`.
  - MCP exposes `list_assets` / `import_asset` / `create_scene` / `update_keyframes` / `create_animation` / `ffprobe` metadata cleanly, whereas the desktop UI lacks a Workspace Refresh trigger when OpenCode modifies files externally.

---

## 6. Design System Problems Found

1. **Wrong Palette:** Uses dark cool **slate-navy + sky-blue** (`#0b0f17`, `#131926`, `#38bdf8`) instead of **Charcoal + Warm Amber**.
2. **Dark Mode Only:** `<meta name="color-scheme" content="dark">` and `:root { color-scheme: dark; }` with zero light mode tokens or toggle, plus hardcoded `#17253a`, `#e0f2fe`, `#22c55e`, `#f59e0b`, `#ef4444`.
3. **Scroll-Heavy Form Layout:** Stacking `Projects` + `Create Project` + `Selected Scene` beside `<PreviewStage />` and placing the 8-card `DoctorBar` permanently below forces scrolling and obscures simultaneous stage + timeline + inspector work inside `1280×820` windows.
4. **No Typographic / Elevation Tokens:** Missing monospace styles for timecodes/IDs/metrics, missing spacing/radius tokens, and flat 12–18px visual hierarchy.

---

## 7. Technical Constraints

- **Workspace Path Safety:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` includes a **trailing space**; Rust & Node layers preserve it strictly (UI changes must never mutate or display-trim workspace paths when passing back IDs/paths).
- **Tauri CSP & Preview Jailing:** Local bundle/video playback must route exclusively through `PreviewServer` (`http://127.0.0.1:<port>/projects/<id>/...` or `/assets/...`) matching `tauri.conf.json` CSP.
- **Low-Spec Target (`--workers 1`):** UI and previews must stay memory-light (single active `<gm-player>`/`<video>` mount, collapsible docks, optional low-res preview controls on Acer Aspire A315-21 Linux hardware).
- **Existing Accessibility Standard:** New redesign must preserve `App.test.tsx` / `DoctorBar.test.tsx` / `PreviewStage.test.tsx` / `useStudio.test.ts` standards (`aria-live`, `role="alert"`, `:focus-visible`, `@media (forced-colors: active)`).

---

## 8. Screenshot Index (`docs/frontend-audit/screenshots/`)

- **Captured Files:** None (`0` PNG files saved).
- **Verification & Block Reason:** The compiled release binary (`animforge-desktop/src-tauri/target/release/animforge-desktop`) was launched and confirmed creating native macOS window **ID `1151` (`AnimForge Studio`)** before clean `SIGTERM` termination. `screencapture -x -o -l 1151` failed with `could not create image from window` due to macOS Screen Recording (TCC) permission restrictions on headless background capture. In compliance with audit rules (no permission bypassing, no mockups), no fake screenshots were substituted.

---

## 9. Recommended Redesign Priorities & Small Implementation Milestones

1. **Redesign-M1 — Design Tokens, Theme Switcher & UI Primitives**
   - Extract `styles/tokens.css` (Charcoal + Warm Amber dark & light modes), `ThemeContext`, `ErrorBoundary`, and accessible UI primitives (`Button`, `Input`, `Modal`, `Tabs`, `Badge`, `Toast`) while keeping all existing functionality working.
2. **Redesign-M2 — Studio Application Shell & Collapsible Diagnostics**
   - Introduce top command bar (Project switcher, Workspace Sync/Refresh button, Theme toggle, compact Doctor pill -> `DoctorDrawer`, mode navigation: `Projects` / `Story` / `Studio` / `Render`). Move `Create Project` into a clean modal/view supporting `width`/`height`/`fps` presets.
3. **Redesign-M3 — Three-Pane Studio Workspace + Scene/Action/Camera Inspector**
   - Build Left Dock (`Scenes`, `Characters` viewer), Center Stage (`PreviewStage` with toolbar + collapsible QA drawer), and Right Inspector editing `Scene.{title, description, duration, transition, cameraMoves}` via existing `project_save` IPC—zero Rust/worker changes needed.
4. **Redesign-M4 — Bottom Timeline & Action Clip Editor**
   - Add synced playhead ruler + Scene/Action/Camera/Audio tracks wired to `Scene.timeline` and `project_save`.
5. **Redesign-M5 — Asset Browser & Render Export Upgrade (Small Backend Extension)**
   - Add additive `list_assets` / `import_asset` worker v1 + Tauri commands, upgrade `Render` panel with `ffprobe` metadata & reveal-in-folder action, and lay groundwork for M2 `StretchyStudio` Character Studio tab.

---

## 10. Documentation Files Created

1. [FRONTEND_ARCHITECTURE.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/frontend-audit/FRONTEND_ARCHITECTURE.md)
2. [SCREEN_INVENTORY.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/frontend-audit/SCREEN_INVENTORY.md)
3. [COMPONENT_INVENTORY.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/frontend-audit/COMPONENT_INVENTORY.md)
4. [DESIGN_SYSTEM_AUDIT.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/frontend-audit/DESIGN_SYSTEM_AUDIT.md)
5. [FUNCTIONALITY_AUDIT.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/frontend-audit/FUNCTIONALITY_AUDIT.md)
6. [BACKEND_INTEGRATION_MAP.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/frontend-audit/BACKEND_INTEGRATION_MAP.md)
7. [FRONTEND_REDESIGN_BLUEPRINT.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/frontend-audit/FRONTEND_REDESIGN_BLUEPRINT.md)
8. [FRONTEND_AUDIT_REPORT.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/frontend-audit/FRONTEND_AUDIT_REPORT.md)
