# AnimForge Studio — Six-Agent Integration Architecture Report

**Date**: 2026-11-13  
**Lead Focus**: Multi-Specialist Architecture, Interface Contracts & Cross-Layer Coordination  
**Sprint**: Critical Functional Repair Sprint  

---

## 1. Architectural Strategy

The critical functional repair sprint was organized into six specialized engineering domains to address the deep cross-layer integration challenges between the Rust backend, Node.js core worker, MCP server, and React desktop application:

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT 4: Desktop Shell                       │
│  - Tauri Webview (React + Vite)                                 │
│  - Global Desktop Shell & Window Management                     │
└────────────────┬───────────────────────────────┬────────────────┘
                 │                               │
┌────────────────▼──────────────┐ ┌──────────────▼────────────────┐
│  AGENT 2: Project Management  │ │   AGENT 3: Scene & Timeline   │
│  - Metadata Editing & Forms   │ │  - Multi-track Outliner       │
│  - Save / Discard Lifecycle   │ │  - Scrub & Playhead Sync      │
└────────────────┬──────────────┘ └──────────────┬────────────────┘
                 │                               │
┌────────────────▼───────────────────────────────▼────────────────┐
│                  AGENT 1: Preview Engine                        │
│  - GiveMotion Bundler & Live HTML Player (<gm-player>)          │
│  - Embedded Loopback Preview Server with CORS (preview_server)  │
└────────────────┬───────────────────────────────┬────────────────┘
                 │                               │
┌────────────────▼───────────────────────────────▼────────────────┐
│             AGENT 5: Core Worker & MCP Bridge                   │
│  - Tauri IPC Commands (invoke('worker_call', ...))              │
│  - JSON-RPC stdio worker daemon (animforge-core/worker.ts)      │
│  - Shared Database & File Storage (database.ts)                 │
│  - MCP Tools Suite (16 tools)                                  │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│                 AGENT 6: Integration QA                         │
│  - Vitest Unit & Integration Suites                             │
│  - Rust Cargo Tests & Typecheck Verification                    │
│  - End-to-End Workflow Validation (A, B, C, D, E)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Specialist Responsibilities & Delivered Solutions

### Agent 1: Preview Engine Specialist
- **Delivered**:
  * Inverted `previewProject` execution in `givemotion.adapter.ts` to guarantee bundle generation before validation.
  * Added environment-resilient error handling for headless Chrome checks.
  * Enhanced `PreviewStage.tsx` with dynamic `viewMode` switching and `<gm-player>.seekTo()` transport seeking.
  * Automated bundle rebuilding on project save in `writeProjectFiles`.

### Agent 2: Project Management Specialist
- **Delivered**:
  * Built complete metadata editing lifecycle in `ProjectManager.tsx` with explicit dirty state tracking.
  * Implemented validation for FPS, aspect ratio, resolution, and title.
  * Created clean Save and Discard flows with feedback banners and error reporting.
  * Ensured zero data corruption of existing project `proj_1794470257338_1` ("Dancer").

### Agent 3: Scene & Timeline Specialist
- **Delivered**:
  * Implemented scene creation, editing, deletion, and sequence reordering.
  * Synchronized playhead timecode changes bidirectionally between `Timeline.tsx` and `PreviewStage.tsx`.
  * Connected `useStudio.saveProjectDraft` with `previewRev` cache invalidation to trigger live preview reloading.

### Agent 4: Desktop Shell & Tauri Specialist
- **Delivered**:
  * Implemented CORS headers and HTTP `OPTIONS` preflight responses in `preview_server.rs`.
  * Whitelisted Vite dev servers and Tauri scheme origins.
  * Maintained stable window state, navigation bar, and panel docking across themes (Dark, Light, System).

### Agent 5: Core Worker & MCP Bridge Specialist
- **Delivered**:
  * Extended `ProjectSchema`, `ProjectSummary`, and `ProjectDetail` with `hasBundle` and `hasVideo`.
  * Updated `database.listProjects()` and `worker.ts` handlers (`create_project`, `load_project`, `save_project`) to inspect disk artifacts and populate bundle flags synchronously.
  * Maintained absolute path safety across macOS directories, including workspace paths with trailing spaces.

### Agent 6: Integration QA Specialist
- **Delivered**:
  * Authored comprehensive end-to-end integration test suite `critical_repair_workflows.test.ts`.
  * Verified 45 unit/integration tests in `animforge-core`.
  * Verified 59 unit/integration tests in `animforge-desktop`.
  * Executed Rust backend test suites (`cargo test worker_bridge`).
  * Confirmed TypeScript compilation (`tsc --noEmit`) and Vite production bundle.

---

## 3. Shared Interface Contracts

### 3.1 Project Schema Extensions
```typescript
export interface ProjectSummary {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  sceneCount: number;
  duration: number;
  fps: number;
  hasBundle?: boolean; // Indicates bundle/index.html is ready on disk
  hasVideo?: boolean;  // Indicates output.mp4 is ready on disk
}

export interface ProjectDetail extends ProjectSummary {
  aspectRatio: string;
  resolution: { width: number; height: number };
  scenes: Scene[];
}
```

### 3.2 Loopback Server Protocol
- **Endpoint**: `http://127.0.0.1:<PORT>/<PROJECT_ID>/bundle/index.html`
- **Method Support**: `GET`, `HEAD`, `OPTIONS`
- **CORS Headers**:
  * `Access-Control-Allow-Origin: <origin>`
  * `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
  * `Access-Control-Allow-Headers: Range, Content-Type, Accept`
  * `Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges`

---

## 4. Conflict Avoidance & Code Quality

- **Isolated File Ownership**: Agents worked in distinct layers (adapter vs frontend components vs Rust backend).
- **Single Source of Truth**: Project persistence is mediated entirely by `animforge-core/database.ts` and `animforge-core/worker.ts`.
- **Zero Mocking of Core Workflows**: End-to-end tests use real disk storage, real GiveMotion bundler commands, and real schema validation.
