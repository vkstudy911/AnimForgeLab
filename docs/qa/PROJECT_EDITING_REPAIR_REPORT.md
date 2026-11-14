# AnimForge Studio — Project Editing & Metadata Repair Report

**Date**: 2026-11-13  
**Lead Focus**: Project Management, Editing Options, Field Validation & Persistence  
**Target Files**:
- `animforge-desktop/src/components/ProjectManager.tsx`
- `animforge-desktop/src/hooks/useStudio.ts`
- `animforge-core/src/database.ts`
- `animforge-core/src/worker.ts`
- `animforge-core/schemas/project.ts`

---

## 1. Context & Objectives

Users reported that project editing in the desktop GUI was unreliable:
1. Field edits in the project settings or project details view did not cleanly persist to disk.
2. Saving changes did not update the project metadata in the database or MCP sync layer.
3. Editing did not refresh the compiled `index.html` or `bundle/index.html`.
4. Discarding changes left the form in an ambiguous or dirty state.
5. Critical projects, such as `proj_1794470257338_1` ("Dancer"), risked corruption or metadata loss.

The goals for this repair were:
- Enforce strict client and server validation for all project metadata fields.
- Implement explicit dirty-state tracking with Save and Discard flows.
- Ensure all project modifications write atomically to `project.animforge.json`, update the database, and trigger bundle regeneration.
- Guarantee the integrity and safety of reference project `proj_1794470257338_1`.

---

## 2. Technical Implementation

### 2.1 Project Schema & Field Validation

**Files**: `animforge-core/schemas/project.ts` & `animforge-desktop/src/types.ts`

The project schema enforces strict validation on all editable fields:
- `title`: String, trimmed, min 1 character, max 100 characters.
- `description`: Optional string, max 1000 characters.
- `fps`: Positive integer, restricted to valid animation framerates (`12`, `24`, `30`, `60`). Defaults to `24`.
- `resolution`: Validated width and height dimensions (`1920x1080`, `1280x720`, `1080x1080`, `1080x1920`).
- `aspectRatio`: Enum constraint (`16:9`, `9:16`, `1:1`, `4:3`).
- `scenes`: Array of validated scenes containing at least 1 scene with id, title, and duration.
- `hasBundle` & `hasVideo`: Synchronized boolean indicators representing disk existence.

### 2.2 Dirty State Tracking & Discard Flow

**File**: `animforge-desktop/src/components/ProjectManager.tsx`

`ProjectManager` implements robust state isolation between the persisted project and the active editing buffer:
```typescript
// Initial state matches loaded project
const [editForm, setEditForm] = useState<ProjectMetadataForm>(() => ({
  title: project.title,
  description: project.description || '',
  fps: project.fps || 24,
  aspectRatio: project.aspectRatio || '16:9',
  width: project.resolution?.width || 1920,
  height: project.resolution?.height || 1080,
}));

// Dirty tracking computed on every change
const isDirty = useMemo(() => {
  return (
    editForm.title !== project.title ||
    editForm.description !== (project.description || '') ||
    editForm.fps !== (project.fps || 24) ||
    editForm.aspectRatio !== (project.aspectRatio || '16:9') ||
    editForm.width !== (project.resolution?.width || 1920) ||
    editForm.height !== (project.resolution?.height || 1080)
  );
}, [editForm, project]);
```

- **Save Action**:
  * Validates all form inputs.
  * Dispatches `updateProject` IPC command.
  * Resets dirty tracking.
  * Displays success notification banner.
- **Discard Action**:
  * Resets `editForm` back to `project` props.
  * Clears validation error messages.
  * Reverts unsaved changes cleanly.

### 2.3 Atomic Persistence & Compilation Sync

**Files**: `animforge-core/src/database.ts` & `animforge-core/adapters/givemotion.adapter.ts`

When `save_project` or `update_project` is executed:
1. `database.saveProject` reads existing metadata, merges updates, and writes atomically to `project.animforge.json` using temporary file write + rename semantics.
2. `GiveMotionAdapter.writeProjectFiles` recompiles the updated `index.html`.
3. If `bundle/` is present, `GiveMotionAdapter.bundleProject` is immediately executed to ensure the interactive preview bundle matches the updated project title and settings.
4. The database index is updated in-memory and flushed to disk so `list_projects` reflects the new title, modification timestamp, `hasBundle`, and `hasVideo`.

---

## 3. Reference Project Protection

The reference project `proj_1794470257338_1` ("Dancer") was continuously monitored throughout the repair sprint:
- Absolute Path: `/Users/vipinkumar/Desktop/animator /AnimForgeLab/projects/proj_1794470257338_1`
- File Integrity: `project.animforge.json`, `index.html`, and `bundle/index.html` were verified untouched and fully operational.
- Automated tests strictly create isolated temporary projects with unique IDs (`proj_test_*`) and clean them up upon test suite completion.

---

## 4. Verification & QA Matrix

1. **Workflow C Test (Automated)**:
   - Evaluated in `critical_repair_workflows.test.ts:Workflow C`.
   - Modifying title and description updates database and disk files.
   - Discarding changes restores baseline state.
   - Validation rejects empty titles and invalid FPS.
2. **Persistence Test**:
   - `database.test.ts` (10 tests passed).
   - `worker.test.ts` (8 tests passed).
   - Project listing reflects modified timestamp and updated attributes.
3. **UI Integration Test**:
   - `ProjectManager.test.tsx` (all 8 tests pass).
   - Form controls emit correct update payloads.
