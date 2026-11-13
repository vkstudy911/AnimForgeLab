# AnimForge Character Studio — License & Security Audit Report

**Date**: 2026-11-13  
**Reviewer**: Integration & Security Review Specialist (Agent 5)  
**Evaluated Repositories**:
1. **Rigby2D**: `https://github.com/jaisurya-dev-art/rigby2d` @ `271e90ed30a209804254a66e275b54d58b5ca500`
2. **TextRig**: `https://github.com/blackoutbuild/textrig` @ `24de1222983c4ee77d8905965f96058e4433ca28`

---

## 1. Open-Source Licensing Compliance

### 1.1 Rigby2D License Audit
- **Primary License**: Dual-licensed under **MIT License** and **Apache License 2.0** (`LICENSE-MIT`, `LICENSE-APACHE`).
  * Permits free commercial use, modification, distribution, sublicensing, and private use.
  * No seat limitations, copyleft provisions, or revenue share requirements.
- **Third-Party Notices (`THIRD_PARTY_NOTICES.md`)**:
  * `ag-psd`: MIT License (PSD parsing).
  * `marked`: MIT License.
  * `highlight.js`: BSD 3-Clause License.
  * `pyodide` / `transformers`: Permissive open-source runtime libraries (isolated to optional plugins; not bundled into AnimForge core).
- **Trademarks Notice (`TRADEMARKS.md`)**:
  * "Rigby2D" name and logo are trademarks of the original authors.
  * AnimForge Studio integrates the engine under the generic technical designation "Rigby2D Engine Adapter" while retaining AnimForge Studio branding.

### 1.2 TextRig License Audit
- **Primary License**: **MIT License** (Copyright (c) 2026 Blackout Interactive).
  * Permits inspection, adaptation, and algorithmic reuse of image segmentation, contour analysis, and polygon boundary concepts.

---

## 2. Supply-Chain & Dependency Risk Assessment

| Potential Risk | Severity | Mitigation Strategy in AnimForge |
| :--- | :--- | :--- |
| Heavy native C++ binaries | High | Rejected. Rigby2D core engine (`src/core/*`) is pure ECMAScript ES2022, requiring zero native C++ compile steps on macOS Apple Silicon. |
| Nested Tauri desktop conflict | Critical | The standalone Rigby2D Tauri app is **not** imported. Only pure engine math and data structures are accessed via the adapter. |
| Cloud / Telemetry Leakage | Medium | Rigby2D core does not phone home. All pose evaluation, auto-rigging, and keyframe generation occur locally in offline memory. |
| Remote Model Downloads | Medium | Image segmentation and part detection use local procedural contour heuristics and geometric PCA without unapproved multi-gigabyte neural weight downloads. |

---

## 3. Platform & macOS Apple Silicon Compatibility

- **Host Environment**: macOS Sonoma / Sequoia / Darwin 24+ on Apple Silicon (arm64, M-series).
- **Runtime Engines**:
  * Node.js v24.19.0 (ARM64 native).
  * WebKit (`WKWebView`) hardware accelerated via Metal.
  * Canvas 2D / WebGL rendering.
- **Verification**:
  * 31 upstream unit tests in `engines/rigby2d` pass on the active Apple Silicon machine in < 200ms.
  * Zero memory leaks or architecture mismatches observed.

---

## 4. Path Jail & Traversal Security Audit

All character asset loading (PNGs, PSDs, JSON manifests) conforms to AnimForge's path jail:
- Project paths are strictly canonicalized under `resolveProjectDir(projectsRoot, projectId)`.
- Character asset paths are validated using `resolveWorkspacePath`, blocking traversal characters (`..`), encoded variants (`%2e`), backslashes (`\`), and null bytes (`\0`).
- Character IDs are sanitized using `assertSafeId`.
- No arbitrary file writes outside the active project boundary are permitted.
