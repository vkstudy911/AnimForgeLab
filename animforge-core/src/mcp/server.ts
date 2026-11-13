import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProcessRunner } from '../../adapters/process-runner.js';
import { toToolErrorResult, toToolSuccessResult } from './errors.js';
import {
  CancelRenderInputSchema,
  CreateAnimationInputSchema,
  CreateProjectInputSchema,
  CreateSceneInputSchema,
  DoctorInputSchema,
  ExportVideoInputSchema,
  GeneratePreviewInputSchema,
  GetProjectInputSchema,
  GetProjectStatusInputSchema,
  GetRenderStatusInputSchema,
  ImportAssetInputSchema,
  ListAssetsInputSchema,
  ListProjectsInputSchema,
  ListScenesInputSchema,
  UpdateKeyframesInputSchema,
  UpdateSceneInputSchema,
} from './schemas.js';
import { AnimForgeMcpService } from './tools.js';
import { CharacterMcpService } from './character_tools.js';
import {
  CharacterAnalyzeInputSchema,
  CharacterCreateBoneInputSchema,
  CharacterCreateIKInputSchema,
  CharacterDetectPartsInputSchema,
  CharacterExportInputSchema,
  CharacterGenerateAnimationInputSchema,
  CharacterGetRigInputSchema,
  CharacterImportInputSchema,
  CharacterListInputSchema,
  CharacterPreviewInputSchema,
  CharacterSaveInputSchema,
  CharacterUpdateBoneInputSchema,
  CharacterUpdateKeyframesInputSchema,
  CharacterUpdateWeightsInputSchema,
  CharacterValidateInputSchema,
} from './character_schemas.js';
import { validateWorkspaceDir } from './validation.js';

export interface CreateAnimForgeMcpServerOptions {
  workspaceDir: string;
  processRunner?: ProcessRunner;
}

export interface AnimForgeMcpServerHandle {
  server: McpServer;
  service: AnimForgeMcpService;
  close: () => Promise<void>;
}

async function runTool<T extends Record<string, unknown>>(fn: () => Promise<T>) {
  try {
    return toToolSuccessResult(await fn());
  } catch (err: unknown) {
    return toToolErrorResult(err);
  }
}

export async function createAnimForgeMcpServer(
  options: CreateAnimForgeMcpServerOptions
): Promise<AnimForgeMcpServerHandle> {
  const workspaceDir = await validateWorkspaceDir(options.workspaceDir);
  const service = new AnimForgeMcpService({
    workspaceDir,
    processRunner: options.processRunner,
  });
  const charService = new CharacterMcpService(workspaceDir);

  const server = new McpServer({
    name: 'animforge',
    version: '0.1.0',
  });

  server.registerTool(
    'animforge_doctor',
    {
      description: 'Check AnimForge Studio engine, Chrome, FFmpeg, ffprobe, and workspace readiness.',
      inputSchema: DoctorInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => runTool(() => service.doctor())
  );

  server.registerTool(
    'animforge_list_projects',
    {
      description: 'List existing animation projects stored in the AnimForge workspace.',
      inputSchema: ListProjectsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => service.listProjects(args))
  );

  server.registerTool(
    'animforge_create_project',
    {
      description:
        'Create a new AnimForge animation project from a prompt. Pass confirmOverwrite: true if overwriting an existing projectId.',
      inputSchema: CreateProjectInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => service.createProject(args))
  );

  server.registerTool(
    'animforge_get_project',
    {
      description: 'Retrieve full canonical metadata, scenes, characters, and assets for a project.',
      inputSchema: GetProjectInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => service.getProject(args))
  );

  server.registerTool(
    'animforge_get_project_status',
    {
      description: 'Get workflow status, scene/asset counts, active render state, and output.mp4 status for a project.',
      inputSchema: GetProjectStatusInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => service.getProjectStatus(args))
  );

  server.registerTool(
    'animforge_list_scenes',
    {
      description: 'List scenes ordered by sequenceIndex in an AnimForge project.',
      inputSchema: ListScenesInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => service.listScenes(args))
  );

  server.registerTool(
    'animforge_create_scene',
    {
      description: 'Create a new scene in an existing AnimForge project and recompile its composition HTML.',
      inputSchema: CreateSceneInputSchema,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => service.createScene(args))
  );

  server.registerTool(
    'animforge_update_scene',
    {
      description: 'Update an existing scene metadata/duration/sequence/transition (requires confirmOverwrite: true).',
      inputSchema: UpdateSceneInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => service.updateScene(args))
  );

  server.registerTool(
    'animforge_list_assets',
    {
      description: 'List project assets and approved workspace library files inside assets/.',
      inputSchema: ListAssetsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => service.listAssets(args))
  );

  server.registerTool(
    'animforge_import_asset',
    {
      description:
        'Import an allowed media/rig asset from approved workspace directories (assets/ or projects/<id>/assets/) into a project.',
      inputSchema: ImportAssetInputSchema,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => service.importAsset(args))
  );

  server.registerTool(
    'animforge_create_animation',
    {
      description: 'Attach a GiveMotion-supported character action (idle, walk, run, wave, smile, blink, look_around) to a scene.',
      inputSchema: CreateAnimationInputSchema,
      annotations: { destructiveHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => service.createAnimation(args))
  );

  server.registerTool(
    'animforge_update_keyframes',
    {
      description:
        'Update scene timeline actions, camera moves, or audio tracks (requires confirmOverwrite: true; mesh/bone .stretch editing is M2).',
      inputSchema: UpdateKeyframesInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => service.updateKeyframes(args))
  );

  server.registerTool(
    'animforge_generate_preview',
    {
      description: 'Run GiveMotion visual QA check and compile standalone playback bundle without starting any HTTP server.',
      inputSchema: GeneratePreviewInputSchema,
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => service.generatePreview(args))
  );

  server.registerTool(
    'animforge_get_render_status',
    {
      description: 'Get progress and status for a render job by jobId.',
      inputSchema: GetRenderStatusInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => service.getRenderStatus(args))
  );

  server.registerTool(
    'animforge_cancel_render',
    {
      description: 'Cancel an active GiveMotion video render for projectId.',
      inputSchema: CancelRenderInputSchema,
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => service.cancelRender(args))
  );

  server.registerTool(
    'animforge_export_video',
    {
      description:
        'Render and export project MP4 via Chrome + FFmpeg and inspect with ffprobe. Requires confirm: true.',
      inputSchema: ExportVideoInputSchema,
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    async (args, extra) =>
      runTool(() =>
        service.exportVideo(args, {
          signal: extra.signal,
          onProgress: async (info) => {
            const token = extra._meta?.progressToken;
            if (token !== undefined) {
              await extra
                .sendNotification({
                  method: 'notifications/progress',
                  params: {
                    progressToken: token,
                    progress: info.progress,
                    total: 100,
                    message: info.phase,
                  },
                })
                .catch(() => undefined);
            }
          },
        })
      )
  );

  // ---- Character Studio MCP Tools (15 Tools) ----

  // 1. character_list
  server.registerTool(
    'character_list',
    {
      description: 'List characters in workspace or specified project.',
      inputSchema: CharacterListInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => charService.listCharacters(args))
  );

  // 2. character_import
  server.registerTool(
    'character_import',
    {
      description: 'Import flat PNG or layered artwork, auto-rig bones, IK and create AnimForgeCharacterV2.',
      inputSchema: CharacterImportInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => charService.importCharacter(args))
  );

  // 3. character_analyze
  server.registerTool(
    'character_analyze',
    {
      description: 'Analyze artwork image dimensions, alpha silhouette, and aspect ratio.',
      inputSchema: CharacterAnalyzeInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => charService.analyzeArtwork(args))
  );

  // 4. character_detect_parts
  server.registerTool(
    'character_detect_parts',
    {
      description: 'Decompose flat artwork into anatomical body parts (head, torso, arms, legs, face).',
      inputSchema: CharacterDetectPartsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => charService.detectParts(args))
  );

  // 5. character_get_rig
  server.registerTool(
    'character_get_rig',
    {
      description: 'Retrieve full Rigby2D skeletal rig: bones, slots, IK chains, meshes, animations.',
      inputSchema: CharacterGetRigInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => charService.getRig(args))
  );

  // 6. character_create_bone
  server.registerTool(
    'character_create_bone',
    {
      description: 'Create and add a new bone to a character skeleton.',
      inputSchema: CharacterCreateBoneInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => charService.createBone(args))
  );

  // 7. character_update_bone
  server.registerTool(
    'character_update_bone',
    {
      description: 'Update bone transforms, length, parent, or rotation limits.',
      inputSchema: CharacterUpdateBoneInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => charService.updateBone(args))
  );

  // 8. character_update_weights
  server.registerTool(
    'character_update_weights',
    {
      description: 'Update vertex bone weights on a deformable mesh.',
      inputSchema: CharacterUpdateWeightsInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => charService.updateWeights(args))
  );

  // 9. character_create_ik
  server.registerTool(
    'character_create_ik',
    {
      description: 'Create a 2-bone IK constraint chain (parent bone, child bone, target handle).',
      inputSchema: CharacterCreateIKInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => charService.createIK(args))
  );

  // 10. character_generate_animation
  server.registerTool(
    'character_generate_animation',
    {
      description: 'Generate AI motion clip (idle, walk, run, wave, jump, dance, breathing, blink, etc.).',
      inputSchema: CharacterGenerateAnimationInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => charService.generateAnimation(args))
  );

  // 11. character_update_keyframes
  server.registerTool(
    'character_update_keyframes',
    {
      description: 'Add or update keyframes for a bone animation channel (rotate, translate, scale).',
      inputSchema: CharacterUpdateKeyframesInputSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => charService.updateKeyframes(args))
  );

  // 12. character_preview
  server.registerTool(
    'character_preview',
    {
      description: 'Evaluate character pose at a given animation time and return bone world transforms.',
      inputSchema: CharacterPreviewInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => charService.previewCharacter(args))
  );

  // 13. character_validate
  server.registerTool(
    'character_validate',
    {
      description: 'Validate character data model, schema compliance, and check for cyclic bone hierarchies.',
      inputSchema: CharacterValidateInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => charService.validateCharacter(args))
  );

  // 14. character_save
  server.registerTool(
    'character_save',
    {
      description: 'Save character JSON to project or global library.',
      inputSchema: CharacterSaveInputSchema,
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => charService.saveCharacter(args))
  );

  // 15. character_export
  server.registerTool(
    'character_export',
    {
      description: 'Export character to Spine 3.8/4.2 JSON or AnimForge 2.0 format.',
      inputSchema: CharacterExportInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => charService.exportCharacter(args))
  );

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await service.close();
    await server.close().catch(() => undefined);
  };

  return { server, service, close };
}
