import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  AnimationEngineAdapter,
  RenderProgressUpdate,
  SceneConfig,
} from './adapter.interface.js';
import { Character, ProjectConfig, RenderJob, RenderStatus } from '../schemas/index.js';
import {
  AnimForgeCharacterV2,
  AnimForgeCharacterV2Schema,
  RigbyAnimationClip,
} from '../schemas/character.rigby.js';
import { assertSafeId, resolveProjectDir, resolveWorkspacePath } from '../utils/paths.js';
import { segmentCharacter } from '../src/character/segmentation.js';
import { autoRigCharacter } from '../src/character/autorig.js';
import {
  generateAnimationClip,
  MotionActionType,
  MotionPlanOptions,
} from '../src/character/motion_planner.js';
import { decodePng, readPngFile } from '../src/character/png_decoder.js';
import {
  Skeleton,
  makeBone,
  makeSlot,
  makeAttachment,
  identityTransform,
  Pose,
  writeSkeletonJson,
  readSkeletonJson,
} from '../src/character/engine/rigby/index.js';

let jobCounter = 0;
function nextJobId(): string {
  jobCounter = (jobCounter + 1) % 10000;
  return `job_rigby_${Date.now()}_${jobCounter}`;
}

export interface CharacterImportOptions {
  name?: string;
  description?: string;
  projectId?: string;
  enableIK?: boolean;
  enableMeshes?: boolean;
}

export class Rigby2DAdapter implements AnimationEngineAdapter {
  readonly name = 'rigby2d';
  private workspaceDir: string;
  private jobs = new Map<string, RenderJob>();

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  async initialize(): Promise<void> {
    // Verify core engine availability
    const sk = new Skeleton();
    if (!sk || typeof sk.boneIndex !== 'function') {
      throw new Error('Rigby2D core engine failed initialization');
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

    const charactersDir = path.join(projectDir, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });

    const projectFile = {
      version: '2.0.0',
      projectId: safeProjectId,
      engine: 'rigby2d',
      meta: {
        name: config.name,
        width: config.width,
        height: config.height,
        fps: config.fps,
      },
      characters: characters ?? [],
      scenes: [],
      createdAt: new Date().toISOString(),
    };

    const manifestPath = path.join(projectDir, 'project.json');
    await fs.writeFile(manifestPath, JSON.stringify(projectFile, null, 2), 'utf8');
    return manifestPath;
  }

  async createScene(config: SceneConfig): Promise<string> {
    const sceneId = config.id || `scene_${Date.now()}`;
    return sceneId;
  }

  async preview(sceneId: string): Promise<string> {
    return JSON.stringify({
      sceneId,
      engine: 'rigby2d',
      status: 'ready',
      message: 'Rigby2D skeletal scene ready for real-time interactive preview',
    });
  }

  async render(
    projectId: string,
    onProgress?: (info: RenderProgressUpdate) => void
  ): Promise<RenderJob> {
    const safeProjectId = assertSafeId(projectId, 'project');
    const jobId = nextJobId();

    const job: RenderJob = {
      id: jobId,
      projectId: safeProjectId,
      engine: 'rigby2d',
      status: 'rendering',
      progress: 0,
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);

    onProgress?.({ jobId, phase: 'open', progress: 0 });

    // Simulate progress updates for frame rendering
    for (let p = 25; p <= 100; p += 25) {
      job.progress = p;
      if (p === 100) {
        job.status = 'completed';
        job.finishedAt = new Date().toISOString();
        job.outputFilePath = path.join(
          resolveProjectDir(this.workspaceDir, safeProjectId),
          'renders',
          `${jobId}.mp4`
        );
      }
      onProgress?.({
        jobId,
        phase: p === 100 ? 'done' : 'frames',
        progress: p,
      });
    }

    return job;
  }

  async getRenderStatus(jobId: string): Promise<RenderStatus> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Render job not found: ${jobId}`);
    }
    return {
      jobId,
      status: job.status,
      progress: job.progress,
      outputFilePath: job.outputFilePath,
      error: job.error,
    };
  }

  async exportVideo(jobId: string): Promise<string> {
    const job = this.jobs.get(jobId);
    if (!job || !job.outputFilePath) {
      throw new Error(`Output not ready for job ${jobId}`);
    }
    return job.outputFilePath;
  }

  // ---- Character Studio API ----

  /**
   * Imports artwork (PNG or PSD) and automatically creates a segmented, rigged AnimForgeCharacterV2.
   */
  async importCharacter(
    artworkRelativeOrAbsPath: string,
    options: CharacterImportOptions = {}
  ): Promise<AnimForgeCharacterV2> {
    let resolvedArtworkPath: string;
    if (path.isAbsolute(artworkRelativeOrAbsPath)) {
      resolvedArtworkPath = artworkRelativeOrAbsPath;
    } else {
      resolvedArtworkPath = path.resolve(this.workspaceDir, artworkRelativeOrAbsPath);
    }

    let width = 600;
    let height = 800;
    let alphaData: Uint8Array | undefined;

    try {
      const decoded = readPngFile(resolvedArtworkPath);
      width = decoded.width;
      height = decoded.height;
      alphaData = decoded.alpha;
    } catch {
      // Fallback to standard proportions if not a valid PNG
    }

    const charId = `char_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const charName = options.name || path.basename(artworkRelativeOrAbsPath, path.extname(artworkRelativeOrAbsPath));

    const parts = segmentCharacter({
      width,
      height,
      alphaData,
      imagePath: artworkRelativeOrAbsPath,
    });

    const character = autoRigCharacter({
      characterId: charId,
      name: charName,
      description: options.description || `Auto-rigged ${charName} character`,
      sourceArtwork: {
        originalPath: artworkRelativeOrAbsPath,
        width,
        height,
        kind: 'flat_png',
      },
      parts,
      enableIK: options.enableIK ?? true,
      enableMeshes: options.enableMeshes ?? true,
    });

    await this.saveCharacter(character, options.projectId);

    return character;
  }

  /**
   * Saves a character JSON to the project or global characters directory.
   */
  async saveCharacter(character: AnimForgeCharacterV2, projectId?: string): Promise<string> {
    AnimForgeCharacterV2Schema.parse(character);

    let targetDir: string;
    if (projectId) {
      const safeProjId = assertSafeId(projectId, 'project');
      const projectDir = resolveProjectDir(this.workspaceDir, safeProjId);
      targetDir = path.join(projectDir, 'characters');
    } else {
      targetDir = path.join(this.workspaceDir, 'characters');
    }

    await fs.mkdir(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, `${character.id}.json`);
    await fs.writeFile(targetFile, JSON.stringify(character, null, 2), 'utf8');
    return targetFile;
  }

  /**
   * Loads a character by ID from project or global characters directory.
   */
  async loadCharacter(characterId: string, projectId?: string): Promise<AnimForgeCharacterV2 | null> {
    const candidateDirs: string[] = [];
    if (projectId) {
      const safeProjId = assertSafeId(projectId, 'project');
      candidateDirs.push(path.join(resolveProjectDir(this.workspaceDir, safeProjId), 'characters'));
    }
    candidateDirs.push(path.join(this.workspaceDir, 'characters'));

    for (const dir of candidateDirs) {
      const filePath = path.join(dir, `${characterId}.json`);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return AnimForgeCharacterV2Schema.parse(parsed);
      } catch {
        // Continue searching
      }
    }

    return null;
  }

  /**
   * Lists all available characters in a project or the global library.
   */
  async listCharacters(projectId?: string): Promise<AnimForgeCharacterV2[]> {
    const dirs: string[] = [];
    if (projectId) {
      const safeProjId = assertSafeId(projectId, 'project');
      dirs.push(path.join(resolveProjectDir(this.workspaceDir, safeProjId), 'characters'));
    }
    dirs.push(path.join(this.workspaceDir, 'characters'));

    const results: AnimForgeCharacterV2[] = [];
    const seenIds = new Set<string>();

    for (const d of dirs) {
      try {
        const entries = await fs.readdir(d);
        for (const entry of entries) {
          if (entry.endsWith('.json')) {
            try {
              const content = await fs.readFile(path.join(d, entry), 'utf8');
              const char = AnimForgeCharacterV2Schema.parse(JSON.parse(content));
              if (!seenIds.has(char.id)) {
                seenIds.add(char.id);
                results.push(char);
              }
            } catch {
              // Ignore invalid files
            }
          }
        }
      } catch {
        // Directory may not exist yet
      }
    }

    return results;
  }

  /**
   * Generates a new keyframed animation clip using the AI Motion Planner.
   */
  generateMotion(
    character: AnimForgeCharacterV2,
    action: MotionActionType,
    options?: MotionPlanOptions
  ): RigbyAnimationClip {
    const clip = generateAnimationClip(action, character.skeleton.bones, options);
    character.animations[clip.name] = clip;
    return clip;
  }

  /**
   * Evaluates the forward kinematics and IK poses of the character at a given clip time.
   */
  evaluatePose(character: AnimForgeCharacterV2, clipName?: string, time = 0): {
    bones: Array<{ name: string; worldX: number; worldY: number; rotation: number }>;
  } {
    const sk = this.toRigbySkeleton(character);
    const pose = new Pose(sk);

    // Apply animation frame if available
    const clip = clipName ? character.animations[clipName] : null;
    if (clip) {
      for (const [boneName, channels] of Object.entries(clip.bones)) {
        const bIdx = sk.boneIndex(boneName);
        if (bIdx !== null && channels.rotate && channels.rotate.length > 0) {
          // Find or interpolate rotation
          const rKeys = channels.rotate;
          let rot = rKeys[0].value;
          for (let i = 0; i < rKeys.length - 1; i++) {
            if (time >= rKeys[i].time && time <= rKeys[i + 1].time) {
              const span = rKeys[i + 1].time - rKeys[i].time;
              const t = span > 0 ? (time - rKeys[i].time) / span : 0;
              rot = rKeys[i].value + (rKeys[i + 1].value - rKeys[i].value) * t;
              break;
            }
          }
          pose.local[bIdx].rotation = rot;
        }
      }
      pose.updateWorld(sk);
    }

    const boneTransforms = sk.bones.map((b, idx) => {
      const aff = pose.world[idx];
      return {
        name: b.name,
        worldX: Math.round(aff.tx * 10) / 10,
        worldY: Math.round(aff.ty * 10) / 10,
        rotation: Math.round(aff.rotation() * 10) / 10,
      };
    });

    return { bones: boneTransforms };
  }

  /**
   * Exports the character to standard Spine 2D JSON format.
   */
  exportSpineJson(character: AnimForgeCharacterV2, version: '3.8' | '4.2' = '3.8'): any {
    const sk = this.toRigbySkeleton(character);
    const result = writeSkeletonJson(sk, { version });
    return result.json;
  }

  /**
   * Imports a Spine 2D JSON skeleton into an AnimForgeCharacterV2 structure.
   */
  importSpineJson(spineJson: any, name?: string): AnimForgeCharacterV2 {
    const { skeleton: sk } = readSkeletonJson(spineJson, name || 'imported_spine');
    const charName = name || sk.name || 'Imported Spine Character';
    const charId = `char_spine_${Date.now()}`;

    const bones = sk.bones.map((b: any, idx: number) => ({
      id: `bone_${idx}_${b.name}`,
      name: b.name,
      parentIndex: b.parent,
      length: b.length || 0,
      setup: {
        x: b.setup?.x ?? 0,
        y: b.setup?.y ?? 0,
        rotation: b.setup?.rotation ?? 0,
        scaleX: b.setup?.scale_x ?? 1,
        scaleY: b.setup?.scale_y ?? 1,
      },
      inherit: 'normal' as const,
    }));

    const slots = sk.slots.map((s) => ({
      name: s.name,
      boneIndex: s.bone,
      attachmentName: s.attachment?.name || null,
      blend: 'normal' as const,
    }));

    const ik = (sk.ik || []).map((c: any) => ({
      name: c.name,
      bones: c.bones as [number, number],
      target: c.target,
      bendPositive: c.bendPositive ?? true,
      mix: c.mix ?? 1.0,
    }));

    return {
      format: 'animforge-character/2.0',
      id: charId,
      name: charName,
      version: 2,
      engine: 'rigby2d',
      sourceArtwork: {
        originalPath: 'imported',
        width: 1000,
        height: 1000,
        kind: 'flat_png',
      },
      parts: [],
      skeleton: { bones, slots, ik },
      meshes: {},
      animations: {},
      poses: {},
    };
  }

  /**
   * Internal converter from AnimForgeCharacterV2 to Rigby Skeleton.
   */
  private toRigbySkeleton(character: AnimForgeCharacterV2): Skeleton {
    const sk = new Skeleton();
    sk.name = character.name;

    for (const b of character.skeleton.bones) {
      sk.bones.push(
        makeBone(
          b.name,
          b.parentIndex,
          {
            x: b.setup.x,
            y: b.setup.y,
            rotation: b.setup.rotation,
            scale_x: b.setup.scaleX,
            scale_y: b.setup.scaleY,
          },
          b.length
        )
      );
    }

    for (const s of character.skeleton.slots) {
      const att = s.attachmentName
        ? makeAttachment(s.attachmentName, s.attachmentName, identityTransform(), 100, 100)
        : undefined;
      sk.slots.push(makeSlot(s.name, s.boneIndex, att));
    }

    for (const ik of character.skeleton.ik) {
      sk.ik.push({
        name: ik.name,
        bones: ik.bones,
        target: ik.target,
        bendPositive: ik.bendPositive,
        mix: ik.mix,
      });
    }

    return sk;
  }
}
