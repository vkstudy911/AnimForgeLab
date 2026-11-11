import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { z } from 'zod';
import { GivemotionAdapter } from '../adapters/givemotion.adapter.js';
import {
  CharacterSchema,
  Project,
  ProjectConfigSchema,
  ProjectSchema,
  SceneSchema,
} from '../schemas/index.js';
import { assertSafeId, resolveProjectDir, resolveWorkspacePath } from '../utils/paths.js';
import { AnimForgeDatabase } from './database.js';
import { AnimForgePipeline } from './pipeline.js';

export const WORKER_PROTOCOL_VERSION = 1 as const;

export type WorkerErrorCode =
  | 'MALFORMED_JSON'
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_PROTOCOL_VERSION'
  | 'UNKNOWN_METHOD'
  | 'INVALID_ID'
  | 'INVALID_PARAMS'
  | 'RENDER_CANCELLED'
  | 'INTERNAL_ERROR';

export class WorkerRpcError extends Error {
  constructor(
    readonly code: WorkerErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'WorkerRpcError';
  }
}

const WorkerRequestSchema = z.object({
  version: z.unknown().optional(),
  id: z.union([z.string().min(1), z.number().int()]),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

const CreateProjectParamsSchema = z.object({
  projectId: z.string().optional(),
  config: ProjectConfigSchema,
});

const ProjectIdParamsSchema = z.object({
  projectId: z.string(),
});

const SaveProjectParamsSchema = z.object({
  project: ProjectSchema,
});

const PreviewProjectParamsSchema = z.object({
  projectId: z.string(),
  sceneId: z.string().optional(),
});

const DiskManifestSchema = z.object({
  config: ProjectConfigSchema,
  characters: z.array(CharacterSchema).default([]),
  scenes: z.array(SceneSchema).default([]),
});

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function classifyWorkerError(err: unknown): { code: WorkerErrorCode; message: string } {
  if (err instanceof WorkerRpcError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof z.ZodError) {
    return {
      code: 'INVALID_PARAMS',
      message: err.issues.map((i) => `${i.path.join('.') || 'params'}: ${i.message}`).join('; '),
    };
  }
  const message = toErrorMessage(err);
  if (/^Invalid (?:project|scene|[a-z]+) id\b/i.test(message)) {
    return { code: 'INVALID_ID', message };
  }
  return { code: 'INTERNAL_ERROR', message };
}

function resolveGivemotionCliPath(workspaceDir: string): string {
  const inWorkspace = path.resolve(workspaceDir, 'engines', 'givemotion', 'src', 'cli.js');
  if (fsSync.existsSync(inWorkspace)) {
    return inWorkspace;
  }

  const fromCompiled = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'engines',
    'givemotion',
    'src',
    'cli.js'
  );
  if (fsSync.existsSync(fromCompiled)) {
    return fromCompiled;
  }

  const fromSource = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    'engines',
    'givemotion',
    'src',
    'cli.js'
  );
  return fsSync.existsSync(fromSource) ? fromSource : inWorkspace;
}

function writeJsonLine(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ version: WORKER_PROTOCOL_VERSION, ...payload })}\n`);
}

async function loadProjectFromDbOrDisk(
  db: AnimForgeDatabase,
  workspaceDir: string,
  safeProjectId: string
): Promise<Project> {
  const fromDb = db.getProject(safeProjectId);
  if (fromDb) {
    return fromDb;
  }

  const projectDir = resolveProjectDir(workspaceDir, safeProjectId);
  const manifestPath = path.join(projectDir, 'project.animforge.json');
  let text: string;
  let mtimeIso: string;
  try {
    const [contents, stat] = await Promise.all([
      fs.readFile(manifestPath, 'utf-8'),
      fs.stat(manifestPath),
    ]);
    text = contents;
    mtimeIso = stat.mtime.toISOString();
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new Error(`Project not found: ${safeProjectId}`);
    }
    throw new Error(`Invalid project manifest for ${safeProjectId}: ${toErrorMessage(err)}`);
  }

  let manifest: z.infer<typeof DiskManifestSchema>;
  try {
    manifest = DiskManifestSchema.parse(JSON.parse(text));
    for (const scene of manifest.scenes) {
      assertSafeId(scene.id, 'scene');
      if (scene.projectId !== safeProjectId) {
        throw new Error(`scene ${scene.id} projectId mismatch`);
      }
    }
  } catch (err: unknown) {
    throw new Error(`Invalid project manifest for ${safeProjectId}: ${toErrorMessage(err)}`);
  }

  return {
    id: safeProjectId,
    name: manifest.config.name,
    prompt: manifest.config.prompt,
    width: manifest.config.width,
    height: manifest.config.height,
    fps: manifest.config.fps,
    preferredEngine: manifest.config.preferredEngine,
    status: manifest.scenes.length > 0 ? 'scenes_planned' : 'created',
    characters: manifest.characters,
    assets: [],
    scenes: manifest.scenes,
    createdAt: mtimeIso,
    updatedAt: mtimeIso,
  };
}

export async function runWorker(workspaceDir: string): Promise<void> {
  if (!workspaceDir || workspaceDir.includes('\0')) {
    throw new Error('Invalid workspace directory argument');
  }
  const projectsRoot = resolveWorkspacePath(workspaceDir, 'projects');
  await fs.mkdir(projectsRoot, { recursive: true });

  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  console.log = console.error;
  console.info = console.error;

  const db = new AnimForgeDatabase(path.join(projectsRoot, 'animforge.db'));
  const pipeline = new AnimForgePipeline(db);
  const adapter = new GivemotionAdapter(workspaceDir, resolveGivemotionCliPath(workspaceDir));
  const inFlight = new Set<Promise<void>>();
  const activeRenders = new Set<string>();
  const preparingRenders = new Set<string>();
  const cancelledProjects = new Set<string>();
  let draining = false;
  let aborting = false;
  let abortPromise: Promise<void> | null = null;

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  async function ensureProjectHtml(project: Project): Promise<void> {
    const projectDir = resolveProjectDir(workspaceDir, project.id);
    try {
      await fs.access(path.join(projectDir, 'index.html'));
    } catch {
      await adapter.saveProjectState(project);
    }
  }

  async function dispatch(method: string, params: unknown): Promise<Record<string, unknown>> {
    switch (method) {
      case 'doctor': {
        const report = await adapter.getDoctorInfo();
        return { ...report };
      }

      case 'list_projects': {
        return { projects: db.listProjects() };
      }

      case 'create_project': {
        const parsed = CreateProjectParamsSchema.parse(params ?? {});
        const project = await pipeline.planProject(parsed.config, { projectId: parsed.projectId });
        const projectDir = resolveProjectDir(workspaceDir, project.id);
        await adapter.saveProjectState(project);
        db.saveProject(project);
        return { project, projectDir };
      }

      case 'load_project': {
        const { projectId } = ProjectIdParamsSchema.parse(params);
        const safeProjectId = assertSafeId(projectId, 'project');
        const project = await loadProjectFromDbOrDisk(db, workspaceDir, safeProjectId);
        return { project };
      }

      case 'save_project': {
        const { project } = SaveProjectParamsSchema.parse(params);
        const safeProjectId = assertSafeId(project.id, 'project');
        resolveProjectDir(workspaceDir, safeProjectId);
        for (const scene of project.scenes) {
          assertSafeId(scene.id, 'scene');
          if (scene.projectId !== safeProjectId) {
            throw new WorkerRpcError(
              'INVALID_PARAMS',
              `Scene ${scene.id} projectId mismatch: expected ${safeProjectId}`
            );
          }
        }
        const updated: Project = {
          ...project,
          id: safeProjectId,
          updatedAt: new Date().toISOString(),
        };
        await adapter.saveProjectState(updated);
        db.saveProject(updated);
        return { project: updated };
      }

      case 'preview_project': {
        const { projectId, sceneId } = PreviewProjectParamsSchema.parse(params);
        const safeProjectId = assertSafeId(projectId, 'project');
        const safeSceneId = sceneId !== undefined ? assertSafeId(sceneId, 'scene') : undefined;
        const project = await loadProjectFromDbOrDisk(db, workspaceDir, safeProjectId);
        if (safeSceneId !== undefined && !project.scenes.some((s) => s.id === safeSceneId)) {
          throw new Error(`Scene ${safeSceneId} not found in project ${safeProjectId}`);
        }
        await ensureProjectHtml(project);
        const preview = await adapter.previewProject(safeProjectId);
        return { ...preview };
      }

      case 'render_project': {
        const { projectId } = ProjectIdParamsSchema.parse(params);
        const safeProjectId = assertSafeId(projectId, 'project');
        if (activeRenders.has(safeProjectId)) {
          throw new Error(`Render already in progress for project ${safeProjectId}`);
        }
        cancelledProjects.delete(safeProjectId);
        activeRenders.add(safeProjectId);
        preparingRenders.add(safeProjectId);
        try {
          let project: Project;
          try {
            project = await loadProjectFromDbOrDisk(db, workspaceDir, safeProjectId);
            await ensureProjectHtml(project);
          } finally {
            preparingRenders.delete(safeProjectId);
          }
          if (cancelledProjects.has(safeProjectId)) {
            throw new WorkerRpcError('RENDER_CANCELLED', 'Render cancelled by user');
          }

          let currentJobId = '';
          const job = await adapter.render(safeProjectId, (ev) => {
            writeJsonLine({
              event: 'render_progress',
              jobId: ev.jobId ?? currentJobId,
              projectId: safeProjectId,
              phase: ev.phase,
              progress: ev.progress,
              done: ev.done,
              total: ev.total,
              fps: ev.fps,
              eta: ev.eta,
            });
          });
          currentJobId = job.id;
          db.saveRenderJob(job);

          let status = await adapter.getRenderStatus(job.id);
          while (status.status === 'rendering' || status.status === 'queued') {
            if (aborting) {
              throw new Error('Render interrupted by worker shutdown');
            }
            await new Promise((resolve) => setTimeout(resolve, 40));
            status = await adapter.getRenderStatus(job.id);
          }

          job.status = status.status;
          job.progress = status.progress;
          job.outputFilePath = status.outputFilePath ?? job.outputFilePath;
          job.error = status.error;
          job.finishedAt = job.finishedAt ?? new Date().toISOString();
          db.saveRenderJob(job);

          if (status.status === 'failed') {
            if (cancelledProjects.has(safeProjectId)) {
              throw new WorkerRpcError('RENDER_CANCELLED', status.error || 'Render cancelled by user');
            }
            throw new Error(status.error || 'Render failed');
          }

          const videoPath = await adapter.exportVideo(job.id);
          const latestProject = db.getProject(safeProjectId) ?? project;
          db.saveProject({
            ...latestProject,
            status: 'rendered',
            updatedAt: new Date().toISOString(),
          });
          return { renderJob: job, videoPath };
        } finally {
          activeRenders.delete(safeProjectId);
          cancelledProjects.delete(safeProjectId);
        }
      }

      case 'cancel_render': {
        const { projectId } = ProjectIdParamsSchema.parse(params);
        const safeProjectId = assertSafeId(projectId, 'project');
        if (preparingRenders.has(safeProjectId)) {
          cancelledProjects.add(safeProjectId);
          return { projectId: safeProjectId, cancelled: true };
        }
        const cancelled = await adapter.cancelRender(safeProjectId);
        if (cancelled) {
          cancelledProjects.add(safeProjectId);
        }
        return { projectId: safeProjectId, cancelled };
      }

      default:
        throw new WorkerRpcError('UNKNOWN_METHOD', `Unknown worker method: ${method}`);
    }
  }

  async function shutdown(killChildren: boolean): Promise<void> {
    if (killChildren) {
      aborting = true;
      rl.close();
      abortPromise ??= (async () => {
        try {
          await adapter.dispose();
        } finally {
          db.close();
        }
      })();
      return abortPromise;
    }

    if (draining || aborting) return;
    draining = true;
    rl.close();
    try {
      if (inFlight.size > 0) {
        await Promise.allSettled([...inFlight]);
      }
      if (!aborting) {
        await adapter.dispose();
      }
    } finally {
      db.close();
    }
  }

  const onSignal = () => {
    void shutdown(true).finally(() => process.exit(0));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  rl.on('line', (line) => {
    if (draining || aborting || !line.trim()) return;

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(line);
    } catch {
      writeJsonLine({ ok: false, code: 'MALFORMED_JSON', error: 'Malformed JSON request' });
      return;
    }

    const maybeObj =
      typeof rawJson === 'object' && rawJson !== null && !Array.isArray(rawJson)
        ? (rawJson as Record<string, unknown>)
        : null;
    const maybeId =
      maybeObj &&
      ((typeof maybeObj.id === 'string' && maybeObj.id.length > 0) ||
        (typeof maybeObj.id === 'number' && Number.isInteger(maybeObj.id)))
        ? (maybeObj.id as string | number)
        : undefined;

    if (
      maybeObj &&
      'version' in maybeObj &&
      maybeObj.version !== undefined &&
      maybeObj.version !== WORKER_PROTOCOL_VERSION
    ) {
      writeJsonLine({
        ...(maybeId !== undefined ? { id: maybeId } : {}),
        ok: false,
        code: 'UNSUPPORTED_PROTOCOL_VERSION',
        error: `Unsupported worker protocol version: ${String(maybeObj.version)}`,
      });
      return;
    }

    const reqParsed = WorkerRequestSchema.safeParse(rawJson);
    if (!reqParsed.success) {
      writeJsonLine({
        ...(maybeId !== undefined ? { id: maybeId } : {}),
        ok: false,
        code: 'INVALID_REQUEST',
        error: `Invalid request envelope: ${reqParsed.error.issues.map((i) => i.message).join('; ')}`,
      });
      return;
    }

    const { id, method, params } = reqParsed.data;

    const task = (async () => {
      try {
        const result = await dispatch(method, params);
        writeJsonLine({ id, ok: true, result });
      } catch (err: unknown) {
        const { code, message } = classifyWorkerError(err);
        writeJsonLine({ id, ok: false, code, error: message });
      }
    })();

    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  });

  try {
    await new Promise<void>((resolve) => {
      rl.once('close', () => {
        void shutdown(false).finally(() => resolve());
      });
    });
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  const workspaceArg = process.argv[2];
  if (!workspaceArg) {
    process.stderr.write('Usage: node worker.js <workspaceDir>\n');
    process.exit(1);
  }
  runWorker(workspaceArg).catch((err: unknown) => {
    process.stderr.write(`Worker fatal error: ${toErrorMessage(err)}\n`);
    process.exit(1);
  });
}
