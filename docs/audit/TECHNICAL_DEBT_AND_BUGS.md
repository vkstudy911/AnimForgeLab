# AnimForge Studio — Technical Debt & Bug Inventory

**Audit Date:** 2026-11-14  
**Audit Scope:** Full Codebase (`animforge-desktop`, `animforge-core`, `src-tauri`, `engines/`)

---

## Priority Classification
- **P0 — Critical:** Data loss, security vulnerability, or application crash.
- **P1 — Core Workflow Broken:** Central user journey blocked or non-functional.
- **P2 — Important Incomplete:** Secondary feature missing backend wiring or limited.
- **P3 — Polish & Optimization:** Code bloat, UI inconsistency, or performance optimization.

---

## 1. P0 Findings (Critical)

### P0-1: Character Studio "Export Video" Generates Fake Mock Blob Instead of Video
- **Evidence:** `animforge-desktop/src/workspaces/CharacterStudio.tsx:1457-1466`
  ```typescript
  const mockVideoData = `AnimForge Video Export\nCharacter: ${selectedChar?.name}\n...`;
  const blob = new Blob([mockVideoData], { type: exportFormat === 'gif' ? 'image/gif' : 'video/mp4' });
  const url = URL.createObjectURL(blob);
  ```
- **Impact:** Clicking "Export Video" in Character Studio triggers a download of a text file with an `.mp4` or `.gif` extension. Opening the file in QuickTime or a media player fails with an invalid media error.
- **Remedy:** Connect `handleStartVideoExport` to Tauri IPC `project_render`, reusing the existing GiveMotion/FFmpeg video pipeline.

---

## 2. P1 Findings (Core Workflow Broken)

### P1-1: GIF Video Export Unimplemented
- **Evidence:** `CharacterStudio.tsx:3421-3432`, `worker.ts:852`
- **Impact:** While the UI offers a GIF export toggle, neither `animforge-core` nor `GivemotionAdapter` has a GIF encoding pipeline (e.g. FFmpeg `split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`).
- **Remedy:** Add GIF preset to FFmpeg command line options in `givemotion.adapter.ts`.

### P1-2: Frontend PNG Analyzer Uses Filename Heuristics Instead of Real Pixels
- **Evidence:** `CharacterStudio.tsx:79-86`
  ```typescript
  export async function analyzeCharacterPng(file: File): Promise<CharacterPngAnalysis> {
    const isOpaque = file.name.toLowerCase().includes('opaque') || file.type === 'image/jpeg';
  ```
- **Impact:** If a user imports a transparent PNG named `character_opaque.png`, it will be misclassified as opaque. If they import an opaque JPEG named `transparent.png`, it will attempt cutout segmentation and fail.
- **Remedy:** Pipe the imported file buffer to `decodePng` in `animforge-core` or perform lightweight Canvas `getImageData` pixel scan in the browser to measure true alpha values.

### P1-3: Disconnected Character Studio Auto-Rigging from Core Worker
- **Evidence:** `CharacterStudio.tsx:1404-1446` vs `rigby2d.adapter.ts:importCharacter`
- **Impact:** `CharacterStudio.tsx` currently generates its own in-memory skeleton objects using local state functions instead of invoking the centralized `rigby2d.adapter.ts:importCharacter` via Tauri IPC.
- **Remedy:** Wire `handleConfirmAutoPrep` to invoke Tauri command `character_invoke('character_import', ...)`.

---

## 3. P2 Findings (Important Functionality Incomplete)

### P2-1: Unused Remotion Engine Monorepo Bloats Workspace by 893 MB
- **Evidence:** `AnimForgeLab/engines/remotion` (size: 893 MB)
- **Impact:** The entire Remotion monorepo is sitting in the repository unbuilt. It introduces commercial licensing restrictions (>3 staff license fees) while AnimForge already has a working, MIT-licensed MP4 export pipeline via GiveMotion + FFmpeg.
- **Remedy:** Archive or remove `engines/remotion` to reclaim nearly 1 GB of repository space.

### P2-2: StretchyStudio Node Modules Bloat Workspace by 394 MB
- **Evidence:** `AnimForgeLab/engines/stretchystudio/node_modules` (size: 394 MB)
- **Impact:** Only the mathematical deformation formulas and shaders are needed from StretchyStudio; the full development `node_modules` in `engines/stretchystudio` is redundant.
- **Remedy:** Remove `engines/stretchystudio/node_modules` and extract the WebGL2 deformation shader into `animforge-core`.

### P2-3: Sandbox Network Loopback Probe Failure in Rust Cargo Tests
- **Evidence:** `cargo test` in `src-tauri` fails on `preview_server::tests::loopback_http_server_serves_assets_ranges_and_security_rejections`.
- **Impact:** Loopback TCP socket connections fail when executed within strict macOS sandbox environments that block port binding.
- **Remedy:** Add conditional test flag `#[cfg(not(sandbox))]` or mock socket transport during sandboxed cargo tests.

---

## 4. P3 Findings (Polish & Technical Debt)

### P3-1: Duplicate Types Between Core and Desktop
- **Evidence:** `animforge-desktop/src/types.ts` duplicates data models from `animforge-core/schemas/`.
- **Impact:** Schema migrations in core must be manually replicated in desktop `types.ts`.
- **Remedy:** Export TypeScript types directly from `animforge-core` or generate them from Zod schemas via `z.infer`.

### P3-2: In-Memory Undo/Redo Only
- **Evidence:** `CharacterStudio.tsx` has undo/redo state variables that reset on character change.
- **Impact:** No persistent command history or transaction journaling for complex skeleton adjustments.
- **Remedy:** Implement standard Command pattern with history stack for bone transform edits.

### P3-3: Missing Audio Waveform Previews
- **Evidence:** `AssetLibrary.tsx:AudioPlayer`
- **Impact:** Audio assets show play/pause and time without visual waveform peaks.
- **Remedy:** Render Web Audio API `AudioBuffer` peak visualization.
