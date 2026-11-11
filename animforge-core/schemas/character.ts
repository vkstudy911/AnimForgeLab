import { z } from 'zod';

export const CharacterPartSchema = z.object({
  id: z.string(),
  name: z.string(),
  layerName: z.string(),
  pivot: z.object({ x: z.number(), y: z.number() }),
  zIndex: z.number().default(0),
  parentPartId: z.string().optional(),
});

export const CharacterActionSchema = z.object({
  actionId: z.string(),
  name: z.enum(['idle', 'walk', 'run', 'wave', 'smile', 'blink', 'look_around', 'custom']),
  startTime: z.number().nonnegative(),
  duration: z.number().positive(),
  parameters: z.record(z.any()).default({}),
});

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  parts: z.array(CharacterPartSchema).default([]),
  defaultRigId: z.string().optional(),
  colorPalette: z.array(z.string()).default([]),
});

export type CharacterPart = z.infer<typeof CharacterPartSchema>;
export type CharacterAction = z.infer<typeof CharacterActionSchema>;
export type Character = z.infer<typeof CharacterSchema>;
