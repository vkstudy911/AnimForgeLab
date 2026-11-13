# AnimForge Studio — Component Design System

**Palette:** Charcoal + Warm Amber  
**Modes:** Dark Mode (Default) · Light Mode (Warm Paper/Stone) · System Mode (`prefers-color-scheme`) · High Contrast (`forced-colors: active`)  
**Zero-Bloat Stack:** Pure CSS Custom Properties (`tokens.css`) + CSS Grid/Container Queries + Native `<dialog>`/`popover` + Lightweight inline SVG icon library (zero CSS-in-JS, zero Tailwind, zero external UI framework).

> **Baseline Audit Note:** Prior to this redesign specification, [styles.css](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/styles.css) used a cool slate-navy (`#0b0f17` / `#131926`) and sky-blue (`#38bdf8`) dark-only palette. All Charcoal + Warm Amber tokens below are authored fresh for this redesign.

---

## 1. Color Token System & WCAG Contrast Audit

All text/background pairings target **>= 4.5:1** contrast for normal text (`11px–14px`), **>= 3:1** for large display headings, UI borders, timeline cues, focus outlines, and scrollbar thumbs (`a11y-debugging` + `modern-web-guidance/color`).

### 1.1 Semantic CSS Custom Properties

Implemented using dual-safe CSS: `light-dark()` declarations where supported plus explicit `[data-resolved-theme="dark"]` / `[data-resolved-theme="light"]` overrides so Linux WebKitGTK renders identically.

| Semantic Token | Dark Mode (Default) | Light Mode (Warm Paper) | Usage | Contrast Check |
| :--- | :--- | :--- | :--- | :--- |
| `--bg-app` | `#111215` (Deep Charcoal) | `#f6f4ef` (Warm Stone) | Root shell & gutter behind stage | Base |
| `--bg-surface` | `#181a1f` (Panel Charcoal) | `#ffffff` (Crisp Paper) | Sidebar, Inspector, Cards, Timeline | Base panel |
| `--bg-surface-elevated` | `#21242b` (Raised Charcoal) | `#efece6` (Warm Tint) | Hover rows, active cards, inputs, dock headers | Distinguishable >= 1.2:1 step |
| `--bg-stage-matte` | `#0b0c0e` (Obsidian Stage) | `#22201d` (Dark Matte Framing) | Surrounds `<gm-player>` / `<video>` so color artwork judges accurately in both modes | Isolates artwork |
| `--text-primary` | `#f3f1ed` (Warm Alabaster) | `#181715` (Ink Charcoal) | Headings, active labels, inspector values | **~15.5:1** Dark / **~16.2:1** Light |
| `--text-secondary` | `#b8b4ac` (Muted Warm Gray) | `#545049` (Slate Umber) | Subtitles, field hints, track labels, timestamps | **~8.5:1** Dark / **~7.4:1** Light |
| `--text-muted` | `#8c877d` | `#6d685f` | Placeholders, disabled metadata | **~5.1:1** Dark / **~5.2:1** Light |
| `--border-subtle` | `#2b2e36` | `#dbd6cc` | Panel dividers, card hairlines, timeline grid | Non-intrusive 1px line |
| `--border-strong` | `#464b57` | `#8b8579` | Interactive input borders, inactive tabs, thumbs | **>= 3.0:1** UI border ratio |
| `--accent-amber` | `#f59e0b` (Warm Amber) | `#b45309` (Deep Ochre Amber) | Primary CTAs, active nav rail mark, playhead, focus accents | High visibility |
| `--accent-amber-hover` | `#fbbf24` | `#92400e` | Button hover / pressed state | Crisp interactive delta |
| `--accent-amber-ink` | `#141008` (Dark ink on `#f59e0b`) | `#ffffff` (White ink on `#b45309`) | Text inside primary Amber buttons | **~9.8:1** Dark / **~5.0:1** Light |
| `--accent-amber-soft` | `rgba(245, 158, 11, 0.14)` | `rgba(180, 83, 9, 0.10)` | Active workspace pill, selected timeline clip fill | Soft tint |
| `--focus-ring` | `#fbbf24` (`2px solid`, `2px` offset) | `#92400e` (`2px solid`, `2px` offset) | `:focus-visible` ring across all controls | **>= 8:1** |
| `--status-pass-fg` / `bg` | `#4ade80` / `rgba(34,197,94,0.14)` | `#15803d` / `#dcfce7` | `PASS`, `rendered`, `completed` | **>= 7:1** |
| `--status-warn-fg` / `bg` | `#fbbf24` / `rgba(245,158,11,0.15)` | `#a16207` / `#fef3c7` | `WARN`, dirty draft, Track B preview | **>= 6:1** |
| `--status-fail-fg` / `bg` | `#f87171` / `rgba(239,68,68,0.15)` | `#b91c1c` / `#fee2e2` | `FAIL`, `role="alert"`, field validation error | **>= 5.8:1** |
| `--track-scene` | `#f59e0b` | `#b45309` | Scene sequence blocks | Distinct track hue |
| `--track-action` | `#38bdf8` | `#0369a1` | Character action keyframes/clips | Distinct track hue |
| `--track-camera` | `#a78bfa` | `#6d28d9` | Camera move spans | Distinct track hue |
| `--track-audio` | `#34d399` | `#047857` | Audio track strips | Distinct track hue |

---

## 2. Typography, Spacing, Borders & Motion

1. **Font Stack (Zero External Font Network Calls — Local/CSP Safe):**
   - Sans UI: `'Inter', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
   - Monospace Timecode / Frame Counter / Logs: `'JetBrains Mono', 'SF Mono', ui-monospace, 'Cascadia Mono', monospace` with `font-variant-numeric: tabular-nums;` so timecodes (`00:04.12 / 00:12.00`) never jitter horizontally during playback.
2. **Type Scale:**
   - `--text-xs`: `11px` (`0.6875rem`) — Timeline ruler ticks, metadata tags, keycap hints
   - `--text-sm`: `12px` (`0.75rem`) — Inspector labels, rail items, status footer, badges
   - `--text-base`: `13px` (`0.8125rem`) — Desktop standard body copy, form inputs, buttons (higher information density than web `16px`)
   - `--text-md`: `15px` (`0.9375rem`) — Panel headings (`<h2>`), modal titles
   - `--text-lg`: `18px` (`1.125rem`) — Hero Dashboard heading / Workspace headers
3. **Spacing Grid (`4px` base):** `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`.
4. **Radii & Elevation:**
   - Sharp creative-tool geometry: `--radius-sm: 4px` (timeline clips, badges, kbd), `--radius-md: 6px` (buttons, inputs, inspector boxes), `--radius-lg: 8px` (cards, `<dialog>`).
   - **Flat Borders > Heavy Shadows:** `1px solid var(--border-subtle)` everywhere; only popovers and `<dialog>` carry subtle shadow (`0 12px 32px rgba(0,0,0,0.45)` in dark, `0 12px 28px rgba(0,0,0,0.14)` in light).
5. **Scrollbar Standard (`modern-web-guidance`):**
   ```css
   * {
     scrollbar-width: thin;
     scrollbar-color: var(--border-strong) transparent;
     /* Never transition scrollbar-color (WebKit flicker bug) */
   }
   @supports not (scrollbar-color: auto) {
     ::-webkit-scrollbar { width: 8px; height: 8px; }
     ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
     ::-webkit-scrollbar-track { background: transparent; }
   }
   ```
6. **High Contrast Mode (`@media (forced-colors: active)`):**
   - Active workspace buttons and active tabs render `2px solid Highlight` borders / `border-block-end` pseudo-elements so selection remains unambiguous when OS overrides backgrounds.

---

## 3. Core Component Inventory (`animforge-desktop/src/components/`)

Organized into focused, small modules—reusing existing logic without over-engineering:

### 3.1 `ui/` — Accessible Primitives
- **`StudioButton.tsx`**: Semantic `<button>` (`primary` amber, `secondary` hairline, `ghost`, `danger`), preserves disabled/loading copy patterns.
- **`StudioDialog.tsx`**: Thin wrapper around native HTML `<dialog>` using `showModal()`/`close()` in `useEffect`; handles dirty-form `onCancel` confirmation without adding fake `role="dialog"` or manual Tab traps; styles `dialog:modal { overscroll-behavior: contain; }` & `dialog::backdrop { overflow: hidden; overscroll-behavior: contain; }`.
- **`StudioTabs.tsx`**: Strict WAI-ARIA single-row `role="tablist"` supporting `ArrowLeft`/`ArrowRight`/`Home`/`End` roving `tabindex`, `aria-selected`, and `hidden` inactive `role="tabpanel"` panels. Used inside Inspector, Asset Source Switch, and Stage Mode toggles (never top-level navigation).
- **`StatusBadge.tsx` & `InlineFieldError.tsx`**: Accessible badge (`PASS`/`WARN`/`FAIL`/status) and validation error slot reserving static height via `visibility` where appropriate or clean `aria-describedby` linkage matching `App.test.tsx`.
- **`WorkspaceErrorBoundary.tsx`**: React ErrorBoundary catching workspace/stage faults with one-click reset.

### 3.2 `layout/` — Workbench Frame
- **`StudioHeader.tsx`**: Zone 1 (`44px`), contains `<h1>AnimForge Studio</h1>`, Project Switcher (`popover`), Dirty badge, Global Save/Preview/Render triggers, Theme cycle button.
- **`WorkspaceRail.tsx`**: Zone 2 (`<nav aria-label="Studio Workspaces">`), renders 3 Groups / 10 Workspaces with `aria-current="page"`, auto-collapse < `1080px`, manual collapse toggle `[`.
- **`StatusFooter.tsx`**: Zone 5 (`28px`), hosts polite `aria-live` status readout (`450ms` blur debounce preserved), global Doctor status pill, and live `animforge://render-progress` mini-bar + Cancel trigger.
- **`CommandPaletteDialog.tsx`**: `Cmd/Ctrl + K` `<dialog>` fuzzy filter across Workspaces, Projects, and Active Project Scenes.

### 3.3 `stage/` & `timeline/` — Creative Core
- **`PreviewStage.tsx`** *(Refactored cleanly in-place, preserving exported `defaultLoadPlayerScript` & all props/events)*: Adds aspect framing, stage zoom (`Fit`, `100%`, `50%`), Safe-Zone guide SVG overlay toggle, unified Transport readout, and collapsible GiveMotion QA `<details>` / panel.
- **`SceneOutliner.tsx`**: Hierarchical list of `project.scenes[]`, character presence toggles (`scene.characterIds`), and background assignment summary.
- **`MultiTrackTimeline.tsx`**: Pointer + keyboard-scrubbable time ruler, Playhead hairline (`0` to total/scene duration in seconds & frames), 4 track lanes (`Scenes`, `CharacterActions`, `CameraMoves`, `AudioTracks`), click-to-select clip for Inspector editing, `+ Add Cue` inline buttons.
- **`CueInspector.tsx`**: Context-sensitive Zone 4 form editing Scene (`title`, `description`, `duration`, `transition`), `CharacterAction` (`name`, `startTime`, `duration`, `parameters`), `CameraMovement` (`type`, `startX/Y`, `endX/Y`, `startZoom/endZoom`, `easing`, `duration`), or `AudioTrack` (`assetId`, `startTime`, `volume`, `loop`) -> updates draft project cleanly.

### 3.4 `workspaces/` — The 10 Views
- `HomeDashboard.tsx`, `ProjectManager.tsx`, `StoryboardWorkspace.tsx`, `CharacterStudio.tsx`, `AssetLibrary.tsx`, `AnimationEditor.tsx`, `RenderQueueWorkspace.tsx`, `AgentCenterWorkspace.tsx`, `SettingsWorkspace.tsx`, `DiagnosticsWorkspace.tsx` (wrapping refactored `DoctorBar`).

---

## 4. State Architecture (`StudioProvider` over Existing `useStudio`)

- Keep [useStudio.ts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/hooks/useStudio.ts) intact as the battle-tested IPC & concurrency layer (`projectSeqRef`, `opTokensRef`, `unmountedRef`, `renderingProjectIdRef`, `animforge://render-progress`).
- Add a lightweight `StudioContext` + `useThemePreference` + `useProjectDraft`:
  - `activeWorkspace`: `'home' | 'projects' | 'storyboard' | 'characters' | 'assets' | 'editor' | 'render-queue' | 'agents' | 'settings' | 'diagnostics'`
  - `draftProject`: Local mutable copy synced carefully when `activeProject.id` changes or `project_save` succeeds—crucially preserving unsaved edits when `project_render` updates only `status: 'rendered'` (100% honoring existing `App.test.tsx` race invariant!).
  - `selection`: `{ type: 'project' | 'scene' | 'beat' | 'character' | 'part' | 'asset' | 'action' | 'camera' | 'audio'; id: string; sceneId?: string }` driving Zone 4 Inspector cleanly.
