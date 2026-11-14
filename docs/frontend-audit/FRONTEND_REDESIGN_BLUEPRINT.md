# AnimForge Studio — Frontend Redesign Blueprint (Recommendations Only)

> **Status:** Design recommendations prepared from the codebase audit. **No code or configuration has been modified.**

---

## 1. Visual Design System: Charcoal + Warm Amber (Dark & Light Modes)

Replace the current dark-only slate-navy/sky-blue tokens (`#0b0f17` / `#38bdf8`) with a semantic token layer supporting **Dark (Charcoal)** default + **Light (Warm Stone / Paper)** mode toggled via `[data-theme="dark" | "light"]` (and persisted cleanly in `localStorage` + `matchMedia` fallback):

### Recommended Token Palette

| Semantic Token | Dark Mode (Charcoal) | Light Mode (Warm Stone) | Purpose |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#121316` | `#f5f3ef` | App shell / recessed canvas backdrop |
| `--bg-surface` | `#1a1c20` | `#ffffff` | Primary docked panels & header/footer chrome |
| `--bg-elevated` | `#23262c` | `#ebe7df` | Cards, inputs, timeline tracks, hover states |
| `--bg-stage` | `#0c0d0f` | `#18191c` | Letterbox viewport behind composition/video *(kept dark in both modes for accurate color/alpha judging)* |
| `--border-subtle` | `#2d3139` | `#ddd7cc` | Panel dividers & grid hairlines |
| `--border-control` | `#454b57` | `#b5aea0` | Form inputs & secondary button outlines |
| `--text-primary` | `#f4f3f0` | `#18181b` | Headings & primary body labels |
| `--text-muted` | `#a1a1aa` | `#57534e` | Secondary metadata, hints, timecodes |
| `--accent` | `#f59e0b` (Amber 500) | `#b45309` (Amber 700, WCAG AA contrast on light) | Active selection, focus ring, primary CTAs, playhead, keyframes |
| `--accent-hover` | `#fbbf24` | `#92400e` | Hover / active CTA state |
| `--accent-surface` | `rgba(245, 158, 11, 0.14)` | `rgba(180, 83, 9, 0.10)` | Active tabs, selected tracks, subtle highlights |
| `--accent-on-solid` | `#141414` | `#ffffff` | High-contrast text on solid amber primary buttons |
| `--status-pass` / `warn` / `fail` | `#22c55e` / `#f59e0b` / `#ef4444` (with high-contrast tinted badge fills) | `#15803d` / `#b45309` / `#b91c1c` | Doctor badges, QA severity, render status |

Also define **font-size, spacing (`4px` grid), radius (`4px`/`6px`/`10px`), z-index, and monospace (`ui-monospace, SFMono-Regular, Menlo, monospace`)** tokens so timecodes (`00:04.12`), dimensions (`1280×720`), `fps`, and QA error codes render with tabular alignment (`font-variant-numeric: tabular-nums`).

---

## 2. Recommended Navigation & Multi-View Studio Architecture

Move from a single scrolling form page to an **Application Shell with Top Chrome + Activity Rail + Switchable Workspaces**:

### Top Title/Command Bar (`48px` height)
- **Left:** Brand mark (`AnimForge Studio`), active project switcher dropdown / breadcrumb (`Projects / <Active Project>`), unsaved-change indicator dot, and manual **Refresh Workspace** button (syncing external OpenCode MCP edits).
- **Center:** Mode switcher segmented control tailored to what exists and what M2 adds:
  1. **Projects** (Dashboard / Project Manager & Creation wizard)
  2. **Story & Scenes** (Storyboard beats + Scene sequence cards)
  3. **Studio** (Primary 4-zone Animation Editor: Assets/Layers + Stage + Inspector + Timeline)
  4. **Render** (Render Queue, export summary, `ffprobe` card, video player)
  5. **Diagnostics** (Opens compact `Doctor` status pill drawer or full Diagnostics view instead of consuming 300px of vertical height on every screen!)
- **Right:** Engine badge (`GiveMotion`), compact overall Doctor health pill (`All Systems Ready` / `1 Warning` clickable to open Diagnostics Drawer), **Dark/Light Theme Toggle**, and primary **Preview** / **Export MP4** actions.

---

## 3. Professional Studio Workspace Layout (Mode 3: `Studio`)

Inside the primary **Studio** workspace (designed cleanly for `1280×820` desktop and collapsible cleanly down to `960×640`):

```text
+-----------------------------------------------------------------------------+
| Header: Project Selector | Projects | Story | [Studio] | Render | [Theme][Doc]
+------------+-----------------------------------------------+----------------+
| Left Dock  | Center Stage Viewport                         | Right Dock     |
| (260-300px | - Interactive Aspect-Locked Canvas/Player      | (280-320px     |
| collapsible| - Zoom / Fit / Safe-Margin overlay toggle     | collapsible)   |
| tabs):     | - Mode pill: [Live Bundle] [Rendered MP4]     | Selected Scene |
| - Scenes   | - Transport Bar: Play/Pause, Scrub, Timecode  | Inspector:     |
| - Characters| - QA Issue Drawer (collapsible badge count)  | - Title & Desc |
| - Assets   |                                               | - Duration/FPS |
|            |                                               | - Transition   |
|            |                                               | - Camera Move  |
|            |                                               | - Action Props |
+------------+-----------------------------------------------+----------------+
| Bottom Dock (180-220px resizable/collapsible Timeline Panel)                |
| - Multi-scene ruler & playhead synced to <gm-player> timeupdate             |
| - Tracks: Scene Sequence | Character Actions (walk/wave/..) | Camera | Audio |
+-----------------------------------------------------------------------------+
```

### Key Workflow Improvements Mapped Directly to Existing Backend Capabilities
1. **Immediate Value Using Existing `worker.ts` `save_project`:**
   - Even *before* touching Rust/Node backend code, the frontend already receives complete `ProjectDetail` objects (`storyboard`, `characters`, `scenes[].{title,description,duration,transition,characterIds,timeline.{characterActions,cameraMoves,audioTracks}}`).
   - Editing scene duration, description, transition (`none`/`fade`/`wipe`/`slide`/`dissolve`), camera motion (`static`/`zoom`/`push`/`pull`/`pan`/`shake`), character palette/action blocks (`idle`/`walk`/`run`/`wave`/`smile`/`blink`/`look_around`), and reordering/adding scenes can **all serialize immediately through existing `project_save` IPC**!
2. **Project Creation Upgrade (Dialog / Focused View):**
   - Replace the always-visible sidebar form with a **"New Project"** modal dialog or Dashboard card supporting prompt input **plus** resolution presets (`1280×720`, `1920×1080`, `1080×1920` Vertical, `1080×1080` Square) and `fps` (`24`, `30`, `60`), which `worker_bridge::CreateProjectInput` already accepts!
3. **Preview & Render Ergonomics:**
   - Replace `<details>` QA scrolling below the stage with a compact **QA Status Chip (`0 errors · 1 warning`)** in the stage toolbar that expands an overlay/drawer only when clicked or when errors exist.
   - Surface the returned `videoPath` upon render completion with copy/open feedback cleanly in the Render panel.
4. **Asset & Character Management Separation:**
   - Put `Characters` (`parts` tree, `colorPalette` swatches) and `Assets` (`assets/` library + project assets) into tabbed Left Dock panels. Wire `Assets` to new additive `worker.ts` / Tauri commands (`list_assets`, `import_asset`) cleanly in a later milestone without touching MCP.
   - Keep `DoctorBar` accessible via a lightweight status pill + slide-over drawer so it stays 1 click away without pushing the stage off-screen.
5. **Agent / OpenCode Awareness Panel (Optional Drawer):**
   - Since OpenCode interacts via the external MCP server (`animforge_core`), provide a simple **Workspace Sync** indicator (last modified timestamp / Reload button) so MCP-created projects, scenes, and MP4 exports appear immediately in the desktop UI.

---

## 4. Reusable Component Architecture Recommendation

Structure `animforge-desktop/src/` cleanly before scaling to M2 views:

```text
animforge-desktop/src/
├── styles/
│   ├── tokens.css           # Charcoal + Warm Amber (dark & light) + typography + spacing
│   └── global.css           # Resets, forced-colors, focus-visible
├── components/
│   ├── ui/                  # Pure primitives: Button, IconButton, Input, Textarea, Select,
│   │                        # Badge, Card, Tabs, Modal, Toast, EmptyState, AlertBanner, ProgressBar
│   ├── layout/              # StudioHeader, DockPanel (collapsible), SplitPane
│   ├── projects/            # ProjectManagerView, CreateProjectModal
│   ├── scenes/              # StoryboardView, SceneList, SceneInspector
│   ├── stage/               # PreviewStage, ViewportToolbar, QaDiagnosticsDrawer, VideoPlayer
│   ├── timeline/            # TimelineDock, TrackRow, ActionClip, TimeRuler
│   └── diagnostics/         # DoctorDrawer, DoctorSummaryPill
├── context/                 # ThemeContext (dark/light), ToastContext, StudioErrorBoundary
└── hooks/                   # useStudio.ts (kept race-safe), useKeyboardShortcuts.ts, useLocalStorage.ts
```

### Design Principles for the Redesign
- **Preserve All M1 Accessibility Guarantees:** Keep strict `aria-invalid`, `aria-describedby`, debounced blur validation, `aria-live="polite"`, keyboard focus management, `:focus-visible`, and `@media (forced-colors: active)` across every new primitive.
- **No Unnecessary Heavy Libraries:** Keep bundle size lean (`lucide-react` is optional/lightweight for crisp vector icons; avoid heavy CSS-in-JS runtime or dragging in all 40 Radix/Recharts packages used inside `engines/stretchystudio`).
- **Safety & Stability:** Wrap `<App />` and `<gm-player>` viewport in React `ErrorBoundary` components with fallback recovery.
