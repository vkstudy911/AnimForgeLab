# AnimForge Studio — Project & MCP Root Cause Investigation Report

**Date:** 2026-11-13  
**Target Existing Project for Reproduction:** `proj_1794470257338_1` (Project Name: `Dancer`)  
**Workspace Root:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` *(verbatim with trailing space in parent directory preserved)*  
**Database File:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab/projects/animforge.db`

---

## Executive Summary

An investigation was conducted into the three major integration problems:
1. **Projects created via AnimForge MCP do not appear in the desktop application's Projects page without an app restart or obscure triggers.**
2. **AnimForge MCP and the desktop GUI operate independently without shared state change detection.**
3. **The desktop application does not provide a complete workflow to open, inspect, and edit existing animation projects.**

The root cause is not a split database or differing directory roots. Both the desktop Tauri worker bridge and the MCP server target the exact same directory (`AnimForgeLab/projects`) and the exact same SQLite database (`AnimForgeLab/projects/animforge.db`). Rather, the breakdown stems from **lack of reactivity/refresh in the desktop GUI**, **one-way database queries that ignore disk state**, **missing artifact probing upon project load**, and **absence of concurrent change detection/reconciliation**.

---

## Detailed Investigation: Answers to the 10 Diagnostic Questions

### 1. Where does MCP create projects?
- **Source Location:** `AnimForgeLab/animforge-core/src/mcp/tools.ts:98-107, 248-254`
- **Resolution:**
  ```ts
  this.projectsRoot = resolveWorkspacePath(this.workspaceDir, 'projects');
  this.db = new AnimForgeDatabase(path.join(this.projectsRoot, 'animforge.db'));
  ```
- **Creation Flow:** When `createProject` is called, MCP delegates to `this.pipeline.planProject()`, writes disk assets (`projects/<id>/project.animforge.json`, `scenes/`, `assets/`, `index.html`) via `GivemotionAdapter.saveProjectState()`, and commits the metadata row to SQLite `animforge.db` via `this.db.saveProject(project)`.
- **Finding:** MCP creates projects in the canonical shared workspace root both on disk and in SQLite.

### 2. Where does the desktop GUI search for projects?
- **Source Location:**
  - Frontend Hook: `AnimForgeLab/animforge-desktop/src/hooks/useStudio.ts:138-146, 190-206`
  - Tauri Command: `AnimForgeLab/animforge-desktop/src-tauri/src/worker_bridge.rs:850-858`
  - Worker RPC: `AnimForgeLab/animforge-core/src/worker.ts:380-382`
  - Database Query: `AnimForgeLab/animforge-core/src/database.ts:105-128`
- **Query Flow:** The desktop GUI invokes Tauri command `project_list`, which calls worker method `list_projects`, which invokes `db.listProjects()` executing:
  ```sql
  SELECT data FROM projects ORDER BY updated_at DESC
  ```
- **Finding:** The desktop GUI searches the exact same SQLite database file as MCP.

### 3. Do both use the same project root?
- **Source Location:**
  - MCP: `AnimForgeLab/animforge-core/src/mcp/tools.ts:98` (`resolveWorkspacePath(this.workspaceDir, 'projects')`)
  - Desktop Tauri: `AnimForgeLab/animforge-desktop/src-tauri/src/lib.rs:176-190` & `worker_bridge.rs:107-111`
  - Desktop Worker: `AnimForgeLab/animforge-core/src/worker.ts:302` (`resolveWorkspacePath(workspaceDir, 'projects')`)
- **Finding:** **YES.** Both resolve to `/Users/vipinkumar/Desktop/animator /AnimForgeLab/projects`. Path traversal and the trailing space in `animator ` are preserved identically across both subsystems.

### 4. Do both use the same project schema?
- **Source Location:**
  - Canonical Schema: `AnimForgeLab/animforge-core/schemas/index.ts:10-150` (`ProjectSchema`, `DiskManifestSchema`)
  - MCP Usage: `AnimForgeLab/animforge-core/src/mcp/tools.ts:36-40`
  - Worker Usage: `AnimForgeLab/animforge-core/src/worker.ts:25-35`
- **Finding:** **YES.** Both validate projects with `ProjectSchema.parse()` and `ProjectSchema.safeParse()`. All 4 existing projects in `animforge.db` validate cleanly against `ProjectSchema`.

### 5. Does GUI use mock data instead of real backend results?
- **Source Location:** `AnimForgeLab/animforge-desktop/src/hooks/useStudio.ts:136-157` & `ProjectManager.tsx:117-130`
- **Finding:** **NO.** The GUI does not use hardcoded mock project lists. It stores real backend results returned by `invoke('project_list')`.
- **THE FLAW:** `useStudio.ts` only invokes `project_list` **ONCE** on initial mount (`loadInitial`). `ProjectManager.tsx` contained **zero** `useEffect` to re-fetch projects when navigating to the Projects page, and there was **no manual Refresh button** in the Projects workspace. Consequently, when MCP creates a project (such as `proj_cute_boy_dance`), the running desktop GUI remains stale until app restart.

### 6. Does MCP maintain separate in-memory project state?
- **Source Location:** `AnimForgeLab/animforge-core/src/mcp/tools.ts:83-107`
- **Finding:** **NO.** MCP does not cache project states in memory. Every tool call reads from `this.db.getProject(safeId)` or disk. However, MCP runs in an independent Node process with its own SQLite connection (`DatabaseSync`), so mutations by MCP do not emit OS or IPC events to Tauri.

### 7. Does project listing filter out valid projects?
- **Source Location:** `AnimForgeLab/animforge-core/src/database.ts:105-129` & `useStudio.ts:144-146`
- **Finding:**
  1. `db.listProjects()` strictly queries SQLite rows. Any project present on disk in `projects/<id>/project.animforge.json` that was not inserted into SQLite is completely invisible to `listProjects`.
  2. In `useStudio.ts:144`, `if (projectSeqRef.current === 0) setProjects(list);` prevents updating if `projectSeqRef` had incremented.
  3. In `ProjectManager.tsx`, filter dropdowns (`statusFilter`, `query`) filter client-side.

### 8. Does opening a project load its real scenes and assets?
- **Source Location:**
  - `AnimForgeLab/animforge-core/src/worker.ts:238-296` (`loadProjectFromDbOrDisk`)
  - `AnimForgeLab/animforge-desktop/src/hooks/useStudio.ts:208-233` (`selectProject`)
  - `AnimForgeLab/animforge-desktop/src/context/StudioContext.tsx:662-680` (`openProject`)
- **Finding:**
  1. `loadProjectFromDbOrDisk` loads the real scenes, characters, and assets.
  2. **CRITICAL DEFECT:** In `worker.ts:243`, `if (fromDb) return fromDb;`. If SQLite has an older record, it ignores disk edits (even if `project.animforge.json` has a newer modification timestamp).
  3. **CRITICAL ARTIFACT DEFECT:** In `useStudio.ts:216-220`, when opening a project, `previewRev` and `videoRev` are reset to `0`. `bundleUrl` and `videoUrl` only activate when `previewRev > 0` or `videoRev > 0`. Even though `Dancer` and `proj_cute_boy_dance` have existing `bundle/index.html` and `output.mp4` on disk, the UI shows a blank "Click Preview Bundle to compile..." empty state.
  4. **MISSING EDITING PANEL:** In `ProjectManager.tsx`, the right sidebar was hardcoded to "New Project". Selecting an existing project card had no "Edit Project Properties" (name, prompt, dimensions, FPS, engine) panel.

### 9. Are project updates persisted to the same project storage?
- **Source Location:**
  - Desktop Worker: `AnimForgeLab/animforge-core/src/worker.ts:341-353` (`persistFullProject`)
  - MCP: `AnimForgeLab/animforge-core/src/mcp/tools.ts:170-179` (`persistProject`)
- **Finding:** **YES.** Both write to disk via `adapter.saveProjectState()` and SQLite via `db.saveProject()`. However, neither checks for concurrent modification before saving, leading to silent overwrite risks.

### 10. Are there stale caches or state synchronization issues?
- **Source Location:**
  - `useStudio.ts:130-158` (stale `projects` list, no polling/window focus/navigation refresh)
  - `StudioContext.tsx:553-558` (isDirty comparison based on stale in-memory activeProject)
  - `worker.ts:243-246` (SQLite shadows newer disk manifests)
  - `database.ts:105-128` (SQLite omits disk projects)
- **Finding:** **YES.** The desktop frontend is completely disconnected from external updates made by MCP or disk file changes until explicitly commanded to synchronize.

---

## Reproduction with Target Project: `proj_1794470257338_1` ("Dancer")

### Verification of Existing Project Data
Direct diagnostic inspection confirmed:
- **SQLite Database:** Row exists in `AnimForgeLab/projects/animforge.db` with `id = 'proj_1794470257338_1'`, `name = 'Dancer'`, `updated_at = '2026-11-12T08:57:16.095Z'`.
- **Disk Directory:** `AnimForgeLab/projects/proj_1794470257338_1/` contains:
  - `project.animforge.json` (6,772 bytes, valid Zod DiskManifest)
  - `index.html` (13,618 bytes)
  - `givemotion.json`
  - `bundle/index.html` (878,661 bytes)
  - `bundle/gm-player.js` (10,168 bytes)
  - `bundle/player.html` (391 bytes)
- **Scenes:** 3 valid scenes (`scene_1_stage_lights`, `scene_2_solo_spin`, `scene_3_grand_finale`).
- **Characters:** 1 valid character (`char_pip`).

### Observed Reproduction Failures
1. **List Stagnation:** When MCP creates a new project while desktop GUI is open, `projects` state remains frozen with the 4 initial projects; newly created projects never appear without triggering a project rename or restart.
2. **Preview Blankness on Open:** Selecting `proj_1794470257338_1` loads the project data into state, but sets `previewRev = 0` and `videoRev = 0`, causing the Preview stage to display "No bundle compiled yet" despite `bundle/index.html` already existing on disk.
3. **Missing Project Metadata Editing:** There is no dedicated editing panel to modify `Dancer`'s name, prompt, canvas width/height, FPS, or preferred engine directly from the Projects workspace.
4. **Unidirectional Load:** If `proj_1794470257338_1/project.animforge.json` is modified directly on disk or via external script, `loadProjectFromDbOrDisk` serves the stale SQLite blob without detecting the disk timestamp change.

---

## Action Plan for Architectural Fixes

1. **Two-Way Database & Disk Reconciliation (`database.ts` & `worker.ts`):**
   - Enhance `listProjects(projectsRoot?: string)` to scan `projects/` for any directories containing `project.animforge.json`, reconcile missing or newer disk projects into SQLite, and return unified project summaries.
   - Enhance `loadProjectFromDbOrDisk` to compare disk file `mtime` with SQLite `updated_at` and ingest newer disk manifests.
2. **Desktop GUI Auto-Refresh & Manual Refresh (`ProjectManager.tsx` & `useStudio.ts`):**
   - Add `useEffect` on mount of `ProjectManager` and when navigating to `#projects` to invoke `refreshProjects()`.
   - Add a prominent, accessible **Refresh Projects** button with loading/spinning state in the Projects workspace toolbar.
   - Add a window `focus` event listener in `StudioContext` / `useStudio` to gently refresh project listings when returning to the AnimForge window.
3. **Artifact Detection on Project Load (`useStudio.ts`):**
   - Probe for existing `bundle/index.html` and `output.mp4` when a project is selected; initialize `previewRev = 1` and/or `videoRev = 1` if artifacts exist so the preview stage immediately renders existing bundles.
4. **Complete Project Editing Workflow (`ProjectManager.tsx` & `StudioContext.tsx`):**
   - Implement an **Edit Project Details** mode in `ProjectManager` sidebar allowing direct edits to project name, prompt, dimensions, FPS, and preferred engine.
   - Add an **Edit Project** button on every project card.
   - Ensure saving persists both to disk and SQLite with external conflict detection.
