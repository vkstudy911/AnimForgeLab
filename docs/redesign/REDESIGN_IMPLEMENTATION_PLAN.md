# AnimForge Studio UX Redesign Implementation Plan

> **For agentic workers:** Once the user lifts the planning STOP gate, implement this plan using `superpowers:subagent-driven-development` (`invoke_subagent` per task + review) or `superpowers:executing-plans` (inline batch execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `animforge-desktop` from a single-page prototype into a Charcoal + Warm Amber creative desktop workbench (Blender / After Effects / DaVinci Resolve / Figma inspired) supporting Dark (default), Light (Warm Paper), and System themes across 10 focused workspaces in 3 groups, while preserving 100% compatibility with existing Tauri IPC, PreviewServer, Worker Protocol v1, and all 4 existing Vitest suites.

**Architecture:** Maximize existing backend capabilities first (**Track A — Zero Backend Changes**): upgrade frontend TypeScript contracts to match `animforge-core` Zod schemas, introduce zero-FOUC theme tokens and a 5-zone CSS Grid shell over existing `useStudio`, add native `<dialog>` / WAI-ARIA tabs / ErrorBoundary primitives, and wire all workspaces (`Home`, `Projects`, `Storyboard`, `Characters`, `Asset Library`, `Animation Editor` with Outliner + Stage + Multi-Track Timeline + Inspector, `Render Queue`, `Agent Center`, `Settings`, `System Diagnostics`) to `project_save` / `project_preview` / `project_render`. Isolate genuinely missing backend features cleanly into **Track B — Additive Backend Extensions** without faking them in Track A.

**Tech Stack:** Tauri 2 (`src-tauri`), React 18.3.1, TypeScript 5.4.5, Vite 5.4.0, Vitest 2.1.8 + Testing Library, Native HTML `<dialog>` & `popover`, Pure CSS Custom Properties (`light-dark()` + `[data-resolved-theme]` fallback), Inline SVG Icons. Zero new npm dependencies (`ponytail` rule).

**Spec References:**
- [Skill Usage Report](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/redesign/SKILL_USAGE_REPORT.md)
- [UX Architecture](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/redesign/APP_UX_ARCHITECTURE.md)
- [Navigation Map](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/redesign/NAVIGATION_MAP.md)
- [Workspace Layouts](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/redesign/WORKSPACE_LAYOUTS.md)
- [Component Design System](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/redesign/COMPONENT_DESIGN_SYSTEM.md)
- [Frontend Compatibility Report](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/redesign/FRONTEND_COMPATIBILITY_REPORT.md)

---

## Global Constraints & Review Focus

- **Stop Gate:** Do NOT edit any code until the user approves this plan.
- **No Unapproved Dependencies:** Do not install Tailwind, `react-router-dom`, `zustand`, `lucide-react`, or Radix.
- **Preserve Existing Test Contracts:** `App.test.tsx`, `DoctorBar.test.tsx`, `PreviewStage.test.tsx`, and `useStudio.test.ts` invariants (`<h1>AnimForge Studio</h1>`, `<main>`, polite `aria-live` 450ms blur announcement, `role="alert"`, submit buttons stay enabled, `defaultLoadPlayerScript` single-flight deduplication, in-progress draft preservation on `project_render` completion, StrictMode race tokens) MUST remain green throughout every task.
- **Review Focus (`ponytail-review`):** Every PR/commit must verify (1) zero horizontal overflow at `960x640`, (2) `prefers-color-scheme` + manual Dark/Light parity, (3) dirty-state protection on project switch, (4) clean unmount of `<gm-player>`/`<video>` when leaving `Animation Editor`, and (5) TypeScript strict compile (`npx tsc --noEmit`).

---

# TRACK A — Pure Frontend Redesign (Zero Backend / Worker / Schema Edits)

### Task 1: Upgrade Frontend TypeScript Contracts (`src/types.ts`) & `useStudio` Project Save/Create Overloads

**Files:**
- Modify: `animforge-desktop/src/types.ts`
- Modify: `animforge-desktop/src/hooks/useStudio.ts`
- Test: `animforge-desktop/src/hooks/useStudio.test.ts`

**Interfaces:** Typed interfaces mirroring `animforge-core/schemas/*.ts`:
- `StoryBeat`, `Storyboard`
- `CharacterPart`, `CharacterAction`, `Character`
- `AssetType`, `AssetItem`
- `CameraMovement`, `AudioTrackItem`, `AnimationTimeline`
- `ProjectCreateOptions`: `{ width?: number; height?: number; fps?: number; preferredEngine?: 'givemotion' | 'remotion' | 'stretchystudio' | 'composite' }`
- Export `saveProjectDraft(project: ProjectDetail): Promise<ProjectDetail | null>` alongside existing `saveSceneTitle` (kept backward-compatible).

- [ ] **Step 1 (RED): Write failing test in `useStudio.test.ts` for `saveProjectDraft` and `createProject` canvas options**

```tsx
it('passes optional width/height/fps/preferredEngine on createProject and persists full draft via saveProjectDraft', async () => {
  const { result } = renderHook(() => useStudio());
  await waitFor(() => expect(result.current.busy.loadingList).toBe(false));

  await act(async () => {
    await result.current.createProject('Vertical Short', 'Rocket cat', {
      width: 1080,
      height: 1920,
      fps: 24,
      preferredEngine: 'givemotion',
    });
  });

  expect(mockInvoke).toHaveBeenCalledWith('project_create_from_prompt', {
    input: {
      name: 'Vertical Short',
      prompt: 'Rocket cat',
      width: 1080,
      height: 1920,
      fps: 24,
      preferredEngine: 'givemotion',
    },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm --prefix "animforge-desktop" test -- useStudio.test.ts`
  Expected: FAIL (type/argument mismatch because `createProject` takes 2 args and `saveProjectDraft` does not exist).

- [ ] **Step 3 (GREEN): Update `src/types.ts` & add `saveProjectDraft` + `createProject` 3rd options arg in `useStudio.ts`**
  Keep `saveSceneTitle` working via `saveProjectDraft` internally so zero existing callers break.

- [ ] **Step 4: Run test & typecheck**
  Run: `npm --prefix "animforge-desktop" test && npx --prefix "animforge-desktop" tsc --noEmit`
  Expected: PASS (17+ tests passing, 0 TS errors).

- [ ] **Step 5: Commit**
  Rollback: `git checkout -- animforge-desktop/src/types.ts animforge-desktop/src/hooks/useStudio.ts animforge-desktop/src/hooks/useStudio.test.ts`

---

### Task 2: Charcoal + Warm Amber Tokens, FOUC-Free Theme Boot, and Tri-State Theme Hook

**Files:**
- Modify: `animforge-desktop/index.html`
- Create: `animforge-desktop/public/theme-init.js`
- Create: `animforge-desktop/src/styles/tokens.css`
- Create: `animforge-desktop/src/styles/base.css`
- Create: `animforge-desktop/src/hooks/useThemePreference.ts`
- Test: `animforge-desktop/src/hooks/useThemePreference.test.ts`

**Implementation Notes (`modern-web-guidance` + Tauri CSP):**
- Update `index.html` `<meta name="color-scheme" content="light dark" />` + classic external `<script src="/theme-init.js"></script>` in `<head>` (external file in `public/` satisfies `tauri.conf.json` `script-src 'self'` without `'unsafe-inline'`) setting `meta[content]` and `document.documentElement.dataset.resolvedTheme` from `localStorage.getItem('animforge:theme')` (`'dark'` default, `'light'`, `'system'`) inside `try..catch`.
- `tokens.css` defines all Charcoal + Warm Amber semantic custom properties with `light-dark()` + `[data-resolved-theme="dark"]` / `[data-resolved-theme="light"]` fallbacks, `@media (forced-colors: active)`, and `scrollbar-width: thin; scrollbar-color` (zero `scrollbar-color` CSS transitions).

- [ ] **Step 1 (RED): Write failing Vitest suite `useThemePreference.test.ts`**

```tsx
it('defaults to dark, switches to light/system cleanly, and reacts to matchMedia in system mode without clobbering manual choice', () => {
  localStorage.clear();
  const { result } = renderHook(() => useThemePreference());
  expect(result.current.preference).toBe('dark');
  expect(document.documentElement.dataset.resolvedTheme).toBe('dark');

  act(() => result.current.setPreference('light'));
  expect(localStorage.getItem('animforge:theme')).toBe('light');
  expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('light');
});
```

- [ ] **Step 2: Run test to verify failure**
  Run: `npm --prefix "animforge-desktop" test -- useThemePreference.test.ts`

- [ ] **Step 3 (GREEN): Implement `index.html`, `src/styles/tokens.css`, `src/styles/base.css`, and `src/hooks/useThemePreference.ts`**
  Include `matchMedia('(prefers-color-scheme: dark)')` and `storage` event listeners cleanly with teardown.

- [ ] **Step 4: Run tests & Vite build check**
  Run: `npm --prefix "animforge-desktop" test -- useThemePreference.test.ts && npm --prefix "animforge-desktop" run build`

- [ ] **Step 5: Commit**
  Rollback: `git checkout -- animforge-desktop/index.html && rm -rf animforge-desktop/src/styles animforge-desktop/src/hooks/useThemePreference*`

---

### Task 3: Accessible UI Primitives (`StudioDialog`, `StudioTabs`, `WorkspaceErrorBoundary`, Inline SVG Icons)

**Files:**
- Create: `animforge-desktop/src/components/ui/Icons.tsx`
- Create: `animforge-desktop/src/components/ui/StudioDialog.tsx`
- Create: `animforge-desktop/src/components/ui/StudioTabs.tsx`
- Create: `animforge-desktop/src/components/ui/StatusBadge.tsx`
- Create: `animforge-desktop/src/components/ui/WorkspaceErrorBoundary.tsx`
- Test: `animforge-desktop/src/components/ui/primitives.test.tsx`

- [ ] **Step 1 (RED): Write failing tests for `StudioDialog` (dirty `cancel` guard), `StudioTabs` (single-row roving `tabindex` + ArrowRight/ArrowLeft + `hidden`), and `WorkspaceErrorBoundary`**

```tsx
it('StudioTabs moves selection and focus with ArrowRight/ArrowLeft and marks inactive panels hidden', () => {
  render(
    <StudioTabs
      label="Inspector Tabs"
      tabs={[
        { id: 'scene', label: 'Scene', content: <div>Scene Form</div> },
        { id: 'camera', label: 'Camera', content: <div>Camera Form</div> },
      ]}
    />
  );
  const tab1 = screen.getByRole('tab', { name: 'Scene' });
  const tab2 = screen.getByRole('tab', { name: 'Camera' });
  tab1.focus();
  fireEvent.keyDown(tab1, { key: 'ArrowRight' });
  expect(tab2.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tab2);
  expect(screen.getByText('Scene Form').closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify failure**
  Run: `npm --prefix "animforge-desktop" test -- primitives.test.tsx`

- [ ] **Step 3 (GREEN): Implement minimal accessible primitives**
  Note for jsdom (`HTMLDialogElement.prototype.showModal` polyfill shim in Vitest if needed): guard gracefully if `.showModal` is missing in jsdom while calling native `.showModal()` in WebKit/Chromium.

- [ ] **Step 4: Run test & typecheck**
  Run: `npm --prefix "animforge-desktop" test -- primitives.test.tsx && npx --prefix "animforge-desktop" tsc --noEmit`

- [ ] **Step 5: Commit**
  Rollback: `rm -rf animforge-desktop/src/components/ui`

---

### Task 4: Workbench State Context (`StudioProvider`) + Five-Zone Shell + 3-Group/10-Workspace Rail

**Files:**
- Create: `animforge-desktop/src/context/StudioContext.tsx`
- Create: `animforge-desktop/src/components/layout/IconsLayoutStyles.css` (or `src/styles/shell.css`)
- Create: `animforge-desktop/src/components/layout/StudioHeader.tsx`
- Create: `animforge-desktop/src/components/layout/WorkspaceRail.tsx`
- Create: `animforge-desktop/src/components/layout/StatusFooter.tsx`
- Create: `animforge-desktop/src/components/layout/CommandPaletteDialog.tsx`
- Create: `animforge-desktop/src/components/layout/NewProjectDialog.tsx`
- Test: `animforge-desktop/src/components/layout/WorkspaceRail.test.tsx`

- [ ] **Step 1 (RED): Write failing tests verifying 3 groups, all 10 workspaces, `aria-current="page"`, compact icon-rail toggle, and dirty-draft preservation when `renderProject` completes**

```tsx
it('renders 3 workspace groups, 10 navigation buttons using aria-current="page", and switches workspace without losing draft state', () => {
  render(<WorkspaceRail activeWorkspace="home" collapsed={false} onSelect={vi.fn()} onToggleCollapse={vi.fn()} />);
  const nav = screen.getByRole('navigation', { name: 'Studio Workspaces' });
  expect(within(nav).getAllByRole('button').length).toBeGreaterThanOrEqual(10);
  expect(screen.getByRole('button', { name: /Home Dashboard/i }).getAttribute('aria-current')).toBe('page');
});
```

- [ ] **Step 2: Run test to verify failure**
  Run: `npm --prefix "animforge-desktop" test -- WorkspaceRail.test.tsx`

- [ ] **Step 3 (GREEN): Implement `StudioContext`, `StudioHeader`, `WorkspaceRail`, `StatusFooter`, `NewProjectDialog`, and `CommandPaletteDialog`**
  Wire `StudioProvider` cleanly over `useStudio()` + `useThemePreference()`, managing `activeWorkspace`, `draftProject`, `isDirty`, `selection`, `selectedSceneId`, `playheadSeconds`, and existing `450ms` blur announcement ref hygiene.

- [ ] **Step 4: Run test & typecheck**
  Run: `npm --prefix "animforge-desktop" test -- WorkspaceRail.test.tsx && npx --prefix "animforge-desktop" tsc --noEmit`

- [ ] **Step 5: Commit**

---

### Task 5: Home Dashboard, Project Manager, System Diagnostics (`DoctorBar` Migration) & Settings Workspaces

**Files:**
- Modify: `animforge-desktop/src/components/DoctorBar.tsx` (preserve `Environment Diagnostics` heading & `run_doctor` StrictMode race guard + expose `onSummaryChange` or shared hook if needed for Footer pill)
- Create: `animforge-desktop/src/workspaces/HomeDashboard.tsx`
- Create: `animforge-desktop/src/workspaces/ProjectManager.tsx`
- Create: `animforge-desktop/src/workspaces/SettingsWorkspace.tsx`
- Create: `animforge-desktop/src/workspaces/DiagnosticsWorkspace.tsx`
- Test: `animforge-desktop/src/workspaces/ManagementWorkspaces.test.tsx`

- [ ] **Step 1 (RED): Write failing tests verifying Home prompt creation validation (`noValidate`, keeps submit enabled, focuses invalid field), Project filtering/opening, Settings tri-state theme switching, and `DoctorBar.test.tsx` passing unchanged**

- [ ] **Step 2: Run test to verify failure**
  Run: `npm --prefix "animforge-desktop" test -- ManagementWorkspaces.test.tsx DoctorBar.test.tsx`

- [ ] **Step 3 (GREEN): Implement all 4 workspaces + update `DoctorBar.tsx` styling tokens cleanly**

- [ ] **Step 4: Run all tests**
  Run: `npm --prefix "animforge-desktop" test`

- [ ] **Step 5: Commit**

---

### Task 6: Storyboard, Character Studio & Asset Library Workspaces (Track A Real Persistence + Track B Markers)

**Files:**
- Create: `animforge-desktop/src/workspaces/StoryboardWorkspace.tsx`
- Create: `animforge-desktop/src/workspaces/CharacterStudio.tsx`
- Create: `animforge-desktop/src/workspaces/AssetLibrary.tsx`
- Test: `animforge-desktop/src/workspaces/CreativePrepWorkspaces.test.tsx`

- [ ] **Step 1 (RED): Write failing tests verifying:**
  - Editing a `StoryBeat` (`sceneTitle`, `visualSummary`, `targetDurationSeconds`) updates draft and persists via `project_save`.
  - Editing `Character` `colorPalette` / `CharacterPart` `pivot` persists via `project_save` and SVG rig hierarchy updates live.
  - Assigning a project asset to `scene.backgroundAssetId` saves cleanly; Track B workspace disk browse shows an explicit honest placeholder note ("Requires Backend Asset Scan RPC — Track B").

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3 (GREEN): Implement `StoryboardWorkspace`, `CharacterStudio`, and `AssetLibrary`**

- [ ] **Step 4: Run tests & typecheck**
  Run: `npm --prefix "animforge-desktop" test && npx --prefix "animforge-desktop" tsc --noEmit`

- [ ] **Step 5: Commit**

---

### Task 7: Animation Editor (`SceneOutliner` + Refactored `PreviewStage` + `MultiTrackTimeline` + `CueInspector`)

**Files:**
- Modify: `animforge-desktop/src/components/PreviewStage.tsx` (preserve `defaultLoadPlayerScript` export, `<gm-player>`/`<video>` switch, live render progress, Accessible Scene Description, and QA list; add zoom preset `Fit`/`100%`/`50%` and Safe-Zone SVG guide toggle)
- Create: `animforge-desktop/src/components/timeline/SceneOutliner.tsx`
- Create: `animforge-desktop/src/components/timeline/MultiTrackTimeline.tsx`
- Create: `animforge-desktop/src/components/timeline/CueInspector.tsx`
- Create: `animforge-desktop/src/workspaces/AnimationEditor.tsx`
- Test: `animforge-desktop/src/components/timeline/AnimationEditor.test.tsx`

- [ ] **Step 1 (RED): Write failing tests verifying:**
  - Rendering `AnimationEditor` mounts Scene Outliner, `PreviewStage`, Multi-Track Timeline (`Scenes`, `Actions`, `Camera`, `Audio`), and Cue Inspector.
  - Clicking a `CharacterAction` clip selects it in Inspector; changing `duration` or `name` updates `draftProject` and enables **Save Project** -> calls `project_save`.
  - Adding a `CameraMovement` (`pan`, `zoom`, `ease-in-out`) writes valid `CameraMovementSchema` defaults.
  - Pressing `ArrowRight` / `ArrowLeft` on Timeline ruler steps playhead timecode (`tabular-nums` display).
  - Existing `PreviewStage.test.tsx` suite remains 100% green.

- [ ] **Step 2: Run test to verify failure**
  Run: `npm --prefix "animforge-desktop" test -- AnimationEditor.test.tsx PreviewStage.test.tsx`

- [ ] **Step 3 (GREEN): Implement `SceneOutliner`, `MultiTrackTimeline`, `CueInspector`, `AnimationEditor`, and extend `PreviewStage.tsx` safely**

- [ ] **Step 4: Run tests & typecheck**
  Run: `npm --prefix "animforge-desktop" test && npx --prefix "animforge-desktop" tsc --noEmit`

- [ ] **Step 5: Commit**

---

### Task 8: Render Queue & Agent Center Workspaces + Wire `App.tsx` + Full Regression Verification

**Files:**
- Create: `animforge-desktop/src/workspaces/RenderQueueWorkspace.tsx`
- Create: `animforge-desktop/src/workspaces/AgentCenterWorkspace.tsx`
- Modify: `animforge-desktop/src/App.tsx`
- Modify: `animforge-desktop/src/main.tsx` (import `tokens.css`, `base.css`, `shell.css`)
- Modify / Extend: `animforge-desktop/src/App.test.tsx` (preserve existing end-to-end assertions + verify new shell navigation & `Alt+1..0` / `Cmd+K` accessibility)

- [ ] **Step 1 (RED): Update `App.test.tsx` to verify both legacy workflow guarantees AND new 5-zone studio navigation (`Home -> Animation Editor -> Diagnostics -> Theme toggle`)**

- [ ] **Step 2: Run test to verify red state**

- [ ] **Step 3 (GREEN): Implement `RenderQueueWorkspace`, `AgentCenterWorkspace`, and assemble `App.tsx` inside `StudioProvider` + `WorkspaceErrorBoundary`**

- [ ] **Step 4: Run Full Verification Gate (Superpowers `verification-before-completion`):**
  1. `npm --prefix "animforge-desktop" test` -> All Vitest suites pass.
  2. `npx --prefix "animforge-desktop" tsc --noEmit` -> Zero TypeScript errors.
  3. `npm --prefix "animforge-desktop" run build` -> Clean Vite production bundle.
  4. `cargo test --manifest-path "animforge-desktop/src-tauri/Cargo.toml"` -> All Rust backend tests pass.
  5. `cargo clippy --manifest-path "animforge-desktop/src-tauri/Cargo.toml" -- -D warnings` -> Zero warnings.
  6. Desktop Accessibility & Responsive Smoke Check (`960x640` + `1280x820`, Dark + Light + High Contrast, `<gm-player>` + MP4 playback) via `chrome-devtools` / `a11y-debugging` or live Tauri window (`npm --prefix "animforge-desktop" run tauri dev`).

- [ ] **Step 5: Final Commit**

---

# TRACK B — Additive Backend & Engine Extensions (Separate M2/M3 Scope)

These features MUST NOT be faked in Track A UI. Implement each only after adding the corresponding `worker.ts` method + `worker_bridge.rs` Tauri command + `lib.rs` handler registration:

| Task | Feature Unlocked | Backend Touchpoints (`animforge-core` + `src-tauri`) |
| :--- | :--- | :--- |
| **B1** | Workspace `assets/` Scanner & File Import | Port `listAssets` & `importAsset` validation logic from `src/mcp/tools.ts` into `worker.ts` (`list_assets`, `import_asset`) -> expose `assets_list` & `asset_import` in `worker_bridge.rs`. |
| **B2** | Render History & `ffprobe` Metadata Card | Add `Database.listRenderJobs(projectId?)` in `database.ts` + `ffprobe` probe helper in `worker.ts` -> expose `render_jobs_list` & `project_probe_output` in `worker_bridge.rs`. |
| **B3** | Project Delete / Duplicate + Disk Sync | Reconcile `project_list` disk manifests alongside `projects/animforge.db`, add path-jailed `project_delete` / `project_duplicate` with confirmation check. |
| **B4** | AI Re-Plan (`StoryDirector` / `ScenePlanner`) | Expose `project_replan_storyboard` / `project_replan_scene` in `worker.ts` calling `StoryDirectorAgent` / `ScenePlannerAgent` + provider API config storage. |
| **B5** | **StretchyStudio** `.stretch` Bridge & **Remotion** Export | Add secure local bundle/iframe or side-window route for `engines/stretchystudio` + theme `postMessage` sync, and wire `RemotionAdapter.render()` selectable from UI when `engines/remotion` is healthy. |
| **B6** | Live Agent / MCP Activity Feed | Emit structured worker/MCP activity events (e.g. `animforge://mcp-log`) if user wants real-time OpenCode agent monitoring inside `Agent Center`. |

---

## Execution Handoff (After User Approves Plan)

Plan complete and saved to [REDESIGN_IMPLEMENTATION_PLAN.md](file:///Users/vipinkumar/Desktop/animator%20/AnimForgeLab/docs/redesign/REDESIGN_IMPLEMENTATION_PLAN.md). Two execution options once you give approval to proceed with implementation:

1. **Subagent-Driven (`superpowers:subagent-driven-development`)** — Dispatch fresh `invoke_subagent` worker per task with two-stage spec compliance + `ponytail-review` quality checks.
2. **Inline Session Execution (`superpowers:executing-plans`)** — Implement sequentially task-by-task in the current session with verification checkpoints after each batch.
