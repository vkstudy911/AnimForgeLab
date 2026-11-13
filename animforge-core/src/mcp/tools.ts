import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { GivemotionAdapter } from '../../adapters/givemotion.adapter.js';
import { createNodeProcessRunner, ProcessRunner } from '../../adapters/process-runner.js';
import {
  AssetSchema,
  CharacterSchema,
  Project,
  ProjectConfigSchema,
  RenderJob,
  Scene,
  SceneSchema,
  StoryboardSchema,
} from '../../schemas/index.js';
import { assertSafeId, resolveProjectDir, resolveWorkspacePath } from '../../utils/paths.js';
import { listSafeFilesRecursive } from '../assets/workspaceAssets.js';
import { AnimForgeDatabase } from '../database.js';
import { probeVideo as sharedProbeVideo } from '../media/ffprobe.js';
import { AnimForgePipeline } from '../pipeline.js';
import { McpToolError } from './errors.js';
import {
  CancelRenderInputSchema,
  CreateAnimationInputSchema,
  CreateProjectInputSchema,
  CreateSceneInputSchema,
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
import {
  assertApprovedAssetSourcePath,
  requireConfirmation,
  resolveSafeDestAssetPath,
} from './validation.js';

const DiskManifestSchema = z.object({
  config: ProjectConfigSchema,
  storyboard: StoryboardSchema.optional(),
  characters: z.array(CharacterSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  scenes: z.array(SceneSchema).default([]),
});

let mcpIdSeq = 0;
function nextMcpId(prefix: string): string {
  mcpIdSeq = (mcpIdSeq + 1) % 10000;
  return `${prefix}_${Date.now()}_${mcpIdSeq}`;
}

function resolveRepoEnginePath(workspaceDir: string, ...subpath: string[]): string {
  const inWorkspace = path.resolve(workspaceDir, ...subpath);
  if (fsSync.existsSync(inWorkspace)) {
    return inWorkspace;
  }
  const fromDist = path.resolve(import.meta.dirname, '..', '..', '..', '..', ...subpath);
  if (fsSync.existsSync(fromDist)) {
    return fromDist;
  }
  const fromSrc = path.resolve(import.meta.dirname, '..', '..', '..', ...subpath);
  return fsSync.existsSync(fromSrc) ? fromSrc : inWorkspace;
}

export interface ExportProgressInfo {
  phase: string;
  progress: number;
}

export interface AnimForgeMcpServiceOptions {
  workspaceDir: string;
  processRunner?: ProcessRunner;
}

export class AnimForgeMcpService {
  readonly workspaceDir: string;
  readonly projectsRoot: string;
  private readonly runner: ProcessRunner;
  private readonly db: AnimForgeDatabase;
  private readonly pipeline: AnimForgePipeline;
  private readonly adapter: GivemotionAdapter;
  private readonly activeRenders = new Set<string>();
  private readonly cancelledRenders = new Set<string>();
  private readonly latestJobByProject = new Map<string, string>();
  private closed = false;

  constructor(options: AnimForgeMcpServiceOptions) {
    this.workspaceDir = options.workspaceDir;
    this.runner = options.processRunner ?? createNodeProcessRunner();
    this.projectsRoot = resolveWorkspacePath(this.workspaceDir, 'projects');
    fsSync.mkdirSync(this.projectsRoot, { recursive: true });
    this.db = new AnimForgeDatabase(path.join(this.projectsRoot, 'animforge.db'));
    this.pipeline = new AnimForgePipeline(this.db);
    this.adapter = new GivemotionAdapter(
      this.workspaceDir,
      resolveRepoEnginePath(this.workspaceDir, 'engines', 'givemotion', 'src', 'cli.js'),
      this.runner
    );
  }

  getActiveRenders(): string[] {
    return [...this.activeRenders];
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const projectId of [...this.activeRenders]) {
      this.cancelledRenders.add(projectId);
      await this.adapter.cancelRender(projectId).catch(() => false);
    }
    await this.adapter.dispose().catch(() => undefined);
    this.db.close();
  }

  private async loadProject(projectId: string): Promise<Project> {
    const safeId = assertSafeId(projectId, 'project');
    const fromDb = this.db.getProject(safeId);
    if (fromDb) return fromDb;

    const projectDir = resolveProjectDir(this.workspaceDir, safeId);
    const manifestPath = path.join(projectDir, 'project.animforge.json');
    let rawText: string;
    let mtimeIso: string;
    try {
      const [text, stat] = await Promise.all([
        fs.readFile(manifestPath, 'utf-8'),
        fs.stat(manifestPath),
      ]);
      rawText = text;
      mtimeIso = stat.mtime.toISOString();
    } catch {
      throw new McpToolError('NOT_FOUND', `Project not found: ${safeId}`);
    }

    const parsed = DiskManifestSchema.parse(JSON.parse(rawText));
    for (const scene of parsed.scenes) {
      assertSafeId(scene.id, 'scene');
      if (scene.projectId !== safeId) {
        throw new McpToolError('EXECUTION_FAILED', `Scene ${scene.id} projectId mismatch`);
      }
    }

    return {
      id: safeId,
      name: parsed.config.name,
      prompt: parsed.config.prompt,
      width: parsed.config.width,
      height: parsed.config.height,
      fps: parsed.config.fps,
      preferredEngine: parsed.config.preferredEngine,
      status: parsed.scenes.length > 0 ? 'scenes_planned' : 'created',
      ...(parsed.storyboard ? { storyboard: parsed.storyboard } : {}),
      characters: parsed.characters,
      assets: parsed.assets,
      scenes: parsed.scenes,
      createdAt: mtimeIso,
      updatedAt: mtimeIso,
    };
  }

  private async persistProject(project: Project): Promise<Project> {
    const updated: Project = {
      ...project,
      scenes: [...project.scenes].sort((a, b) => a.sequenceIndex - b.sequenceIndex),
      updatedAt: new Date().toISOString(),
    };
    await this.adapter.saveProjectState(updated);
    this.db.saveProject(updated);
    return updated;
  }

  private async projectExists(projectId: string): Promise<boolean> {
    if (this.db.getProject(projectId)) return true;
    const projectDir = resolveProjectDir(this.workspaceDir, projectId);
    return fsSync.existsSync(path.join(projectDir, 'project.animforge.json'));
  }

  async doctor(): Promise<Record<string, unknown>> {
    const gmReport = await this.adapter.getDoctorInfo();
    let ffprobeOk = false;
    let ffprobeVersion: string | undefined;
    try {
      const res = await this.runner.execFile('ffprobe', ['-version']);
      ffprobeOk = res.exitCode === 0;
      ffprobeVersion = res.stdout.split('\n')[0]?.trim() || undefined;
    } catch {
      ffprobeOk = false;
    }

    const stretchPkg = resolveRepoEnginePath(this.workspaceDir, 'engines', 'stretchystudio', 'package.json');
    const remotionDir = resolveRepoEnginePath(this.workspaceDir, 'engines', 'remotion');

    return {
      ok: true,
      doctor: {
        os: `${process.platform} (${process.arch})`,
        node: gmReport.node ?? process.version,
        chrome: gmReport.chrome,
        chromeOk: gmReport.chromeOk,
        ffmpeg: gmReport.ffmpeg,
        ffmpegOk: gmReport.ffmpegOk,
        ffprobeOk,
        ffprobeVersion,
        workspaceDir: this.workspaceDir,
        projectsDirExists: fsSync.existsSync(this.projectsRoot),
        assetsDirExists: fsSync.existsSync(path.join(this.workspaceDir, 'assets')),
        engines: {
          givemotionReady: gmReport.chromeOk && gmReport.ffmpegOk,
          stretchyStudioAvailable: fsSync.existsSync(stretchPkg),
          remotionAvailable: fsSync.existsSync(remotionDir),
        },
        previewServerExposed: false,
      },
    };
  }

  async listProjects(rawInput: unknown): Promise<Record<string, unknown>> {
    const input = ListProjectsInputSchema.parse(rawInput ?? {});
    const projects = this.db.listProjects();
    return {
      ok: true,
      total: projects.length,
      projects: input.limit ? projects.slice(0, input.limit) : projects,
    };
  }

  async createProject(rawInput: unknown): Promise<Record<string, unknown>> {
    const input = CreateProjectInputSchema.parse(rawInput);
    const planned = await this.pipeline.planProject(
      {
        name: input.name,
        prompt: input.prompt,
        width: input.width,
        height: input.height,
        fps: input.fps,
        preferredEngine: input.preferredEngine,
      },
      { projectId: input.projectId }
    );

    if (await this.projectExists(planned.id)) {
      requireConfirmation(input.confirmOverwrite, `overwrite existing project '${planned.id}'`);
    }

    const saved = await this.persistProject(planned);
    const projectDir = resolveProjectDir(this.workspaceDir, saved.id);
    return { ok: true, project: saved, projectDir };
  }

  async getProject(rawInput: unknown): Promise<Record<string, unknown>> {
    const { projectId } = GetProjectInputSchema.parse(rawInput);
    const project = await this.loadProject(projectId);
    return { ok: true, project };
  }

  async getProjectStatus(rawInput: unknown): Promise<Record<string, unknown>> {
    const { projectId } = GetProjectStatusInputSchema.parse(rawInput);
    const project = await this.loadProject(projectId);
    const projectDir = resolveProjectDir(this.workspaceDir, project.id);
    const mp4Path = path.join(projectDir, 'output.mp4');
    const mp4Exists = fsSync.existsSync(mp4Path);
    const latestJobId = this.latestJobByProject.get(project.id);
    const latestJob = latestJobId ? this.db.getRenderJob(latestJobId) : null;

    return {
      ok: true,
      projectId: project.id,
      status: project.status,
      renderInProgress: this.activeRenders.has(project.id),
      sceneCount: project.scenes.length,
      characterCount: project.characters.length,
      assetCount: project.assets.length,
      outputMp4Exists: mp4Exists,
      outputMp4Path: mp4Exists ? mp4Path : null,
      latestJob,
      updatedAt: project.updatedAt,
    };
  }

  async listScenes(rawInput: unknown): Promise<Record<string, unknown>> {
    const { projectId } = ListScenesInputSchema.parse(rawInput);
    const project = await this.loadProject(projectId);
    const scenes = [...project.scenes].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    return { ok: true, projectId: project.id, scenes };
  }

  async createScene(rawInput: unknown): Promise<Record<string, unknown>> {
    const input = CreateSceneInputSchema.parse(rawInput);
    const project = await this.loadProject(input.projectId);
    const sceneId = input.sceneId ?? nextMcpId('scene');

    const existingIndex = project.scenes.findIndex((s) => s.id === sceneId);
    if (existingIndex >= 0) {
      requireConfirmation(input.confirmOverwrite, `overwrite existing scene '${sceneId}'`);
    }

    const nextSequenceIndex =
      input.sequenceIndex ??
      (project.scenes.length > 0
        ? Math.max(...project.scenes.map((s) => s.sequenceIndex)) + 1
        : 0);

    const newScene: Scene = {
      id: sceneId,
      projectId: project.id,
      sequenceIndex: nextSequenceIndex,
      title: input.title,
      description: input.description,
      duration: input.duration,
      ...(input.backgroundAssetId ? { backgroundAssetId: input.backgroundAssetId } : {}),
      characterIds: input.characterIds ?? project.characters.map((c) => c.id),
      transition: input.transition ?? { type: 'fade', duration: 0.5 },
      timeline: {
        duration: input.duration,
        fps: project.fps,
        characterActions: [],
        cameraMoves: [],
        audioTracks: [],
      },
    };

    const nextScenes = [...project.scenes];
    if (existingIndex >= 0) {
      nextScenes[existingIndex] = newScene;
    } else {
      nextScenes.push(newScene);
    }

    const saved = await this.persistProject({ ...project, scenes: nextScenes });
    const created = saved.scenes.find((s) => s.id === sceneId)!;
    return { ok: true, projectId: saved.id, scene: created };
  }

  async updateScene(rawInput: unknown): Promise<Record<string, unknown>> {
    const input = UpdateSceneInputSchema.parse(rawInput);
    const project = await this.loadProject(input.projectId);
    const idx = project.scenes.findIndex((s) => s.id === input.sceneId);
    if (idx < 0) {
      throw new McpToolError('NOT_FOUND', `Scene '${input.sceneId}' not found in project '${project.id}'`);
    }
    requireConfirmation(input.confirmOverwrite, `update existing scene '${input.sceneId}'`);

    const current = project.scenes[idx];
    const updatedScene: Scene = {
      ...current,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.duration !== undefined ? { duration: input.duration } : {}),
      ...(input.sequenceIndex !== undefined ? { sequenceIndex: input.sequenceIndex } : {}),
      ...(input.characterIds !== undefined ? { characterIds: input.characterIds } : {}),
      ...(input.backgroundAssetId !== undefined
        ? { backgroundAssetId: input.backgroundAssetId ?? undefined }
        : {}),
      ...(input.transition !== undefined ? { transition: input.transition } : {}),
      timeline: {
        ...current.timeline,
        ...(input.duration !== undefined ? { duration: input.duration } : {}),
      },
    };

    const nextScenes = [...project.scenes];
    nextScenes[idx] = updatedScene;
    const saved = await this.persistProject({ ...project, scenes: nextScenes });
    return {
      ok: true,
      projectId: saved.id,
      scene: saved.scenes.find((s) => s.id === input.sceneId)!,
    };
  }

  async listAssets(rawInput: unknown): Promise<Record<string, unknown>> {
    const input = ListAssetsInputSchema.parse(rawInput ?? {});
    const project = input.projectId ? await this.loadProject(input.projectId) : null;
    const projectDir = project ? resolveProjectDir(this.workspaceDir, project.id) : null;

    const projectAssetFiles = projectDir
      ? await listSafeFilesRecursive(path.join(projectDir, 'assets'), this.workspaceDir)
      : [];
    const workspaceLibraryFiles = input.includeWorkspaceLibrary
      ? await listSafeFilesRecursive(path.join(this.workspaceDir, 'assets'), this.workspaceDir)
      : [];

    return {
      ok: true,
      ...(project ? { projectId: project.id, projectAssets: project.assets } : {}),
      projectAssetFiles,
      workspaceLibraryFiles,
    };
  }

  async importAsset(rawInput: unknown): Promise<Record<string, unknown>> {
    const input = ImportAssetInputSchema.parse(rawInput);
    const project = await this.loadProject(input.projectId);
    const resolvedSource = await assertApprovedAssetSourcePath(this.workspaceDir, input.sourcePath);
    const fileName = path.basename(resolvedSource);
    const { assetsDir, destPath } = await resolveSafeDestAssetPath(
      this.workspaceDir,
      project.id,
      fileName
    );

    const assetId = input.assetId ?? nextMcpId('asset');
    const existingIdx = project.assets.findIndex((a) => a.id === assetId);
    if (existingIdx >= 0 || (resolvedSource !== destPath && fsSync.existsSync(destPath))) {
      requireConfirmation(
        input.confirmOverwrite,
        `overwrite existing asset '${assetId}' or file 'assets/${fileName}'`
      );
    }

    await fs.mkdir(assetsDir, { recursive: true });
    if (resolvedSource !== destPath) {
      await fs.copyFile(resolvedSource, destPath);
    }

    const stat = await fs.stat(destPath);
    const workspaceRel = path.relative(this.workspaceDir, destPath).split(path.sep).join('/');
    const assetRecord = {
      id: assetId,
      name: input.name,
      type: input.assetType,
      uri: `assets/${fileName}`,
      metadata: {
        sizeBytes: stat.size,
        sourcePath: input.sourcePath,
      },
      createdAt: new Date().toISOString(),
    };

    const nextAssets = [...project.assets];
    if (existingIdx >= 0) {
      nextAssets[existingIdx] = assetRecord;
    } else {
      nextAssets.push(assetRecord);
    }

    await this.persistProject({ ...project, assets: nextAssets });
    return {
      ok: true,
      projectId: project.id,
      asset: assetRecord,
      copiedTo: destPath,
      workspaceRelativePath: workspaceRel,
    };
  }

  async createAnimation(rawInput: unknown): Promise<Record<string, unknown>> {
    const input = CreateAnimationInputSchema.parse(rawInput);
    const project = await this.loadProject(input.projectId);
    const sceneIdx = project.scenes.findIndex((s) => s.id === input.sceneId);
    if (sceneIdx < 0) {
      throw new McpToolError('NOT_FOUND', `Scene '${input.sceneId}' not found in project '${project.id}'`);
    }

    const scene = project.scenes[sceneIdx];
    if (
      project.characters.length > 0 &&
      !project.characters.some((c) => c.id === input.characterId)
    ) {
      throw new McpToolError(
        'NOT_FOUND',
        `Character '${input.characterId}' not found in project '${project.id}'`
      );
    }

    const actionId = input.actionId ?? nextMcpId('act');
    const existingActionIdx = scene.timeline.characterActions.findIndex(
      (a) => a.actionId === actionId
    );
    if (existingActionIdx >= 0) {
      requireConfirmation(input.confirmOverwrite, `overwrite action '${actionId}'`);
    }

    const action = {
      actionId,
      name: input.actionName,
      startTime: input.startTime,
      duration: input.duration,
      parameters: input.parameters,
    };

    const nextActions = [...scene.timeline.characterActions];
    if (existingActionIdx >= 0) {
      nextActions[existingActionIdx] = action;
    } else {
      nextActions.push(action);
    }

    const nextCharacterIds = scene.characterIds.includes(input.characterId)
      ? scene.characterIds
      : [...scene.characterIds, input.characterId];

    const updatedScene: Scene = {
      ...scene,
      characterIds: nextCharacterIds,
      timeline: {
        ...scene.timeline,
        characterActions: nextActions,
      },
    };

    const nextScenes = [...project.scenes];
    nextScenes[sceneIdx] = updatedScene;
    await this.persistProject({ ...project, scenes: nextScenes });

    return {
      ok: true,
      projectId: project.id,
      sceneId: scene.id,
      action,
    };
  }

  async updateKeyframes(rawInput: unknown): Promise<Record<string, unknown>> {
    const input = UpdateKeyframesInputSchema.parse(rawInput);
    const project = await this.loadProject(input.projectId);
    const sceneIdx = project.scenes.findIndex((s) => s.id === input.sceneId);
    if (sceneIdx < 0) {
      throw new McpToolError('NOT_FOUND', `Scene '${input.sceneId}' not found in project '${project.id}'`);
    }
    requireConfirmation(input.confirmOverwrite, `update keyframes/timeline for scene '${input.sceneId}'`);

    const scene = project.scenes[sceneIdx];
    const updatedScene: Scene = {
      ...scene,
      ...(input.duration !== undefined ? { duration: input.duration } : {}),
      timeline: {
        duration: input.duration ?? scene.timeline.duration,
        fps: input.fps ?? scene.timeline.fps,
        characterActions: input.characterActions ?? scene.timeline.characterActions,
        cameraMoves: input.cameraMoves ?? scene.timeline.cameraMoves,
        audioTracks: input.audioTracks ?? scene.timeline.audioTracks,
      },
    };

    const nextScenes = [...project.scenes];
    nextScenes[sceneIdx] = updatedScene;
    await this.persistProject({ ...project, scenes: nextScenes });

    return {
      ok: true,
      projectId: project.id,
      sceneId: scene.id,
      timeline: updatedScene.timeline,
    };
  }

  async generatePreview(rawInput: unknown): Promise<Record<string, unknown>> {
    const input = GeneratePreviewInputSchema.parse(rawInput);
    const project = await this.loadProject(input.projectId);
    if (input.sceneId && !project.scenes.some((s) => s.id === input.sceneId)) {
      throw new McpToolError('NOT_FOUND', `Scene '${input.sceneId}' not found in project '${project.id}'`);
    }

    const projectDir = resolveProjectDir(this.workspaceDir, project.id);
    if (!fsSync.existsSync(path.join(projectDir, 'index.html'))) {
      await this.adapter.saveProjectState(project);
    }

    const preview = await this.adapter.previewProject(project.id);
    return {
      ...preview,
      previewServerExposed: false,
    };
  }

  async getRenderStatus(rawInput: unknown): Promise<Record<string, unknown>> {
    const { jobId } = GetRenderStatusInputSchema.parse(rawInput);
    try {
      const liveStatus = await this.adapter.getRenderStatus(jobId);
      return { ok: true, ...liveStatus };
    } catch {
      const stored = this.db.getRenderJob(jobId);
      if (!stored) {
        throw new McpToolError('NOT_FOUND', `Render job not found: ${jobId}`);
      }
      return {
        ok: true,
        jobId: stored.id,
        status: stored.status,
        progress: stored.progress,
        outputFilePath: stored.outputFilePath,
        error: stored.error,
      };
    }
  }

  async cancelRender(rawInput: unknown): Promise<Record<string, unknown>> {
    const { projectId } = CancelRenderInputSchema.parse(rawInput);
    const safeId = assertSafeId(projectId, 'project');
    this.cancelledRenders.add(safeId);
    const cancelled = await this.adapter.cancelRender(safeId);
    return { ok: true, projectId: safeId, cancelled };
  }

  async exportVideo(
    rawInput: unknown,
    options?: {
      signal?: AbortSignal;
      onProgress?: (info: ExportProgressInfo) => Promise<void> | void;
    }
  ): Promise<Record<string, unknown>> {
    const input = ExportVideoInputSchema.parse(rawInput);
    requireConfirmation(input.confirm, `render and export MP4 for '${input.projectId}'`);

    const project = await this.loadProject(input.projectId);
    if (project.preferredEngine !== 'givemotion') {
      throw new McpToolError(
        'UNSUPPORTED',
        `Headless MCP video export currently supports 'givemotion' only (project uses '${project.preferredEngine}')`
      );
    }
    if (this.activeRenders.has(project.id)) {
      throw new McpToolError('CONFLICT', `Render already in progress for project '${project.id}'`);
    }

    const projectDir = resolveProjectDir(this.workspaceDir, project.id);
    if (!fsSync.existsSync(path.join(projectDir, 'index.html'))) {
      await this.adapter.saveProjectState(project);
    }

    this.cancelledRenders.delete(project.id);
    this.activeRenders.add(project.id);

    const onAbort = () => {
      this.cancelledRenders.add(project.id);
      void this.adapter.cancelRender(project.id);
    };
    if (options?.signal?.aborted) {
      this.activeRenders.delete(project.id);
      throw new McpToolError('CANCELLED', 'Export cancelled before starting');
    }
    options?.signal?.addEventListener('abort', onAbort, { once: true });

    let job: RenderJob;
    let backgroundTracked = false;
    try {
      job = await this.adapter.render(project.id, (ev) => {
        if (options?.onProgress) {
          void options.onProgress({ phase: ev.phase, progress: ev.progress });
        }
      });
      this.latestJobByProject.set(project.id, job.id);
      this.db.saveRenderJob(job);

      if (!input.wait) {
        backgroundTracked = true;
        void this.trackBackgroundRender(project, job, input.timeoutMs);
        return {
          ok: true,
          started: true,
          projectId: project.id,
          jobId: job.id,
          status: job.status,
          outputFilePath: job.outputFilePath,
        };
      }

      const deadline = Date.now() + input.timeoutMs;
      let status = await this.adapter.getRenderStatus(job.id);
      while (status.status === 'rendering' || status.status === 'queued') {
        if (this.cancelledRenders.has(project.id)) {
          await this.adapter.cancelRender(project.id);
          throw new McpToolError('CANCELLED', `Render cancelled for project '${project.id}'`);
        }
        if (Date.now() >= deadline) {
          await this.adapter.cancelRender(project.id);
          throw new McpToolError('TIMEOUT', `Render timed out after ${input.timeoutMs}ms`);
        }
        await new Promise((r) => setTimeout(r, 100));
        status = await this.adapter.getRenderStatus(job.id);
      }

      const finishedJob: RenderJob = {
        ...job,
        status: status.status,
        progress: status.progress,
        outputFilePath: status.outputFilePath ?? job.outputFilePath,
        error: status.error,
        finishedAt: new Date().toISOString(),
      };
      this.db.saveRenderJob(finishedJob);

      if (this.cancelledRenders.has(project.id)) {
        throw new McpToolError('CANCELLED', `Render cancelled for project '${project.id}'`);
      }
      if (status.status === 'failed') {
        throw new McpToolError('EXECUTION_FAILED', status.error || 'Video render failed');
      }

      const videoPath = await this.adapter.exportVideo(job.id);
      const videoStat = await fs.stat(videoPath);
      const ffprobe = await this.probeVideo(videoPath);

      await this.persistProject({ ...project, status: 'rendered' });

      return {
        ok: true,
        projectId: project.id,
        jobId: job.id,
        videoPath,
        fileSizeBytes: videoStat.size,
        ffprobe,
      };
    } finally {
      options?.signal?.removeEventListener('abort', onAbort);
      if (!backgroundTracked) {
        this.activeRenders.delete(project.id);
        this.cancelledRenders.delete(project.id);
      }
    }
  }

  private async trackBackgroundRender(
    project: Project,
    job: RenderJob,
    timeoutMs: number
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    try {
      let status = await this.adapter.getRenderStatus(job.id);
      while (!this.closed && (status.status === 'rendering' || status.status === 'queued')) {
        if (this.cancelledRenders.has(project.id) || Date.now() >= deadline) {
          await this.adapter.cancelRender(project.id).catch(() => false);
        }
        await new Promise((r) => setTimeout(r, 150));
        status = await this.adapter.getRenderStatus(job.id);
      }
      if (this.closed) return;
      this.db.saveRenderJob({
        ...job,
        status: status.status,
        progress: status.progress,
        outputFilePath: status.outputFilePath ?? job.outputFilePath,
        error: status.error,
        finishedAt: new Date().toISOString(),
      });
      if (status.status === 'completed' && !this.cancelledRenders.has(project.id)) {
        await this.persistProject({ ...project, status: 'rendered' }).catch(() => undefined);
      }
    } catch {
      // Background errors already recorded on RenderJob / DB when possible
    } finally {
      this.activeRenders.delete(project.id);
      this.cancelledRenders.delete(project.id);
    }
  }

  private async probeVideo(videoPath: string): Promise<Record<string, unknown>> {
    try {
      const meta = await sharedProbeVideo(videoPath, this.runner);
      return {
        formatName: meta.formatName,
        durationSeconds: meta.durationSeconds,
        codec: meta.codec,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
      };
    } catch (err: unknown) {
      throw new McpToolError(
        'EXECUTION_FAILED',
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}
