import { z } from 'zod';
import { CharacterActionSchema } from './character.js';

export const CameraMovementSchema = z.object({
  type: z.enum(['static', 'pan', 'zoom', 'push', 'pull', 'dolly', 'shake']),
  startX: z.number().default(0),
  startY: z.number().default(0),
  endX: z.number().default(0),
  endY: z.number().default(0),
  startZoom: z.number().default(1.0),
  endZoom: z.number().default(1.0),
  easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring']).default('ease-in-out'),
  duration: z.number().positive(),
});

export const AnimationTimelineSchema = z.object({
  duration: z.number().positive(),
  fps: z.number().int().positive().default(30),
  characterActions: z.array(CharacterActionSchema).default([]),
  cameraMoves: z.array(CameraMovementSchema).default([]),
  audioTracks: z.array(z.object({
    assetId: z.string(),
    startTime: z.number().nonnegative(),
    volume: z.number().min(0).max(1).default(1),
    loop: z.boolean().default(false),
    muted: z.boolean().optional(),
  })).default([]),
});

export const SceneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sequenceIndex: z.number().int().nonnegative(),
  title: z.string(),
  description: z.string(),
  duration: z.number().positive(),
  backgroundAssetId: z.string().optional(),
  characterIds: z.array(z.string()).default([]),
  timeline: AnimationTimelineSchema,
  transition: z.object({
    type: z.enum(['none', 'fade', 'wipe', 'slide', 'dissolve']).default('fade'),
    duration: z.number().nonnegative().default(0.5),
  }).default({ type: 'fade', duration: 0.5 }),
});

export type CameraMovement = z.infer<typeof CameraMovementSchema>;
export type AnimationTimeline = z.infer<typeof AnimationTimelineSchema>;
export type Scene = z.infer<typeof SceneSchema>;
