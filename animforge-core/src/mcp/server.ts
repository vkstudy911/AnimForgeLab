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

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await service.close();
    await server.close().catch(() => undefined);
  };

  return { server, service, close };
}
