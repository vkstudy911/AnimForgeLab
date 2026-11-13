# AnimForge Studio — Phase 2 Master Implementation Plan
## Four-Agent Parallel Development Architecture & Shared Contracts

**Created:** 2026-11-13  
**Status:** In Execution  
**Architecture Owner:** Main Orchestrator  
**Baseline Verified Commit:** `42afe35` (Phase 1 Complete)

---

## 1. Shared Architecture Contract

All four development agents must strictly honor the canonical data structures and API boundaries defined in `src/types.ts` and `src/context/StudioContext.tsx`. No agent may invent competing data models or alter core schemas without Orchestrator coordination.

### 1.1 Data Model Contracts (`src/types.ts`)
1. **`ProjectDetail`**:
   - `id: string` (canonical format `proj_*`)
   - `name: string`, `prompt: string`
   - `width: number`, `height: number`, `fps: number`
   - `preferredEngine: 'givemotion' | 'remotion' | 'stretchystudio' | 'composite'`
   - `status: string` (`'scenes_planned' | 'rendered' | 'failed' | ...`)
   - `storyboard?: Storyboard`
   - `characters: CharacterItem[]`
   - `assets: AssetItem[]`
   - `scenes: SceneDetail[]`
   - `createdAt: string`, `updatedAt: string`
2. **`SceneDetail`**:
   - `id: string` (canonical format `scene_*`)
   - `sequenceIndex: number` (0-based scene order)
   - `title: string`, `description: string`, `duration: number`
   - `backgroundAssetId?: string`
   - `characterIds: string[]`
   - `timeline: AnimationTimeline` (characterActions, cameraMoves, audioTracks)
   - `transition: SceneTransition` (`type: 'none' | 'fade' | 'wipe' | 'slide' | 'dissolve'`, `duration: number`)
3. **`CharacterItem`**:
   - `id: string` (`char_*`), `name: string`, `description: string`
   - `parts: CharacterPart[]` (`pivot: { x: number; y: number }`, `zIndex: number`, `layerName: string`)
   - `colorPalette: string[]`
4. **`AssetItem`**:
   - `id: string`, `name: string`, `type: AssetType` (`'background' | 'character' | 'prop' | 'audio' | 'font' | 'model' | 'reference'`)
   - `uri: string`, `mimeType?: string`, `metadata: Record<string, unknown>`

### 1.2 State & Persistence Strategy (`StudioContext.tsx`)
- **Single Source of Truth**: Active mutable draft is managed via `useStudioContext()`.
- **Immutable Draft Updates**: Agents MUST update project data via `updateDraft((prev) => ({ ...prev, ... }))`.
- **Draft Persistence**: Save via `saveDraft()`. Discard via `discardDraft()`.
- **Dirty Guard**: `isDirty` indicates unsaved changes. Navigation between projects guards dirty drafts.
- **Selection State**: `selection: StudioSelection | null` drives Zone 4 Cue Inspector and contextual highlights.

### 1.3 Shared UI Component Primitives
Agents MUST use the existing design system primitives from `src/components/ui/`:
- `<StudioButton variant="primary" | "secondary" | "ghost" | "danger" size="sm" | "md" icon={...} loading={...} />`
- `<StudioTooltip content="..." position="top" | "bottom" | "left" | "right">...</StudioTooltip>`
- `<StudioNotification type="info" | "success" | "warning" | "error" title="..." message="..." onDismiss={...} />`
- `<StudioDialog open={...} title="..." onClose={...} preventEscapeWhenDirty={...}>...</StudioDialog>`
- `<StudioTabs label="..." tabs={[{ id, label, content }]} />`
- `<NumericInput value={...} onChange={...} min={...} max={...} step={...} />`
- `<StatusBadge tone="pass" | "warn" | "fail" | "neutral" | "planned">...</StatusBadge>`
- `<WorkspaceErrorBoundary workspaceName="...">...</WorkspaceErrorBoundary>`

---

## 2. Four-Agent Distribution & File Ownership Matrix

Strict non-overlapping file ownership prevents merge conflicts and race conditions.

| Agent | Role | Owned Workspaces | Owned Files | Verification Target |
| :--- | :--- | :--- | :--- | :--- |
| **Agent 1** | Workspace & Dashboard Specialist | Home Dashboard, Projects, Settings | `src/workspaces/HomeDashboard.tsx`<br>`src/workspaces/ProjectManager.tsx`<br>`src/workspaces/SettingsWorkspace.tsx` | `ManagementWorkspaces.test.tsx` |
| **Agent 2** | Story, Scenes & Character Specialist | Story & Scenes, Character Studio | `src/workspaces/StoryScenesWorkspace.tsx`<br>`src/workspaces/CharacterStudio.tsx` | `StoryScenesWorkspace` & `CharacterStudio` tests |
| **Agent 3** | Animation Engine & Timeline Specialist | Animation Studio (NLE, Timeline, Inspector, Outliner) | `src/workspaces/AnimationEditor.tsx`<br>`src/components/timeline/MultiTrackTimeline.tsx`<br>`src/components/timeline/CueInspector.tsx`<br>`src/components/timeline/SceneOutliner.tsx` | `AnimationEditor.test.tsx`<br>`PreviewStage.test.tsx` |
| **Agent 4** | Asset, Rendering & Agent Systems Specialist | Asset Library, Render & Export, Agent Center, Diagnostics | `src/workspaces/AssetLibrary.tsx`<br>`src/workspaces/RenderWorkspace.tsx`<br>`src/workspaces/AgentCenterWorkspace.tsx`<br>`src/workspaces/DiagnosticsWorkspace.tsx` | `SecondaryWorkspaces.test.tsx` |
| **Orchestrator** | Architecture, Contracts & Integration | All Shared Infrastructure | `src/types.ts`, `src/hooks/*`, `src/context/*`, `src/components/ui/*`, `src/components/layout/*`, `src/App.tsx`, `src-tauri/*`, `animforge-core/*`, `docs/*` | Full integration suite |

---

## 3. Detailed Agent Task Breakdown

### AGENT 1: Workspace & Dashboard Specialist
1. **Home Dashboard (`HomeDashboard.tsx`)**:
   - Add Project Statistics banner (Total Projects, Scenes Planned, Rendered/Completed, Storage estimate).
   - Add Recent Activity feed tracking last modified time, engine preference, and status badges.
   - Refine Quick-Start template cards with one-click creation into active studio.
   - Clean empty state with CTA to create the first animation project.
2. **Projects Workspace (`ProjectManager.tsx`)**:
   - Sorting dropdown (Modification Date: Newest first / Oldest first; Name: A-Z / Z-A).
   - Enhanced search and category filters.
   - Project cards with resolution, FPS, engine badges, SVG scene thumbnail, inline rename, duplicate, delete with confirmation modal, and reveal folder.
   - Embedded New Project form with field validation, presets, and polite announcements.
3. **Settings Workspace (`SettingsWorkspace.tsx`)**:
   - Appearance preference (dark / light / system) with instant preview.
   - Density override (`compact` / `comfortable`) applying `:root[data-density="compact"]`.
   - Animation defaults (Default FPS, default resolution/aspect, default engine).
   - Export defaults (output format, quality, folder location).
   - Storage configuration status & disk persistence (`config_get` / `config_save`).
   - "Settings Saved" notification using `<StudioNotification />`.

### AGENT 2: Story, Scenes & Character Specialist
1. **Story & Scenes (`StoryScenesWorkspace.tsx`)**:
   - Storyboard editor with Logline, Art Style, and individual Story Beat cards.
   - Beat management: Add beat, edit visual summary, character interactions, camera notes, target duration.
   - One-click "Create Scene from Beat" generating a scene draft.
   - Scene sequence manager: Reorder (Up/Down), Add scene, Duplicate scene, Delete scene.
   - Character assignment to scenes: Multi-select checkboxes assigning cast members to `scene.characterIds`.
   - Scene background asset selector linking project assets.
   - Direct scene-to-scene jump buttons.
2. **Character Studio (`CharacterStudio.tsx`)**:
   - Cast roster: Add character, duplicate, delete, search.
   - Character profile: Name, description, interactive color palette swatches with color picker.
   - SVG Rig Schematic: Interactive draggable body part pivots with keyboard arrow nudges and coordinate clamping.
   - Rig parts manager: Add part, edit name, layerName, zIndex, and hierarchy.
   - Expressions & Poses presets (Happy, Surprised, Neutral, Walk, Run, Wave).
   - Character scene appearance assignment (toggle which scenes character appears in).
   - JSON export and schema-validated JSON import.

### AGENT 3: Animation Engine & Timeline Specialist
1. **Multi-Track Timeline (`MultiTrackTimeline.tsx`)**:
   - 4 Track lanes: Scenes, Character Actions, Camera Moves, Audio Tracks.
   - Playhead scrub with millimeter time ruler and formatted timecode (`00:04.2 / 00:12.0`).
   - Magnet snapping with toggle (`snapEnabled`).
   - Track visibility toggle (Eye/EyeOff) and Track lock toggle (Lock/Unlock).
   - Clip selection, drag-to-move, edge-drag-to-resize, and clip split at playhead (`ScissorsIcon`).
   - Keyframe markers: Visual diamond keyframe dots on action and camera spans.
   - Add/delete keyframes at current playhead position.
2. **Cue Inspector (`CueInspector.tsx`)**:
   - Scene properties: Title, description, duration, transition type, transition duration.
   - Character Action properties: Action name, character selector, start time, duration, and Transform controls (Position X/Y, Scale, Rotation, Opacity).
   - Keyframe editing: Value interpolation (linear, ease-in, ease-out, ease-in-out), easing curves.
   - Camera controls: Type (pan, zoom, push, pull, dolly, shake), start/end coordinates and zoom levels.
   - Audio track properties: Asset selector, start time, volume slider, loop toggle, mute toggle.
3. **Scene Outliner (`SceneOutliner.tsx`)**:
   - Hierarchy tree: Scenes with sequence index, duration, character presence pills.
   - One-click seek playhead to scene start.
   - Duplicate, delete, and inline rename scene.
   - Characters and Assets tabs.

### AGENT 4: Asset, Rendering & Agent Systems Specialist
1. **Asset Library (`AssetLibrary.tsx`)**:
   - Category filtering: All, Background, Character, Prop, Audio, Video, Font, Reference.
   - Native file upload and Drag-and-Drop dropzone (`.png`, `.jpg`, `.svg`, `.mp3`, `.wav`, `.mp4`, `.webm`).
   - Thumbnail previews via sandboxed `PreviewServer` loopback.
   - Audio playback controls and video preview modal.
   - Asset metadata inspector (file size, dimensions, format, date).
   - Asset rename and delete with automatic scene cleanup.
2. **Render & Export (`RenderWorkspace.tsx`)**:
   - Resolution presets (1080p, 4K, 720p, vertical 9:16, square 1:1).
   - FPS selection (24, 30, 60), quality presets (Draft, Standard, High).
   - Format selection (MP4 H.264, WebM VP9).
   - Circular animated progress ring bound to live `animforge://render-progress` events (phase, FPS, ETA).
   - Cancellation trigger (`project_cancel_render`).
   - Output video player with `ffprobe` stream metadata inspection.
   - Persistent SQLite render jobs history with Retry and Reveal Output.
3. **Agent Center (`AgentCenterWorkspace.tsx`)**:
   - Active project artifact inspector (storyboard, beats, characters, scenes).
   - OpenCode MCP stdio server integration with copyable command.
   - 16-tool interactive catalog with parameter schemas and health status.
   - Deterministic agent runners: StoryDirector, CharacterManager, ScenePlanner with inline confirmation.
   - Agent execution history log and telemetry details.
4. **Diagnostics Workspace (`DiagnosticsWorkspace.tsx`)**:
   - Live loopback PreviewServer connection probe (`probe_preview_server`) with latency measurement.
   - Full 10-category native Rust Doctor checks via `DoctorBar`.
   - System storage health: Workspace root, SQLite database size, free disk space via `statvfs`.
   - Diagnostic report generation & clipboard copy.

---

## 4. Verification Plan

All agents must achieve:
1. `npm --prefix animforge-desktop test` — All Vitest test suites PASS.
2. `npm --prefix animforge-desktop run typecheck` — 0 TypeScript errors.
3. `npm --prefix animforge-desktop run build` — Clean production Vite build.
4. `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` — 0 warnings.
5. `cargo test --manifest-path src-tauri/Cargo.toml` — 19/19 tests PASS.
6. `npm --prefix animforge-core run typecheck && npm test` — 31/31 unit tests PASS.
7. Visual verification across all 10 workspaces in Dark and Light themes.
