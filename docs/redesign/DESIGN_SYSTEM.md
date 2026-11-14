# AnimForge Studio — Design System Specification (`Charcoal + Warm Amber`)

Grounded in the uploaded visual reference image (`media_1794495119664_70dd223c.jpg`), `modern-web-guidance` (`dark-mode`, `dark-mode-toggle`, `color`, `dialog`, `tabs`, `customize-scrollbar-color-and-thickness`), and `a11y-debugging` WCAG AA rules.

---

## 1. Visual Language (Derived Directly from Reference)

- **Default Mode:** **Dark Charcoal Studio** (`#111317` background canvas, `#171a20` panel surface, `#1e222a` raised controls, `#0b0c0f` obsidian stage matte).
- **Warm Amber Accent:** `#f59e0b` primary CTA fill (`#141007` dark ink on button for `~9.8:1` contrast), `#fbbf24` hover & active playhead/borders, `rgba(245, 158, 11, 0.14)` soft active row highlight.
- **Light Mode (Warm Paper):** `#f5f3ee` background, `#ffffff` crisp paper panels, `#ece8e0` raised inputs, `#b45309` deep ochre accent with `#ffffff` button text (`~5.0:1` contrast).
- **System Mode:** Follows OS `prefers-color-scheme` live via CSS `light-dark()` + `[data-resolved-theme]` dual fallback for macOS WKWebView and Linux WebKitGTK.
- **Hairline Borders & Geometry:** `1px solid var(--border-subtle)` (`#272b34` dark / `#dbd6cc` light), `1.5px solid var(--accent-amber)` on selected scene card / active studio icon tile, crisp `6px`–`8px` rounded panels, zero purple gradients or heavy glassmorphism.

---

## 2. Semantic CSS Tokens (`animforge-desktop/src/styles/tokens.css`)

| Token | Dark (Default) | Light (Warm Paper) | Role |
| :--- | :--- | :--- | :--- |
| `--bg-app` | `#111317` | `#f5f3ee` | Main workbench shell background |
| `--bg-header` | `#14161b` | `#faf9f6` | Top 46px studio command bar & left 52px rail |
| `--bg-surface` | `#181b21` | `#ffffff` | Sidebars, Inspector, Cards, Timeline panel |
| `--bg-surface-elevated` | `#21252d` | `#efece6` | Inputs, hover states, secondary buttons |
| `--bg-stage-matte` | `#0b0c0f` | `#1b1a18` | Matte frame behind interactive/MP4 viewport |
| `--text-primary` | `#f2f0ec` | `#171614` | Primary UI copy & headings |
| `--text-secondary` | `#a6aab4` | `#57534e` | Metadata, hints, labels, inactive tabs |
| `--text-muted` | `#747985` | `#78716c` | Subtle separators & keycap placeholders |
| `--border-subtle` | `#282c35` | `#ded9cf` | Panel hairlines, row dividers |
| `--border-strong` | `#3d4351` | `#9a9387` | Input outlines, scrollbar thumbs |
| `--accent-amber` | `#f59e0b` | `#b45309` | Primary CTA, playhead, active selection border |
| `--accent-amber-hover` | `#fbbf24` | `#92400e` | Hover & focus accent |
| `--accent-amber-ink` | `#141007` | `#ffffff` | Text on solid amber CTAs |
| `--accent-amber-soft` | `rgba(245,158,11,0.14)` | `rgba(180,83,9,0.10)` | Active tool highlight & badge fill |
| `--status-pass` | `#22c55e` / `#4ade80` | `#15803d` | `Healthy`, `OK`, `Preview Ready` |
| `--status-warn` | `#f59e0b` / `#fbbf24` | `#b45309` | `WARN`, `Unsaved Changes`, Planned markers |
| `--status-fail` | `#ef4444` / `#f87171` | `#b91c1c` | `FAIL`, validation & worker alerts |
| `--track-scene` | `#b4691e` | `#d97706` | Timeline Scene track bar |
| `--track-action` | `#2b6cb0` | `#0284c7` | Timeline Character Actions clip |
| `--track-camera` | `#5b528c` | `#6d28d9` | Timeline Camera track span |
| `--track-audio` | `#1f6f54` | `#059669` | Timeline Audio waveform clip |

---

## 3. Typography, Timecode & Scrollbars

- **UI Sans:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` (`12.5px`–`13px` dense desktop default).
- **Monospace Timecodes:** `'JetBrains Mono', 'SF Mono', ui-monospace, monospace` with `font-variant-numeric: tabular-nums` (`00:00:02:15 / 00:00:18:00`, FPS, frame counters, workspace paths).
- **Scrollbars:** `scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;` + `@supports not (scrollbar-color: auto)` WebKit rules, with **zero `scrollbar-color` transition**.

---

## 4. Accessibility & Interactive Primitives

1. **CSP-Safe Zero-FOUC Theme Boot (`public/theme-init.js`):** Loaded synchronously in `index.html` (`<script src="/theme-init.js"></script>`) because `tauri.conf.json` enforces `script-src 'self'` without `'unsafe-inline'`.
2. **Modals (`<dialog>.showModal()`):** Native top-layer modal handling with dirty-form `cancel` confirmation guard.
3. **Top-Level Navigation vs. Sub-Tabs:** Top Header + Left Rail use `<nav>` buttons with `aria-current="page"`. Sub-panel switches (`Scenes | Characters | Assets`, `Interactive Player | Rendered MP4`) use single-row `role="tablist"` with roving `tabindex` (`ArrowLeft`/`ArrowRight`/`Home`/`End`) and `hidden` panels.
4. **Preserved Test Invariants:** `<h1>AnimForge Studio</h1>`, `<main>`, polite `aria-live` (`450ms` blur validation debounce), enabled submit buttons (`noValidate`), `role="alert"`, `defaultLoadPlayerScript` single-flight cache, and `DoctorBar` StrictMode sequence guard.
