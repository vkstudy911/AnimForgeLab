import { ProjectConfig, Scene, RenderJob, RenderStatus } from '../schemas/index.js';

export type SceneConfig = Omit<Scene, 'id'> & { id?: string };

export interface AnimationEngineAdapter {
  /**
   * Identifies the adapter name
   */
  readonly name: string;

  /**
   * Initialize and verify engine prerequisites (e.g. binaries, browsers, templates)
   */
  initialize(): Promise<void>;

  /**
   * Create an isolated project structure for this engine
   */
  createProject(config: ProjectConfig): Promise<string>;

  /**
   * Create or update a scene representation within the engine project
   */
  createScene(config: SceneConfig): Promise<string>;

  /**
   * Generate or launch a preview for the scene
   */
  preview(sceneId: string): Promise<string>;

  /**
   * Trigger rendering of the project to MP4
   */
  render(projectId: string): Promise<RenderJob>;

  /**
   * Poll or inspect render job status
   */
  getRenderStatus(jobId: string): Promise<RenderStatus>;

  /**
   * Retrieve the final exported video path
   */
  exportVideo(jobId: string): Promise<string>;
}
