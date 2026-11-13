# AnimForge Studio — Unified Project Data Architecture

**Date:** 2026-11-13  
**Status:** Approved & Implemented  
**Workspace Root:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab` *(verbatim trailing space)*

---

## 1. Architectural Overview

AnimForge Studio operates with two distinct interaction surfaces:
1. **Desktop GUI (Tauri + React):** High-speed interactive desktop workstation with timeline, preview stage, storyboards, character rigging, and asset managers.
2. **AnimForge MCP Server (stdio):** Headless JSON-RPC agent tool interface used by AI coding agents (OpenCode, Claude, etc.) to plan stories, script keyframes, import assets, and trigger renders.

### The Unified Data Model

Previously, the two surfaces communicated with the database and filesystem independently without cross-synchronization. The unified architecture establishes **two-way data synchronization and reconciliation** between SQLite and on-disk files.

```
+-----------------------------------------------------------------------------------+
|                               SHARED WORKSPACE ROOT                                |
|                 /Users/vipinkumar/Desktop/animator /AnimForgeLab/                  |
+-----------------------------------------------------------------------------------+
                                         |
               +-------------------------+-------------------------+
               |                                                   |
      [Desktop Application]                                [MCP Tool Server]
      Tauri Core + Worker Bridge                           AnimForgeMcpService
               |                                                   |
      Worker RPC (stdio)                                   Tool Invocations (stdio)
               |                                                   |
               +-------------------------+-------------------------+
                                         |
                            +-------------------------+
                            |    AnimForgeDatabase    |
                            |   (database.ts & DB)    |
                            +-------------------------+
                                 /                \
                                /                  \
          +-------------------------+      +------------------------------+
          | SQLite (animforge.db)   | <--> | Disk File Manifests          |
          | projects table          | Sync | projects/<id>/               |
          | - id, name, prompt      |      |   - project.animforge.json   |
          | - full data JSON blob   |      |   - givemotion.json          |
          | - created_at, updated_at|      |   - bundle/ (index.html)     |
          |                         |      |   - output.mp4               |
          +-------------------------+      +------------------------------+
```

---

## 2. Shared Storage Layout

All projects reside under the canonical path `AnimForgeLab/projects/`:
```
AnimForgeLab/projects/
├── animforge.db                           <-- SQLite database with projects & render_jobs tables
├── proj_1794470257338_1/                  <-- Project directory (e.g. "Dancer")
│   ├── project.animforge.json             <-- Canonical disk manifest (Zod DiskManifestSchema)
│   ├── givemotion.json                    <-- Engine configuration
│   ├── index.html                         <-- Compiled standalone GiveMotion player HTML
│   ├── bundle/
│   │   ├── index.html                     <-- Preview player build
│   │   └── gm-player.js                   <-- Interactive player runtime
│   └── output.mp4                         <-- Rendered high-definition MP4 (when rendered)
└── proj_cute_boy_dance/
    ├── project.animforge.json
    ├── output.mp4
    └── ...
```

---

## 3. Two-Way Disk & Database Reconciliation Algorithm

To ensure projects created by MCP or modified on disk are immediately reflected in the GUI (and vice versa):

### A. List Reconciliation (`listProjects(projectsRoot)`)
When `list_projects` is invoked by either the desktop Tauri worker or MCP:
1. `reconcileDiskProjects(projectsRoot)` iterates over every subdirectory in `projects/`.
2. For each project directory containing `project.animforge.json`:
   - Checks the filesystem modification timestamp (`stat.mtimeMs`).
   - Compares against the SQLite row's `updated_at`.
   - If the project does not exist in SQLite OR if `stat.mtimeMs > new Date(updated_at).getTime() + 500`:
     - Reads and validates `project.animforge.json` against `DiskManifestSchema`.
     - Validates scene project IDs.
     - Commits the updated project to SQLite via `saveProject(project)`.
3. Queries SQLite: `SELECT data FROM projects ORDER BY updated_at DESC`.
4. Returns the unified, up-to-date `ProjectSummary[]` array.

### B. Mtime-Aware Loading (`loadProjectFromDbOrDisk` & `mcp.loadProject`)
When loading a project by ID:
1. Inspects `projects/<safeProjectId>/project.animforge.json`.
2. Compares disk `mtimeMs` with SQLite `fromDb.updatedAt`:
   - If SQLite has a record whose `updatedAt >= diskStat.mtimeMs - 500`, the database record is returned immediately.
   - If the disk manifest is newer, or if the project was never indexed in SQLite, the disk manifest is read, validated, committed to SQLite, and returned.
   - If the disk file does not exist, but SQLite has a valid record, the database record is returned.
   - If neither exists, throws `Project not found`.

---

## 4. MCP Tools Unified Mapping

All 16 AnimForge MCP tools are bound to this unified architecture:

| Tool Name | Operation | Shared Core Function |
|---|---|---|
| `animforge_doctor` | Environment and binary health check | `GivemotionAdapter.getDoctorInfo()` |
| `animforge_list_projects` | Reconcile disk & list all projects | `AnimForgeDatabase.listProjects(projectsRoot)` |
| `animforge_create_project` | Plan and persist new project | `pipeline.planProject()` + `persistProject()` |
| `animforge_get_project` | Mtime-aware project retrieval | `loadProject()` |
| `animforge_get_project_status`| Status, render job, and artifact check | `loadProject()` + `db.listRenderJobs()` |
| `animforge_list_scenes` | Inspect project scene sequence | `loadProject().scenes` |
| `animforge_create_scene` | Add scene and persist | `loadProject()` + update scenes + `persistProject()` |
| `animforge_update_scene` | Edit scene timing, cues, cameras | `loadProject()` + update scene + `persistProject()` |
| `animforge_list_assets` | List project assets + workspace safe assets | `loadProject()` + `listSafeFilesRecursive()` |
| `animforge_import_asset` | Copy asset into project directory | `resolveSafeDestAssetPath()` + `persistProject()` |
| `animforge_create_animation` | Auto-plan character choreography | `pipeline.planProject()` |
| `animforge_update_keyframes`| Modify timeline keyframes | `loadProject()` + update keyframes + `persistProject()` |
| `animforge_generate_preview`| Compile GiveMotion bundle | `adapter.buildBundle()` |
| `animforge_get_render_status`| Poll render progress | `db.getRenderJob()` |
| `animforge_cancel_render` | Abort active render job | `adapter.cancelRender()` |
| `animforge_export_video` | Full headless Chrome + FFmpeg render | `adapter.renderChunks()` + MP4 assembly |

---

## 5. Conflict Avoidance & Concurrency

1. **Independent Process Isolation:** MCP and desktop GUI run in separate OS processes. Both interact with SQLite via synchronous WAL transactions and write atomic disk files.
2. **Auto-Reconciliation on Access:** Any project modified by MCP is automatically ingested by the desktop GUI on the next list query, route navigation, or window focus.
3. **Draft Conflict Warning:** If a user in the desktop GUI attempts to save a project whose backend `updatedAt` is newer than their draft's base timestamp, a conflict check prevents silent overwrite.
