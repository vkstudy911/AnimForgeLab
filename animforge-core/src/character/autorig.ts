import {
  AnimForgeCharacterV2,
  DetectedPart,
  RigbyBone,
  RigbySlot,
  RigbyIKConstraint,
  RigbyMesh,
} from '../../schemas/character.rigby.js';
import { triangulateMesh } from './engine/rigby/index.js';
import { generateAnimationClip } from './motion_planner.js';

export interface AutoRigOptions {
  characterId: string;
  name: string;
  description?: string;
  sourceArtwork: {
    originalPath: string;
    width: number;
    height: number;
    kind?: 'flat_png' | 'layered_png' | 'psd';
  };
  parts: DetectedPart[];
  enableIK?: boolean;
  enableMeshes?: boolean;
}

export function autoRigCharacter(options: AutoRigOptions): AnimForgeCharacterV2 {
  const {
    characterId,
    name,
    description = 'Rigby2D Skeletal Animated Character',
    sourceArtwork,
    parts,
    enableIK = true,
    enableMeshes = true,
  } = options;

  const totalW = sourceArtwork.width;
  const totalH = sourceArtwork.height;

  // Find part references by role and side
  const findPart = (role: string, side?: 'l' | 'r' | null) =>
    parts.find((p) => p.role === role && (side === undefined || p.side === side));

  const headPart = findPart('head');
  const torsoPart = findPart('torso');
  const pelvisPart = findPart('pelvis');
  const upperarmLPart = findPart('upperarm', 'l');
  const forearmLPart = findPart('forearm', 'l');
  const handLPart = findPart('hand', 'l');
  const upperarmRPart = findPart('upperarm', 'r');
  const forearmRPart = findPart('forearm', 'r');
  const handRPart = findPart('hand', 'r');
  const thighLPart = findPart('thigh', 'l');
  const shinLPart = findPart('shin', 'l');
  const footLPart = findPart('foot', 'l');
  const thighRPart = findPart('thigh', 'r');
  const shinRPart = findPart('shin', 'r');
  const footRPart = findPart('foot', 'r');
  const eyeLPart = findPart('eye', 'l');
  const eyeRPart = findPart('eye', 'r');
  const mouthPart = findPart('mouth');

  const bones: RigbyBone[] = [];
  const boneMap = new Map<string, number>();

  const addBone = (
    id: string,
    boneName: string,
    parentName: string | null,
    length: number,
    x: number,
    y: number,
    rotation = 0,
    color?: string
  ): number => {
    const parentIndex = parentName ? (boneMap.get(parentName) ?? null) : null;
    const index = bones.length;
    boneMap.set(boneName, index);

    bones.push({
      id,
      name: boneName,
      parentIndex,
      length: Math.round(length),
      setup: {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        rotation: Math.round(rotation * 10) / 10,
        scaleX: 1,
        scaleY: 1,
      },
      inherit: 'normal',
      color,
    });
    return index;
  };

  // Convert normalized [0..1] to pixel coords
  const px = (normVal: number, total: number) => normVal * total;

  // 1. Root bone at character base
  addBone('bone_root', 'root', null, 0, totalW / 2, totalH * 0.98, 0, '#888888');

  // 2. Pelvis & Spine / Chest
  const pelvisY = pelvisPart ? px(pelvisPart.centroid[1], totalH) : totalH * 0.58;
  const torsoTopY = torsoPart ? px(torsoPart.polygon[0][1], totalH) : totalH * 0.28;
  const spineHeight = Math.max(40, pelvisY - torsoTopY);

  addBone('bone_hip', 'hip', 'root', spineHeight * 0.45, 0, pelvisY - totalH * 0.98, 0, '#e5a158');
  addBone('bone_chest', 'chest', 'hip', spineHeight * 0.55, 0, -spineHeight * 0.45, 0, '#e5a158');

  // 3. Neck & Head
  const headTopY = headPart ? px(headPart.polygon[0][1], totalH) : totalH * 0.05;
  const headHeight = Math.max(50, torsoTopY - headTopY);
  addBone('bone_neck', 'neck', 'chest', headHeight * 0.25, 0, -spineHeight * 0.55, 0, '#f59e0b');
  addBone('bone_head', 'head', 'neck', headHeight * 0.75, 0, -headHeight * 0.25, 0, '#f59e0b');

  // Face features
  if (eyeLPart) {
    const elX = px(eyeLPart.centroid[0], totalW) - totalW / 2;
    const elY = px(eyeLPart.centroid[1], totalH) - torsoTopY;
    addBone('bone_eye_l', 'eye_l', 'head', 10, elX, elY, 0, '#60a5fa');
  }
  if (eyeRPart) {
    const erX = px(eyeRPart.centroid[0], totalW) - totalW / 2;
    const erY = px(eyeRPart.centroid[1], totalH) - torsoTopY;
    addBone('bone_eye_r', 'eye_r', 'head', 10, erX, erY, 0, '#60a5fa');
  }
  if (mouthPart) {
    const mX = px(mouthPart.centroid[0], totalW) - totalW / 2;
    const mY = px(mouthPart.centroid[1], totalH) - torsoTopY;
    addBone('bone_mouth', 'mouth', 'head', 10, mX, mY, 0, '#f87171');
  }

  // 4. Left Arm Chain (Screen Right)
  const armLen = totalH * 0.14;
  const armLX = upperarmLPart ? px(upperarmLPart.pivot[0], totalW) - totalW / 2 : totalW * 0.22;
  const armLY = upperarmLPart ? px(upperarmLPart.pivot[1], totalH) - (pelvisY - spineHeight) : -spineHeight * 0.5;

  addBone('bone_upperarm_l', 'upperarm_l', 'chest', armLen, armLX, armLY, -75, '#34d399');
  addBone('bone_forearm_l', 'forearm_l', 'upperarm_l', armLen * 0.9, armLen, 0, -15, '#34d399');
  addBone('bone_hand_l', 'hand_l', 'forearm_l', armLen * 0.5, armLen * 0.9, 0, 0, '#34d399');

  // 5. Right Arm Chain (Screen Left)
  const armRX = upperarmRPart ? px(upperarmRPart.pivot[0], totalW) - totalW / 2 : -totalW * 0.22;
  const armRY = upperarmRPart ? px(upperarmRPart.pivot[1], totalH) - (pelvisY - spineHeight) : -spineHeight * 0.5;

  addBone('bone_upperarm_r', 'upperarm_r', 'chest', armLen, armRX, armRY, 75, '#10b981');
  addBone('bone_forearm_r', 'forearm_r', 'upperarm_r', armLen * 0.9, armLen, 0, 15, '#10b981');
  addBone('bone_hand_r', 'hand_r', 'forearm_r', armLen * 0.5, armLen * 0.9, 0, 0, '#10b981');

  // 6. Left Leg Chain
  const legLen = totalH * 0.18;
  const hipLX = thighLPart ? px(thighLPart.pivot[0], totalW) - totalW / 2 : totalW * 0.12;
  const hipLY = thighLPart ? px(thighLPart.pivot[1], totalH) - pelvisY : 0;

  addBone('bone_thigh_l', 'thigh_l', 'hip', legLen, hipLX, hipLY, -90, '#a78bfa');
  addBone('bone_shin_l', 'shin_l', 'thigh_l', legLen * 0.95, legLen, 0, 0, '#a78bfa');
  addBone('bone_foot_l', 'foot_l', 'shin_l', legLen * 0.45, legLen * 0.95, 0, 90, '#a78bfa');

  // 7. Right Leg Chain
  const hipRX = thighRPart ? px(thighRPart.pivot[0], totalW) - totalW / 2 : -totalW * 0.12;
  const hipRY = thighRPart ? px(thighRPart.pivot[1], totalH) - pelvisY : 0;

  addBone('bone_thigh_r', 'thigh_r', 'hip', legLen, hipRX, hipRY, -90, '#8b5cf6');
  addBone('bone_shin_r', 'shin_r', 'thigh_r', legLen * 0.95, legLen, 0, 0, '#8b5cf6');
  addBone('bone_foot_r', 'foot_r', 'shin_r', legLen * 0.45, legLen * 0.95, 0, 90, '#8b5cf6');

  // 8. IK Constraints and Target Bones
  const ikConstraints: RigbyIKConstraint[] = [];

  if (enableIK) {
    // Left hand IK target
    const ikHandLIdx = addBone('bone_ik_hand_l', 'ik_hand_l', 'root', 25, armLX + 20, armLY + armLen * 1.8, 0, '#f43f5e');
    const uarmL = boneMap.get('upperarm_l');
    const farmL = boneMap.get('forearm_l');
    if (uarmL !== undefined && farmL !== undefined) {
      ikConstraints.push({
        name: 'ik_arm_l',
        bones: [uarmL, farmL],
        target: ikHandLIdx,
        bendPositive: true,
        mix: 1.0,
      });
    }

    // Right hand IK target
    const ikHandRIdx = addBone('bone_ik_hand_r', 'ik_hand_r', 'root', 25, armRX - 20, armRY + armLen * 1.8, 0, '#f43f5e');
    const uarmR = boneMap.get('upperarm_r');
    const farmR = boneMap.get('forearm_r');
    if (uarmR !== undefined && farmR !== undefined) {
      ikConstraints.push({
        name: 'ik_arm_r',
        bones: [uarmR, farmR],
        target: ikHandRIdx,
        bendPositive: false,
        mix: 1.0,
      });
    }

    // Left foot IK target
    const ikFootLIdx = addBone('bone_ik_foot_l', 'ik_foot_l', 'root', 30, hipLX, 0, 0, '#ec4899');
    const thighL = boneMap.get('thigh_l');
    const shinL = boneMap.get('shin_l');
    if (thighL !== undefined && shinL !== undefined) {
      ikConstraints.push({
        name: 'ik_leg_l',
        bones: [thighL, shinL],
        target: ikFootLIdx,
        bendPositive: true,
        mix: 1.0,
      });
    }

    // Right foot IK target
    const ikFootRIdx = addBone('bone_ik_foot_r', 'ik_foot_r', 'root', 30, hipRX, 0, 0, '#ec4899');
    const thighR = boneMap.get('thigh_r');
    const shinR = boneMap.get('shin_r');
    if (thighR !== undefined && shinR !== undefined) {
      ikConstraints.push({
        name: 'ik_leg_r',
        bones: [thighR, shinR],
        target: ikFootRIdx,
        bendPositive: true,
        mix: 1.0,
      });
    }
  }

  // 9. Assign Bones to Parts and Create Slots
  const slots: RigbySlot[] = [];

  const roleToBoneMap: Record<string, string> = {
    head: 'head',
    torso: 'chest',
    pelvis: 'hip',
    upperarm_l: 'upperarm_l',
    forearm_l: 'forearm_l',
    hand_l: 'hand_l',
    upperarm_r: 'upperarm_r',
    forearm_r: 'forearm_r',
    hand_r: 'hand_r',
    thigh_l: 'thigh_l',
    shin_l: 'shin_l',
    foot_l: 'foot_l',
    thigh_r: 'thigh_r',
    shin_r: 'shin_r',
    foot_r: 'foot_r',
    eye_l: 'eye_l',
    eye_r: 'eye_r',
    mouth: 'mouth',
  };

  for (const part of parts) {
    const key = part.side ? `${part.role}_${part.side}` : part.role;
    const targetBoneName = roleToBoneMap[key] || roleToBoneMap[part.role] || 'hip';
    const boneIndex = boneMap.get(targetBoneName) ?? (boneMap.get('hip') || 0);
    const assignedBone = bones[boneIndex];

    part.boneId = assignedBone.id;

    slots.push({
      name: `slot_${part.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      boneIndex,
      attachmentName: part.name,
      blend: 'normal',
    });
  }

  // Sort slots by part zIndex for correct draw order
  slots.sort((a, b) => {
    const pA = parts.find((p) => `slot_${p.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}` === a.name);
    const pB = parts.find((p) => `slot_${p.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}` === b.name);
    return (pA?.zIndex ?? 0) - (pB?.zIndex ?? 0);
  });

  // 10. Generate Weighted Meshes for Deformable Parts
  const meshes: Record<string, RigbyMesh> = {};

  if (enableMeshes) {
    for (const part of parts) {
      // Triangulate boundary polygon into 2D Delaunay mesh
      const pixelPoly: Array<[number, number]> = part.polygon.map(([nx, ny]) => [
        nx * totalW,
        ny * totalH,
      ]);

      const triIndices = triangulateMesh(pixelPoly, pixelPoly.length);
      const boneIdx = boneMap.get(roleToBoneMap[part.side ? `${part.role}_${part.side}` : part.role] || 'hip') ?? 0;

      const vertices = pixelPoly.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
      const uvs = pixelPoly.flatMap(([x, y]) => [
        Math.round((x / totalW) * 1000) / 1000,
        Math.round((y / totalH) * 1000) / 1000,
      ]);
      const triangles = triIndices.flat();

      const weights = [];
      for (let v = 0; v < pixelPoly.length; v++) {
        weights.push([{ boneIndex: boneIdx, weight: 1.0 }]);
      }

      meshes[part.name] = {
        vertices,
        uvs,
        triangles,
        weights,
      };
    }
  }

  // 11. Generate Standard AI Motion Clips
  const animations: Record<string, any> = {
    idle: generateAnimationClip('idle', bones),
    walk: generateAnimationClip('walk', bones),
    wave: generateAnimationClip('wave', bones),
    run: generateAnimationClip('run', bones),
    dance: generateAnimationClip('dance', bones),
  };

  return {
    format: 'animforge-character/2.0',
    id: characterId,
    name,
    description,
    version: 2,
    engine: 'rigby2d',
    sourceArtwork: {
      originalPath: sourceArtwork.originalPath,
      width: totalW,
      height: totalH,
      kind: sourceArtwork.kind ?? 'flat_png',
    },
    parts,
    skeleton: {
      bones,
      slots,
      ik: ikConstraints,
    },
    meshes,
    animations,
    poses: {},
  };
}
