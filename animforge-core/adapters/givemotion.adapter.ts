import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  AnimationEngineAdapter,
  RenderProgressUpdate,
  SceneConfig,
} from './adapter.interface.js';
import { compileProjectHtml } from './givemotion.compiler.js';
import {
  createNdjsonLineParser,
  GiveMotionDoctorReport,
  parseDoctorStdout,
  progressPercent,
} from './givemotion.ndjson.js';
import {
  createNodeProcessRunner,
  ProcessRunner,
  SpawnedProcess,
} from './process-runner.js';
import {
  Character,
  CharacterSchema,
  Project,
  ProjectConfig,
  ProjectConfigSchema,
  RenderJob,
  RenderStatus,
  Scene,
  SceneSchema,
} from '../schemas/index.js';
import { z } from 'zod';
import { assertSafeId, resolveProjectDir, resolveWorkspacePath } from '../utils/paths.js';

export interface GiveMotionCheckIssue {
  severity?: string;
  code?: string;
  message: string;
}

export interface GiveMotionPreviewResult {
  projectId: string;
  ok: boolean;
  errors: number;
  warnings: number;
  notes: number;
  issues: GiveMotionCheckIssue[];
  bundleDir: string;
  bundleIndexHtml: string;
  playerHtml: string;
}

const StoredProjectStateSchema = z.object({
  config: ProjectConfigSchema,
  characters: z.array(CharacterSchema).default([]),
  scenes: z.array(SceneSchema).default([]),
});

interface StoredProjectState {
  projectId: string;
  config: ProjectConfig;
  characters: Character[];
  scenes: Scene[];
}

const DEFAULT_WORKERS = 1;
const MAX_STDERR_LINES = 50;
let idSeq = 0;

function nextId(prefix: string): string {
  idSeq = (idSeq + 1) % 10000;
  return `${prefix}_${Date.now()}_${idSeq}`;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseCheckReport(stdout: string, exitCode: number, stderr: string): {
  ok: boolean;
  errors: number;
  warnings: number;
  notes: number;
  issues: GiveMotionCheckIssue[];
} {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error(
      `Givemotion check failed (exit ${exitCode}): ${stderr.trim() || stdout.trim() || 'Invalid JSON output'}`
    );
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Givemotion check returned unexpected JSON payload');
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.error === 'string' && rec.error.length > 0) {
    throw new Error(`Givemotion check failed (exit ${exitCode}): ${rec.error}`);
  }
  const issues: GiveMotionCheckIssue[] = Array.isArray(rec.issues)
    ? rec.issues
        .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
        .map((i) => ({
          severity: typeof i.severity === 'string' ? i.severity : undefined,
          code: typeof i.code === 'string' ? i.code : undefined,
          message: typeof i.message === 'string' ? i.message : 'Unknown issue',
        }))
    : [];

  const errors = typeof rec.errors === 'number' ? rec.errors : 0;
  const warnings = typeof rec.warnings === 'number' ? rec.warnings : 0;
  const notes = typeof rec.notes === 'number' ? rec.notes : 0;
  const ok = typeof rec.ok === 'boolean' ? rec.ok : errors === 0 && exitCode === 0;
  return { ok, errors, warnings, notes, issues };
}

export class GivemotionAdapter implements AnimationEngineAdapter {
  readonly name = 'givemotion';
  private cliPath: string;
  private workspaceDir: string;
  private runner: ProcessRunner;
  private jobs = new Map<string, RenderJob>();
  private projects = new Map<string, StoredProjectState>();
  private sceneToProject = new Map<string, string>();
  private activeProcesses = new Set<SpawnedProcess>();

  constructor(workspaceDir: string, cliPath?: string, runner?: ProcessRunner) {
    this.workspaceDir = workspaceDir;
    this.cliPath = cliPath || path.resolve(workspaceDir, 'engines/givemotion/src/cli.js');
    this.runner = runner || createNodeProcessRunner();
  }

  async getDoctorInfo(): Promise<GiveMotionDoctorReport> {
    const result = await this.runner.execFile(process.execPath, [this.cliPath, 'doctor']);
    const report = parseDoctorStdout(result.stdout);
    if (
      result.exitCode !== 0 &&
      (result.stderr.trim().length > 0 || !report.node || !report.chrome || !report.ffmpeg)
    ) {
      throw new Error(
        `Givemotion doctor failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`
      );
    }
    return report;
  }

  async initialize(): Promise<void> {
    try {
      const report = await this.getDoctorInfo();
      if (!report.chromeOk || !report.ffmpegOk) {
        throw new Error(`Givemotion missing prerequisites: ${report.raw.trim()}`);
      }
    } catch (err: unknown) {
      throw new Error(`Givemotion initialization failed: ${toErrorMessage(err)}`);
    }
  }

  private async loadOrRequireState(projectId: string, projectDir: string): Promise<StoredProjectState> {
    const cached = this.projects.get(projectId);
    if (cached) return cached;

    const manifestPath = path.join(projectDir, 'project.animforge.json');
    try {
      const raw: unknown = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      const parsed = StoredProjectStateSchema.parse(raw);
      const hydrated: StoredProjectState = {
        projectId,
        config: parsed.config,
        characters: parsed.characters,
        scenes: parsed.scenes,
      };
      for (const s of hydrated.scenes) {
        assertSafeId(s.id, 'scene');
        if (s.projectId !== projectId) {
          throw new Error(`Scene ${s.id} projectId mismatch`);
        }
      }
      this.projects.set(projectId, hydrated);
      for (const s of hydrated.scenes) {
        this.sceneToProject.set(s.id, projectId);
      }
      return hydrated;
    } catch {
      throw new Error(`Givemotion project not found or invalid: ${projectId}`);
    }
  }

  private async writeProjectFiles(projectDir: string, state: StoredProjectState): Promise<void> {
    const sortedScenes = [...state.scenes].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    state.scenes = sortedScenes;

    const html = compileProjectHtml({
      projectId: state.projectId,
      config: state.config,
      scenes: state.scenes,
      characters: state.characters,
    });

    await Promise.all([
      fs.writeFile(path.join(projectDir, 'givemotion.json'), '{}\n', 'utf-8'),
      fs.writeFile(path.join(projectDir, 'project.animforge.json'), JSON.stringify(state, null, 2), 'utf-8'),
      fs.writeFile(path.join(projectDir, 'index.html'), html, 'utf-8'),
    ]);
  }

  async createProject(
    projectId: string,
    config: ProjectConfig,
    characters?: Character[]
  ): Promise<string> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    await fs.mkdir(projectDir, { recursive: true });

    const state: StoredProjectState = {
      projectId: safeProjectId,
      config,
      characters: characters ? [...characters] : [],
      scenes: [],
    };
    for (const [sceneId, ownerProjectId] of this.sceneToProject.entries()) {
      if (ownerProjectId === safeProjectId) {
        this.sceneToProject.delete(sceneId);
      }
    }
    this.projects.set(safeProjectId, state);

    await this.writeProjectFiles(projectDir, state);
    return safeProjectId;
  }

  async saveProjectState(project: Project): Promise<void> {
    const safeProjectId = assertSafeId(project.id, 'project');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    await fs.mkdir(projectDir, { recursive: true });

    for (const [sceneId, ownerProjectId] of this.sceneToProject.entries()) {
      if (ownerProjectId === safeProjectId) {
        this.sceneToProject.delete(sceneId);
      }
    }

    const state: StoredProjectState = {
      projectId: safeProjectId,
      config: {
        name: project.name,
        prompt: project.prompt,
        width: project.width,
        height: project.height,
        fps: project.fps,
        preferredEngine: project.preferredEngine,
      },
      characters: [...project.characters],
      scenes: project.scenes.map((scene) => {
        const safeSceneId = assertSafeId(scene.id, 'scene');
        this.sceneToProject.set(safeSceneId, safeProjectId);
        return { ...scene, id: safeSceneId, projectId: safeProjectId };
      }),
    };
    this.projects.set(safeProjectId, state);
    await this.writeProjectFiles(projectDir, state);
  }

  async createScene(config: SceneConfig): Promise<string> {
    const safeProjectId = assertSafeId(config.projectId, 'project');
    const sceneId = config.id !== undefined ? assertSafeId(config.id, 'scene') : nextId('scene');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);

    const state = await this.loadOrRequireState(safeProjectId, projectDir);
    const scene: Scene = { ...config, id: sceneId, projectId: safeProjectId };
    const existingIdx = state.scenes.findIndex((s) => s.id === sceneId);
    if (existingIdx >= 0) {
      state.scenes[existingIdx] = scene;
    } else {
      state.scenes.push(scene);
    }

    this.sceneToProject.set(sceneId, safeProjectId);
    await this.writeProjectFiles(projectDir, state);
    return sceneId;
  }

  private async findProjectIdForScene(safeSceneId: string): Promise<string | null> {
    const cached = this.sceneToProject.get(safeSceneId);
    if (cached) return cached;

    let entries: string[];
    try {
      const projectsRoot = resolveWorkspacePath(this.workspaceDir, 'projects');
      entries = await fs.readdir(projectsRoot);
    } catch {
      return null;
    }

    for (const entry of entries) {
      let projectId: string;
      let projectDir: string;
      try {
        projectId = assertSafeId(entry, 'project');
        projectDir = resolveProjectDir(this.workspaceDir, projectId);
      } catch {
        continue;
      }

      try {
        const state = await this.loadOrRequireState(projectId, projectDir);
        if (state.scenes.some((s) => s.id === safeSceneId)) {
          return projectId;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  async previewProject(projectId: string): Promise<GiveMotionPreviewResult> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    const indexHtml = path.join(projectDir, 'index.html');
    const bundleDir = path.join(projectDir, 'bundle');

    try {
      await fs.access(indexHtml);
    } catch {
      throw new Error(`Givemotion composition not found at ${indexHtml}`);
    }

    const checkExec = await this.runner.execFile(
      process.execPath,
      [this.cliPath, 'check', indexHtml, '--json', '--fast'],
      { cwd: projectDir }
    );
    const checkReport = parseCheckReport(checkExec.stdout, checkExec.exitCode, checkExec.stderr);

    const bundleExec = await this.runner.execFile(
      process.execPath,
      [this.cliPath, 'bundle', indexHtml, '-o', bundleDir, '--json'],
      { cwd: projectDir }
    );
    if (bundleExec.exitCode !== 0) {
      throw new Error(
        `Givemotion bundle failed (exit ${bundleExec.exitCode}): ${bundleExec.stderr.trim() || bundleExec.stdout.trim()}`
      );
    }

    return {
      projectId: safeProjectId,
      ok: checkReport.ok,
      errors: checkReport.errors,
      warnings: checkReport.warnings,
      notes: checkReport.notes,
      issues: checkReport.issues,
      bundleDir,
      bundleIndexHtml: path.join(bundleDir, 'index.html'),
      playerHtml: path.join(bundleDir, 'player.html'),
    };
  }

  async preview(sceneId: string): Promise<string> {
    const safeSceneId = assertSafeId(sceneId, 'scene');
    const projectId = await this.findProjectIdForScene(safeSceneId);
    if (!projectId) {
      throw new Error(`No Givemotion project found for scene ${safeSceneId}`);
    }

    const res = await this.previewProject(projectId);
    if (!res.ok) {
      const summary = res.issues
        .filter((i) => i.severity === 'error')
        .slice(0, 3)
        .map((i) => i.message)
        .join('; ');
      throw new Error(`Givemotion check failed with ${res.errors} error(s): ${summary}`);
    }
    return res.bundleIndexHtml;
  }

  async render(
    projectId: string,
    onProgress?: (info: RenderProgressUpdate) => void
  ): Promise<RenderJob> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const jobId = nextId('job');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    const inputHtml = path.join(projectDir, 'index.html');
    const outputMp4 = path.join(projectDir, 'output.mp4');

    const job: RenderJob = {
      id: jobId,
      projectId: safeProjectId,
      engine: 'givemotion',
      status: 'rendering',
      progress: 0,
      outputFilePath: outputMp4,
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);

    const child = this.runner.spawnProcess(
      process.execPath,
      [
        this.cliPath,
        'render',
        inputHtml,
        '-o',
        outputMp4,
        '--workers',
        String(DEFAULT_WORKERS),
        '--progress',
        'json',
        '--json',
      ],
      { cwd: projectDir }
    );
    this.activeProcesses.add(child);

    child.stdout?.resume();

    let stderrError: string | null = null;
    const stderrLines: string[] = [];
    let doneEmitted = false;
    let settled = false;

    const parser = createNdjsonLineParser(
      (ev) => {
        if (ev.event === 'progress') {
          const pct = progressPercent(ev);
          job.progress = pct;
          if (ev.phase === 'done') doneEmitted = true;
          onProgress?.({
            jobId,
            phase: ev.phase,
            progress: pct,
            done: ev.done,
            total: ev.total,
            fps: ev.fps,
            eta: ev.eta,
          });
        } else if (ev.event === 'error') {
          stderrError = ev.message;
        }
      },
      (textLine) => {
        stderrLines.push(textLine);
        if (stderrLines.length > MAX_STDERR_LINES) {
          stderrLines.shift();
        }
      }
    );

    child.stderr?.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      parser.push(chunk);
    });

    const settleFailure = (message: string) => {
      if (settled) return;
      settled = true;
      this.activeProcesses.delete(child);
      parser.flush();
      job.status = 'failed';
      job.error = message;
      job.finishedAt = new Date().toISOString();
    };

    child.once('error', (err: unknown) => {
      settleFailure(toErrorMessage(err));
    });

    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      this.activeProcesses.delete(child);
      parser.flush();

      if (code === 0 && !stderrError) {
        job.status = 'completed';
        job.progress = 100;
        job.finishedAt = new Date().toISOString();
        if (!doneEmitted) {
          onProgress?.({ jobId, phase: 'done', progress: 100 });
        }
        return;
      }

      const detail =
        stderrError ||
        stderrLines.slice(-5).join(' | ') ||
        (signal ? `Terminated by signal ${signal}` : `Exited with code ${String(code)}`);
      job.status = 'failed';
      job.error = detail;
      job.finishedAt = new Date().toISOString();
    });

    return job;
  }

  async getRenderStatus(jobId: string): Promise<RenderStatus> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      outputFilePath: job.outputFilePath,
      error: job.error,
    };
  }

  async exportVideo(jobId: string): Promise<string> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'completed' || !job.outputFilePath) {
      throw new Error(`Video not ready for export on job ${jobId}`);
    }
    return job.outputFilePath;
  }

  async dispose(): Promise<void> {
    for (const child of this.activeProcesses) {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
    this.activeProcesses.clear();
  }
}
