import { z } from 'zod';

export const StoryBeatSchema = z.object({
  beatNumber: z.number().int().positive(),
  sceneTitle: z.string(),
  visualSummary: z.string(),
  characterInteractions: z.string(),
  cameraNotes: z.string(),
  soundNotes: z.string().optional(),
  targetDurationSeconds: z.number().positive(),
});

export const StoryboardSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  logline: z.string(),
  artStyle: z.string().default('2D cartoon flat-vector'),
  beats: z.array(StoryBeatSchema).min(1),
  totalDurationSeconds: z.number().positive(),
  createdAt: z.string().datetime(),
});

export type StoryBeat = z.infer<typeof StoryBeatSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
