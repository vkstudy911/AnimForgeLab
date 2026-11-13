import { z } from 'zod';
import { BodyPartRoleSchema } from '../../schemas/character.rigby.js';

export const CharacterListInputSchema = z.object({
  projectId: z.string().optional(),
});

export const CharacterImportInputSchema = z.object({
  artworkPath: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  enableIK: z.boolean().default(true),
  enableMeshes: z.boolean().default(true),
});

export const CharacterAnalyzeInputSchema = z.object({
  artworkPath: z.string(),
});

export const CharacterDetectPartsInputSchema = z.object({
  artworkPath: z.string(),
  threshold: z.number().min(0).max(255).default(16),
});

export const CharacterGetRigInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
});

export const CharacterCreateBoneInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
  name: z.string(),
  parentName: z.string().nullable().default(null),
  length: z.number().default(40),
  x: z.number().default(0),
  y: z.number().default(0),
  rotation: z.number().default(0),
  color: z.string().optional(),
});

export const CharacterUpdateBoneInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
  boneName: z.string(),
  parentName: z.string().nullable().optional(),
  length: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  rotation: z.number().optional(),
  rotationLimit: z.object({ min: number(), max: number() }).optional(),
});

function number() {
  return z.number();
}

export const CharacterUpdateWeightsInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
  meshName: z.string(),
  vertexIndex: z.number().int().nonnegative(),
  weights: z.array(
    z.object({
      boneIndex: z.number().int().nonnegative(),
      weight: z.number().min(0).max(1),
    })
  ),
});

export const CharacterCreateIKInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
  name: z.string(),
  parentBoneName: z.string(),
  childBoneName: z.string(),
  targetBoneName: z.string(),
  bendPositive: z.boolean().default(true),
  mix: z.number().min(0).max(1).default(1.0),
});

export const CharacterGenerateAnimationInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
  action: z.enum([
    'idle',
    'walk',
    'run',
    'wave',
    'jump',
    'dance',
    'breathing',
    'blink',
    'head_turn',
    'smile',
    'hand_gesture',
  ]),
  duration: z.number().positive().optional(),
  fps: z.number().positive().default(30),
  intensity: z.number().positive().default(1.0),
});

export const CharacterUpdateKeyframesInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
  animationName: z.string(),
  boneName: z.string(),
  channel: z.enum(['rotate', 'translate', 'scale']),
  keyframes: z.array(
    z.object({
      time: z.number().nonnegative(),
      value: z.union([z.number(), z.tuple([z.number(), z.number()])]),
      curve: z.array(z.number()).optional(),
    })
  ),
});

export const CharacterPreviewInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
  animationName: z.string().optional(),
  time: z.number().nonnegative().default(0),
});

export const CharacterValidateInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
});

export const CharacterSaveInputSchema = z.object({
  character: z.record(z.any()),
  projectId: z.string().optional(),
});

export const CharacterExportInputSchema = z.object({
  characterId: z.string(),
  projectId: z.string().optional(),
  format: z.enum(['spine3.8', 'spine4.2', 'animforge2']),
});
