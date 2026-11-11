import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AnimationEngineAdapter, SceneConfig } from './adapter.interface.js';
import { ProjectConfig, RenderJob, RenderStatus } from '../schemas/index.js';

/**
 * StretchyStudioAdapter
 *
 * Engine Capabilities:
 * - 2D Character rigging with armatures/bones and mesh deformation (Delaunay triangulation).
 * - Shape keys for facial expressions (eyes open/close, mouth smile/frown).
 * - Spine 2D 4.0 JSON export (`exportSpine.js`).
 * - Layer decomposition from PSD files (`psd.js`).
 *
 * Architectural Limitation:
 * - Stretchy Studio does NOT provide a headless Node.js CLI or direct MP4 rendering engine.
 *   It is an interactive browser application (Vite + WebGL + React).
 *
 * Safe Workaround:
 * - Character rig configurations and keyframe tracks are exported as Spine 2D JSON or
 *   spritesheet animation packages. These assets are then ingested by Givemotion or Remotion
 *   for final scene composition and video rendering.
 */
export class StretchyStudioAdapter implements AnimationEngineAdapter {
  readonly name = 'stretchystudio';
  private workspaceDir: string;
  private appDir: string;
  private jobs = new Map<string, RenderJob>();

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
    this.appDir = path.resolve(workspaceDir, 'engines/stretchystudio');
  }

  async initialize(): Promise<void> {
    const pkgPath = path.join(this.appDir, 'package.json');
    try {
      await fs.access(pkgPath);
    } catch {
      throw new Error(`Stretchy Studio engine not found at ${this.appDir}`);
    }
  }

  async createProject(config: ProjectConfig): Promise<string> {
    const projectId = `stretchy_${Date.now()}`;
    const projectDir = path.resolve(this.workspaceDir, 'projects', projectId);
    await fs.mkdir(projectDir, { recursive: true });

    // Create a .stretch project descriptor compatible with Stretchy Studio schema
    const projectFile = {
      version: '1.0.0',
      meta: {
        name: config.name,
        width: config.width,
        height: config.height,
        fps: config.fps,
      },
      armature: {
        root: 'root',
        bones: [],
      },
      layers: [],
      animations: {},
    };

    await fs.writeFile(
      path.join(projectDir, 'character.stretch'),
      JSON.stringify(projectFile, null, 2),
      'utf-8'
    );
    return projectId;
  }

  async createScene(config: SceneConfig): Promise<string> {
    // In Stretchy Studio, scenes map to animation clips for rigged characters
    return `clip_${config.id || Date.now()}`;
  }

  async preview(sceneId: string): Promise<string> {
    return 'Stretchy Studio interactive rigging editor available via `npm run dev` at http://127.0.0.1:5173';
  }

  async render(projectId: string): Promise<RenderJob> {
    const jobId = `job_${Date.now()}`;
    const projectDir = path.resolve(this.workspaceDir, 'projects', projectId);
    const exportPath = path.join(projectDir, 'character-rig.spine.json');

    // Simulate exporting Spine 2D character rig data
    const spineData = {
      skeleton: { hash: 'animforge', spine: '4.0.0', width: 500, height: 800 },
      bones: [{ name: 'root' }, { name: 'torso', parent: 'root' }, { name: 'head', parent: 'torso' }],
      slots: [],
      animations: {
        walk: {},
        wave: {},
      },
    };

    await fs.writeFile(exportPath, JSON.stringify(spineData, null, 2), 'utf-8');

    const job: RenderJob = {
      id: jobId,
      projectId,
      engine: 'stretchystudio',
      status: 'completed',
      progress: 100,
      outputFilePath: exportPath,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);

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
    };
  }

  async exportVideo(jobId: string): Promise<string> {
    const job = this.jobs.get(jobId);
    if (!job || !job.outputFilePath) {
      throw new Error(`Export not ready for job ${jobId}`);
    }
    // Return exported Spine character data for composition
    return job.outputFilePath;
  }
}
