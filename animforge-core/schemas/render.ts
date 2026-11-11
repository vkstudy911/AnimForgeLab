import { z } from 'zod';

export const RenderJobStatusSchema = z.enum([
  'queued',
  'rendering',
  'completed',
  'failed',
]);

export const RenderJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  engine: z.enum(['givemotion', 'remotion', 'stretchystudio', 'composite']),
  status: RenderJobStatusSchema,
  progress: z.number().min(0).max(100).default(0),
  outputFilePath: z.string().optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
});

export const RenderStatusSchema = z.object({
  jobId: z.string(),
  status: RenderJobStatusSchema,
  progress: z.number().min(0).max(100),
  outputFilePath: z.string().optional(),
  error: z.string().optional(),
});

export type RenderJobStatus = z.infer<typeof RenderJobStatusSchema>;
export type RenderJob = z.infer<typeof RenderJobSchema>;
export type RenderStatus = z.infer<typeof RenderStatusSchema>;
