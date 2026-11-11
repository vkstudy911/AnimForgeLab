import { z } from 'zod';

export const AssetTypeSchema = z.enum([
  'character',
  'background',
  'prop',
  'audio',
  'font',
  'model',
  'reference',
]);

export const AssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: AssetTypeSchema,
  uri: z.string(),
  mimeType: z.string().optional(),
  metadata: z.record(z.any()).default({}),
  createdAt: z.string().datetime(),
});

export type AssetType = z.infer<typeof AssetTypeSchema>;
export type Asset = z.infer<typeof AssetSchema>;
