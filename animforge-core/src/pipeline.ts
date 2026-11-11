import { Project, ProjectConfig, RenderJob } from '../schemas/index.js';
import { StoryDirectorAgent } from '../agents/storyDirector.js';
import { CharacterManagerAgent } from '../agents/characterManager.js';
import { ScenePlannerAgent } from '../agents/scenePlanner.js';
import { AnimationEngineAdapter } from '../adapters/adapter.interface.js';
import { AnimForgeDatabase } from './database.js';

export interface PipelineProgressCallback {
  (stage: string, message: string, data?: any): void;
}

export class AnimForgePipeline {
  private storyDirector = new StoryDirectorAgent();
  private characterManager = new CharacterManagerAgent();
  private scenePlanner = new ScenePlannerAgent();
  private db: AnimForgeDatabase;

  constructor(db?: AnimForgeDatabase) {
    this.db = db || new AnimForgeDatabase();
  }

  /**
   * Run the complete animation pipeline from human natural language idea to final video
   */
  async execute(
    config: ProjectConfig,
    adapter: AnimationEngineAdapter,
    onProgress?: PipelineProgressCallback
  ): Promise<{ project: Project; renderJob: RenderJob; videoPath: string }> {
    const notify = (stage: string, message: string, data?: any) => {
      if (onProgress) onProgress(stage, message, data);
    };

    // Stage 1: Initialize Engine Adapter
    notify('INIT_ENGINE', `Initializing engine adapter: ${adapter.name}`);
    await adapter.initialize();

    // Stage 2: Human Idea -> AI Story Director
    const projectId = `proj_${Date.now()}`;
    notify('STORY_DIRECTOR', `Converting prompt to storyboard: "${config.prompt}"`);
    const storyboard = await this.storyDirector.createStoryboard(projectId, config.prompt);

    // Stage 3: Character & Asset Preparation
    notify('CHARACTER_MANAGER', 'Generating character layer hierarchy and rigging parameters');
    const character = await this.characterManager.createCharacter(
      'Pip',
      'Cute little green cartoon alien/creature with expressive big eyes'
    );

    // Stage 4: Scene Planner & Animation Choreography
    notify('SCENE_PLANNER', `Planning scenes and motion tracks (${storyboard.beats.length} beats)`);
    const scenes = await this.scenePlanner.planScenes(projectId, storyboard, character);

    // Stage 5: Project Assembly
    const now = new Date().toISOString();
    const project: Project = {
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
    this.db.saveProject(project);

    // Stage 6: Engine Project & Scene Instantiation
    notify('ADAPTER_SCENES', `Instantiating project and ${scenes.length} scenes in ${adapter.name}`);
    await adapter.createProject(config);
    for (const scene of scenes) {
      await adapter.createScene(scene);
    }

    // Stage 7: Quality Checker & Preview
    notify('QUALITY_CHECK', 'Verifying scene layouts, motion boundaries and visual pacing');
    await adapter.preview(scenes[0].id);

    // Stage 8: Video Render Execution
    notify('RENDER_ENGINE', `Rendering project frames to MP4 via ${adapter.name}...`);
    const renderJob = await adapter.render(projectId);
    this.db.saveRenderJob(renderJob);

    // Poll until complete
    let status = await adapter.getRenderStatus(renderJob.id);
    let attempts = 0;
    while (status.status === 'rendering' || status.status === 'queued') {
      attempts++;
      if (attempts > 60) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      status = await adapter.getRenderStatus(renderJob.id);
    }

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
