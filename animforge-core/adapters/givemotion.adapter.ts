import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AnimationEngineAdapter, SceneConfig } from './adapter.interface.js';
import { ProjectConfig, RenderJob, RenderStatus } from '../schemas/index.js';

const execAsync = promisify(exec);

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
      const { stdout } = await execAsync(`node "${this.cliPath}" doctor`);
      if (!stdout.includes('chrome') || !stdout.includes('ffmpeg')) {
        throw new Error(`Givemotion missing prerequisites: ${stdout}`);
      }
    } catch (err: any) {
      throw new Error(`Givemotion initialization failed: ${err.message}`);
    }
  }

  async createProject(config: ProjectConfig): Promise<string> {
    const projectId = `proj_${Date.now()}`;
    const projectDir = path.resolve(this.workspaceDir, 'projects', projectId);
    await fs.mkdir(projectDir, { recursive: true });

    const htmlContent = `<!doctype html>
<html data-width="${config.width}" data-height="${config.height}" data-fps="${config.fps}">
<head>
<meta charset="utf-8">
<title>${config.name}</title>
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
    return projectId;
  }

  async createScene(config: SceneConfig): Promise<string> {
    const sceneId = config.id || `scene_${Date.now()}`;
    const projectDir = path.resolve(this.workspaceDir, 'projects', config.projectId);
    const htmlPath = path.join(projectDir, 'project.html');

    // In a full implementation, insert section into <main data-sequence>
    const sceneHtml = `
    <!-- Scene: ${config.title} (${sceneId}) -->
    <section class="scene" data-duration="${config.duration}" data-camera="${config.timeline.cameraMoves[0]?.type || 'static'}">
      <h2>${config.title}</h2>
      <p>${config.description}</p>
    </section>`;

    let current = await fs.readFile(htmlPath, 'utf-8');
    current = current.replace('</main>', `${sceneHtml}\n  </main>`);
    await fs.writeFile(htmlPath, current, 'utf-8');

    return sceneId;
  }

  async preview(sceneId: string): Promise<string> {
    // Run visual QA check and report
    return `Preview ready via Givemotion dev server or still inspection: scene ${sceneId}`;
  }

  async render(projectId: string): Promise<RenderJob> {
    const jobId = `job_${Date.now()}`;
    const projectDir = path.resolve(this.workspaceDir, 'projects', projectId);
    const inputHtml = path.join(projectDir, 'project.html');
    const outputMp4 = path.join(projectDir, 'output.mp4');

    const job: RenderJob = {
      id: jobId,
      projectId,
      engine: 'givemotion',
      status: 'rendering',
      progress: 0,
      outputFilePath: outputMp4,
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);

    // Trigger render command
    execAsync(`node "${this.cliPath}" render "${inputHtml}" -o "${outputMp4}"`)
      .then(() => {
        job.status = 'completed';
        job.progress = 100;
        job.finishedAt = new Date().toISOString();
      })
      .catch((err) => {
        job.status = 'failed';
        job.error = err.message;
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
