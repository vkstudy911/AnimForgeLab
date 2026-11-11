import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AnimationEngineAdapter, SceneConfig } from './adapter.interface.js';
import { ProjectConfig, RenderJob, RenderStatus } from '../schemas/index.js';

const execAsync = promisify(exec);

export class RemotionAdapter implements AnimationEngineAdapter {
  readonly name = 'remotion';
  private workspaceDir: string;
  private jobs = new Map<string, RenderJob>();

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  async initialize(): Promise<void> {
    try {
      const { stdout } = await execAsync('npx remotion --version');
      if (!stdout) {
        throw new Error('Remotion CLI not found');
      }
    } catch (err: any) {
      throw new Error(`Remotion initialization failed: ${err.message}`);
    }
  }

  async createProject(config: ProjectConfig): Promise<string> {
    const projectId = `remotion_${Date.now()}`;
    const projectDir = path.resolve(this.workspaceDir, 'projects', projectId);
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });

    // Generate package.json
    const packageJson = {
      name: projectId,
      version: '1.0.0',
      private: true,
      dependencies: {
        "@remotion/cli": "^4.0.260",
        "react": "^18.3.1",
        "react-dom": "^18.3.1",
        "remotion": "^4.0.260"
      }
    };
    await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf-8');

    // Generate Root.tsx
    const rootTsx = `import React from 'react';
import { Composition } from 'remotion';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Main"
      component={() => <div style={{ flex: 1, backgroundColor: '#000', color: '#fff' }}>${config.name}</div>}
      durationInFrames={${Math.round((config.fps || 30) * 5)}}
      fps={${config.fps || 30}}
      width={${config.width || 1280}}
      height={${config.height || 720}}
    />
  );
};
`;
    await fs.writeFile(path.join(projectDir, 'src', 'Root.tsx'), rootTsx, 'utf-8');

    // Generate index.ts
    const indexTs = `import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
`;
    await fs.writeFile(path.join(projectDir, 'src', 'index.ts'), indexTs, 'utf-8');

    return projectId;
  }

  async createScene(config: SceneConfig): Promise<string> {
    const sceneId = config.id || `scene_${Date.now()}`;
    // In Remotion, scenes are represented as <Sequence> components with layout and durationInFrames
    return sceneId;
  }

  async preview(sceneId: string): Promise<string> {
    return `Remotion preview available via 'npx remotion preview src/index.ts' for scene ${sceneId}`;
  }

  async render(projectId: string): Promise<RenderJob> {
    const jobId = `job_${Date.now()}`;
    const projectDir = path.resolve(this.workspaceDir, 'projects', projectId);
    const outputMp4 = path.join(projectDir, 'output.mp4');

    const job: RenderJob = {
      id: jobId,
      projectId,
      engine: 'remotion',
      status: 'rendering',
      progress: 0,
      outputFilePath: outputMp4,
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);

    execAsync(`cd "${projectDir}" && npx remotion render src/index.ts Main "${outputMp4}"`)
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
