import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { z } from 'zod';
import { GivemotionAdapter } from '../adapters/givemotion.adapter.js';
import { createNodeProcessRunner } from '../adapters/process-runner.js';
import { RemotionAdapter } from '../adapters/remotion.adapter.js';
import { StretchyStudioAdapter } from '../adapters/stretchystudio.adapter.js';
import { CharacterManagerAgent } from '../agents/characterManager.js';
import { ScenePlannerAgent } from '../agents/scenePlanner.js';
import { StoryDirectorAgent } from '../agents/storyDirector.js';
import {
  Asset,
  AssetSchema,
  CharacterSchema,
  Project,
  ProjectConfigSchema,
  ProjectSchema,
  SceneSchema,
  StoryboardSchema,
} from '../schemas/index.js';
import { assertSafeId, resolveProjectDir, resolveWorkspacePath } from '../utils/paths.js';
import {
  copyDirectoryFilesSafe,
  inferAssetTypeFromFilename,
  listSafeFilesRecursive,
  MAX_IMPORTED_ASSET_BYTES,
  resolveProjectAssetDestPath,
} from './assets/workspaceAssets.js';
import { AnimForgeDatabase } from './database.js';
import { FfprobeError, FfprobeMetadata, probeVideo } from './media/ffprobe.js';
import { AnimForgePipeline, createCanonicalProjectId } from './pipeline.js';

export const WORKER_PROTOCOL_VERSION = 1 as const;

export type WorkerErrorCode =
  | 'MALFORMED_JSON'
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_PROTOCOL_VERSION'
  | 'UNKNOWN_METHOD'
  | 'INVALID_ID'
  | 'INVALID_PARAMS'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PATH_VIOLATION'
  | 'ENGINE_UNAVAILABLE'
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

const DuplicateProjectParamsSchema = z.object({
  projectId: z.string(),
  newName: z.string().min(1).max(160).optional(),
});

const ImportProjectParamsSchema = z.object({
  project: z.unknown(),
});

const ListRenderJobsParamsSchema = z
  .object({
    projectId: z.string().optional(),
  })
  .optional();

const AssetsListParamsSchema = z
  .object({
    projectId: z.string().optional(),
  })
  .optional();

const AssetTypeEnum = z.enum([
  'character',
  'background',
  'prop',
  'audio',
  'font',
  'model',
  'reference',
]);

const AssetImportParamsSchema = z.object({
  projectId: z.string(),
  sourcePath: z.string().min(1),
  name: z.string().min(1).max(160).optional(),
  assetType: AssetTypeEnum.optional(),
  confirmOverwrite: z.boolean().optional(),
});

const AssetImportBytesParamsSchema = z.object({
  projectId: z.string(),
  fileName: z.string().min(1),
  dataBase64: z.string().min(1),
  name: z.string().min(1).max(160).optional(),
  assetType: AssetTypeEnum.optional(),
  confirmOverwrite: z.boolean().optional(),
});

const RunDeterministicAgentParamsSchema = z.object({
  projectId: z.string(),
  agent: z.enum(['story_director', 'character_manager', 'scene_planner']),
});

export const StudioDiskConfigSchema = z.object({
  defaultWidth: z.number().int().positive().default(1920),
  defaultHeight: z.number().int().positive().default(1080),
  defaultFps: z.number().int().positive().default(30),
  defaultEngine: z.enum(['givemotion', 'remotion', 'stretchystudio', 'composite']).default('givemotion'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  reducedEffects: z.boolean().default(false),
  showSafeZonesByDefault: z.boolean().default(true),
});

const SaveConfigParamsSchema = z.object({
  config: StudioDiskConfigSchema,
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
  status: ProjectSchema.shape.status.nullish().transform((v) => v ?? undefined),
  updatedAt: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  storyboard: StoryboardSchema.nullish().transform((v) => v ?? undefined),
  characters: z
    .array(CharacterSchema)
    .nullish()
    .transform((v) => v ?? []),
  assets: z
    .array(AssetSchema)
    .nullish()
    .transform((v) => v ?? []),
  scenes: z
    .array(SceneSchema)
    .nullish()
    .transform((v) => v ?? []),
});

let workerAssetSeq = 0;
function nextWorkerId(prefix: string): string {
  workerAssetSeq = (workerAssetSeq + 1) % 10000;
  return `${prefix}_${Date.now()}_${workerAssetSeq}`;
}

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
    status: manifest.status ?? (manifest.scenes.length > 0 ? 'scenes_planned' : 'created'),
    ...(manifest.storyboard ? { storyboard: manifest.storyboard } : {}),
    characters: manifest.characters,
    assets: manifest.assets,
    scenes: manifest.scenes,
    createdAt: mtimeIso,
    updatedAt: manifest.updatedAt ?? mtimeIso,
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
  const runner = createNodeProcessRunner();
  const adapter = new GivemotionAdapter(workspaceDir, resolveGivemotionCliPath(workspaceDir), runner);
  const remotionAdapter = new RemotionAdapter(workspaceDir);
  const stretchyAdapter = new StretchyStudioAdapter(workspaceDir);
  const storyDirector = new StoryDirectorAgent();
  const characterManager = new CharacterManagerAgent();
  const scenePlanner = new ScenePlannerAgent();
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

  async function persistFullProject(project: Project): Promise<Project> {
    const safeProjectId = assertSafeId(project.id, 'project');
    resolveProjectDir(workspaceDir, safeProjectId);
    const updated: Project = {
      ...project,
      id: safeProjectId,
      scenes: [...project.scenes].sort((a, b) => a.sequenceIndex - b.sequenceIndex),
      updatedAt: new Date().toISOString(),
    };
    await adapter.saveProjectState(updated);
    db.saveProject(updated);
    return updated;
  }

  async function runOptionalFfprobe(videoPath: string): Promise<FfprobeMetadata | null> {
    try {
      const meta = await probeVideo(videoPath, runner);
      if (!meta.hasVideoStream) {
        throw new WorkerRpcError(
          'INTERNAL_ERROR',
          'Rendered MP4 verification failed: ffprobe reported no video stream'
        );
      }
      return meta;
    } catch (err: unknown) {
      if (err instanceof FfprobeError && err.kind === 'MISSING_BINARY') {
        return null;
      }
      throw err;
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
        const updated = await persistFullProject(project);
        return { project: updated };
      }

      case 'delete_project': {
        const { projectId } = ProjectIdParamsSchema.parse(params);
        const safeProjectId = assertSafeId(projectId, 'project');
        if (activeRenders.has(safeProjectId)) {
          throw new WorkerRpcError(
            'CONFLICT',
            `Cannot delete project ${safeProjectId} while a render is in progress`
          );
        }
        const projectDir = resolveProjectDir(workspaceDir, safeProjectId);
        const existedInDb = db.hasProjectRow(safeProjectId);
        const existedOnDisk = fsSync.existsSync(projectDir);
        if (!existedInDb && !existedOnDisk) {
          throw new WorkerRpcError('NOT_FOUND', `Project not found: ${safeProjectId}`);
        }
        await fs.rm(projectDir, { recursive: true, force: true });
        db.deleteProject(safeProjectId);
        adapter.evictProjectCache(safeProjectId);
        return { projectId: safeProjectId, deleted: true };
      }

      case 'duplicate_project': {
        const parsed = DuplicateProjectParamsSchema.parse(params);
        const safeSourceId = assertSafeId(parsed.projectId, 'project');
        const source = await loadProjectFromDbOrDisk(db, workspaceDir, safeSourceId);
        const newId = createCanonicalProjectId();
        const now = new Date().toISOString();
        const cloned: Project = {
          ...source,
          id: newId,
          name: parsed.newName?.trim() || `${source.name} (Copy)`,
          status: source.scenes.length > 0 ? 'scenes_planned' : 'created',
          ...(source.storyboard
            ? {
                storyboard: {
                  ...source.storyboard,
                  id: nextWorkerId('sb'),
                  projectId: newId,
                },
              }
            : {}),
          scenes: source.scenes.map((scene) => ({
            ...scene,
            projectId: newId,
          })),
          createdAt: now,
          updatedAt: now,
        };
        const srcDir = resolveProjectDir(workspaceDir, safeSourceId);
        const destDir = resolveProjectDir(workspaceDir, newId);
        await fs.mkdir(destDir, { recursive: true });
        await copyDirectoryFilesSafe(path.join(srcDir, 'assets'), path.join(destDir, 'assets'));
        const saved = await persistFullProject(cloned);
        return { project: saved, projectDir: destDir };
      }

      case 'import_project': {
        const parsedInput = ImportProjectParamsSchema.parse(params);
        const rawProject = ProjectSchema.parse(parsedInput.project);
        let targetId = assertSafeId(rawProject.id, 'project');
        const existingDir = resolveProjectDir(workspaceDir, targetId);
        if (db.getProject(targetId) || fsSync.existsSync(existingDir)) {
          targetId = createCanonicalProjectId();
        }
        const now = new Date().toISOString();
        const imported: Project = {
          ...rawProject,
          id: targetId,
          ...(rawProject.storyboard
            ? { storyboard: { ...rawProject.storyboard, projectId: targetId } }
            : {}),
          scenes: rawProject.scenes.map((s) => ({
            ...s,
            id: assertSafeId(s.id, 'scene'),
            projectId: targetId,
          })),
          updatedAt: now,
        };
        const projectDir = resolveProjectDir(workspaceDir, targetId);
        const saved = await persistFullProject(imported);
        return { project: saved, projectDir };
      }

      case 'list_render_jobs': {
        const parsed = ListRenderJobsParamsSchema.parse(params ?? {});
        const safeProjectId =
          parsed?.projectId !== undefined ? assertSafeId(parsed.projectId, 'project') : undefined;
        return { jobs: db.listRenderJobs(safeProjectId) };
      }

      case 'assets_list': {
        const parsed = AssetsListParamsSchema.parse(params ?? {});
        const project =
          parsed?.projectId !== undefined
            ? await loadProjectFromDbOrDisk(db, workspaceDir, assertSafeId(parsed.projectId, 'project'))
            : null;
        const projectDir = project ? resolveProjectDir(workspaceDir, project.id) : null;
        const projectAssetFiles = projectDir
          ? await listSafeFilesRecursive(path.join(projectDir, 'assets'), workspaceDir)
          : [];
        const workspaceLibraryFiles = await listSafeFilesRecursive(
          path.join(workspaceDir, 'assets'),
          workspaceDir
        );
        const projectAssets = project
          ? project.assets.map((asset) => {
              let existsOnDisk = false;
              let workspaceRelativePath: string | undefined;
              try {
                if (asset.uri.startsWith('assets/')) {
                  const inProject = resolveWorkspacePath(projectDir!, asset.uri);
                  if (fsSync.existsSync(inProject)) {
                    existsOnDisk = true;
                    workspaceRelativePath = path
                      .relative(workspaceDir, inProject)
                      .split(path.sep)
                      .join('/');
                  } else {
                    const inWorkspace = resolveWorkspacePath(workspaceDir, asset.uri);
                    if (fsSync.existsSync(inWorkspace)) {
                      existsOnDisk = true;
                      workspaceRelativePath = path
                        .relative(workspaceDir, inWorkspace)
                        .split(path.sep)
                        .join('/');
                    }
                  }
                } else {
                  const candidate = resolveWorkspacePath(workspaceDir, asset.uri);
                  if (fsSync.existsSync(candidate)) {
                    existsOnDisk = true;
                    workspaceRelativePath = path
                      .relative(workspaceDir, candidate)
                      .split(path.sep)
                      .join('/');
                  }
                }
              } catch {
                existsOnDisk = false;
                workspaceRelativePath = undefined;
              }
              return {
                ...asset,
                existsOnDisk,
                ...(workspaceRelativePath ? { workspaceRelativePath } : {}),
              };
            })
          : [];
        return {
          ...(project ? { projectId: project.id, projectAssets } : {}),
          projectAssetFiles,
          workspaceLibraryFiles,
        };
      }

      case 'asset_import': {
        const parsed = AssetImportParamsSchema.parse(params);
        const safeProjectId = assertSafeId(parsed.projectId, 'project');
        const project = await loadProjectFromDbOrDisk(db, workspaceDir, safeProjectId);
        if (parsed.sourcePath.includes('\0')) {
          throw new WorkerRpcError('PATH_VIOLATION', 'Invalid asset source path');
        }

        let resolvedSource: string;
        try {
          resolvedSource = resolveWorkspacePath(workspaceDir, parsed.sourcePath);
        } catch (err: unknown) {
          throw new WorkerRpcError('PATH_VIOLATION', toErrorMessage(err));
        }
        const rel = path.relative(path.resolve(workspaceDir), resolvedSource);
        const parts = rel.split(path.sep).filter(Boolean);
        const validSubdir =
          (parts[0] === 'assets' && parts.length >= 2) ||
          (parts[0] === 'projects' && parts.length >= 4 && parts[2] === 'assets');
        if (!validSubdir) {
          throw new WorkerRpcError(
            'PATH_VIOLATION',
            'Asset source must reside inside assets/ or projects/<id>/assets/'
          );
        }

        let lstat;
        try {
          lstat = await fs.lstat(resolvedSource);
        } catch {
          throw new WorkerRpcError('NOT_FOUND', `Source asset not found: ${parsed.sourcePath}`);
        }
        if (lstat.isSymbolicLink() || !lstat.isFile()) {
          throw new WorkerRpcError('PATH_VIOLATION', 'Asset source must be a non-symlink regular file');
        }
        if (lstat.size === 0 || lstat.size > MAX_IMPORTED_ASSET_BYTES) {
          throw new WorkerRpcError(
            'INVALID_PARAMS',
            `Asset file size must be between 1 byte and ${MAX_IMPORTED_ASSET_BYTES} bytes`
          );
        }

        const { assetsDir, destPath, safeFileName } = await resolveProjectAssetDestPath(
          workspaceDir,
          safeProjectId,
          path.basename(resolvedSource)
        );
        if (resolvedSource !== destPath && fsSync.existsSync(destPath) && !parsed.confirmOverwrite) {
          throw new WorkerRpcError(
            'CONFLICT',
            `Asset 'assets/${safeFileName}' already exists; pass confirmOverwrite: true to replace`
          );
        }

        await fs.mkdir(assetsDir, { recursive: true });
        if (resolvedSource !== destPath) {
          await fs.copyFile(resolvedSource, destPath);
        }
        const stat = await fs.stat(destPath);
        const targetUri = `assets/${safeFileName}`;
        const existingAsset = project.assets.find((a) => a.uri === targetUri);
        const assetRecord: Asset = {
          id: existingAsset?.id ?? nextWorkerId('asset'),
          name: parsed.name?.trim() || path.basename(safeFileName, path.extname(safeFileName)),
          type: parsed.assetType ?? inferAssetTypeFromFilename(safeFileName),
          uri: targetUri,
          metadata: { sizeBytes: stat.size },
          createdAt: existingAsset?.createdAt ?? new Date().toISOString(),
        };
        const updated = await persistFullProject({
          ...project,
          assets: [...project.assets.filter((a) => a.uri !== targetUri), assetRecord],
        });
        return {
          project: updated,
          asset: assetRecord,
          copiedTo: destPath,
          workspaceRelativePath: path.relative(workspaceDir, destPath).split(path.sep).join('/'),
        };
      }

      case 'asset_import_bytes': {
        const parsed = AssetImportBytesParamsSchema.parse(params);
        const safeProjectId = assertSafeId(parsed.projectId, 'project');
        const project = await loadProjectFromDbOrDisk(db, workspaceDir, safeProjectId);
        const buf = Buffer.from(parsed.dataBase64, 'base64');
        if (buf.length === 0 || buf.length > MAX_IMPORTED_ASSET_BYTES) {
          throw new WorkerRpcError(
            'INVALID_PARAMS',
            `Decoded asset payload must be between 1 byte and ${MAX_IMPORTED_ASSET_BYTES} bytes`
          );
        }

        const { assetsDir, destPath, safeFileName } = await resolveProjectAssetDestPath(
          workspaceDir,
          safeProjectId,
          parsed.fileName
        );
        if (fsSync.existsSync(destPath) && !parsed.confirmOverwrite) {
          throw new WorkerRpcError(
            'CONFLICT',
            `Asset 'assets/${safeFileName}' already exists; pass confirmOverwrite: true to replace`
          );
        }

        await fs.mkdir(assetsDir, { recursive: true });
        await fs.writeFile(destPath, buf);

        const targetUri = `assets/${safeFileName}`;
        const existingAsset = project.assets.find((a) => a.uri === targetUri);
        const assetRecord: Asset = {
          id: existingAsset?.id ?? nextWorkerId('asset'),
          name: parsed.name?.trim() || path.basename(safeFileName, path.extname(safeFileName)),
          type: parsed.assetType ?? inferAssetTypeFromFilename(safeFileName),
          uri: targetUri,
          metadata: { sizeBytes: buf.length },
          createdAt: existingAsset?.createdAt ?? new Date().toISOString(),
        };
        const updated = await persistFullProject({
          ...project,
          assets: [...project.assets.filter((a) => a.uri !== targetUri), assetRecord],
        });
        return {
          project: updated,
          asset: assetRecord,
          copiedTo: destPath,
          workspaceRelativePath: path.relative(workspaceDir, destPath).split(path.sep).join('/'),
        };
      }

      case 'run_deterministic_agent': {
        const parsed = RunDeterministicAgentParamsSchema.parse(params);
        const safeProjectId = assertSafeId(parsed.projectId, 'project');
        const project = await loadProjectFromDbOrDisk(db, workspaceDir, safeProjectId);
        let nextProject: Project = project;
        let summary = '';

        if (parsed.agent === 'story_director') {
          const storyboard = await storyDirector.createStoryboard(safeProjectId, project.prompt);
          nextProject = { ...project, storyboard, status: 'storyboarded' };
          summary = `Generated ${storyboard.beats.length} storyboard beats deterministically from project prompt.`;
        } else if (parsed.agent === 'character_manager') {
          const generatedChar = await characterManager.createCharacter(
            'Pip',
            'Cute little green cartoon alien/creature with expressive big eyes'
          );
          const existingIdx = project.characters.findIndex((c) => c.id === generatedChar.id);
          const nextChars = [...project.characters];
          if (existingIdx >= 0) {
            nextChars[existingIdx] = generatedChar;
          } else {
            nextChars.push(generatedChar);
          }
          nextProject = { ...project, characters: nextChars };
          summary = `Prepared 9-part articulated character rig (${generatedChar.name}) deterministically.`;
        } else {
          const storyboard =
            project.storyboard ?? (await storyDirector.createStoryboard(safeProjectId, project.prompt));
          const primaryChar =
            project.characters[0] ??
            (await characterManager.createCharacter(
              'Pip',
              'Cute little green cartoon alien/creature with expressive big eyes'
            ));
          const plannedScenes = await scenePlanner.planScenes(safeProjectId, storyboard, primaryChar);
          nextProject = {
            ...project,
            storyboard,
            characters: project.characters.length > 0 ? project.characters : [primaryChar],
            scenes: plannedScenes,
            status: 'scenes_planned',
          };
          summary = `Planned ${plannedScenes.length} scenes from storyboard beats deterministically.`;
        }

        const saved = await persistFullProject(nextProject);
        return { project: saved, agent: parsed.agent, summary };
      }

      case 'get_config': {
        const configPath = resolveWorkspacePath(workspaceDir, 'animforge.config.json');
        let config = StudioDiskConfigSchema.parse({});
        let exists = false;
        try {
          const lstat = await fs.lstat(configPath);
          if (lstat.isSymbolicLink() || !lstat.isFile()) {
            throw new WorkerRpcError('PATH_VIOLATION', 'animforge.config.json cannot be a symlink');
          }
          const raw = await fs.readFile(configPath, 'utf-8');
          config = StudioDiskConfigSchema.parse(JSON.parse(raw));
          exists = true;
        } catch (err: unknown) {
          if (err instanceof WorkerRpcError) throw err;
          if ((err as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
            throw new WorkerRpcError('INVALID_PARAMS', `Invalid animforge.config.json: ${toErrorMessage(err)}`);
          }
        }
        return { config, configPath, exists };
      }

      case 'save_config': {
        const parsed = SaveConfigParamsSchema.parse(params);
        const configPath = resolveWorkspacePath(workspaceDir, 'animforge.config.json');
        if (fsSync.existsSync(configPath)) {
          const lstat = await fs.lstat(configPath);
          if (lstat.isSymbolicLink()) {
            throw new WorkerRpcError('PATH_VIOLATION', 'animforge.config.json cannot be a symlink');
          }
        }
        await fs.writeFile(configPath, `${JSON.stringify(parsed.config, null, 2)}\n`, 'utf-8');
        return { config: parsed.config, configPath, exists: true };
      }

      case 'preview_project': {
        const { projectId, sceneId } = PreviewProjectParamsSchema.parse(params);
        const safeProjectId = assertSafeId(projectId, 'project');
        const safeSceneId = sceneId !== undefined ? assertSafeId(sceneId, 'scene') : undefined;
        const project = await loadProjectFromDbOrDisk(db, workspaceDir, safeProjectId);
        if (safeSceneId !== undefined && !project.scenes.some((s) => s.id === safeSceneId)) {
          throw new Error(`Scene ${safeSceneId} not found in project ${safeProjectId}`);
        }

        if (project.preferredEngine === 'remotion') {
          try {
            await remotionAdapter.initialize();
          } catch (err: unknown) {
            throw new WorkerRpcError(
              'ENGINE_UNAVAILABLE',
              `Remotion engine is unavailable: ${toErrorMessage(err)}`
            );
          }
          await remotionAdapter.createProject(safeProjectId, project, project.characters);
          const msg = await remotionAdapter.preview(safeSceneId ?? project.scenes[0]?.id ?? 'scene_1');
          return {
            projectId: safeProjectId,
            ok: true,
            errors: 0,
            warnings: 0,
            notes: 1,
            issues: [{ severity: 'note', code: 'REMOTION_READY', message: msg }],
            bundleDir: resolveProjectDir(workspaceDir, safeProjectId),
            bundleIndexHtml: '',
            playerHtml: '',
          };
        }

        if (project.preferredEngine === 'stretchystudio') {
          try {
            await stretchyAdapter.initialize();
          } catch (err: unknown) {
            throw new WorkerRpcError(
              'ENGINE_UNAVAILABLE',
              `StretchyStudio engine is unavailable: ${toErrorMessage(err)}`
            );
          }
          await stretchyAdapter.createProject(safeProjectId, project, project.characters);
          const msg = await stretchyAdapter.preview(safeSceneId ?? project.scenes[0]?.id ?? 'scene_1');
          return {
            projectId: safeProjectId,
            ok: true,
            errors: 0,
            warnings: 0,
            notes: 1,
            issues: [{ severity: 'note', code: 'STRETCHY_RIG_GENERATED', message: msg }],
            bundleDir: resolveProjectDir(workspaceDir, safeProjectId),
            bundleIndexHtml: '',
            playerHtml: '',
          };
        }

        if (project.preferredEngine === 'composite') {
          throw new WorkerRpcError(
            'ENGINE_UNAVAILABLE',
            'Composite multi-engine composition preview is not implemented; select givemotion, remotion, or stretchystudio'
          );
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
          } finally {
            preparingRenders.delete(safeProjectId);
          }
          if (cancelledProjects.has(safeProjectId)) {
            throw new WorkerRpcError('RENDER_CANCELLED', 'Render cancelled by user');
          }

          if (project.preferredEngine === 'composite') {
            throw new WorkerRpcError(
              'ENGINE_UNAVAILABLE',
              'Composite multi-engine rendering is not implemented; select givemotion, remotion, or stretchystudio'
            );
          }

          if (project.preferredEngine === 'stretchystudio') {
            try {
              await stretchyAdapter.initialize();
            } catch (err: unknown) {
              throw new WorkerRpcError(
                'ENGINE_UNAVAILABLE',
                `StretchyStudio engine is unavailable: ${toErrorMessage(err)}`
              );
            }
            await stretchyAdapter.createProject(safeProjectId, project, project.characters);
            const job = await stretchyAdapter.render(safeProjectId, (ev) => {
              writeJsonLine({
                event: 'render_progress',
                jobId: ev.jobId ?? 'stretch',
                projectId: safeProjectId,
                phase: ev.phase,
                progress: ev.progress,
                done: ev.done,
                total: ev.total,
                fps: ev.fps,
                eta: ev.eta,
              });
            });
            db.saveRenderJob(job);
            const exportPath = await stretchyAdapter.exportVideo(job.id);
            const latestProject = db.getProject(safeProjectId) ?? project;
            await persistFullProject({
              ...latestProject,
              status: 'rendered',
            });
            return {
              renderJob: job,
              videoPath: exportPath,
              ffprobe: null,
              artifactKind: 'spine_json',
            };
          }

          if (project.preferredEngine === 'remotion') {
            try {
              await remotionAdapter.initialize();
            } catch (err: unknown) {
              throw new WorkerRpcError(
                'ENGINE_UNAVAILABLE',
                `Remotion CLI is unavailable: ${toErrorMessage(err)}`
              );
            }
            await remotionAdapter.createProject(safeProjectId, project, project.characters);
            const job = await remotionAdapter.render(safeProjectId, (ev) => {
              writeJsonLine({
                event: 'render_progress',
                jobId: ev.jobId ?? 'remotion',
                projectId: safeProjectId,
                phase: ev.phase,
                progress: ev.progress,
              });
            });
            db.saveRenderJob(job);

            let status = await remotionAdapter.getRenderStatus(job.id);
            while (status.status === 'rendering' || status.status === 'queued') {
              if (aborting) {
                throw new Error('Render interrupted by worker shutdown');
              }
              await new Promise((resolve) => setTimeout(resolve, 60));
              status = await remotionAdapter.getRenderStatus(job.id);
            }
            job.status = status.status;
            job.progress = status.progress;
            job.outputFilePath = status.outputFilePath ?? job.outputFilePath;
            job.error = status.error;
            job.finishedAt = job.finishedAt ?? new Date().toISOString();
            db.saveRenderJob(job);
            if (status.status === 'failed') {
              if (cancelledProjects.has(safeProjectId)) {
                throw new WorkerRpcError(
                  'RENDER_CANCELLED',
                  status.error || 'Remotion render cancelled by user'
                );
              }
              throw new Error(status.error || 'Remotion render failed');
            }
            const videoPath = await remotionAdapter.exportVideo(job.id);
            let ffprobe: FfprobeMetadata | null = null;
            try {
              ffprobe = await runOptionalFfprobe(videoPath);
            } catch (probeErr: unknown) {
              job.status = 'failed';
              job.error = toErrorMessage(probeErr);
              db.saveRenderJob(job);
              throw probeErr;
            }
            const latestProject = db.getProject(safeProjectId) ?? project;
            await persistFullProject({
              ...latestProject,
              status: 'rendered',
            });
            return { renderJob: job, videoPath, ffprobe };
          }

          // Default: GiveMotion engine
          await ensureProjectHtml(project);

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
          let ffprobe: FfprobeMetadata | null = null;
          try {
            ffprobe = await runOptionalFfprobe(videoPath);
          } catch (probeErr: unknown) {
            job.status = 'failed';
            job.error = toErrorMessage(probeErr);
            db.saveRenderJob(job);
            throw probeErr;
          }

          const latestProject = db.getProject(safeProjectId) ?? project;
          await persistFullProject({
            ...latestProject,
            status: 'rendered',
          });
          return { renderJob: job, videoPath, ffprobe };
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
        const cancelled =
          (await adapter.cancelRender(safeProjectId)) ||
          (await remotionAdapter.cancelRender(safeProjectId));
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
          await Promise.allSettled([adapter.dispose(), remotionAdapter.dispose()]);
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
        await Promise.allSettled([adapter.dispose(), remotionAdapter.dispose()]);
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
