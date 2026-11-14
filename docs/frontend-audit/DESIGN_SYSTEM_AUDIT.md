# AnimForge Studio — Existing Design System Audit

**Source Audited:** [styles.css](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/styles.css) & [index.html](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/index.html)  
**Target Direction Evaluated Against:** **Charcoal + Warm Amber, with both dark and light modes.**

---

## 1. Color Palette (`:root` Tokens & Hardcoded Literals)

All current custom properties in [styles.css](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src/styles.css#L1-L21):

| Token / Location | Current Hex / Value | Role | Assessment vs. Charcoal + Warm Amber |
| :--- | :--- | :--- | :--- |
| `--bg` | `#0b0f17` | App page canvas | Deep **blue-black** (`rgb(11,15,23)`), not neutral charcoal |
| `--surface` | `#131926` | Panel / header background | Cool **slate-navy**, not warm/neutral charcoal |
| `--surface-elevated` | `#1a2233` | Inputs, buttons, cards, progress box | Cool **dark slate-blue** |
| `--border` | `#2a3447` | Panel & card dividers | Cool slate border |
| `--control-border` | `#64748b` | Button & input borders | Cool Tailwind `slate-500` |
| `--text` | `#f1f5f9` | Primary text | Cool `slate-100` |
| `--text-muted` | `#94a3b8` | Secondary copy, hints, metadata | Cool `slate-400` |
| `--accent` | `#38bdf8` | Primary interactive highlight, focus ring, required asterisk, QA code | **Sky blue (`sky-400`) — conflicts directly with Warm Amber target** |
| `--accent-contrast` | `#082f49` | `.btn-primary` background | Deep sky (`sky-950`) |
| `--danger-border` | `#ef4444` | Validation/alert border & fail badge border | Tailwind `red-500` |
| `--danger-fg` | `#fecaca` | Field error text (`red-200`) | Functional crimson text |
| `--pass-bg` / `--pass-fg` | `#14532d` / `#dcfce7` (hardcoded border `#22c55e`) | Pass badge | Tailwind green (`green-900` / `green-100`) |
| `--warn-bg` / `--warn-fg` | `#78350f` / `#fef3c7` (hardcoded border `#f59e0b`) | Warning badge | Amber (`amber-900` / `amber-100` / `amber-500`) |
| `--fail-bg` / `--fail-fg` | `#7f1d1d` / `#fee2e2` | Fail badge & error alert | Red (`red-900` / `red-100`) |
| Hardcoded in rules | `#17253a` (active toggle bg), `#e0f2fe` (`.btn-primary` text), `#000` (`.stage-viewport` bg) | Hardcoded overrides bypassing CSS variables | Break themeability; must be tokenized before Light Mode |

**Verdict on Color Direction:** **0% aligned with Charcoal + Warm Amber** (only `--warn-bg` / `#f59e0b` happens to use amber for warning status badges). Current aesthetic is Tailwind Slate + Sky Blue (`#0b0f17` + `#38bdf8`).

---

## 2. Dark Mode & Light Mode Support

- **Current Status:** **Dark mode only.**
  - `index.html` sets `<meta name="color-scheme" content="dark" />`.
  - `styles.css` hardcodes `color-scheme: dark;` directly in `:root` with zero light-theme variables, zero `[data-theme="light"]` / `.theme-light` selectors, and zero `@media (prefers-color-scheme: light)` support.
  - Hardcoded hex literals (`#17253a`, `#e0f2fe`, `#22c55e`, `#f59e0b`, `#ef4444`, `#38bdf8` in `@supports not (accent-color: #38bdf8)`) also prevent instant theme flipping cleanly today.

---

## 3. Typography, Sizes & Weights

- **Font Stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (system UI stack; no monospace token defined for `<code>` / `.qa-code` / timestamps / IDs / `fps` / pixel dimensions, leaving `<code className="qa-code">` to browser default monospace).
- **Scale & Hierarchy (`styles.css`):**

| Element / Class | Size | Weight | Notes |
| :--- | :--- | :--- | :--- |
| `.studio-brand h1` | `1.125rem` (`18px`) | `600` | Header title |
| `.panel h2`, `.doctor-header h2` | `1rem` (`16px`) | browser bold (`700`) | Section headings |
| `.qa-summary-row h3` | `0.9375rem` (`15px`) | browser bold | QA heading |
| `input[type='text'], textarea` | `max(1rem, 0.9375rem)` (`16px`) | inherit | Prevents mobile/WebKit zoom |
| `.stage-empty` | `0.9375rem` (`15px`) | normal | Viewport placeholder |
| `button`, `.field label`, `.doctor-label`, `.qa-issue-item`, `.studio-status`, `.studio-alert`, `.scene-description-list` | `0.875rem` (`14px`) | `500`–`600` | Primary body/control size |
| `.doctor-root`, `.doctor-summary`, `.doctor-detail`, `.project-meta`, `.stage-subtitle`, `.field-hint`, `.field-error`, `.empty-copy` | `0.8125rem` (`13px`) | normal | Muted metadata & hints |
| `.studio-tag`, `.qa-code`, `.badge` | `0.75rem` (`12px`) | normal / `700` | Compact tags & badges |

- **Observation:** Hierarchy is flat (`12px`–`18px` spread with very tight spacing between `13px`, `14px`, `15px`, `16px`). No typographic tokens (`--font-sans`, `--font-mono`, `--text-xs`..`--text-lg`) exist.

---

## 4. Spacing, Borders, Radius & Shadows

- **Spacing System:** Ad-hoc `rem` literals (`0.35rem`, `0.45rem`, `0.5rem`, `0.65rem`, `0.75rem`, `0.85rem`, `1rem`, `1.25rem`, `1.5rem`); **no spacing tokens (`--space-*`)**.
- **Border Radius:** Hardcoded `4px` (badges), `5px` (`<progress>`), `6px` (buttons, inputs, cards, alerts, details, render box), `8px` (`.panel`, `.stage-viewport`); **no radius tokens (`--radius-*`)**.
- **Shadows & Elevation:** **Zero `box-shadow` declarations** in `styles.css`. Elevation relies exclusively on lightness steps (`#0b0f17` -> `#131926` -> `#1a2233`) and `1px solid` borders (`#2a3447`, `#64748b`).
- **Focus & Accessibility Contrast:** `:focus-visible` uses a strong `2px solid var(--accent)` with `2px` offset; `@media (forced-colors: active)` is thoughtfully implemented and tested.

---

## 5. Layout Proportions, Sidebar Dimensions & Responsiveness

- **Window Geometry ([tauri.conf.json](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/animforge-desktop/src-tauri/tauri.conf.json#L16-L20)):** Default `1280 × 820`, minimum `960 × 640`.
- **Workspace Grid:** `.studio-workspace` = `grid-template-columns: minmax(300px, 380px) minmax(0, 1fr)` with `1rem` (`16px`) gap and `1.25rem` (`20px`) outer padding.
  - Sidebar occupies ~`24%–30%` of horizontal space (`300px–380px`), is non-collapsible and non-resizable, and forces vertical page scrolling as projects/scenes/doctor items grow.
  - Because `Projects`, `Create Project`, and `Selected Scene` are permanently stacked vertically in one fixed `380px` column **above** `<DoctorBar />`, the user cannot collapse project creation while editing, nor keep a bottom timeline docked inside `820px` viewport height without scrolling past the stage.
- **Responsive Breakpoint:** Single breakpoint `@media (max-width: 960px)` (matches Tauri `minWidth: 960`), dropping `.studio-workspace` to `1fr`. Doctor cards adapt cleanly via `repeat(auto-fit, minmax(220px, 1fr))`.

---

## 6. Design Token Consistency Summary

| Criterion | Status | Evidence |
| :--- | :--- | :--- |
| CSS Custom Properties used systematically | Partial | Palette tokenized, but `4` hex colors leaked + spacing/radius/font/z-index/shadow tokens absent |
| Charcoal + Warm Amber palette implemented | **No** | Currently Blue-Navy (`#0b0f17`/`#131926`) + Sky Blue (`#38bdf8`) |
| Dark + Light mode parity | **No** | Dark mode only (`color-scheme: dark` hardcoded) |
| Consistent studio panel hierarchy (NLE / Timeline / Docked Inspector) | **No** | Form-stack left column + single preview box + footer diagnostics list |
| Accessibility & Forced Colors | **Strong** | Validated ARIA associations, live region, focus-visible ring, `forced-colors` media rules |
