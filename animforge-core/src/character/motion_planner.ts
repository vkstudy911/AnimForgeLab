import { RigbyBone, RigbyAnimationClip } from '../../schemas/character.rigby.js';

export type MotionActionType =
  | 'idle'
  | 'walk'
  | 'run'
  | 'wave'
  | 'jump'
  | 'dance'
  | 'breathing'
  | 'blink'
  | 'head_turn'
  | 'smile'
  | 'hand_gesture';

export interface MotionPlanOptions {
  duration?: number;
  fps?: number;
  intensity?: number;
  armSide?: 'l' | 'r';
  loop?: boolean;
}

/**
 * Generates an expressive, keyframed RigbyAnimationClip for standard skeletal actions.
 */
export function generateAnimationClip(
  action: MotionActionType,
  bones: Array<{ name: string } & Partial<RigbyBone>>,
  options: MotionPlanOptions = {}
): RigbyAnimationClip {
  const fps = options.fps ?? 30;
  const intensity = options.intensity ?? 1.0;
  const boneNames = new Set(bones.map((b) => b.name));

  const animBones: Record<
    string,
    {
      rotate?: Array<{ time: number; value: number; curve?: number[] }>;
      translate?: Array<{ time: number; value: [number, number]; curve?: number[] }>;
      scale?: Array<{ time: number; value: [number, number]; curve?: number[] }>;
    }
  > = {};

  const ensureBone = (name: string) => {
    if (!animBones[name]) animBones[name] = {};
    return animBones[name];
  };

  switch (action) {
    case 'idle': {
      const duration = options.duration ?? 2.0;
      // Chest breathing & gentle head bob
      if (boneNames.has('chest')) {
        const b = ensureBone('chest');
        b.rotate = [
          { time: 0, value: 0 },
          { time: duration * 0.5, value: 2.5 * intensity },
          { time: duration, value: 0 },
        ];
        b.scale = [
          { time: 0, value: [1.0, 1.0] },
          { time: duration * 0.5, value: [1.02 * intensity, 1.03 * intensity] },
          { time: duration, value: [1.0, 1.0] },
        ];
      }
      if (boneNames.has('head')) {
        const b = ensureBone('head');
        b.rotate = [
          { time: 0, value: 0 },
          { time: duration * 0.4, value: -1.5 * intensity },
          { time: duration * 0.8, value: 1.0 * intensity },
          { time: duration, value: 0 },
        ];
      }
      // Gentle arm sway
      if (boneNames.has('upperarm_l')) {
        const b = ensureBone('upperarm_l');
        b.rotate = [
          { time: 0, value: -75 },
          { time: duration * 0.5, value: -72 * intensity },
          { time: duration, value: -75 },
        ];
      }
      if (boneNames.has('upperarm_r')) {
        const b = ensureBone('upperarm_r');
        b.rotate = [
          { time: 0, value: 75 },
          { time: duration * 0.5, value: 72 * intensity },
          { time: duration, value: 75 },
        ];
      }
      return { name: 'idle', duration, fps, bones: animBones };
    }

    case 'walk': {
      const duration = options.duration ?? 1.2;
      const t4 = duration / 4;

      // Pelvis vertical bob (two drops per stride)
      if (boneNames.has('hip')) {
        const b = ensureBone('hip');
        b.translate = [
          { time: 0, value: [0, 0] },
          { time: t4 * 1, value: [0, -6 * intensity] },
          { time: t4 * 2, value: [0, 0] },
          { time: t4 * 3, value: [0, -6 * intensity] },
          { time: duration, value: [0, 0] },
        ];
        b.rotate = [
          { time: 0, value: 0 },
          { time: t4 * 1, value: 3 * intensity },
          { time: t4 * 2, value: 0 },
          { time: t4 * 3, value: -3 * intensity },
          { time: duration, value: 0 },
        ];
      }

      // Legs antiphase swing
      if (boneNames.has('thigh_l') && boneNames.has('thigh_r')) {
        const tl = ensureBone('thigh_l');
        const tr = ensureBone('thigh_r');
        tl.rotate = [
          { time: 0, value: -90 },
          { time: t4 * 1, value: -90 + 25 * intensity },
          { time: t4 * 2, value: -90 },
          { time: t4 * 3, value: -90 - 25 * intensity },
          { time: duration, value: -90 },
        ];
        tr.rotate = [
          { time: 0, value: -90 },
          { time: t4 * 1, value: -90 - 25 * intensity },
          { time: t4 * 2, value: -90 },
          { time: t4 * 3, value: -90 + 25 * intensity },
          { time: duration, value: -90 },
        ];
      }

      // Shins bend on backswing
      if (boneNames.has('shin_l') && boneNames.has('shin_r')) {
        const sl = ensureBone('shin_l');
        const sr = ensureBone('shin_r');
        sl.rotate = [
          { time: 0, value: 0 },
          { time: t4 * 1, value: 5 * intensity },
          { time: t4 * 2, value: 0 },
          { time: t4 * 3, value: 35 * intensity },
          { time: duration, value: 0 },
        ];
        sr.rotate = [
          { time: 0, value: 0 },
          { time: t4 * 1, value: 35 * intensity },
          { time: t4 * 2, value: 0 },
          { time: t4 * 3, value: 5 * intensity },
          { time: duration, value: 0 },
        ];
      }

      // Arms swing opposite to legs
      if (boneNames.has('upperarm_l') && boneNames.has('upperarm_r')) {
        const al = ensureBone('upperarm_l');
        const ar = ensureBone('upperarm_r');
        al.rotate = [
          { time: 0, value: -75 },
          { time: t4 * 1, value: -75 - 20 * intensity },
          { time: t4 * 2, value: -75 },
          { time: t4 * 3, value: -75 + 20 * intensity },
          { time: duration, value: -75 },
        ];
        ar.rotate = [
          { time: 0, value: 75 },
          { time: t4 * 1, value: 75 + 20 * intensity },
          { time: t4 * 2, value: 75 },
          { time: t4 * 3, value: 75 - 20 * intensity },
          { time: duration, value: 75 },
        ];
      }

      return { name: 'walk', duration, fps, bones: animBones };
    }

    case 'run': {
      const duration = options.duration ?? 0.8;
      const t4 = duration / 4;

      if (boneNames.has('hip')) {
        const b = ensureBone('hip');
        b.translate = [
          { time: 0, value: [0, 0] },
          { time: t4 * 1, value: [0, -12 * intensity] },
          { time: t4 * 2, value: [0, 8 * intensity] }, // airborne spring
          { time: t4 * 3, value: [0, -12 * intensity] },
          { time: duration, value: [0, 0] },
        ];
        b.rotate = [
          { time: 0, value: 5 }, // forward lean
          { time: t4 * 1, value: 8 },
          { time: t4 * 2, value: 5 },
          { time: t4 * 3, value: 8 },
          { time: duration, value: 5 },
        ];
      }

      if (boneNames.has('thigh_l') && boneNames.has('thigh_r')) {
        const tl = ensureBone('thigh_l');
        const tr = ensureBone('thigh_r');
        tl.rotate = [
          { time: 0, value: -90 },
          { time: t4 * 1, value: -90 + 45 * intensity },
          { time: t4 * 2, value: -90 },
          { time: t4 * 3, value: -90 - 45 * intensity },
          { time: duration, value: -90 },
        ];
        tr.rotate = [
          { time: 0, value: -90 },
          { time: t4 * 1, value: -90 - 45 * intensity },
          { time: t4 * 2, value: -90 },
          { time: t4 * 3, value: -90 + 45 * intensity },
          { time: duration, value: -90 },
        ];
      }

      return { name: 'run', duration, fps, bones: animBones };
    }

    case 'wave': {
      const duration = options.duration ?? 2.0;
      const targetArm = options.armSide === 'r' ? 'r' : 'l';

      if (targetArm === 'l') {
        if (boneNames.has('upperarm_l')) {
          const u = ensureBone('upperarm_l');
          u.rotate = [
            { time: 0, value: -75 },
            { time: 0.3, value: 30 }, // lift arm up
            { time: duration - 0.3, value: 30 },
            { time: duration, value: -75 },
          ];
        }
        if (boneNames.has('forearm_l')) {
          const f = ensureBone('forearm_l');
          f.rotate = [
            { time: 0, value: -15 },
            { time: 0.3, value: 40 },
            { time: 0.6, value: -20 }, // wave left
            { time: 0.9, value: 40 },  // wave right
            { time: 1.2, value: -20 },
            { time: 1.5, value: 40 },
            { time: duration - 0.2, value: 20 },
            { time: duration, value: -15 },
          ];
        }
        if (boneNames.has('hand_l')) {
          const h = ensureBone('hand_l');
          h.rotate = [
            { time: 0, value: 0 },
            { time: 0.6, value: -15 },
            { time: 0.9, value: 15 },
            { time: 1.2, value: -15 },
            { time: 1.5, value: 15 },
            { time: duration, value: 0 },
          ];
        }
      } else {
        if (boneNames.has('upperarm_r')) {
          const u = ensureBone('upperarm_r');
          u.rotate = [
            { time: 0, value: 75 },
            { time: 0.3, value: -30 },
            { time: duration - 0.3, value: -30 },
            { time: duration, value: 75 },
          ];
        }
        if (boneNames.has('forearm_r')) {
          const f = ensureBone('forearm_r');
          f.rotate = [
            { time: 0, value: 15 },
            { time: 0.3, value: -40 },
            { time: 0.6, value: 20 },
            { time: 0.9, value: -40 },
            { time: 1.2, value: 20 },
            { time: 1.5, value: -40 },
            { time: duration - 0.2, value: -20 },
            { time: duration, value: 15 },
          ];
        }
      }

      // Slight head tilt towards wave
      if (boneNames.has('head')) {
        const h = ensureBone('head');
        h.rotate = [
          { time: 0, value: 0 },
          { time: 0.4, value: 5 * intensity },
          { time: duration - 0.4, value: 5 * intensity },
          { time: duration, value: 0 },
        ];
      }

      return { name: 'wave', duration, fps, bones: animBones };
    }

    case 'jump': {
      const duration = options.duration ?? 1.5;
      if (boneNames.has('hip')) {
        const b = ensureBone('hip');
        b.translate = [
          { time: 0, value: [0, 0] },
          { time: 0.3, value: [0, -15 * intensity] }, // anticipation crouch
          { time: 0.7, value: [0, 45 * intensity] },  // jump apex
          { time: 1.1, value: [0, -8 * intensity] },  // landing squish
          { time: duration, value: [0, 0] },          // recover
        ];
      }
      return { name: 'jump', duration, fps, bones: animBones };
    }

    case 'dance': {
      const duration = options.duration ?? 2.4;
      const t8 = duration / 8;
      if (boneNames.has('hip')) {
        const b = ensureBone('hip');
        b.rotate = [
          { time: 0, value: 0 },
          { time: t8 * 2, value: 12 * intensity },
          { time: t8 * 4, value: 0 },
          { time: t8 * 6, value: -12 * intensity },
          { time: duration, value: 0 },
        ];
        b.translate = [
          { time: 0, value: [0, 0] },
          { time: t8 * 1, value: [10 * intensity, -4 * intensity] },
          { time: t8 * 3, value: [-10 * intensity, -4 * intensity] },
          { time: t8 * 5, value: [10 * intensity, -4 * intensity] },
          { time: t8 * 7, value: [-10 * intensity, -4 * intensity] },
          { time: duration, value: [0, 0] },
        ];
      }
      return { name: 'dance', duration, fps, bones: animBones };
    }

    case 'breathing': {
      const duration = options.duration ?? 3.0;
      if (boneNames.has('chest')) {
        const b = ensureBone('chest');
        b.scale = [
          { time: 0, value: [1.0, 1.0] },
          { time: duration * 0.45, value: [1.04 * intensity, 1.05 * intensity] },
          { time: duration, value: [1.0, 1.0] },
        ];
      }
      return { name: 'breathing', duration, fps, bones: animBones };
    }

    case 'blink': {
      const duration = options.duration ?? 0.3;
      for (const eyeName of ['eye_l', 'eye_r']) {
        if (boneNames.has(eyeName)) {
          const b = ensureBone(eyeName);
          b.scale = [
            { time: 0, value: [1, 1] },
            { time: 0.1, value: [1, 0.05] }, // eye closed
            { time: 0.2, value: [1, 1] },
          ];
        }
      }
      return { name: 'blink', duration, fps, bones: animBones };
    }

    case 'head_turn': {
      const duration = options.duration ?? 1.5;
      if (boneNames.has('head')) {
        const b = ensureBone('head');
        b.rotate = [
          { time: 0, value: 0 },
          { time: 0.5, value: 20 * intensity },
          { time: 1.0, value: -20 * intensity },
          { time: duration, value: 0 },
        ];
      }
      return { name: 'head_turn', duration, fps, bones: animBones };
    }

    case 'smile': {
      const duration = options.duration ?? 1.0;
      if (boneNames.has('mouth')) {
        const b = ensureBone('mouth');
        b.scale = [
          { time: 0, value: [1, 1] },
          { time: 0.5, value: [1.2 * intensity, 0.9 * intensity] },
          { time: duration, value: [1, 1] },
        ];
      }
      return { name: 'smile', duration, fps, bones: animBones };
    }

    case 'hand_gesture':
    default: {
      const duration = options.duration ?? 1.0;
      if (boneNames.has('hand_l')) {
        const b = ensureBone('hand_l');
        b.rotate = [
          { time: 0, value: 0 },
          { time: 0.5, value: 25 * intensity },
          { time: duration, value: 0 },
        ];
      }
      return { name: action, duration, fps, bones: animBones };
    }
  }
}
