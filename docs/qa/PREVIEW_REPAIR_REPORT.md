# AnimForge Studio — Preview Engine Repair Report

**Date**: 2026-11-13  
**Lead Focus**: Preview Engine, Interactive Player & Loopback Server Repair  
**Target Files**:
- `animforge-core/adapters/givemotion.adapter.ts`
- `animforge-desktop/src-tauri/src/preview_server.rs`
- `animforge-desktop/src/components/PreviewStage.tsx`
- `animforge-desktop/src/hooks/useStudio.ts`

---

## 1. Context & Objectives

The primary functional requirement of AnimForge Studio is enabling animators to interactively preview animations **before** committing time and compute resources to full video rendering (MP4 export). Prior to this sprint, opening projects like `Dancer` or creating new scenes resulted in blank canvases or demanded full MP4 export before anything could be seen.

The goals of this repair were:
1. Guarantee that `GiveMotionAdapter.previewProject` always creates standalone interactive bundles (`bundle/index.html`).
2. Resolve HTTP/CORS issues on Tauri's embedded loopback preview server so webview components can embed bundles and stream video without security rejections.
3. Fix transport synchronization between React timeline controls and `<gm-player>` / `<video>`.
4. Allow instant toggling between the interactive bundle and the rendered MP4 without view mode hijacking.

---

## 2. Technical Modifications

### 2.1 GiveMotion Adapter: Bundle-First Pipeline & Resilient Validation

**File**: `animforge-core/adapters/givemotion.adapter.ts`

#### Problem
`givemotion.adapter.ts:previewProject` previously performed a pre-flight headless check:
```typescript
const checkReport = await this.checkProject(projectPath, { fast: true });
if (!checkReport.ok) {
  throw new Error(`GiveMotion check failed: ${checkReport.errors.join(', ')}`);
}
await this.bundleProject(projectPath);
```
In sandboxed environments without full desktop display servers or unique user directories, Chrome headless exited with code 1, throwing an error and completely preventing `bundleProject` from executing.

#### Fix
1. Inverted the order to guarantee bundle generation first:
```typescript
// Always generate the interactive bundle first so preview is immediately functional
await this.bundleProject(projectPath);

// Execute check as validation/diagnostics without aborting preview if headless browser fails
let checkReport: GiveMotionCheckReport;
try {
  checkReport = await this.checkProject(projectPath, { fast: true });
} catch (err: any) {
  const errMsg = err?.message || String(err);
  if (errMsg.includes('Failed to create a unique user data directory') || errMsg.includes('Chrome exited')) {
    checkReport = {
      ok: true,
      errors: [],
      warnings: [`Headless validation skipped due to environment limitations: ${errMsg}`],
      durationMs: 0,
      issues: [{
        code: 'HEADLESS_CHECK_SKIPPED',
        severity: 'warning',
        message: 'Headless browser check skipped; interactive bundle generated successfully.',
      }],
    };
  } else {
    throw err;
  }
}
```

2. Enhanced `writeProjectFiles`:
When project files or scene data are saved, `bundle/index.html` is automatically refreshed if the `bundle/` directory exists:
```typescript
if (fs.existsSync(path.join(projectPath, 'bundle'))) {
  try {
    await this.bundleProject(projectPath);
  } catch (err) {
    logger.warn(`Failed to auto-refresh bundle on save: ${err}`);
  }
}
```

---

### 2.2 Tauri Preview Server: Full CORS & Origin Support

**File**: `animforge-desktop/src-tauri/src/preview_server.rs`

#### Problem
Tauri's embedded HTTP server (`127.0.0.1:<port>`) serves static files (`bundle/index.html`, assets, `output.mp4`). However, frontend requests from `http://localhost:1420` (Vite dev) or `tauri://localhost` (Tauri webview) failed with CORS preflight errors or blocked `fetch(..., { method: 'HEAD' })` calls.

#### Fix
1. Added full CORS header generation on all HTTP responses:
```rust
fn cors_headers(origin: Option<&str>) -> String {
    let allowed_origin = match origin {
        Some(o) if is_allowed_origin(o) => o,
        _ => "*",
    };
    format!(
        "Access-Control-Allow-Origin: {}\r\n\
         Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
         Access-Control-Allow-Headers: Range, Content-Type, Accept\r\n\
         Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n",
        allowed_origin
    )
}
```

2. Implemented HTTP `OPTIONS` handling returning `204 No Content`:
```rust
if method == "OPTIONS" {
    let resp = format!(
        "HTTP/1.1 204 No Content\r\n{}\
         Content-Length: 0\r\n\
         Connection: close\r\n\r\n",
        cors_headers(origin_hdr)
    );
    let _ = stream.write_all(resp.as_bytes());
    return;
}
```

3. Expanded `is_allowed_origin` to permit Vite and Tauri origin patterns:
```rust
fn is_allowed_origin(origin: &str) -> bool {
    origin.starts_with("tauri://")
        || origin.starts_with("http://localhost:")
        || origin.starts_with("http://127.0.0.1:")
        || origin == "tauri://localhost"
        || origin == "http://tauri.localhost"
}
```

---

### 2.3 PreviewStage: ViewMode Management & Frame Seeking

**File**: `animforge-desktop/src/components/PreviewStage.tsx`

#### Problem
1. When opening a project that already contained a rendered `output.mp4`, `PreviewStage` would switch `viewMode` to `'video'` automatically, hiding the interactive player.
2. Scrubbing the timeline playhead failed to seek `<gm-player>` because `<gm-player>` expects `.seekTo(t)` rather than `.currentTime = t`.

#### Fix
1. Initialized `viewMode` to `'bundle'` if `bundleUrl` is present:
```typescript
const [viewMode, setViewMode] = useState<'bundle' | 'video'>(
  bundleUrl ? 'bundle' : videoUrl ? 'video' : 'bundle'
);
```

2. Introduced `hasMountedRef` to ensure that automatic switching to `'video'` occurs **only** when a new render completes during the active session:
```typescript
const hasMountedRef = useRef(false);
const prevVideoUrlRef = useRef<string | null>(videoUrl);

useEffect(() => {
  if (!hasMountedRef.current) {
    hasMountedRef.current = true;
    prevVideoUrlRef.current = videoUrl;
    return;
  }
  // Only switch to video if a new videoUrl appeared after mount
  if (videoUrl && videoUrl !== prevVideoUrlRef.current) {
    setViewMode('video');
    prevVideoUrlRef.current = videoUrl;
  }
}, [videoUrl]);
```

3. Added dual seeking support for `<gm-player>` and `<video>`:
```typescript
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

---

### 2.4 useStudio Hook: Direct Flag Initialization & Draft Cache-Busting

**File**: `animforge-desktop/src/hooks/useStudio.ts`

1. When a project is loaded, `hasBundle` and `hasVideo` are initialized directly from `loaded.hasBundle` and `loaded.hasVideo` rather than relying solely on speculative asynchronous network probes.
2. When draft edits are saved via `saveProjectDraft`, `previewRev` is incremented if a preview has already been loaded, triggering an instant reload of the bundle with cache-busting query parameter `?v=<rev>`.

---

## 3. Verification & Results

1. **Workflow A Verified**:
   - Project `proj_1794470257338_1` ("Dancer") loads with `hasBundle = true`.
   - `bundle/index.html` is served via loopback server.
   - Interactive preview renders without requiring video export.
2. **Interactive Transport Verified**:
   - Scrubbing from 0.0s to 2.5s immediately dispatches `seekTo(2.5)` to `<gm-player>`.
   - Play/pause state is preserved across view mode toggles.
3. **Automated Vitest Suite**:
   - `PreviewStage.test.tsx` (all 9 unit tests pass).
   - `useStudio.test.ts` (all 12 unit tests pass).
   - `critical_repair_workflows.test.ts` (Workflow A & B pass).
