import * as path from 'node:path';
import { Rigby2DAdapter } from '../../adapters/rigby2d.adapter.js';
import {
  AnimForgeCharacterV2,
  AnimForgeCharacterV2Schema,
  RigbyBone,
} from '../../schemas/character.rigby.js';
import { segmentCharacter, getSilhouetteBounds } from '../character/segmentation.js';
import { readPngFile } from '../character/png_decoder.js';
import { generateAnimationClip } from '../character/motion_planner.js';
import { McpToolError } from './errors.js';

export class CharacterMcpService {
  private adapter: Rigby2DAdapter;
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
    this.adapter = new Rigby2DAdapter(workspaceDir);
  }

  // 1. character_list
  async listCharacters(args: { projectId?: string }) {
    const characters = await this.adapter.listCharacters(args.projectId);
    return {
      characters: characters.map((c) => ({
        id: c.id,
        name: c.name,
        bonesCount: c.skeleton.bones.length,
        slotsCount: c.skeleton.slots.length,
        ikCount: c.skeleton.ik.length,
        animationsCount: Object.keys(c.animations).length,
      })),
    };
  }

  // 2. character_import
  async importCharacter(args: {
    artworkPath: string;
    name?: string;
    description?: string;
    projectId?: string;
    enableIK?: boolean;
    enableMeshes?: boolean;
  }) {
    const character = await this.adapter.importCharacter(args.artworkPath, {
      name: args.name,
      description: args.description,
      projectId: args.projectId,
      enableIK: args.enableIK ?? true,
      enableMeshes: args.enableMeshes ?? true,
    });

    return {
      characterId: character.id,
      name: character.name,
      format: character.format,
      bonesCount: character.skeleton.bones.length,
      slotsCount: character.skeleton.slots.length,
      ikCount: character.skeleton.ik.length,
      animations: Object.keys(character.animations),
    };
  }

  // 3. character_analyze
  async analyzeArtwork(args: { artworkPath: string }) {
    const resolvedPath = path.isAbsolute(args.artworkPath)
      ? args.artworkPath
      : path.resolve(this.workspaceDir, args.artworkPath);

    const decoded = readPngFile(resolvedPath);
    const bounds = getSilhouetteBounds(decoded.width, decoded.height, decoded.alpha);

    return {
      artworkPath: args.artworkPath,
      width: decoded.width,
      height: decoded.height,
      silhouetteBounds: bounds,
      aspectRatio: Math.round((decoded.width / decoded.height) * 100) / 100,
      hasAlpha: true,
      suggestedRole: bounds.height > bounds.width * 1.5 ? 'humanoid' : 'creature',
    };
  }

  // 4. character_detect_parts
  async detectParts(args: { artworkPath: string; threshold?: number }) {
    const resolvedPath = path.isAbsolute(args.artworkPath)
      ? args.artworkPath
      : path.resolve(this.workspaceDir, args.artworkPath);

    const decoded = readPngFile(resolvedPath);
    const parts = segmentCharacter({
      width: decoded.width,
      height: decoded.height,
      alphaData: decoded.alpha,
      imagePath: args.artworkPath,
    });

    return {
      artworkPath: args.artworkPath,
      partsCount: parts.length,
      parts: parts.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        side: p.side,
        centroid: p.centroid,
        pivot: p.pivot,
        confidence: p.confidence,
        zIndex: p.zIndex,
      })),
    };
  }

  // 5. character_get_rig
  async getRig(args: { characterId: string; projectId?: string }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);
    return {
      characterId: character.id,
      name: character.name,
      engine: character.engine,
      skeleton: {
        bones: character.skeleton.bones,
        slots: character.skeleton.slots,
        ik: character.skeleton.ik,
      },
      meshesCount: Object.keys(character.meshes || {}).length,
      animations: Object.keys(character.animations),
    };
  }

  // 6. character_create_bone
  async createBone(args: {
    characterId: string;
    projectId?: string;
    name: string;
    parentName?: string | null;
    length?: number;
    x?: number;
    y?: number;
    rotation?: number;
    color?: string;
  }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);
    const existing = character.skeleton.bones.find((b) => b.name === args.name);
    if (existing) {
      throw new McpToolError('CONFLICT', `Bone with name '${args.name}' already exists.`);
    }

    let parentIndex: number | null = null;
    if (args.parentName) {
      const pIdx = character.skeleton.bones.findIndex((b) => b.name === args.parentName);
      if (pIdx === -1) {
        throw new McpToolError('NOT_FOUND', `Parent bone '${args.parentName}' not found.`);
      }
      parentIndex = pIdx;
    }

    const newBone: RigbyBone = {
      id: `bone_${Date.now()}_${args.name}`,
      name: args.name,
      parentIndex,
      length: args.length ?? 40,
      setup: {
        x: args.x ?? 0,
        y: args.y ?? 0,
        rotation: args.rotation ?? 0,
        scaleX: 1,
        scaleY: 1,
      },
      inherit: 'normal',
      color: args.color,
    };

    character.skeleton.bones.push(newBone);
    await this.adapter.saveCharacter(character, args.projectId);

    return {
      success: true,
      boneIndex: character.skeleton.bones.length - 1,
      bone: newBone,
    };
  }

  // 7. character_update_bone
  async updateBone(args: {
    characterId: string;
    projectId?: string;
    boneName: string;
    parentName?: string | null;
    length?: number;
    x?: number;
    y?: number;
    rotation?: number;
    rotationLimit?: { min: number; max: number };
  }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);
    const bone = character.skeleton.bones.find((b) => b.name === args.boneName);
    if (!bone) {
      throw new McpToolError('NOT_FOUND', `Bone '${args.boneName}' not found.`);
    }

    if (args.parentName !== undefined) {
      if (args.parentName === null) {
        bone.parentIndex = null;
      } else {
        const pIdx = character.skeleton.bones.findIndex((b) => b.name === args.parentName);
        if (pIdx === -1) {
          throw new McpToolError('NOT_FOUND', `Parent bone '${args.parentName}' not found.`);
        }
        bone.parentIndex = pIdx;
      }
    }

    if (args.length !== undefined) bone.length = args.length;
    if (args.x !== undefined) bone.setup.x = args.x;
    if (args.y !== undefined) bone.setup.y = args.y;
    if (args.rotation !== undefined) bone.setup.rotation = args.rotation;
    if (args.rotationLimit !== undefined) bone.rotationLimit = args.rotationLimit;

    await this.adapter.saveCharacter(character, args.projectId);

    return {
      success: true,
      bone,
    };
  }

  // 8. character_update_weights
  async updateWeights(args: {
    characterId: string;
    projectId?: string;
    meshName: string;
    vertexIndex: number;
    weights: Array<{ boneIndex: number; weight: number }>;
  }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);
    if (!character.meshes || !character.meshes[args.meshName]) {
      throw new McpToolError('NOT_FOUND', `Mesh '${args.meshName}' not found on character.`);
    }

    const mesh = character.meshes[args.meshName];
    if (args.vertexIndex < 0 || args.vertexIndex >= mesh.weights.length) {
      throw new McpToolError(
        'INVALID_INPUT',
        `Vertex index ${args.vertexIndex} out of bounds (0..${mesh.weights.length - 1}).`
      );
    }

    mesh.weights[args.vertexIndex] = args.weights;
    await this.adapter.saveCharacter(character, args.projectId);

    return {
      success: true,
      meshName: args.meshName,
      vertexIndex: args.vertexIndex,
      updatedWeights: args.weights,
    };
  }

  // 9. character_create_ik
  async createIK(args: {
    characterId: string;
    projectId?: string;
    name: string;
    parentBoneName: string;
    childBoneName: string;
    targetBoneName: string;
    bendPositive?: boolean;
    mix?: number;
  }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);
    const pIdx = character.skeleton.bones.findIndex((b) => b.name === args.parentBoneName);
    const chIdx = character.skeleton.bones.findIndex((b) => b.name === args.childBoneName);
    const tIdx = character.skeleton.bones.findIndex((b) => b.name === args.targetBoneName);

    if (pIdx === -1 || chIdx === -1 || tIdx === -1) {
      throw new McpToolError(
        'NOT_FOUND',
        `One or more bones not found: parent='${args.parentBoneName}', child='${args.childBoneName}', target='${args.targetBoneName}'.`
      );
    }

    const ikConstraint = {
      name: args.name,
      bones: [pIdx, chIdx] as [number, number],
      target: tIdx,
      bendPositive: args.bendPositive ?? true,
      mix: args.mix ?? 1.0,
    };

    character.skeleton.ik.push(ikConstraint);
    await this.adapter.saveCharacter(character, args.projectId);

    return {
      success: true,
      ik: ikConstraint,
    };
  }

  // 10. character_generate_animation
  async generateAnimation(args: {
    characterId: string;
    projectId?: string;
    action: any;
    duration?: number;
    fps?: number;
    intensity?: number;
  }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);
    const clip = generateAnimationClip(args.action, character.skeleton.bones, {
      duration: args.duration,
      fps: args.fps,
      intensity: args.intensity,
    });

    character.animations[clip.name] = clip;
    await this.adapter.saveCharacter(character, args.projectId);

    return {
      success: true,
      animationName: clip.name,
      duration: clip.duration,
      fps: clip.fps,
      animatedBones: Object.keys(clip.bones),
    };
  }

  // 11. character_update_keyframes
  async updateKeyframes(args: {
    characterId: string;
    projectId?: string;
    animationName: string;
    boneName: string;
    channel: 'rotate' | 'translate' | 'scale';
    keyframes: Array<{ time: number; value: any; curve?: number[] }>;
  }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);
    let anim = character.animations[args.animationName];
    if (!anim) {
      anim = {
        name: args.animationName,
        duration: Math.max(...args.keyframes.map((k) => k.time), 1.0),
        fps: 30,
        bones: {},
      };
      character.animations[args.animationName] = anim;
    }

    if (!anim.bones[args.boneName]) {
      anim.bones[args.boneName] = {};
    }

    anim.bones[args.boneName][args.channel] = args.keyframes;
    anim.duration = Math.max(anim.duration, ...args.keyframes.map((k) => k.time));

    await this.adapter.saveCharacter(character, args.projectId);

    return {
      success: true,
      animationName: anim.name,
      boneName: args.boneName,
      channel: args.channel,
      keyframeCount: args.keyframes.length,
      duration: anim.duration,
    };
  }

  // 12. character_preview
  async previewCharacter(args: {
    characterId: string;
    projectId?: string;
    animationName?: string;
    time?: number;
  }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);
    const pose = this.adapter.evaluatePose(character, args.animationName, args.time ?? 0);

    return {
      characterId: character.id,
      animationName: args.animationName || 'setup_pose',
      time: args.time ?? 0,
      bones: pose.bones,
    };
  }

  // 13. character_validate
  async validateCharacter(args: { characterId: string; projectId?: string }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);
    const errors: string[] = [];

    // 1. Zod parse
    const parseRes = AnimForgeCharacterV2Schema.safeParse(character);
    if (!parseRes.success) {
      errors.push(...parseRes.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`));
    }

    // 2. Bone hierarchy acyclic check
    const bones = character.skeleton.bones;
    for (let i = 0; i < bones.length; i++) {
      let curr: number | null = bones[i].parentIndex;
      const visited = new Set<number>([i]);
      while (curr !== null) {
        if (visited.has(curr)) {
          errors.push(`Circular bone parent reference detected involving bone '${bones[i].name}'.`);
          break;
        }
        visited.add(curr);
        curr = bones[curr]?.parentIndex ?? null;
      }
    }

    // 3. IK validation
    for (const ik of character.skeleton.ik) {
      if (ik.bones[0] >= bones.length || ik.bones[1] >= bones.length || ik.target >= bones.length) {
        errors.push(`IK constraint '${ik.name}' references bone index out of bounds.`);
      }
    }

    return {
      characterId: character.id,
      valid: errors.length === 0,
      errors,
    };
  }

  // 14. character_save
  async saveCharacter(args: { character: any; projectId?: string }) {
    const parsed = AnimForgeCharacterV2Schema.parse(args.character);
    const savedPath = await this.adapter.saveCharacter(parsed, args.projectId);
    return {
      success: true,
      characterId: parsed.id,
      path: savedPath,
    };
  }

  // 15. character_export
  async exportCharacter(args: {
    characterId: string;
    projectId?: string;
    format: 'spine3.8' | 'spine4.2' | 'animforge2';
  }) {
    const character = await this.requireCharacter(args.characterId, args.projectId);

    if (args.format === 'animforge2') {
      return {
        format: 'animforge2',
        data: character,
      };
    }

    const version = args.format === 'spine4.2' ? '4.2' : '3.8';
    const spineJson = this.adapter.exportSpineJson(character, version);

    return {
      format: args.format,
      data: spineJson,
    };
  }

  private async requireCharacter(characterId: string, projectId?: string): Promise<AnimForgeCharacterV2> {
    const character = await this.adapter.loadCharacter(characterId, projectId);
    if (!character) {
      throw new McpToolError('NOT_FOUND', `Character '${characterId}' not found.`);
    }
    return character;
  }
}
