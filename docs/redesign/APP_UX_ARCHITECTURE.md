# AnimForge Studio — Desktop UX Architecture

**Target Platforms:** macOS (`aarch64` / Intel, WebKit WKWebView) & Linux (`x86_64`, WebKitGTK)  
**Target Shell:** Tauri 2 (`1280x820` default, `960x640` minimum, CSP-restricted local bundle + `http://127.0.0.1:<port>` preview server)  
**Design Theme:** Charcoal + Warm Amber (**Dark Mode default**, **Warm Paper Light Mode**, **System auto**)  
**Creative Influences:** Blender (Outliner/Viewport/Properties spatial clarity), Adobe After Effects (Layer stack + timeline scrubbing), DaVinci Resolve (Workspace switcher dock + stage focus), Figma (Crisp hairline panels, left asset/layer rail, right contextual inspector)

---

## 1. Core UX Philosophy

1. **Stage-First Ergonomics:** At any moment in a creative workspace, the **Stage Viewport** (`<gm-player>` interactive bundle or rendered MP4) remains the visual anchor. Configuration and controls wrap tightly around it in predictable docks—never hiding the canvas behind full-screen modals while tweaking values.
2. **Contextual Density over Clutter:** Instead of dumping every form and diagnostic list onto one scrolling web page (`App.tsx` today), controls appear **only** inside the workspace where they matter (`Animation Editor` shows outliner + timeline + inspector; `Home Dashboard` shows recent projects + prompt launcher; `System Diagnostics` holds the full 8-check Doctor report + live environment details).
3. **Hardware-Conscious Speed (MacBook Air M5 + Acer Aspire A315-21):**
   - Zero heavy runtime CSS/component libraries or complex shadow/blur stacks (`backdrop-filter` disabled or kept tiny—only solid high-contrast surfaces and 1px hairline borders).
   - Timeline rendering uses lightweight HTML/CSS flex/grid tracks (virtualized or windowed when > 50 cues) and never spawns eager `<video>` / `<gm-player>` instances in background tabs.
   - GiveMotion `--workers 1` renders stay non-blocking with live progress telemetry in a persistent **Status Footer Pill** even if the user navigates between workspaces.
4. **Desktop-Native Accessibility & Predictability:**
   - Top-level workspaces use semantic `<nav>` + `aria-current="page"`.
   - Sub-panels (Inspector tabs, Stage mode switch, QA tabs) use WAI-ARIA single-row `role="tablist"` with roving `tabindex`.
   - Modals (New Project Wizard, Confirmation Prompts, Command Palette) use native `<dialog>.showModal()`.

---

## 2. Five-Zone Workbench Shell

Every workspace sits inside one consistent desktop frame designed to fit cleanly inside `960x640` minimum without horizontal overflow and expand comfortably to `1440px+`:

```
+---------------------------------------------------------------------------------------------------+
| ZONE 1: STUDIO HEADER BAR (44px fixed)                                                            |
| [AnimForge Studio] [Project Selector v] [Unsaved dot]   [Workspace Breadcrumb]   [Theme] [Render] |
+----------+-------------------------------------------------------------------+--------------------+
| ZONE 2:  | ZONE 3: MAIN WORKSPACE STAGE                                      | ZONE 4:            |
| LEFT     | (Adapts per active workspace — single scroll/grid root)           | RIGHT CONTEXTUAL   |
| RAIL     |                                                                   | INSPECTOR          |
| (208px   |  e.g., Home Dashboard / Storyboard Grid / Animation Stage Canvas  | (288px             |
|  or      |                                                                   |  collapsible       |
|  52px    |                                                                   |  drawer at <=1100) |
|  icons)  |                                                                   |                    |
|          +-------------------------------------------------------------------+                    |
|          | ZONE 3B (Animation Editor only): RESIZABLE BOTTOM TIMELINE DOCK   |                    |
|          | (180px - 320px, collapsible, drag divider + Alt+Shift+Arrow keys) |                    |
+----------+-------------------------------------------------------------------+--------------------+
| ZONE 5: STUDIO STATUS & DIAGNOSTICS FOOTER (28px fixed)                                           |
| [Doctor: PASS/WARN/FAIL pill] [Active Task / Render Progress % + Cancel]   [Preview Port] [Zoom]  |
+---------------------------------------------------------------------------------------------------+
```

### 2.1 Zone Details & Constraints

- **Zone 1 — Studio Header Bar (`44px`):**
  - Left: Studio mark (`AnimForge Studio` hidden visually or compact `<h1>` preserved in DOM for landmark/a11y parity — see Compatibility Report), **Project Switcher Popover**, and dirty/unsaved indicator when local scene/timeline edits differ from last `project_save`.
  - Center: Current Workspace title + active Scene pill (`Scene 1 · Launchpad`) or Quick Command Trigger (`Cmd/Ctrl + K`).
  - Right: Primary action group when a project is active (**Save Project**, **Preview**, **Render MP4** / **Cancel**), plus compact Theme cycle button (`System / Dark / Light`).
- **Zone 2 — Collapsible Left Workspace Rail (`208px` expanded / `52px` icon-only):**
  - Organizes all **10 Workspaces** under **3 Semantic Groups** (Home & Management, Creative Workspace, Production & System).
  - Auto-collapses to `52px` icon rail with accessible tooltips/labels when window width `< 1080px` (`960x640` target), or via user toggle (`[`), leaving > `900px` for Stage + Inspector.
- **Zone 3 — Main Workspace Stage (`minmax(0, 1fr)`):**
  - Hosts the active workspace view. Zero outer page scrollbars; each internal pane manages its own `min-height: 0; overflow: auto;` with `scrollbar-width: thin`.
  - In **Animation Editor**, splits vertically via CSS Grid into **Top Row** (Scene/Layer Outliner drawer + Central Stage Canvas) and **Bottom Dock** (Multi-Track Timeline), using a keyboard- and pointer-accessible resize handle.
- **Zone 4 — Right Contextual Inspector (`288px` desktop / slide-over drawer `< 1100px`):**
  - Appears automatically when inspecting a Project, Story Beat, Character, Asset, Scene, Character Action, Camera Move, Audio Track, or Render Job. Hidden in workspaces where the canvas owns the full width (e.g., `Project Manager` table/cards when nothing is selected, or collapsible via `]`).
- **Zone 5 — Studio Status & Diagnostics Footer (`28px`):**
  - Compact **Doctor Health Pill** (`PASS` / `WARN` / `FAIL`) summarizing `run_doctor` without wasting 300px of vertical screen real estate; clicking opens `System Diagnostics`.
  - Live `aria-live="polite"` status text slot (preserving existing 450ms blur announcement hygiene!) + compact progress meter during MP4 rendering (with one-click Cancel) so users never lose render state when switching away from `Animation Editor`.

---

## 3. Theme Architecture (Dark / Light / System)

Grounded directly in `modern-web-guidance` (`dark-mode`, `dark-mode-toggle`, `color`):

1. **Default Theme:** **Dark Mode** (`Charcoal #111215` + `Warm Amber #f59e0b`) matching creative studio conventions, while supporting **Warm Paper Light Mode** and **System OS Follow**.
2. **Storage & FOUC Prevention:**
   - Update `animforge-desktop/index.html`:
     - `<meta name="color-scheme" content="light dark" />`
     - Synchronous external `<script src="/theme-init.js"></script>` (placed in `animforge-desktop/public/theme-init.js`) in `<head>` instead of an inline script—required because `tauri.conf.json` enforces `script-src 'self'` without `'unsafe-inline'`. Reads `localStorage.getItem('animforge:theme')` (`'dark'` default, `'light'`, `'system'`), sets `<meta name="color-scheme">` and `document.documentElement.dataset.resolvedTheme` inside `try..catch` before first paint.
3. **CSS Dual-Engine Mechanism (macOS WebKit + Linux WebKitGTK Safe):**
   - Primary modern CSS: `:root { color-scheme: light dark; }` + `:root:has(> head > meta[name="color-scheme"][content="dark"]) { color-scheme: dark; }` + `light-dark(...)` tokens.
   - Explicit fallback for WebKitGTK engines lacking `light-dark()` or `:has()`: override custom property tokens inside `:root[data-resolved-theme="light"]` and `:root[data-resolved-theme="dark"]` (and `@media (prefers-color-scheme: light)` when `data-theme="system"`).
4. **Live Synchronization:**
   - `window.matchMedia('(prefers-color-scheme: dark)')` `change` listener updates resolved theme automatically when preference is `'system'`, never clobbering manual `'dark'`/`'light'` choices.
   - `window.addEventListener('storage', ...)` syncs across Tauri multi-window future contexts.
   - Any future embedded `<iframe>` (e.g., StretchyStudio) receives resolved theme via `postMessage` or query parameter.

---

## 4. Modal, Popover, Alert, Error Boundary & Shortcut Architecture

### 4.1 Modals & Confirmation Dialogs (`<dialog>.showModal()`)
- All blocking dialogs use native HTML `<dialog>` opened via `.showModal()`:
  - **New Project Modal** (can be opened from anywhere via `Cmd/Ctrl + N`; supports `name`, `prompt`, plus `width`, `height`, `fps`, `preferredEngine` already supported by `project_create_from_prompt`!).
  - **Unsaved Changes Confirmation** (when switching active project or leaving a dirty edit if user opts to discard/save).
  - **Command Palette (`Cmd/Ctrl + K`)** (quick-jump across the 10 workspaces, active projects, and scenes).
- Browser native top-layer handles Escape, backdrop, focus restoration, and inert background (`inert` redundant when `.showModal()` is used). Only dirty forms attach an `onCancel` confirmation check.

### 4.2 Popovers, Toasts & Inline Alerts
- **Inline Global Alert Banner (`role="alert"`):** Retained cleanly in Zone 3 top slot for recoverable IPC / validation errors with `Dismiss` action.
- **Transient Action Toasts:** Non-blocking status pill in Zone 5 / bottom-right corner (`role="status"` single live region inside shell, never stacking 10 duplicate `aria-live` regions).
- **Context Menus / Quick Pickers:** Native HTML `popover="auto"` anchored cleanly near trigger button (e.g., Project Switcher, Aspect Preset Picker).

### 4.3 Error Boundaries
- Top-level **WorkspaceErrorBoundary** wraps Zone 3 + Zone 4 (per-workspace isolation): if a canvas overlay, timeline formatter, or third-party `<gm-player>` custom element throws during render, the Shell, Left Rail, Project Switcher, and `Save Project` safety remain intact, presenting a recovery card ("Reload Workspace" / "Return to Home Dashboard").
- **StageMediaBoundary** wraps `<gm-player>` and `<video>` inside `Animation Editor` so malformed script bundles degrade to actionable diagnostics rather than blanking timeline edits.

### 4.4 Global Keyboard Shortcuts (Non-Conflicting in Inputs)
When focus is outside `<input>`, `<textarea>`, `<select>`, and `contenteditable`:
- `Space`: Play / Pause active Stage (`<gm-player>` or `<video>`)
- `ArrowLeft` / `ArrowRight`: Step 1 frame backward / forward in Timeline (`Shift` = 10 frames / 1 sec)
- `1`–`9`, `0`: Jump directly to Workspaces 1–10 when combined with `Alt` (`Alt+1` Home .. `Alt+0` Diagnostics)
- `[` / `]`: Collapse/expand Left Workspace Rail / Right Contextual Inspector
- `Cmd/Ctrl + S`: Trigger `project_save` on current dirty project (intercepted cleanly, shows toast if clean)
- `Cmd/Ctrl + P` or `Shift + P`: Compile & Preview Bundle (`project_preview`)
- `Cmd/Ctrl + K`: Open Command Palette `<dialog>`

---

## 5. Low-Spec Hardware & WebKit Performance Rules

Target benchmark includes Apple Silicon (MacBook Air M5) AND constrained dual-core Linux laptops (Acer Aspire A315-21):
1. **Zero Simultaneous Heavy Embeds:** Never mount `<gm-player>` and `<video>` simultaneously unless explicitly switching; switching away from `Animation Editor` unmounts active player DOM (preserving project state and bundle URL cache) so WebKit stops `requestAnimationFrame` work immediately.
2. **No Expensive Compositor Effects:** Avoid large `backdrop-filter: blur(...)` over canvas/video layers and avoid `transition: scrollbar-color` (known WebKit flicker bug).
3. **Pure CSS Motion + `prefers-reduced-motion`:** Use short `120ms–160ms` `transform`/`opacity` micro-transitions; collapse to instant (`0ms`) under `@media (prefers-reduced-motion: reduce)` or a user "Reduced Effects" toggle in Settings.
4. **Render Worker Safety (`--workers 1`):** UI communicates render lock clearly (`renderingProjectId !== null`) across every workspace header/footer without blocking non-destructive browsing.
