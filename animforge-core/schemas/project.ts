import { z } from 'zod';
import { StoryboardSchema } from './storyboard.js';
import { SceneSchema } from './scene.js';
import { CharacterSchema } from './character.js';
import { AssetSchema } from './asset.js';

export const ProjectConfigSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
  fps: z.number().int().positive().default(30),
  preferredEngine: z.enum(['givemotion', 'remotion', 'stretchystudio', 'composite']).default('givemotion'),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  preferredEngine: z.enum(['givemotion', 'remotion', 'stretchystudio', 'composite']),
  status: z.enum(['created', 'storyboarded', 'assets_ready', 'scenes_planned', 'rendered', 'completed']).default('created'),
  storyboard: StoryboardSchema.optional(),
  characters: z.array(CharacterSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  scenes: z.array(SceneSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type Project = z.infer<typeof ProjectSchema>;
