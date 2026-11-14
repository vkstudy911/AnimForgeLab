import { Project, ProjectConfig, RenderJob } from '../schemas/index.js';
import { StoryDirectorAgent } from '../agents/storyDirector.js';
import { CharacterManagerAgent } from '../agents/characterManager.js';
import { ScenePlannerAgent } from '../agents/scenePlanner.js';
import { AnimationEngineAdapter } from '../adapters/adapter.interface.js';
import { AnimForgeDatabase } from './database.js';
import { assertSafeId } from '../utils/paths.js';

export interface PipelineProgressCallback {
  (stage: string, message: string, data?: unknown): void;
}

export interface PipelineExecutionOptions {
  projectId?: string;
  pollIntervalMs?: number;
}

let projectSeq = 0;

export function createCanonicalProjectId(): string {
  projectSeq = (projectSeq + 1) % 10000;
  return `proj_${Date.now()}_${projectSeq}`;
}

export class AnimForgePipeline {
  private storyDirector = new StoryDirectorAgent();
  private characterManager = new CharacterManagerAgent();
  private scenePlanner = new ScenePlannerAgent();
  private db: AnimForgeDatabase;

  constructor(db?: AnimForgeDatabase) {
    this.db = db || new AnimForgeDatabase();
  }

  async planProject(
    config: ProjectConfig,
    options?: { projectId?: string }
  ): Promise<Project> {
    const projectId =
      options?.projectId !== undefined
        ? assertSafeId(options.projectId, 'project')
        : createCanonicalProjectId();

    const storyboard = await this.storyDirector.createStoryboard(projectId, config.prompt);
    const character = await this.characterManager.createCharacter(
      'Pip',
      'Cute little green cartoon alien/creature with expressive big eyes'
    );
    const scenes = await this.scenePlanner.planScenes(projectId, storyboard, character);

    const now = new Date().toISOString();
    return {
      id: projectId,
      name: config.name,
      prompt: config.prompt,
      width: config.width,
      height: config.height,
      fps: config.fps,
      preferredEngine: config.preferredEngine,
      status: 'scenes_planned',
      storyboard,
      characters: [character],
      assets: [],
      scenes,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Run the complete animation pipeline from human natural language idea to final video
   */
  async execute(
    config: ProjectConfig,
    adapter: AnimationEngineAdapter,
    onProgress?: PipelineProgressCallback,
    options?: PipelineExecutionOptions
  ): Promise<{ project: Project; renderJob: RenderJob; videoPath: string }> {
    const notify = (stage: string, message: string, data?: unknown) => {
      if (onProgress) onProgress(stage, message, data);
    };

    const pollIntervalMs = options?.pollIntervalMs ?? 1000;

    // Stage 1: Initialize Engine Adapter
    notify('INIT_ENGINE', `Initializing engine adapter: ${adapter.name}`);
    await adapter.initialize();

    // Stages 2–5: Storyboard, Character, Scenes & Project Assembly
    notify('STORY_DIRECTOR', `Converting prompt to storyboard: "${config.prompt}"`);
    const project = await this.planProject(config, { projectId: options?.projectId });
    const projectId = project.id;
    const character = project.characters[0];
    const scenes = project.scenes;

    notify('CHARACTER_MANAGER', 'Generated character layer hierarchy and rigging parameters');
    notify(
      'SCENE_PLANNER',
      `Planned ${scenes.length} scenes (${project.storyboard?.beats.length ?? 0} beats)`
    );
    this.db.saveProject(project);

    // Stage 6: Engine Project & Scene Instantiation
    notify('ADAPTER_SCENES', `Instantiating project and ${scenes.length} scenes in ${adapter.name}`);
    const adapterProjectId = await adapter.createProject(projectId, config, [character]);
    if (adapterProjectId !== projectId) {
      throw new Error(
        `Adapter ${adapter.name} violated projectId contract: expected ${projectId}, got ${adapterProjectId}`
      );
    }
    for (const scene of scenes) {
      await adapter.createScene(scene);
    }

    // Stage 7: Quality Checker & Preview
    notify('QUALITY_CHECK', 'Verifying scene layouts, motion boundaries and visual pacing');
    if (scenes.length > 0) {
      await adapter.preview(scenes[0].id);
    }

    // Stage 8: Video Render Execution
    notify('RENDER_ENGINE', `Rendering project frames to MP4 via ${adapter.name}...`);
    const renderJob = await adapter.render(projectId, (info) => {
      notify('RENDER_PROGRESS', `Render ${info.phase}: ${info.progress}%`, info);
    });
    if (renderJob.projectId !== projectId) {
      throw new Error(
        `Adapter ${adapter.name} violated renderJob projectId contract: expected ${projectId}, got ${renderJob.projectId}`
      );
    }
    this.db.saveRenderJob(renderJob);

    // Poll until complete
    let status = await adapter.getRenderStatus(renderJob.id);
    let attempts = 0;
    const maxAttempts = pollIntervalMs > 0 ? Math.max(60, Math.ceil(60000 / pollIntervalMs)) : 60;
    while (status.status === 'rendering' || status.status === 'queued') {
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error(`Rendering timed out for job ${renderJob.id}`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      status = await adapter.getRenderStatus(renderJob.id);
    }

    renderJob.status = status.status;
    renderJob.progress = status.progress;
    renderJob.outputFilePath = status.outputFilePath ?? renderJob.outputFilePath;
    renderJob.error = status.error;
    renderJob.finishedAt = renderJob.finishedAt ?? new Date().toISOString();
    this.db.saveRenderJob(renderJob);

    if (status.status === 'failed') {
      throw new Error(`Rendering failed: ${status.error || 'Unknown engine error'}`);
    }

    // Stage 9: Export Final MP4
    notify('EXPORT_VIDEO', 'Exporting and validating final playable MP4 video');
    const videoPath = await adapter.exportVideo(renderJob.id);

    project.status = 'rendered';
    project.updatedAt = new Date().toISOString();
    this.db.saveProject(project);

    notify('COMPLETED', `Pipeline complete! Video saved to ${videoPath}`);
    return { project, renderJob, videoPath };
  }
}
