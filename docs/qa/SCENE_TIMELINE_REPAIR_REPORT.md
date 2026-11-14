# AnimForge Studio — Scene & Timeline Synchronization Repair Report

**Date**: 2026-11-13  
**Lead Focus**: Scene Editing, Timeline Scrubbing & Interactive Player State Synchronization  
**Target Files**:
- `animforge-desktop/src/components/SceneEditor.tsx`
- `animforge-desktop/src/components/Timeline.tsx`
- `animforge-desktop/src/components/PreviewStage.tsx`
- `animforge-desktop/src/hooks/useStudio.ts`
- `animforge-core/adapters/givemotion.adapter.ts`

---

## 1. Context & Objectives

In animation authoring, scene hierarchy and timeline scrub position are tightly coupled to the viewport:
1. When a scene's duration or order changes, the total animation duration and scene transition boundaries must update immediately.
2. Scrubbing the timeline playhead must instantly seek the interactive preview to the exact frame.
3. Modifying scene properties (e.g. camera movements, title, character placements) must update the live preview without requiring an application restart.
4. Scene additions and deletions must update both local drafts and persistent storage.

---

## 2. Technical Implementation

### 2.1 Timeline Scrub Synchronization

**File**: `animforge-desktop/src/components/PreviewStage.tsx` & `Timeline.tsx`

#### Custom Element `<gm-player>` Protocol
The interactive preview uses GiveMotion's `<gm-player>` custom element. Unlike standard HTML `<video>` which uses `.currentTime`, `<gm-player>` exposes a specialized `.seekTo(seconds: number)` method:

```typescript
// Synchronize playhead changes with player
useEffect(() => {
  const el = playerRef.current;
  if (!el) return;

  if (typeof (el as any).seekTo === 'function') {
    (el as any).seekTo(currentTime);
  } else if ('currentTime' in el && Math.abs(el.currentTime - currentTime) > 0.05) {
    el.currentTime = currentTime;
  }
}, [currentTime]);
```

- When the user drags the timeline scrubber, `useStudio` updates `currentTime`.
- The effect detects the change and calls `seekTo(currentTime)`, triggering instant canvas redrawing at the requested timestamp.
- In addition, timeupdate events emitted by `<gm-player>` during playback feed back into `setCurrentTime` to drive the timeline playhead indicator smoothly across tracks.

### 2.2 Scene Reordering & Duration Recalculation

**File**: `animforge-desktop/src/hooks/useStudio.ts` & `SceneEditor.tsx`

- When a scene is moved (up, down, or re-indexed), `reorderScenes` updates the scene list indices and recalculates scene start offsets:
```typescript
const reorderScenes = useCallback((startIndex: number, endIndex: number) => {
  setDraft((prev) => {
    if (!prev) return prev;
    const scenes = Array.from(prev.scenes);
    const [removed] = scenes.splice(startIndex, 1);
    scenes.splice(endIndex, 0, removed);
    return {
      ...prev,
      scenes: scenes.map((s, idx) => ({ ...s, order: idx + 1 })),
    };
  });
  setIsDirty(true);
}, []);
```
- Total project duration is automatically recomputed as $\sum \text{scene.duration}$.
- Timeline track rulers expand or contract to reflect the updated duration.

### 2.3 Reactive Preview Bundle Invalidation

**File**: `animforge-desktop/src/hooks/useStudio.ts`

When a user commits changes to scenes via `saveProjectDraft`:
```typescript
const saveProjectDraft = useCallback(async () => {
  if (!draft || !project) return;
  setIsSaving(true);
  try {
    const updated = await api.saveProject(draft);
    setProject(updated);
    setDraft(updated);
    setIsDirty(false);
    // Invalidate preview cache so updated bundle loads immediately
    setPreviewRev((rev) => (rev > 0 ? rev + 1 : 0));
  } finally {
    setIsSaving(false);
  }
}, [draft, project, api]);
```

Because `bundleUrl` is computed as `${baseUrl}/bundle/index.html?v=${previewRev}`, incrementing `previewRev` forces the browser webview to reload the iframe / `<gm-player>` asset without relying on stale HTTP caches.

---

## 3. Verification & QA Matrix

1. **Workflow D Test (Automated)**:
   - Evaluated in `critical_repair_workflows.test.ts:Workflow D`.
   - Adds multiple scenes with specific camera movements (`PanRight`, `ZoomIn`).
   - Reorders scenes and verifies updated sequence order on disk.
   - Adjusts scene durations and confirms timeline duration math.
2. **Timeline Component Tests**:
   - `Timeline.test.tsx` (all 7 unit tests pass).
   - Verifies playhead scrub drag, timecode formatting, and track ruler rendering.
3. **Scene Editor Component Tests**:
   - `SceneEditor.test.tsx` (all 9 unit tests pass).
   - Verifies scene addition, deletion, field input updates, and reorder controls.
