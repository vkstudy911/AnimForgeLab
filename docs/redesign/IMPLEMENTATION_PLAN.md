# AnimForge Studio — Multi-Page Redesign Implementation Plan

**Execution Mode:** Ponytail + Superpowers (`writing-plans`, `subagent-driven-development`, `test-driven-development`, `verification-before-completion`)  
**Target Reference:** Uploaded Studio Workbench Screenshot (`media_1794495119664_70dd223c.jpg`)

---

## Task Breakdown (10 Independently Testable Units)

| Task | Scope | Owner | Primary Files | Verification |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | Typed Core Contracts, `useStudio` Draft/Create Extensions & CSP-safe `useThemePreference` + Charcoal/Warm Amber `tokens.css` / `base.css` | Coordinator | `index.html`, `public/theme-init.js`, `src/types.ts`, `src/hooks/useStudio.ts`, `src/hooks/useThemePreference.ts`, `src/styles/tokens.css`, `src/styles/base.css` | `useStudio.test.ts` + `useThemePreference.test.ts` |
| **T2** | Accessible Primitives (`Icons`, `StudioDialog`, `StudioTabs`, `StatusBadge`, `WorkspaceErrorBoundary`) & Workbench `StudioContext` | Coordinator | `src/components/ui/*`, `src/context/StudioContext.tsx` | `primitives.test.tsx` + `tsc --noEmit` |
| **T3** | Global Desktop Shell (`StudioHeader` with selector/unsaved dot/top nav/Healthy/Theme/Preview/Export, `WorkspaceRail` left bar, `NewProjectDialog`, `CommandPaletteDialog`, `shell.css`) | Coordinator | `src/components/layout/*`, `src/styles/shell.css` | `WorkspaceRail.test.tsx` + `tsc --noEmit` |
| **T4** | Animation Studio Workspace (`AnimationEditor`, `SceneOutliner` Left Panel w/ Scenes\|Characters\|Assets tabs & Project Info, enhanced `PreviewStage` w/ Zoom/Safe-Zones/Transport/`Preview Ready` QA menu, `MultiTrackTimeline` bottom 4-track ruler/playhead/keyframes/audio waveform, `CueInspector` right panel) | Agent A (`studio-ui-worker`) | `src/components/timeline/*`, `src/workspaces/AnimationEditor.tsx`, `src/components/PreviewStage.tsx` | `AnimationEditor.test.tsx` + `PreviewStage.test.tsx` |
| **T5** | Management Pages (`HomeDashboard`, `ProjectManager` matching Projects+NewProject split card, `StoryScenesWorkspace` matching beat cards + scene editor, `RenderWorkspace` circular ring + live FPS/ETA + output preview, `DiagnosticsWorkspace` + `DoctorBar` reference styling) | Agent B (`management-pages-worker`) | `src/workspaces/HomeDashboard.tsx`, `ProjectManager.tsx`, `StoryScenesWorkspace.tsx`, `RenderWorkspace.tsx`, `DiagnosticsWorkspace.tsx`, `src/components/DoctorBar.tsx` | `ManagementWorkspaces.test.tsx` + `DoctorBar.test.tsx` |
| **T6** | Character Studio, Asset Library, Settings & Agent Center Pages (real `characters[]` rig parts/palette CRUD, real `assets[]` + `PreviewServer` thumbnails + scene assignment, persisted Settings, real MCP artifact/tool catalog + honest Planned states) | Agent C (`secondary-pages-worker`) | `src/workspaces/CharacterStudio.tsx`, `AssetLibrary.tsx`, `SettingsWorkspace.tsx`, `AgentCenterWorkspace.tsx` | `SecondaryWorkspaces.test.tsx` |
| **T7** | Integrate All 10 Workspaces in `App.tsx` + `main.tsx` + Responsive CSS Polish (`960x640` min, `1280x820` default, `1440+` wide) | Coordinator | `src/App.tsx`, `src/main.tsx`, `src/App.test.tsx` | All Vitest suites + `tsc --noEmit` + `vite build` |
| **T8** | Backend Compatibility & Regression Suite Verification | Coordinator | Read-only verification across `animforge-desktop` & `animforge-core` | `vitest`, `tsc`, `vite build`, `cargo test`, `cargo clippy` |
| **T9** | Live Tauri App Launch & Visual Inspection Against Reference Screenshot | Coordinator | Tauri dev/app window | Live desktop launch + DOM/visual check |
| **T10** | Final Documentation (`PAGE_IMPLEMENTATION_STATUS.md`, `FRONTEND_QA_REPORT.md`, `ANIMFORGE_PROGRESS.md`) | Coordinator | `docs/redesign/*`, `documentation/plans/ANIMFORGE_PROGRESS.md` | `git status` + checklist signoff |
