import { z } from 'zod';

export const BodyPartRoleSchema = z.enum([
  'head',
  'neck',
  'torso',
  'chest',
  'pelvis',
  'upperarm',
  'forearm',
  'hand',
  'thigh',
  'shin',
  'foot',
  'face',
  'eye',
  'eyebrow',
  'mouth',
  'nose',
  'hair',
  'accessory',
  'other',
]);

export const BodySideSchema = z.enum(['l', 'r']).nullable().optional();

export const DetectedPartSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: BodyPartRoleSchema,
  side: BodySideSchema,
  zIndex: z.number().default(0),
  polygon: z.array(z.tuple([z.number(), z.number()])),
  centroid: z.tuple([z.number(), z.number()]),
  pivot: z.tuple([z.number(), z.number()]),
  boneId: z.string().optional(),
  imagePath: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
});

export const BoneSetupSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  rotation: z.number().default(0),
  scaleX: z.number().default(1),
  scaleY: z.number().default(1),
});

export const RigbyBoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentIndex: z.number().nullable().default(null),
  length: z.number().default(0),
  setup: BoneSetupSchema,
  inherit: z
    .enum([
      'normal',
      'onlyTranslation',
      'noRotationOrReflection',
      'noScale',
      'noScaleOrReflection',
    ])
    .optional()
    .default('normal'),
  rotationLimit: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
  color: z.string().optional(),
});

export const RigbySlotSchema = z.object({
  name: z.string(),
  boneIndex: z.number(),
  attachmentName: z.string().nullable().default(null),
  color: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  blend: z.enum(['normal', 'additive', 'multiply', 'screen']).default('normal'),
});

export const RigbyIKConstraintSchema = z.object({
  name: z.string(),
  bones: z.tuple([z.number(), z.number()]), // [parent, child]
  target: z.number(), // target bone index
  bendPositive: z.boolean().default(true),
  mix: z.number().min(0).max(1).default(1),
});

export const RigbyMeshSchema = z.object({
  vertices: z.array(z.number()),
  uvs: z.array(z.number()),
  triangles: z.array(z.number()),
  weights: z.array(
    z.array(
      z.object({
        boneIndex: z.number(),
        weight: z.number(),
      })
    )
  ),
});

export const KeyframeSchema = z.object({
  time: z.number().nonnegative(),
  value: z.union([z.number(), z.tuple([z.number(), z.number()])]),
  curve: z.array(z.number()).optional(),
});

export const BoneAnimationChannelSchema = z.object({
  rotate: z
    .array(
      z.object({
        time: z.number().nonnegative(),
        value: z.number(),
        curve: z.array(z.number()).optional(),
      })
    )
    .optional(),
  translate: z
    .array(
      z.object({
        time: z.number().nonnegative(),
        value: z.tuple([z.number(), z.number()]),
        curve: z.array(z.number()).optional(),
      })
    )
    .optional(),
  scale: z
    .array(
      z.object({
        time: z.number().nonnegative(),
        value: z.tuple([z.number(), z.number()]),
        curve: z.array(z.number()).optional(),
      })
    )
    .optional(),
});

export const RigbyAnimationClipSchema = z.object({
  name: z.string(),
  duration: z.number().positive().default(1),
  fps: z.number().positive().default(30),
  bones: z.record(BoneAnimationChannelSchema).default({}),
});

export const AnimForgeCharacterV2Schema = z.object({
  format: z.literal('animforge-character/2.0'),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.number().default(2),
  engine: z.literal('rigby2d'),

  sourceArtwork: z.object({
    originalPath: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    kind: z.enum(['flat_png', 'layered_png', 'psd']).default('flat_png'),
  }),

  parts: z.array(DetectedPartSchema).default([]),

  skeleton: z.object({
    bones: z.array(RigbyBoneSchema).default([]),
    slots: z.array(RigbySlotSchema).default([]),
    ik: z.array(RigbyIKConstraintSchema).default([]),
  }),

  meshes: z.record(RigbyMeshSchema).optional().default({}),
  animations: z.record(RigbyAnimationClipSchema).default({}),
  poses: z
    .record(z.record(z.object({ rotation: z.number().optional(), x: z.number().optional(), y: z.number().optional() })))
    .optional()
    .default({}),
});

export type BodyPartRole = z.infer<typeof BodyPartRoleSchema>;
export type BodySide = z.infer<typeof BodySideSchema>;
export type DetectedPart = z.infer<typeof DetectedPartSchema>;
export type RigbyBone = z.infer<typeof RigbyBoneSchema>;
export type RigbySlot = z.infer<typeof RigbySlotSchema>;
export type RigbyIKConstraint = z.infer<typeof RigbyIKConstraintSchema>;
export type RigbyMesh = z.infer<typeof RigbyMeshSchema>;
export type RigbyAnimationClip = z.infer<typeof RigbyAnimationClipSchema>;
export type AnimForgeCharacterV2 = z.infer<typeof AnimForgeCharacterV2Schema>;
