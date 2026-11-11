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
import { assertSafeId, resolveProjectDir } from '../utils/paths.js';

const execAsync = promisify(exec);
let idSeq = 0;

function nextId(prefix: string): string {
  idSeq = (idSeq + 1) % 10000;
  return `${prefix}_${Date.now()}_${idSeq}`;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class RemotionAdapter implements AnimationEngineAdapter {
  readonly name = 'remotion';
  private workspaceDir: string;
  private jobs = new Map<string, RenderJob>();

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  async initialize(): Promise<void> {
    try {
      // shortcut: execAsync temporarily kept until M1-T06 replaces it with spawn/execFile (shell: false)
      const { stdout } = await execAsync('npx remotion --version');
      if (!stdout) {
        throw new Error('Remotion CLI not found');
      }
    } catch (err: unknown) {
      throw new Error(`Remotion initialization failed: ${toErrorMessage(err)}`);
    }
  }

  async createProject(
    projectId: string,
    config: ProjectConfig,
    _characters?: Character[]
  ): Promise<string> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });

    const packageJson = {
      name: safeProjectId,
      version: '1.0.0',
      private: true,
      dependencies: {
        '@remotion/cli': '^4.0.260',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        remotion: '^4.0.260',
      },
    };
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );

    const safeTitleLiteral = JSON.stringify(config.name);
    const rootTsx = `import React from 'react';
import { Composition } from 'remotion';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Main"
      component={() => <div style={{ flex: 1, backgroundColor: '#000', color: '#fff' }}>{${safeTitleLiteral}}</div>}
      durationInFrames={${Math.round((config.fps || 30) * 5)}}
      fps={${config.fps || 30}}
      width={${config.width || 1280}}
      height={${config.height || 720}}
    />
  );
};
`;
    await fs.writeFile(path.join(projectDir, 'src', 'Root.tsx'), rootTsx, 'utf-8');

    const indexTs = `import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
`;
    await fs.writeFile(path.join(projectDir, 'src', 'index.ts'), indexTs, 'utf-8');

    return safeProjectId;
  }

  async createScene(config: SceneConfig): Promise<string> {
    assertSafeId(config.projectId, 'project');
    return config.id !== undefined ? assertSafeId(config.id, 'scene') : nextId('scene');
  }

  async preview(sceneId: string): Promise<string> {
    const safeSceneId = assertSafeId(sceneId, 'scene');
    return `Remotion preview available via 'npx remotion preview src/index.ts' for scene ${safeSceneId}`;
  }

  async render(
    projectId: string,
    onProgress?: (info: RenderProgressUpdate) => void
  ): Promise<RenderJob> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const jobId = nextId('job');
    const projectDir = resolveProjectDir(this.workspaceDir, safeProjectId);
    const outputMp4 = path.join(projectDir, 'output.mp4');

    const job: RenderJob = {
      id: jobId,
      projectId: safeProjectId,
      engine: 'remotion',
      status: 'rendering',
      progress: 0,
      outputFilePath: outputMp4,
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);

    // shortcut: execAsync temporarily kept until M1-T06 replaces it with spawn (shell: false)
    execAsync(`cd "${projectDir}" && npx remotion render src/index.ts Main "${outputMp4}"`)
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
