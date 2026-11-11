import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  AnimationEngineAdapter,
  RenderProgressUpdate,
  SceneConfig,
} from './adapter.interface.js';
import { Character, ProjectConfig, RenderJob, RenderStatus } from '../schemas/index.js';
import { assertSafeId, escapeHtml, resolveProjectDir } from '../utils/paths.js';

const execAsync = promisify(exec);
let idSeq = 0;

function nextId(prefix: string): string {
  idSeq = (idSeq + 1) % 10000;
  return `${prefix}_${Date.now()}_${idSeq}`;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class GivemotionAdapter implements AnimationEngineAdapter {
  readonly name = 'givemotion';
  private cliPath: string;
  private workspaceDir: string;
  private jobs = new Map<string, RenderJob>();

  constructor(workspaceDir: string, cliPath?: string) {
    this.workspaceDir = workspaceDir;
    this.cliPath = cliPath || path.resolve(workspaceDir, 'engines/givemotion/src/cli.js');
  }

  async initialize(): Promise<void> {
    try {
      // shortcut: execAsync temporarily kept until M1-T06 replaces it with spawn/execFile (shell: false)
      const { stdout } = await execAsync(`node "${this.cliPath}" doctor`);
      if (!stdout.includes('chrome') || !stdout.includes('ffmpeg')) {
        throw new Error(`Givemotion missing prerequisites: ${stdout}`);
      }
    } catch (err: unknown) {
      throw new Error(`Givemotion initialization failed: ${toErrorMessage(err)}`);
    }
  }

  async createProject(
    projectId: string,
    config: ProjectConfig,
    _characters?: Character[]
  ): Promise<string> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    await fs.mkdir(projectDir, { recursive: true });

    const htmlContent = `<!doctype html>
<html data-width="${config.width}" data-height="${config.height}" data-fps="${config.fps}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(config.name)}</title>
<style>
  body { margin: 0; background: #0b0f19; color: #fff; font-family: Inter, system-ui, sans-serif; overflow: hidden; }
  .scene { width: 100%; height: 100%; position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; }
</style>
</head>
<body>
  <main data-sequence data-transition="fade 0.5">
  </main>
</body>
</html>`;

    await fs.writeFile(path.join(projectDir, 'project.html'), htmlContent, 'utf-8');
    return safeProjectId;
  }

  async createScene(config: SceneConfig): Promise<string> {
    const sceneId = config.id !== undefined
      ? assertSafeId(config.id, 'scene')
      : nextId('scene');
    const projectDir = resolveProjectDir(this.workspaceDir, config.projectId);
    const htmlPath = path.join(projectDir, 'project.html');

    const cameraType = escapeHtml(config.timeline.cameraMoves[0]?.type || 'static');
    const sceneHtml = `
    <!-- Scene: ${escapeHtml(config.title)} (${sceneId}) -->
    <section class="scene" data-duration="${config.duration}" data-camera="${cameraType}">
      <h2>${escapeHtml(config.title)}</h2>
      <p>${escapeHtml(config.description)}</p>
    </section>`;

    let current = await fs.readFile(htmlPath, 'utf-8');
    current = current.replace('</main>', () => `${sceneHtml}\n  </main>`);
    await fs.writeFile(htmlPath, current, 'utf-8');

    return sceneId;
  }

  async preview(sceneId: string): Promise<string> {
    const safeSceneId = assertSafeId(sceneId, 'scene');
    return `Preview ready via Givemotion dev server or still inspection: scene ${safeSceneId}`;
  }

  async render(
    projectId: string,
    onProgress?: (info: RenderProgressUpdate) => void
  ): Promise<RenderJob> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const jobId = nextId('job');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    const inputHtml = path.join(projectDir, 'project.html');
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

    // shortcut: execAsync temporarily kept until M1-T06 replaces it with spawn (--progress json, shell: false)
    execAsync(`node "${this.cliPath}" render "${inputHtml}" -o "${outputMp4}"`)
      .then(() => {
        job.status = 'completed';
        job.progress = 100;
        job.finishedAt = new Date().toISOString();
        onProgress?.({ phase: 'done', progress: 100 });
      })
      .catch((err: unknown) => {
        job.status = 'failed';
        job.error = toErrorMessage(err);
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
}
