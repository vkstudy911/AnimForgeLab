# AnimForge Character Studio — Architecture Specification

**Date**: 2026-11-13  
**Sprint**: Rigby2D Engine Integration & AI Auto-Rig Sprint  
**Target Applications**: `animforge-core`, `animforge-desktop`, `animforge-mcp`  
**Primary Engine**: Rigby2D (`engines/rigby2d` @ `271e90ed30a209804254a66e275b54d58b5ca500`)  
**Secondary Reference**: TextRig (`engines/textrig` @ `24de1222983c4ee77d8905965f96058e4433ca28`)  

---

## 1. Architectural Strategy & Integration Boundary

AnimForge Studio integrates the core engine of Rigby2D as its primary 2D skeletal animation runtime.

### Critical Boundary Decisions
1. **Preserve Native Tauri Application**: AnimForge remains the single host application. Rigby2D's standalone Tauri wrapper is **not** used or nested.
2. **Pure Engine Reuse**: Rigby2D's `src/core/` (`Skeleton`, `Bone`, `Slot`, `Attachment`, `Pose`, `Animation`, `Keyframe`, `Curve`, `Mesh`, `AutoRig`, `BodyParts`, `Constraints`, `Interop`) is imported cleanly as an engine module within `animforge-core`.
3. **Decoupled Adapter Layer**: `Rigby2dAdapter` (`animforge-core/adapters/rigby2d.adapter.ts`) conforms to AnimForge's multi-engine adapter pattern alongside `GivemotionAdapter`, `RemotionAdapter`, and `StretchyStudioAdapter`.
4. **Unified Storage & IPC**: Characters are stored under project manifests (`projects/<projectId>/characters/<charId>.json`) and assets (`projects/<projectId>/characters/<charId>/assets/`), with database indexing in SQLite (`animforge.db`) and real-time IPC via the persistent Node stdio worker bridge.
5. **Bidirectional GUI & MCP Sync**: Character modifications made via the Character Studio UI and via the 15+ MCP character tools operate on identical backend services, schemas, and disk files.

---

## 2. Character Data Architecture

The character format is versioned as `animforge-character/2.0`, maintaining full bidirectional mapping with Rigby2D:

```typescript
export interface AnimForgeCharacter {
  format: 'animforge-character/2.0';
  id: string;
  name: string;
  description?: string;
  version: number;
  engine: 'rigby2d';
  
  /** Source artwork paths (original flat PNG or layered PNG/PSD) */
  sourceArtwork: {
    originalPath: string;
    width: number;
    height: number;
    kind: 'flat_png' | 'layered_png' | 'psd';
  };

  /** Detected and user-adjusted segmented body parts */
  parts: Array<{
    id: string;
    name: string;
    role: BodyPartRole;
    side?: 'l' | 'r' | null;
    zIndex: number;
    polygon: Array<[number, number]>; // boundary contour in normalized [0..1] space
    centroid: [number, number];
    pivot: [number, number];
    boneId?: string;
    imagePath?: string;
    confidence: number;
  }>;

  /** Rigby2D skeletal model */
  skeleton: {
    bones: Array<{
      id: string;
      name: string;
      parentIndex: number | null;
      length: number;
      setup: {
        x: number;
        y: number;
        rotation: number;
        scaleX: number;
        scaleY: number;
      };
      inherit?: 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';
      rotationLimit?: { min: number; max: number };
      color?: string;
    }>;
    slots: Array<{
      name: string;
      boneIndex: number;
      attachmentName: string | null;
      color?: [number, number, number, number];
      blend?: 'normal' | 'additive' | 'multiply' | 'screen';
    }>;
    ik: Array<{
      name: string;
      bones: [number, number]; // parent, child
      target: number;          // target bone index
      bendPositive: boolean;
      mix: number;
    }>;
  };

  /** Weighted mesh deformation data (per part / attachment) */
  meshes?: Record<string, {
    vertices: number[];
    uvs: number[];
    triangles: number[];
    weights: Array<Array<{ boneIndex: number; weight: number }>>;
  }>;

  /** Animation clips with bone channels and keyframes */
  animations: Record<string, {
    name: string;
    duration: number; // in seconds
    fps: number;
    bones: Record<string, {
      rotate?: Array<{ time: number; value: number; curve?: number[] }>;
      translate?: Array<{ time: number; value: [number, number]; curve?: number[] }>;
      scale?: Array<{ time: number; value: [number, number]; curve?: number[] }>;
    }>;
  }>;

  /** Saved key poses */
  poses?: Record<string, Record<string, { rotation?: number; x?: number; y?: number }>>;
}
```

---

## 3. Auto-Rig & Segmentation Pipeline

1. **Alpha Channel & Contour Extraction**: Flat PNG is scanned for opaque regions (alpha >= 64). Outer boundaries are traced using polygon approximation.
2. **Part Classification & Anatomical Landmarks**:
   - Head & Face: Top region with facial features (eyes, mouth, nose, brows).
   - Torso & Spine: Central mass connecting neck and pelvis.
   - Arms: Upper arm, forearm, hand on left and right sides.
   - Legs: Thigh, shin, foot on left and right sides.
3. **Joint & Bone Placement**:
   - Root placed at pelvis/base.
   - Spine chains upward to neck and head.
   - Shoulders branch into upperarm -> forearm -> hand.
   - Hips branch into thigh -> shin -> foot.
4. **Mesh Triangulation & Weight Painting**:
   - Delaunay triangulation creates deformable polygon meshes.
   - Distance-weighted influence binds vertices smoothly to adjacent bones.
5. **Interactive Review**:
   - Character Studio displays detected part boundaries with confidence tags.
   - Animators can drag pivot points, split parts, merge parts, or adjust polygons prior to rig generation.

---

## 4. MCP Character Tools

AnimForge's MCP server exposes 15 validated tools:
1. `animforge_character_list`: Lists all characters in the project.
2. `animforge_character_import`: Imports a flat or layered PNG into a project.
3. `animforge_character_analyze`: Returns image dimensions, parts count, and rig readiness.
4. `animforge_character_detect_parts`: Runs AI part detection and returns proposed boundaries.
5. `animforge_character_get_rig`: Returns the complete bone hierarchy, IK chains, and meshes.
6. `animforge_character_create_bone`: Adds a new bone to the hierarchy.
7. `animforge_character_update_bone`: Modifies bone position, rotation, length, or parent.
8. `animforge_character_update_weights`: Adjusts bone vertex weights for mesh deformation.
9. `animforge_character_create_ik`: Configures an inverse kinematics constraint.
10. `animforge_character_generate_animation`: Generates structured motion keyframes (walk, wave, dance, etc.).
11. `animforge_character_update_keyframes`: Edits channel keyframes for a bone.
12. `animforge_character_preview`: Computes posed world transforms at a specified timestamp.
13. `animforge_character_validate`: Runs structural checks (no cycles, valid weights, existing bones).
14. `animforge_character_save`: Commits the character to project storage and SQLite.
15. `animforge_character_export`: Exports in Rigby2D / Spine-compatible JSON.
