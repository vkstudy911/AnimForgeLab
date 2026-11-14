import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  AnimationEngineAdapter,
  RenderProgressUpdate,
  SceneConfig,
} from './adapter.interface.js';
import { Character, ProjectConfig, RenderJob, RenderStatus } from '../schemas/index.js';
import { assertSafeId, resolveProjectDir } from '../utils/paths.js';

let idSeq = 0;

function nextId(prefix: string): string {
  idSeq = (idSeq + 1) % 10000;
  return `${prefix}_${Date.now()}_${idSeq}`;
}

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
 */
export class StretchyStudioAdapter implements AnimationEngineAdapter {
  readonly name = 'stretchystudio';
  private appDir: string;
  private workspaceDir: string;
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

  async createProject(
    projectId: string,
    config: ProjectConfig,
    characters?: Character[]
  ): Promise<string> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    await fs.mkdir(projectDir, { recursive: true });

    const projectFile = {
      version: '1.0.0',
      projectId: safeProjectId,
      meta: {
        name: config.name,
        width: config.width,
        height: config.height,
        fps: config.fps,
      },
      armature: {
        root: 'root',
        bones: (characters?.[0]?.parts ?? []).map((p) => ({
          id: p.id,
          parent: p.parentPartId ?? 'root',
          pivot: p.pivot,
        })),
      },
      layers: [],
      animations: {},
    };

    await fs.writeFile(
      path.join(projectDir, 'character.stretch'),
      JSON.stringify(projectFile, null, 2),
      'utf-8'
    );
    return safeProjectId;
  }

  async createScene(config: SceneConfig): Promise<string> {
    assertSafeId(config.projectId, 'project');
    const safeSceneId = config.id !== undefined ? assertSafeId(config.id, 'scene') : nextId('scene');
    return `clip_${safeSceneId}`;
  }

  async preview(sceneId: string): Promise<string> {
    assertSafeId(sceneId, 'scene');
    return 'Stretchy Studio interactive rigging editor available via `npm run dev` at http://127.0.0.1:5173';
  }

  async render(
    projectId: string,
    onProgress?: (info: RenderProgressUpdate) => void
  ): Promise<RenderJob> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const jobId = nextId('job');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    const exportPath = path.join(projectDir, 'character-rig.spine.json');

    const spineData = {
      skeleton: { hash: 'animforge', spine: '4.0.0', width: 500, height: 800 },
      bones: [
        { name: 'root' },
        { name: 'torso', parent: 'root' },
        { name: 'head', parent: 'torso' },
      ],
      slots: [],
      animations: {
        walk: {},
        wave: {},
      },
    };

    await fs.writeFile(exportPath, JSON.stringify(spineData, null, 2), 'utf-8');
    onProgress?.({ phase: 'done', progress: 100 });

    const job: RenderJob = {
      id: jobId,
      projectId: safeProjectId,
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
    return job.outputFilePath;
  }
}
