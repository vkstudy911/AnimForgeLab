import { z } from 'zod';
import { AssetTypeSchema } from '../../schemas/asset.js';
import { CameraMovementSchema } from '../../schemas/scene.js';

export const safeIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,64}$/, 'ID must match ^[a-zA-Z0-9_-]{1,64}$');

export const SafeActionNameSchema = z.enum([
  'idle',
  'walk',
  'run',
  'wave',
  'smile',
  'blink',
  'look_around',
]);

const TransitionInputSchema = z
  .object({
    type: z.enum(['none', 'fade', 'wipe', 'slide', 'dissolve']).default('fade'),
    duration: z.number().finite().nonnegative().max(30).default(0.5),
  })
  .strict();

const CharacterActionInputSchema = z
  .object({
    actionId: safeIdSchema,
    name: SafeActionNameSchema,
    startTime: z.number().finite().min(0).max(600),
    duration: z.number().finite().positive().max(600),
    parameters: z.record(z.unknown()).default({}),
  })
  .strict();

const AudioTrackInputSchema = z
  .object({
    assetId: safeIdSchema,
    startTime: z.number().finite().min(0).max(600),
    volume: z.number().finite().min(0).max(1).default(1),
    loop: z.boolean().default(false),
  })
  .strict();

export const DoctorInputSchema = z.object({}).strict();

export const ListProjectsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export const CreateProjectInputSchema = z
  .object({
    projectId: safeIdSchema.optional(),
    name: z.string().min(1).max(120),
    prompt: z.string().min(1).max(4000),
    width: z.number().int().min(128).max(3840).default(1280),
    height: z.number().int().min(128).max(2160).default(720),
    fps: z.number().int().min(1).max(120).default(30),
    preferredEngine: z.enum(['givemotion']).default('givemotion'),
    confirmOverwrite: z.boolean().optional(),
  })
  .strict();

export const GetProjectInputSchema = z
  .object({
    projectId: safeIdSchema,
  })
  .strict();

export const GetProjectStatusInputSchema = z
  .object({
    projectId: safeIdSchema,
  })
  .strict();

export const ListScenesInputSchema = z
  .object({
    projectId: safeIdSchema,
  })
  .strict();

export const CreateSceneInputSchema = z
  .object({
    projectId: safeIdSchema,
    sceneId: safeIdSchema.optional(),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    duration: z.number().finite().positive().max(600),
    sequenceIndex: z.number().int().min(0).max(1000).optional(),
    characterIds: z.array(safeIdSchema).optional(),
    backgroundAssetId: safeIdSchema.optional(),
    transition: TransitionInputSchema.optional(),
    confirmOverwrite: z.boolean().optional(),
  })
  .strict();

export const UpdateSceneInputSchema = z
  .object({
    projectId: safeIdSchema,
    sceneId: safeIdSchema,
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(2000).optional(),
    duration: z.number().finite().positive().max(600).optional(),
    sequenceIndex: z.number().int().min(0).max(1000).optional(),
    characterIds: z.array(safeIdSchema).optional(),
    backgroundAssetId: safeIdSchema.nullable().optional(),
    transition: TransitionInputSchema.optional(),
    confirmOverwrite: z.boolean().optional(),
  })
  .strict();

export const ListAssetsInputSchema = z
  .object({
    projectId: safeIdSchema.optional(),
    includeWorkspaceLibrary: z.boolean().default(true),
  })
  .strict();

export const ImportAssetInputSchema = z
  .object({
    projectId: safeIdSchema,
    assetId: safeIdSchema.optional(),
    name: z.string().min(1).max(120),
    assetType: AssetTypeSchema,
    sourcePath: z.string().min(1).max(500),
    confirmOverwrite: z.boolean().optional(),
  })
  .strict();

export const CreateAnimationInputSchema = z
  .object({
    projectId: safeIdSchema,
    sceneId: safeIdSchema,
    characterId: safeIdSchema,
    actionId: safeIdSchema.optional(),
    actionName: SafeActionNameSchema,
    startTime: z.number().finite().min(0).max(600),
    duration: z.number().finite().positive().max(600),
    parameters: z.record(z.unknown()).default({}),
    confirmOverwrite: z.boolean().optional(),
  })
  .strict();

export const UpdateKeyframesInputSchema = z
  .object({
    projectId: safeIdSchema,
    sceneId: safeIdSchema,
    duration: z.number().finite().positive().max(600).optional(),
    fps: z.number().int().min(1).max(120).optional(),
    characterActions: z.array(CharacterActionInputSchema).optional(),
    cameraMoves: z.array(CameraMovementSchema).optional(),
    audioTracks: z.array(AudioTrackInputSchema).optional(),
    confirmOverwrite: z.boolean().optional(),
  })
  .strict();

export const GeneratePreviewInputSchema = z
  .object({
    projectId: safeIdSchema,
    sceneId: safeIdSchema.optional(),
  })
  .strict();

export const GetRenderStatusInputSchema = z
  .object({
    jobId: safeIdSchema,
  })
  .strict();

export const CancelRenderInputSchema = z
  .object({
    projectId: safeIdSchema,
  })
  .strict();

export const ExportVideoInputSchema = z
  .object({
    projectId: safeIdSchema,
    confirm: z.literal(true),
    wait: z.boolean().default(true),
    timeoutMs: z.number().int().min(1000).max(600000).default(300000),
  })
  .strict();

export const ToolInputSchemas = {
  animforge_doctor: DoctorInputSchema,
  animforge_list_projects: ListProjectsInputSchema,
  animforge_create_project: CreateProjectInputSchema,
  animforge_get_project: GetProjectInputSchema,
  animforge_get_project_status: GetProjectStatusInputSchema,
  animforge_list_scenes: ListScenesInputSchema,
  animforge_create_scene: CreateSceneInputSchema,
  animforge_update_scene: UpdateSceneInputSchema,
  animforge_list_assets: ListAssetsInputSchema,
  animforge_import_asset: ImportAssetInputSchema,
  animforge_create_animation: CreateAnimationInputSchema,
  animforge_update_keyframes: UpdateKeyframesInputSchema,
  animforge_generate_preview: GeneratePreviewInputSchema,
  animforge_get_render_status: GetRenderStatusInputSchema,
  animforge_cancel_render: CancelRenderInputSchema,
  animforge_export_video: ExportVideoInputSchema,
} as const;
