import {
  Character,
  ProjectConfig,
  RenderJob,
  RenderStatus,
  Scene,
} from '../schemas/index.js';

export type SceneConfig = Omit<Scene, 'id'> & { id?: string };

export interface RenderProgressUpdate {
  jobId?: string;
  phase: 'open' | 'frames' | 'encode' | 'done';
  progress: number;
  done?: number;
  total?: number;
  fps?: number;
  eta?: number | null;
}

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
   * Create an isolated project structure for this engine using caller-supplied canonical projectId
   */
  createProject(
    projectId: string,
    config: ProjectConfig,
    characters?: Character[]
  ): Promise<string>;

  /**
   * Create or update a scene representation within the engine project
   */
  createScene(config: SceneConfig): Promise<string>;

  /**
   * Generate, verify QA, or launch a preview for the scene
   */
  preview(sceneId: string): Promise<string>;

  /**
   * Trigger rendering of the project to MP4 or engine output
   */
  render(
    projectId: string,
    onProgress?: (info: RenderProgressUpdate) => void
  ): Promise<RenderJob>;

  /**
   * Poll or inspect render job status
   */
  getRenderStatus(jobId: string): Promise<RenderStatus>;

  /**
   * Retrieve the final exported output path
   */
  exportVideo(jobId: string): Promise<string>;

  /**
   * Cancel an active render for the given project if running
   */
  cancelRender?(projectId: string): Promise<boolean>;

  /**
   * Release any child processes or handles owned by the adapter
   */
  dispose?(): Promise<void>;
}
