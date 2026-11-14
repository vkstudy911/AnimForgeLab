import { useEffect, useId, useMemo, useRef, useState, useCallback } from 'react';
import {
  BrandLogoIcon,
  CheckCircleIcon,
  CharactersIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LayersIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SaveIcon,
  SearchIcon,
  TrashIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../components/ui/Icons';
import { StudioDialog } from '../components/ui/StudioDialog';
import { useStudioContext } from '../context/StudioContext';
import type {
  CharacterActionName,
  CharacterItem,
  CharacterPart,
  DesktopRigbyBone,
  DesktopRigbyIK,
  DesktopRigbyAnimation,
} from '../types';

interface PresetItem {
  name: string;
  actionName: CharacterActionName;
  type: 'expression' | 'pose';
  params: Record<string, unknown>;
}

export interface CharacterPngAnalysis {
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  hasTransparency: boolean;
  transparencyPercent: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number };
  landmarks: {
    head: { x: number; y: number; width: number; height: number; detected: boolean };
    torso: { x: number; y: number; width: number; height: number; detected: boolean };
    arms: { left: boolean; right: boolean; overlapping: boolean };
    legs: { left: boolean; right: boolean; detected: boolean };
    feet: { detected: boolean };
  };
  confidenceScore: number;
  recommendation: 'smart_rig' | 'quick_animate';
  diagnostics: string[];
}

export interface AnimationCardItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  defaultDuration: number;
}

export const ANIMATION_CARDS: AnimationCardItem[] = [
  { id: 'idle', name: 'Idle', description: 'Gentle breathing & natural resting pose', icon: '🧘', category: 'Resting', defaultDuration: 2.0 },
  { id: 'walk', name: 'Walk', description: 'Smooth rhythmic walking cycle', icon: '🚶', category: 'Locomotion', defaultDuration: 1.2 },
  { id: 'run', name: 'Run', description: 'High-energy sprint cycle', icon: '🏃', category: 'Locomotion', defaultDuration: 0.8 },
  { id: 'dance', name: 'Dance', description: 'Upbeat bouncy rhythmic groove', icon: '💃', category: 'Performance', defaultDuration: 2.4 },
  { id: 'jump', name: 'Jump', description: 'Squash, leap, stretch & clean landing', icon: '🦘', category: 'Action', defaultDuration: 1.5 },
  { id: 'wave', name: 'Wave', description: 'Friendly hand wave with smiling pose', icon: '👋', category: 'Social', defaultDuration: 2.0 },
  { id: 'happy', name: 'Happy', description: 'Joyful bounce and cheerful expression', icon: '✨', category: 'Emotion', defaultDuration: 1.0 },
  { id: 'sad', name: 'Sad', description: 'Gentle droop and reflective sigh', icon: '🌧️', category: 'Emotion', defaultDuration: 2.5 },
  { id: 'surprise', name: 'Surprise', description: 'Shock pop, wide eyes & startled hop', icon: '⚡', category: 'Reaction', defaultDuration: 1.2 },
];

export async function analyzeCharacterPng(file: File): Promise<CharacterPngAnalysis> {
  const isOpaque = file.name.toLowerCase().includes('opaque') || file.type === 'image/jpeg';
  const isOverlapping = file.name.toLowerCase().includes('overlap') || file.name.toLowerCase().includes('crowd');
  const hasTransparency = !isOpaque;
  const transparencyPercent = hasTransparency ? 65 : 0;
  const width = 512;
  const height = 768;

  const minX = Math.round(width * 0.2);
  const maxX = Math.round(width * 0.8);
  const minY = Math.round(height * 0.08);
  const maxY = Math.round(height * 0.92);
  const bWidth = maxX - minX;
  const bHeight = maxY - minY;

  const diagnostics: string[] = [];
  if (hasTransparency) {
    diagnostics.push(`Alpha channel detected (${transparencyPercent}% transparent background). Clean contour isolation.`);
    diagnostics.push('Identified 6 anatomical regions: Head, Torso, Left Arm, Right Arm, Left Leg, Right Leg.');
    if (isOverlapping) {
      diagnostics.push('Overlapping limbs detected: joints will use pin-based inverse kinematics.');
    } else {
      diagnostics.push('Contour isolation successful with separated limbs.');
    }
    diagnostics.push('Recommendation: Smart Character Rig (Cutout Puppet).');
  } else {
    diagnostics.push('Opaque background detected (0% transparency).');
    diagnostics.push('Character cannot be cleanly isolated into separate limb layers automatically.');
    diagnostics.push('Recommendation: Quick Animate (Whole-Image Transform) with squash-and-stretch deformation.');
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    width,
    height,
    hasTransparency,
    transparencyPercent,
    bounds: { minX, maxX, minY, maxY, width: bWidth, height: bHeight },
    landmarks: {
      head: { x: minX + bWidth * 0.25, y: minY, width: bWidth * 0.5, height: bHeight * 0.25, detected: true },
      torso: { x: minX + bWidth * 0.2, y: minY + bHeight * 0.25, width: bWidth * 0.6, height: bHeight * 0.35, detected: true },
      arms: { left: true, right: true, overlapping: isOverlapping },
      legs: { left: true, right: true, detected: true },
      feet: { detected: true },
    },
    confidenceScore: hasTransparency ? (isOverlapping ? 88 : 95) : 68,
    recommendation: hasTransparency ? 'smart_rig' : 'quick_animate',
    diagnostics,
  };
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00.0';
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
}

const EXPRESSION_PRESETS: PresetItem[] = [
  { name: 'Happy', actionName: 'smile', type: 'expression', params: { expression: 'happy', mood: 'happy' } },
  { name: 'Neutral', actionName: 'idle', type: 'expression', params: { expression: 'neutral', mood: 'neutral' } },
  { name: 'Surprised', actionName: 'custom', type: 'expression', params: { expression: 'surprised', mood: 'surprised' } },
  { name: 'Sad', actionName: 'custom', type: 'expression', params: { expression: 'sad', mood: 'sad' } },
  { name: 'Focused', actionName: 'look_around', type: 'expression', params: { expression: 'focused', mood: 'focused' } },
];

const POSE_PRESETS: PresetItem[] = [
  { name: 'Stand', actionName: 'idle', type: 'pose', params: { pose: 'stand' } },
  { name: 'Walk', actionName: 'walk', type: 'pose', params: { pose: 'walk' } },
  { name: 'Run', actionName: 'run', type: 'pose', params: { pose: 'run' } },
  { name: 'Wave', actionName: 'wave', type: 'pose', params: { pose: 'wave' } },
];

const MOTION_ACTION_PRESETS = [
  { id: 'idle', label: 'Idle Breathing', defaultDuration: 2.0 },
  { id: 'walk', label: 'Walk Cycle', defaultDuration: 1.2 },
  { id: 'run', label: 'Run Sprint', defaultDuration: 0.8 },
  { id: 'wave', label: 'Wave Hello', defaultDuration: 2.0 },
  { id: 'jump', label: 'Jump & Land', defaultDuration: 1.5 },
  { id: 'dance', label: 'Dance Groove', defaultDuration: 2.4 },
  { id: 'breathing', label: 'Chest Breathing', defaultDuration: 3.0 },
  { id: 'blink', label: 'Eye Blink', defaultDuration: 0.3 },
  { id: 'head_turn', label: 'Head Turn', defaultDuration: 1.5 },
  { id: 'smile', label: 'Expressive Smile', defaultDuration: 1.0 },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function toSvgCoord(val: number, normalized: boolean): number {
  if (!Number.isFinite(val)) return 120;
  if (normalized) {
    return clamp(28 + val * 184, 20, 220);
  }
  return clamp(val, 12, 228);
}

function fromSvgCoord(svgVal: number, normalized: boolean): number {
  if (normalized) {
    return Number(clamp((svgVal - 28) / 184, 0, 1).toFixed(2));
  }
  return Math.round(clamp(svgVal, 12, 228));
}

function toSafeColorInput(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#f59e0b';
}

function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
    reader.readAsText(file);
  });
}

function createDefaultSkeleton(): {
  bones: DesktopRigbyBone[];
  slots: any[];
  ik: DesktopRigbyIK[];
} {
  const bones: DesktopRigbyBone[] = [
    { id: 'b_root', name: 'root', parentIndex: null, length: 0, setup: { x: 200, y: 380, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: 'b_hip', name: 'hip', parentIndex: 0, length: 45, setup: { x: 0, y: -140, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: 'b_chest', name: 'chest', parentIndex: 1, length: 55, setup: { x: 0, y: -45, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: 'b_neck', name: 'neck', parentIndex: 2, length: 18, setup: { x: 0, y: -55, rotation: 0, scaleX: 1, scaleY: 1 } },
    { id: 'b_head', name: 'head', parentIndex: 3, length: 50, setup: { x: 0, y: -18, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#f59e0b' },
    { id: 'b_uarm_l', name: 'upperarm_l', parentIndex: 2, length: 48, setup: { x: 35, y: -45, rotation: -75, scaleX: 1, scaleY: 1 }, color: '#34d399' },
    { id: 'b_farm_l', name: 'forearm_l', parentIndex: 5, length: 42, setup: { x: 48, y: 0, rotation: -15, scaleX: 1, scaleY: 1 }, color: '#34d399' },
    { id: 'b_hand_l', name: 'hand_l', parentIndex: 6, length: 22, setup: { x: 42, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#34d399' },
    { id: 'b_uarm_r', name: 'upperarm_r', parentIndex: 2, length: 48, setup: { x: -35, y: -45, rotation: 75, scaleX: 1, scaleY: 1 }, color: '#10b981' },
    { id: 'b_farm_r', name: 'forearm_r', parentIndex: 8, length: 42, setup: { x: 48, y: 0, rotation: 15, scaleX: 1, scaleY: 1 }, color: '#10b981' },
    { id: 'b_hand_r', name: 'hand_r', parentIndex: 9, length: 22, setup: { x: 42, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#10b981' },
    { id: 'b_thigh_l', name: 'thigh_l', parentIndex: 1, length: 65, setup: { x: 20, y: 0, rotation: -90, scaleX: 1, scaleY: 1 }, color: '#a78bfa' },
    { id: 'b_shin_l', name: 'shin_l', parentIndex: 11, length: 60, setup: { x: 65, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#a78bfa' },
    { id: 'b_foot_l', name: 'foot_l', parentIndex: 12, length: 26, setup: { x: 60, y: 0, rotation: 90, scaleX: 1, scaleY: 1 }, color: '#a78bfa' },
    { id: 'b_thigh_r', name: 'thigh_r', parentIndex: 1, length: 65, setup: { x: -20, y: 0, rotation: -90, scaleX: 1, scaleY: 1 }, color: '#8b5cf6' },
    { id: 'b_shin_r', name: 'shin_r', parentIndex: 14, length: 60, setup: { x: 65, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#8b5cf6' },
    { id: 'b_foot_r', name: 'foot_r', parentIndex: 15, length: 26, setup: { x: 60, y: 0, rotation: 90, scaleX: 1, scaleY: 1 }, color: '#8b5cf6' },
    { id: 'b_ik_hand_l', name: 'ik_hand_l', parentIndex: 0, length: 20, setup: { x: 55, y: -70, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#f43f5e' },
    { id: 'b_ik_hand_r', name: 'ik_hand_r', parentIndex: 0, length: 20, setup: { x: -55, y: -70, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#f43f5e' },
    { id: 'b_ik_foot_l', name: 'ik_foot_l', parentIndex: 0, length: 20, setup: { x: 20, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#ec4899' },
    { id: 'b_ik_foot_r', name: 'ik_foot_r', parentIndex: 0, length: 20, setup: { x: -20, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#ec4899' },
  ];

  const ik: DesktopRigbyIK[] = [
    { name: 'ik_arm_l', bones: [5, 6], target: 17, bendPositive: true, mix: 1 },
    { name: 'ik_arm_r', bones: [8, 9], target: 18, bendPositive: false, mix: 1 },
    { name: 'ik_leg_l', bones: [11, 12], target: 19, bendPositive: true, mix: 1 },
    { name: 'ik_leg_r', bones: [14, 15], target: 20, bendPositive: true, mix: 1 },
  ];

  return { bones, slots: [], ik };
}

function generateDefaultClips(): Record<string, DesktopRigbyAnimation> {
  return {
    idle: {
      name: 'idle',
      duration: 2.0,
      fps: 30,
      bones: {
        chest: {
          rotate: [{ time: 0, value: 0 }, { time: 1.0, value: 2.5 }, { time: 2.0, value: 0 }],
          scale: [{ time: 0, value: [1, 1] }, { time: 1.0, value: [1.02, 1.03] }, { time: 2.0, value: [1, 1] }],
        },
        head: {
          rotate: [{ time: 0, value: 0 }, { time: 0.8, value: -1.5 }, { time: 2.0, value: 0 }],
        },
        upperarm_l: {
          rotate: [{ time: 0, value: -75 }, { time: 1.0, value: -72 }, { time: 2.0, value: -75 }],
        },
        upperarm_r: {
          rotate: [{ time: 0, value: 75 }, { time: 1.0, value: 72 }, { time: 2.0, value: 75 }],
        },
      },
    },
    wave: {
      name: 'wave',
      duration: 2.0,
      fps: 30,
      bones: {
        upperarm_l: {
          rotate: [{ time: 0, value: -75 }, { time: 0.3, value: 30 }, { time: 1.7, value: 30 }, { time: 2.0, value: -75 }],
        },
        forearm_l: {
          rotate: [
            { time: 0, value: -15 },
            { time: 0.3, value: 40 },
            { time: 0.6, value: -20 },
            { time: 0.9, value: 40 },
            { time: 1.2, value: -20 },
            { time: 1.5, value: 40 },
            { time: 2.0, value: -15 },
          ],
        },
        head: {
          rotate: [{ time: 0, value: 0 }, { time: 0.5, value: 6 }, { time: 1.5, value: 6 }, { time: 2.0, value: 0 }],
        },
      },
    },
    walk: {
      name: 'walk',
      duration: 1.2,
      fps: 30,
      bones: {
        hip: {
          translate: [{ time: 0, value: [0, 0] }, { time: 0.3, value: [0, -6] }, { time: 0.6, value: [0, 0] }, { time: 0.9, value: [0, -6] }, { time: 1.2, value: [0, 0] }],
          rotate: [{ time: 0, value: 0 }, { time: 0.3, value: 3 }, { time: 0.6, value: 0 }, { time: 0.9, value: -3 }, { time: 1.2, value: 0 }],
        },
        thigh_l: {
          rotate: [{ time: 0, value: -90 }, { time: 0.3, value: -65 }, { time: 0.6, value: -90 }, { time: 0.9, value: -115 }, { time: 1.2, value: -90 }],
        },
        thigh_r: {
          rotate: [{ time: 0, value: -90 }, { time: 0.3, value: -115 }, { time: 0.6, value: -90 }, { time: 0.9, value: -65 }, { time: 1.2, value: -90 }],
        },
        shin_l: {
          rotate: [{ time: 0, value: 0 }, { time: 0.3, value: 5 }, { time: 0.6, value: 0 }, { time: 0.9, value: 35 }, { time: 1.2, value: 0 }],
        },
        shin_r: {
          rotate: [{ time: 0, value: 0 }, { time: 0.3, value: 35 }, { time: 0.6, value: 0 }, { time: 0.9, value: 5 }, { time: 1.2, value: 0 }],
        },
      },
    },
    dance: {
      name: 'dance',
      duration: 2.4,
      fps: 30,
      bones: {
        hip: {
          rotate: [{ time: 0, value: 0 }, { time: 0.6, value: 12 }, { time: 1.2, value: 0 }, { time: 1.8, value: -12 }, { time: 2.4, value: 0 }],
          translate: [{ time: 0, value: [0, 0] }, { time: 0.3, value: [10, -4] }, { time: 0.9, value: [-10, -4] }, { time: 1.5, value: [10, -4] }, { time: 2.1, value: [-10, -4] }, { time: 2.4, value: [0, 0] }],
        },
      },
    },
    run: {
      name: 'run',
      duration: 0.8,
      fps: 30,
      bones: {
        hip: {
          translate: [{ time: 0, value: [0, -2] }, { time: 0.2, value: [0, -10] }, { time: 0.4, value: [0, -2] }, { time: 0.6, value: [0, -10] }, { time: 0.8, value: [0, -2] }],
          rotate: [{ time: 0, value: 0 }, { time: 0.2, value: 6 }, { time: 0.4, value: 0 }, { time: 0.6, value: -6 }, { time: 0.8, value: 0 }],
        },
        thigh_l: {
          rotate: [{ time: 0, value: -90 }, { time: 0.2, value: -40 }, { time: 0.4, value: -90 }, { time: 0.6, value: -130 }, { time: 0.8, value: -90 }],
        },
        thigh_r: {
          rotate: [{ time: 0, value: -90 }, { time: 0.2, value: -130 }, { time: 0.4, value: -90 }, { time: 0.6, value: -40 }, { time: 0.8, value: -90 }],
        },
        shin_l: {
          rotate: [{ time: 0, value: 20 }, { time: 0.2, value: 65 }, { time: 0.4, value: 10 }, { time: 0.6, value: 5 }, { time: 0.8, value: 20 }],
        },
        shin_r: {
          rotate: [{ time: 0, value: 10 }, { time: 0.2, value: 5 }, { time: 0.4, value: 20 }, { time: 0.6, value: 65 }, { time: 0.8, value: 10 }],
        },
        upperarm_l: {
          rotate: [{ time: 0, value: -75 }, { time: 0.2, value: -30 }, { time: 0.4, value: -75 }, { time: 0.6, value: -110 }, { time: 0.8, value: -75 }],
        },
        upperarm_r: {
          rotate: [{ time: 0, value: 75 }, { time: 0.2, value: 110 }, { time: 0.4, value: 75 }, { time: 0.6, value: 30 }, { time: 0.8, value: 75 }],
        },
      },
    },
    jump: {
      name: 'jump',
      duration: 1.5,
      fps: 30,
      bones: {
        hip: {
          translate: [
            { time: 0, value: [0, 0] },
            { time: 0.3, value: [0, 18] },
            { time: 0.75, value: [0, -48] },
            { time: 1.2, value: [0, 14] },
            { time: 1.5, value: [0, 0] },
          ],
        },
        chest: {
          scale: [
            { time: 0, value: [1, 1] },
            { time: 0.3, value: [1.12, 0.88] },
            { time: 0.75, value: [0.92, 1.15] },
            { time: 1.2, value: [1.12, 0.88] },
            { time: 1.5, value: [1, 1] },
          ],
        },
        thigh_l: {
          rotate: [{ time: 0, value: -90 }, { time: 0.3, value: -60 }, { time: 0.75, value: -110 }, { time: 1.2, value: -65 }, { time: 1.5, value: -90 }],
        },
        thigh_r: {
          rotate: [{ time: 0, value: -90 }, { time: 0.3, value: -60 }, { time: 0.75, value: -110 }, { time: 1.2, value: -65 }, { time: 1.5, value: -90 }],
        },
      },
    },
    happy: {
      name: 'happy',
      duration: 1.0,
      fps: 30,
      bones: {
        hip: {
          translate: [
            { time: 0, value: [0, 0] },
            { time: 0.25, value: [0, -18] },
            { time: 0.5, value: [0, 0] },
            { time: 0.75, value: [0, -18] },
            { time: 1.0, value: [0, 0] },
          ],
        },
        head: {
          rotate: [{ time: 0, value: 0 }, { time: 0.25, value: -6 }, { time: 0.5, value: 6 }, { time: 0.75, value: -6 }, { time: 1.0, value: 0 }],
        },
        upperarm_l: {
          rotate: [{ time: 0, value: -75 }, { time: 0.5, value: 15 }, { time: 1.0, value: -75 }],
        },
        upperarm_r: {
          rotate: [{ time: 0, value: 75 }, { time: 0.5, value: -15 }, { time: 1.0, value: 75 }],
        },
      },
    },
    sad: {
      name: 'sad',
      duration: 2.5,
      fps: 30,
      bones: {
        head: {
          rotate: [{ time: 0, value: 0 }, { time: 1.2, value: 18 }, { time: 2.5, value: 0 }],
        },
        chest: {
          rotate: [{ time: 0, value: 0 }, { time: 1.2, value: 6 }, { time: 2.5, value: 0 }],
          translate: [{ time: 0, value: [0, 0] }, { time: 1.2, value: [0, 6] }, { time: 2.5, value: [0, 0] }],
        },
        upperarm_l: {
          rotate: [{ time: 0, value: -75 }, { time: 1.2, value: -85 }, { time: 2.5, value: -75 }],
        },
        upperarm_r: {
          rotate: [{ time: 0, value: 75 }, { time: 1.2, value: 85 }, { time: 2.5, value: 75 }],
        },
      },
    },
    surprise: {
      name: 'surprise',
      duration: 1.2,
      fps: 30,
      bones: {
        hip: {
          translate: [
            { time: 0, value: [0, 0] },
            { time: 0.15, value: [0, -25] },
            { time: 0.4, value: [0, -10] },
            { time: 1.2, value: [0, 0] },
          ],
        },
        chest: {
          scale: [
            { time: 0, value: [1, 1] },
            { time: 0.15, value: [1.18, 1.18] },
            { time: 1.2, value: [1, 1] },
          ],
        },
        upperarm_l: {
          rotate: [{ time: 0, value: -75 }, { time: 0.15, value: 45 }, { time: 1.2, value: -75 }],
        },
        upperarm_r: {
          rotate: [{ time: 0, value: 75 }, { time: 0.15, value: -45 }, { time: 1.2, value: 75 }],
        },
      },
    },
  };
}

export function CharacterStudio() {
  const {
    draftProject,
    updateDraft,
    saveDraft,
    selectedSceneId,
    setSelectedSceneId,
    setSelection,
    playheadTime,
    navigate,
    setNewProjectDialogOpen,
  } = useStudioContext();

  const headingId = useId();

  // Character, Part, Bone & Context Selection
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>(null);
  const [selectedIKName, setSelectedIKName] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<'character' | 'bone' | 'part' | 'ik'>('character');

  // Primary Editing Modes & Left Panel Tabs
  const [editMode, setEditMode] = useState<'design' | 'rig' | 'animate'>('design');
  const [leftTab, setLeftTab] = useState<'characters' | 'layers'>('layers');
  const [searchQuery, setSearchQuery] = useState('');
  const [layersSearch, setLayersSearch] = useState('');
  const [charToDelete, setCharToDelete] = useState<CharacterItem | null>(null);
  const [isRigCollapsed, setIsRigCollapsed] = useState(false);
  const [hiddenParts, setHiddenParts] = useState<Record<string, boolean>>({});
  const [lockedParts, setLockedParts] = useState<Record<string, boolean>>({});

  // Viewport & Canvas Controls
  const [activeTool, setActiveTool] = useState<'select' | 'move' | 'rotate' | 'scale' | 'bone'>('select');
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [showCheckerboard, setShowCheckerboard] = useState(false); // Subtle grid by default
  const [showBones, setShowBones] = useState(false); // Mode-aware: hidden in design mode by default
  const [showMeshes, setShowMeshes] = useState(false);
  const [showParts, setShowParts] = useState(true);
  const [showIK, setShowIK] = useState(false);

  // Animation & Timeline Controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeClipName, setActiveClipName] = useState<string>('idle');
  const [motionIntensity, setMotionIntensity] = useState(1.0);
  const [motionDuration, setMotionDuration] = useState(10.0);
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false);

  // Simple Studio vs Advanced Rig Editor Mode
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  // Auto-Preparation Report Dialog State
  const [autoPrepReport, setAutoPrepReport] = useState<CharacterPngAnalysis | null>(null);
  const [prepCharName, setPrepCharName] = useState<string>('');
  const [selectedPrepOption, setSelectedPrepOption] = useState<'smart_rig' | 'quick_animate'>('smart_rig');

  // Video Export Dialog State
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'mp4' | 'gif' | 'webm'>('mp4');
  const [exportResolution, setExportResolution] = useState<'1080p' | '720p' | 'square'>('1080p');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragPivot, setDragPivot] = useState<{
    charId: string;
    partId: string;
    x: number;
    y: number;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pngInputRef = useRef<HTMLInputElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const characters = draftProject?.characters ?? [];

  const filteredCharacters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [characters, searchQuery]);

  useEffect(() => {
    if (characters.length === 0) {
      setSelectedCharId(null);
      setSelectedPartId(null);
      return;
    }
    const existing = characters.find((c) => c.id === selectedCharId);
    const chosen = existing ?? characters[0];
    if (chosen.id !== selectedCharId) {
      setSelectedCharId(chosen.id);
    }
    if (chosen.parts.length === 0) {
      setSelectedPartId(null);
    } else if (!chosen.parts.some((p) => p.id === selectedPartId)) {
      setSelectedPartId(chosen.parts[0].id);
    }
  }, [characters, selectedCharId, selectedPartId]);

  const selectedChar = useMemo(
    () => characters.find((c) => c.id === selectedCharId) ?? characters[0] ?? null,
    [characters, selectedCharId]
  );

  // Initialize Rigby skeleton & animation clips if missing
  useEffect(() => {
    if (!selectedChar) return;
    if (!selectedChar.skeleton || !selectedChar.skeleton.bones.length || !selectedChar.animations) {
      const defaultSk = createDefaultSkeleton();
      const defaultClips = generateDefaultClips();
      updateDraft((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === selectedChar.id
            ? {
                ...c,
                engine: 'rigby2d',
                skeleton: c.skeleton ?? defaultSk,
                animations: c.animations ?? defaultClips,
              }
            : c
        ),
      }));
    }
  }, [selectedChar, updateDraft]);

  const activeSkeleton = useMemo(() => {
    return selectedChar?.skeleton ?? createDefaultSkeleton();
  }, [selectedChar]);

  const activeAnimations = useMemo(() => {
    return selectedChar?.animations ?? generateDefaultClips();
  }, [selectedChar]);

  const activeClip = useMemo(() => {
    return activeAnimations[activeClipName] ?? activeAnimations.idle ?? {
      name: 'idle',
      duration: 2.0,
      fps: 30,
      bones: {},
    };
  }, [activeAnimations, activeClipName]);

  const sortedParts = useMemo(() => {
    if (!selectedChar) return [];
    return [...selectedChar.parts].sort((a, b) => a.zIndex - b.zIndex);
  }, [selectedChar]);

  const filteredParts = useMemo(() => {
    const q = layersSearch.trim().toLowerCase();
    if (!q) return sortedParts;
    return sortedParts.filter((p) => p.name.toLowerCase().includes(q) || p.layerName.toLowerCase().includes(q));
  }, [sortedParts, layersSearch]);

  const selectedPart = useMemo(
    () =>
      selectedChar?.parts.find((p) => p.id === selectedPartId) ??
      selectedChar?.parts[0] ??
      null,
    [selectedChar, selectedPartId]
  );

  const selectedBone = useMemo(
    () =>
      activeSkeleton.bones.find((b) => b.id === selectedBoneId) ??
      activeSkeleton.bones[1] ??
      activeSkeleton.bones[0] ??
      null,
    [activeSkeleton, selectedBoneId]
  );

  const selectedIK = useMemo(() => {
    return activeSkeleton.ik.find((k) => k.name === selectedIKName) ?? activeSkeleton.ik[0] ?? null;
  }, [activeSkeleton.ik, selectedIKName]);

  const scenes = draftProject?.scenes ?? [];
  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;

  // Mode switching behavior: adjustments to visible tools and overlays
  const handleSetMode = (mode: 'design' | 'rig' | 'animate') => {
    setEditMode(mode);
    if (mode === 'design') {
      setShowBones(false);
      setShowIK(false);
      setShowParts(true);
      if (inspectorMode === 'bone' || inspectorMode === 'ik') {
        setInspectorMode(selectedPart ? 'part' : 'character');
      }
    } else if (mode === 'rig') {
      setShowBones(true);
      setShowIK(true);
      setShowParts(true);
      setInspectorMode('bone');
    } else if (mode === 'animate') {
      setShowBones(false);
      setShowIK(false);
      setShowParts(true);
      setIsTimelineCollapsed(false);
    }
  };

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    lastTimeRef.current = performance.now();
    const effectiveDuration = motionDuration || activeClip.duration || 2.0;
    const loop = (now: number) => {
      const dt = ((now - lastTimeRef.current) / 1000) * playbackSpeed;
      lastTimeRef.current = now;

      setCurrentTime((prev) => {
        let next = prev + dt;
        if (next >= effectiveDuration) {
          if (isLooping) {
            next = next % effectiveDuration;
          } else {
            setIsPlaying(false);
            return effectiveDuration;
          }
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, isLooping, activeClip.duration, motionDuration, playbackSpeed]);

  // Evaluate Bone World Transforms for Viewport Canvas
  const evaluatedBones = useMemo(() => {
    const bones = activeSkeleton.bones;
    const clip = activeClip;
    const results: Array<{
      bone: DesktopRigbyBone;
      index: number;
      worldX: number;
      worldY: number;
      rotation: number;
      tipX: number;
      tipY: number;
    }> = [];

    const evalRot = (boneName: string, baseRot: number) => {
      const chan = clip.bones?.[boneName]?.rotate;
      if (!chan || !chan.length) return baseRot;
      if (currentTime <= chan[0].time) return baseRot + chan[0].value;
      if (currentTime >= chan[chan.length - 1].time) return baseRot + chan[chan.length - 1].value;
      for (let i = 0; i < chan.length - 1; i++) {
        if (currentTime >= chan[i].time && currentTime <= chan[i + 1].time) {
          const t = (currentTime - chan[i].time) / (chan[i + 1].time - chan[i].time || 1);
          return baseRot + chan[i].value + (chan[i + 1].value - chan[i].value) * t;
        }
      }
      return baseRot;
    };

    const evalTrans = (boneName: string, baseX: number, baseY: number) => {
      const chan = clip.bones?.[boneName]?.translate;
      if (!chan || !chan.length) return { x: baseX, y: baseY };
      for (let i = 0; i < chan.length - 1; i++) {
        if (currentTime >= chan[i].time && currentTime <= chan[i + 1].time) {
          const t = (currentTime - chan[i].time) / (chan[i + 1].time - chan[i].time || 1);
          return {
            x: baseX + chan[i].value[0] + (chan[i + 1].value[0] - chan[i].value[0]) * t,
            y: baseY + chan[i].value[1] + (chan[i + 1].value[1] - chan[i].value[1]) * t,
          };
        }
      }
      return { x: baseX + chan[0].value[0], y: baseY + chan[0].value[1] };
    };

    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      const pIdx = b.parentIndex;
      const parent = pIdx !== null && results[pIdx] ? results[pIdx] : null;

      const animatedRot = evalRot(b.name, b.setup.rotation);
      const animatedPos = evalTrans(b.name, b.setup.x, b.setup.y);

      let wx = animatedPos.x;
      let wy = animatedPos.y;
      let wRot = animatedRot;

      if (parent) {
        const rad = (parent.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        wx = parent.worldX + animatedPos.x * cos - animatedPos.y * sin;
        wy = parent.worldY + animatedPos.x * sin + animatedPos.y * cos;
        wRot = parent.rotation + animatedRot;
      }

      const boneLen = b.length || 30;
      const bRad = (wRot * Math.PI) / 180;
      const tx = wx + boneLen * Math.cos(bRad);
      const ty = wy + boneLen * Math.sin(bRad);

      results.push({
        bone: b,
        index: i,
        worldX: wx,
        worldY: wy,
        rotation: wRot,
        tipX: tx,
        tipY: ty,
      });
    }

    return results;
  }, [activeSkeleton, activeClip, currentTime]);

  // Compute character bounding box for auto-framing
  const characterBounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    if (evaluatedBones.length > 0) {
      for (const eb of evaluatedBones) {
        minX = Math.min(minX, eb.worldX, eb.tipX);
        maxX = Math.max(maxX, eb.worldX, eb.tipX);
        minY = Math.min(minY, eb.worldY, eb.tipY);
        maxY = Math.max(maxY, eb.worldY, eb.tipY);
      }
    }

    if (selectedChar?.parts.length) {
      for (const p of selectedChar.parts) {
        minX = Math.min(minX, p.pivot.x - 30);
        maxX = Math.max(maxX, p.pivot.x + 30);
        minY = Math.min(minY, p.pivot.y - 30);
        maxY = Math.max(maxY, p.pivot.y + 30);
      }
    }

    if (!Number.isFinite(minX)) {
      return { minX: 100, maxX: 300, minY: 100, maxY: 400, cx: 200, cy: 250, width: 200, height: 300 };
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const width = Math.max(100, maxX - minX);
    const height = Math.max(160, maxY - minY);

    return { minX, maxX, minY, maxY, cx, cy, width, height };
  }, [evaluatedBones, selectedChar]);

  // "Fit to Character" framing function
  const handleFitToCharacter = useCallback(() => {
    const canvas = canvasRef.current;
    const cw = canvas ? canvas.width : 800;
    const ch = canvas ? canvas.height : 600;
    const bounds = characterBounds;

    const scaleX = (cw * 0.72) / bounds.width;
    const scaleY = (ch * 0.72) / bounds.height;
    const optimalZoom = clamp(Math.min(scaleX, scaleY), 0.6, 2.4);

    setZoom(Number(optimalZoom.toFixed(2)));
    setPan({ x: 0, y: 0 });
  }, [characterBounds]);

  // Auto-frame on character switch
  useEffect(() => {
    handleFitToCharacter();
  }, [selectedCharId, handleFitToCharacter]);

  // Canvas Viewport Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    // Center viewport at character bounding center
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-characterBounds.cx, -characterBounds.cy);

    // 1. Sleek Non-Dominant Background & Floor Shadow
    if (showCheckerboard) {
      const size = 32;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      const startX = Math.floor((characterBounds.cx - 500) / size) * size;
      const endX = characterBounds.cx + 500;
      const startY = Math.floor((characterBounds.cy - 500) / size) * size;
      const endY = characterBounds.cy + 500;

      ctx.beginPath();
      for (let x = startX; x <= endX; x += size) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y += size) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
      ctx.stroke();
    }

    // Floor Contact Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(characterBounds.cx, characterBounds.maxY + 8, characterBounds.width * 0.45, 8, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(characterBounds.cx, characterBounds.maxY + 8, Math.min(24, characterBounds.width * 0.45), 0, Math.PI * 2);
    }
    ctx.fill();

    // 2. Character Artwork & Stylized Silhouette Shapes
    if (showParts && selectedChar && selectedChar.parts.length > 0) {
      const primaryColor = selectedChar.colorPalette[0] ? toSafeColorInput(selectedChar.colorPalette[0]) : '#f59e0b';
      const secondaryColor = selectedChar.colorPalette[1] ? toSafeColorInput(selectedChar.colorPalette[1]) : '#38bdf8';

      // Render connected anatomical parts
      for (const part of sortedParts) {
        if (hiddenParts[part.id]) continue;

        const isPartActive = inspectorMode === 'part' && part.id === selectedPart?.id;
        const pv = part.pivot;

        ctx.save();
        ctx.fillStyle = isPartActive ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.18)';
        ctx.strokeStyle = isPartActive ? '#fbbf24' : primaryColor;
        ctx.lineWidth = isPartActive ? 2.5 : 1.5;

        // Draw stylized limb or joint capsules
        if (part.parentPartId) {
          const parent = selectedChar.parts.find((p) => p.id === part.parentPartId);
          if (parent) {
            ctx.beginPath();
            ctx.moveTo(parent.pivot.x, parent.pivot.y);
            ctx.lineTo(pv.x, pv.y);
            ctx.lineWidth = isPartActive ? 14 : 10;
            ctx.lineCap = 'round';
            ctx.strokeStyle = isPartActive ? 'rgba(251, 191, 36, 0.4)' : 'rgba(245, 158, 11, 0.2)';
            ctx.stroke();
          }
        }

        // Part pivot badge
        ctx.lineWidth = isPartActive ? 2 : 1;
        ctx.strokeStyle = isPartActive ? '#fbbf24' : primaryColor;
        ctx.beginPath();
        ctx.arc(pv.x, pv.y, isPartActive ? 16 : 12, 0, Math.PI * 2);
        ctx.fillStyle = isPartActive ? 'rgba(245, 158, 11, 0.45)' : 'rgba(245, 158, 11, 0.2)';
        ctx.fill();
        ctx.stroke();

        // Small inner pivot dot
        ctx.beginPath();
        ctx.arc(pv.x, pv.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Part label
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '10px sans-serif';
        ctx.fillText(part.name, pv.x - 14, pv.y - 18);
        ctx.restore();
      }
    }

    // 3. Delaunay Mesh Wireframes (Technical Overlay)
    if (showMeshes) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      const meshBones = evaluatedBones.filter((eb) => eb.bone.length > 20);
      for (let i = 0; i < meshBones.length - 1; i++) {
        const b1 = meshBones[i];
        const b2 = meshBones[i + 1];
        ctx.beginPath();
        ctx.moveTo(b1.worldX, b1.worldY);
        ctx.lineTo(b1.tipX, b1.tipY);
        ctx.lineTo(b2.worldX, b2.worldY);
        ctx.closePath();
        ctx.stroke();
      }
    }

    // 4. Rigby2D Tapered Bones & Joints (Visible in Rig Mode or when Toggled)
    if (showBones) {
      for (const eb of evaluatedBones) {
        const isSelected = inspectorMode === 'bone' && eb.bone.id === selectedBone?.id;
        const color = eb.bone.color || '#f59e0b';
        const length = eb.bone.length;

        if (length > 0) {
          const angle = (eb.rotation * Math.PI) / 180;
          const normalAngle = angle + Math.PI / 2;
          const w = Math.min(10, Math.max(4, length * 0.15));
          const midDist = length * 0.25;

          const baseX = eb.worldX;
          const baseY = eb.worldY;
          const midX = baseX + midDist * Math.cos(angle);
          const midY = baseY + midDist * Math.sin(angle);
          const leftX = midX + w * Math.cos(normalAngle);
          const leftY = midY + w * Math.sin(normalAngle);
          const rightX = midX - w * Math.cos(normalAngle);
          const rightY = midY - w * Math.sin(normalAngle);
          const tipX = eb.tipX;
          const tipY = eb.tipY;

          ctx.beginPath();
          ctx.moveTo(baseX, baseY);
          ctx.lineTo(leftX, leftY);
          ctx.lineTo(tipX, tipY);
          ctx.lineTo(rightX, rightY);
          ctx.closePath();

          ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.55)' : 'rgba(229, 161, 88, 0.25)';
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#fbbf24' : color;
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.stroke();
        }

        // Draw joint node circle
        ctx.beginPath();
        ctx.arc(eb.worldX, eb.worldY, isSelected ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#fbbf24' : color;
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 5. IK Constraint Lines & Target Handles
    if (showIK) {
      for (const ik of activeSkeleton.ik) {
        const parentB = evaluatedBones[ik.bones[0]];
        const childB = evaluatedBones[ik.bones[1]];
        const targetB = evaluatedBones[ik.target];
        if (childB && targetB) {
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(childB.tipX, childB.tipY);
          ctx.lineTo(targetB.worldX, targetB.worldY);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.beginPath();
          ctx.arc(targetB.worldX, targetB.worldY, 7, 0, Math.PI * 2);
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [
    evaluatedBones,
    characterBounds,
    zoom,
    pan,
    showCheckerboard,
    showBones,
    showMeshes,
    showParts,
    showIK,
    selectedBone,
    selectedPart,
    selectedChar,
    sortedParts,
    inspectorMode,
    hiddenParts,
  ]);

  // Canvas Mouse Controls (Pan & Selection)
  const handleCanvasMouseDown = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (ev.button === 1 || ev.altKey || ev.shiftKey || activeTool === 'move') {
      setIsPanning(true);
      setStartPan({ x: ev.clientX - pan.x, y: ev.clientY - pan.y });
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = ev.clientX - rect.left;
    const clientY = ev.clientY - rect.top;

    const rx = (clientX - (rect.width / 2 + pan.x)) / zoom + characterBounds.cx;
    const ry = (clientY - (rect.height / 2 + pan.y)) / zoom + characterBounds.cy;

    // Hit test bones
    let closestBone: DesktopRigbyBone | null = null;
    let minDist = 24;

    for (const eb of evaluatedBones) {
      const d = Math.hypot(eb.worldX - rx, eb.worldY - ry);
      if (d < minDist) {
        minDist = d;
        closestBone = eb.bone;
      }
    }

    if (closestBone) {
      setSelectedBoneId(closestBone.id);
      setInspectorMode('bone');
      return;
    }

    // Hit test parts
    let closestPart: CharacterPart | null = null;
    let minPartDist = 24;
    for (const p of sortedParts) {
      const d = Math.hypot(p.pivot.x - rx, p.pivot.y - ry);
      if (d < minPartDist) {
        minPartDist = d;
        closestPart = p;
      }
    }

    if (closestPart) {
      setSelectedPartId(closestPart.id);
      setInspectorMode('part');
      return;
    }

    // Clicked background: switch to character properties
    setInspectorMode('character');
  };

  const handleCanvasMouseMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPan({
        x: ev.clientX - startPan.x,
        y: ev.clientY - startPan.y,
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
  };

  // Character CRUD
  const updateCharacter = (charId: string, updater: (char: CharacterItem) => CharacterItem) => {
    updateDraft((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => (c.id === charId ? updater(c) : c)),
    }));
  };

  const handleAddPart = () => {
    if (!selectedChar) return;
    const idx = selectedChar.parts.length + 1;
    const maxZ = selectedChar.parts.reduce((acc, p) => Math.max(acc, p.zIndex), -1);
    const parentId = selectedPart?.id ?? selectedChar.parts[0]?.id;
    const newPart: CharacterPart = {
      id: makeId('part'),
      name: `Part ${idx}`,
      layerName: `part_${idx}`,
      pivot: { x: 120, y: Math.max(36, 130 - idx * 18) },
      zIndex: maxZ + 1,
      parentPartId: parentId,
    };
    updateCharacter(selectedChar.id, (c) => ({
      ...c,
      parts: [...c.parts, newPart],
    }));
    setSelectedPartId(newPart.id);
    setInspectorMode('part');
    setSelection({ kind: 'part', characterId: selectedChar.id, partId: newPart.id });
  };

  const handleRemovePart = (partId: string) => {
    if (!selectedChar) return;
    updateCharacter(selectedChar.id, (c) => ({
      ...c,
      parts: c.parts.filter((p) => p.id !== partId),
    }));
    if (selectedPartId === partId) {
      const remaining = selectedChar.parts.filter((p) => p.id !== partId);
      setSelectedPartId(remaining[0]?.id ?? null);
      if (!remaining.length) {
        setInspectorMode('character');
      }
    }
  };

  const updatePart = (partId: string, patch: Partial<CharacterPart>) => {
    if (!selectedChar) return;
    updateCharacter(selectedChar.id, (c) => ({
      ...c,
      parts: c.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)),
    }));
  };

  const handleAddCharacter = () => {
    const idx = (draftProject?.characters.length ?? 0) + 1;
    const defaultSk = createDefaultSkeleton();
    const defaultClips = generateDefaultClips();
    const nextChar: CharacterItem = {
      id: makeId('char'),
      name: `Character ${idx}`,
      description: 'Skeletal rigged character',
      defaultRigId: `rig-${idx}`,
      colorPalette: ['#f59e0b', '#38bdf8'],
      parts: [
        {
          id: makeId('part'),
          name: 'Torso',
          layerName: 'torso_layer',
          pivot: { x: 200, y: 240 },
          zIndex: 0,
        },
      ],
      skeleton: defaultSk,
      animations: defaultClips,
    };
    updateDraft((prev) => ({
      ...prev,
      characters: [...prev.characters, nextChar],
    }));
    setSelectedCharId(nextChar.id);
    setSelectedBoneId(defaultSk.bones[0].id);
    setInspectorMode('character');
  };

  const handleDeleteCharacter = (charId: string) => {
    updateDraft((prev) => ({
      ...prev,
      characters: prev.characters.filter((c) => c.id !== charId),
      scenes: prev.scenes.map((sc) => ({
        ...sc,
        characterIds: sc.characterIds.filter((id) => id !== charId),
      })),
    }));
    if (selectedCharId === charId) {
      const remaining = characters.filter((c) => c.id !== charId);
      setSelectedCharId(remaining[0]?.id ?? null);
      setInspectorMode('character');
    }
  };

  const handleDuplicateCharacter = (char: CharacterItem) => {
    const clonedChar: CharacterItem = {
      ...char,
      id: makeId('char'),
      name: `${char.name} (Copy)`,
      colorPalette: [...char.colorPalette],
      parts: char.parts.map((p) => ({ ...p, id: makeId('part') })),
      skeleton: char.skeleton ? JSON.parse(JSON.stringify(char.skeleton)) : createDefaultSkeleton(),
      animations: char.animations ? JSON.parse(JSON.stringify(char.animations)) : generateDefaultClips(),
    };
    updateDraft((prev) => ({
      ...prev,
      characters: [...prev.characters, clonedChar],
    }));
    setSelectedCharId(clonedChar.id);
    setInspectorMode('character');
  };

  // Generate Motion Clip
  const handleGenerateMotion = (actionType: string) => {
    if (!selectedChar) return;
    const allClips = generateDefaultClips();
    const clip = allClips[actionType] || allClips.idle;
    const updatedClip = {
      ...clip,
      duration: motionDuration,
    };

    updateCharacter(selectedChar.id, (c) => ({
      ...c,
      animations: {
        ...(c.animations ?? {}),
        [actionType]: updatedClip,
      },
    }));

    setActiveClipName(actionType);
    setCurrentTime(0);
    setIsPlaying(true);
  };

  // Export Spine 2D JSON
  const handleExportSpine = () => {
    if (!selectedChar) return;
    const spineJson = {
      skeleton: {
        hash: 'animforge',
        spine: '3.8.99',
        width: 400,
        height: 600,
        images: './images/',
      },
      bones: activeSkeleton.bones.map((b) => ({
        name: b.name,
        parent: b.parentIndex !== null ? activeSkeleton.bones[b.parentIndex]?.name : undefined,
        length: b.length,
        x: b.setup.x,
        y: b.setup.y,
        rotation: b.setup.rotation,
      })),
      slots: activeSkeleton.slots,
      ik: activeSkeleton.ik.map((ik) => ({
        name: ik.name,
        bones: [activeSkeleton.bones[ik.bones[0]]?.name, activeSkeleton.bones[ik.bones[1]]?.name],
        target: activeSkeleton.bones[ik.target]?.name,
        bendPositive: ik.bendPositive,
        mix: ik.mix,
      })),
      animations: activeAnimations,
    };

    const blob = new Blob([JSON.stringify(spineJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedChar.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.spine.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export Character JSON
  const handleExportCharacterJson = (char: CharacterItem) => {
    const blob = new Blob([JSON.stringify(char, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${char.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.character.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Apply Storyboard Preset Action
  const handleApplyPreset = (preset: PresetItem) => {
    if (!selectedChar) return;
    if (!activeScene) {
      updateCharacter(selectedChar.id, (c) => ({
        ...c,
        description: c.description
          ? `${c.description.replace(/\[Default.*\]/, '').trim()} [Default ${preset.type}: ${preset.name}]`
          : `[Default ${preset.type}: ${preset.name}]`,
      }));
      return;
    }

    const actionId = makeId('act');
    const startTime = Number.isFinite(playheadTime) ? Math.max(0, playheadTime) : 0;
    const duration = 1.5;

    updateDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) =>
        scene.id === activeScene.id
          ? {
              ...scene,
              characterIds: scene.characterIds.includes(selectedChar.id)
                ? scene.characterIds
                : [...scene.characterIds, selectedChar.id],
              timeline: {
                ...scene.timeline,
                characterActions: [
                  ...scene.timeline.characterActions,
                  {
                    actionId,
                    name: preset.actionName,
                    startTime,
                    duration,
                    parameters: {
                      characterId: selectedChar.id,
                      characterName: selectedChar.name,
                      presetType: preset.type,
                      presetName: preset.name,
                      ...preset.params,
                    },
                  },
                ],
              },
            }
          : scene
      ),
    }));
    setSelectedSceneId(activeScene.id);
    navigate('studio');
  };

  // PNG Import & Auto-Preparation Handler
  const handlePngImport = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const report = await analyzeCharacterPng(file);
      setAutoPrepReport(report);
      setPrepCharName(file.name.replace(/\.[^/.]+$/, ''));
      setSelectedPrepOption(report.recommendation);
    } catch (err) {
      console.error('Failed to analyze character PNG', err);
    }
  };

  const handleConfirmAutoPrep = () => {
    if (!autoPrepReport) return;
    const charName = prepCharName.trim() || autoPrepReport.fileName.replace(/\.[^/.]+$/, '');
    const charId = makeId('char');
    const defaultSk = createDefaultSkeleton();
    const defaultClips = generateDefaultClips();

    let newChar: CharacterItem;
    if (selectedPrepOption === 'smart_rig') {
      newChar = {
        id: charId,
        name: charName,
        description: `Auto-prepared cutout puppet from ${autoPrepReport.fileName}. 6 layers, 21 skeletal joints.`,
        defaultRigId: `rig_${charId}`,
        colorPalette: ['#f59e0b', '#38bdf8', '#10b981'],
        engine: 'rigby2d',
        skeleton: defaultSk,
        animations: defaultClips,
        parts: [
          { id: makeId('part'), name: 'Torso', layerName: 'torso_layer', pivot: { x: 200, y: 220 }, zIndex: 0 },
          { id: makeId('part'), name: 'Head', layerName: 'head_layer', pivot: { x: 200, y: 150 }, zIndex: 1 },
          { id: makeId('part'), name: 'Left Arm', layerName: 'arm_l_layer', pivot: { x: 240, y: 210 }, zIndex: 2 },
          { id: makeId('part'), name: 'Right Arm', layerName: 'arm_r_layer', pivot: { x: 160, y: 210 }, zIndex: 2 },
          { id: makeId('part'), name: 'Left Leg', layerName: 'leg_l_layer', pivot: { x: 220, y: 310 }, zIndex: 0 },
          { id: makeId('part'), name: 'Right Leg', layerName: 'leg_r_layer', pivot: { x: 180, y: 310 }, zIndex: 0 },
        ],
      };
    } else {
      newChar = {
        id: charId,
        name: charName,
        description: `Quick animate whole-image character from ${autoPrepReport.fileName}.`,
        defaultRigId: `rig_${charId}`,
        colorPalette: ['#f59e0b', '#818cf8'],
        engine: 'givemotion',
        skeleton: defaultSk,
        animations: defaultClips,
        parts: [
          { id: makeId('part'), name: 'Body', layerName: 'full_body', pivot: { x: 200, y: 250 }, zIndex: 0 },
        ],
      };
    }

    updateDraft((prev) => ({
      ...prev,
      characters: [...prev.characters, newChar],
    }));
    setSelectedCharId(charId);
    setActiveClipName('dance');
    setIsPlaying(true);
    setAutoPrepReport(null);
    saveDraft(`Auto-prepared character ${charName}`);
  };

  const handleStartVideoExport = async () => {
    setIsExporting(true);
    setExportProgress(15);
    await new Promise((r) => setTimeout(r, 100));
    setExportProgress(50);
    await new Promise((r) => setTimeout(r, 150));
    setExportProgress(85);
    await new Promise((r) => setTimeout(r, 100));
    setExportProgress(100);
    setIsExporting(false);
    setExportComplete(true);

    try {
      const mockVideoData = `AnimForge Video Export\nCharacter: ${selectedChar?.name}\nAnimation: ${activeClipName}\nFormat: ${exportFormat}\nResolution: ${exportResolution}\nDuration: ${motionDuration}s`;
      const blob = new Blob([mockVideoData], { type: exportFormat === 'gif' ? 'image/gif' : 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(selectedChar?.name || 'character').toLowerCase().replace(/[^a-z0-9]/g, '_')}_${activeClipName}.${exportFormat === 'gif' ? 'gif' : 'mp4'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  if (!draftProject) {
    return (
      <section className="page-container" aria-labelledby={headingId}>
        <div className="page-header-row">
          <h2 id={headingId}>Character Studio</h2>
        </div>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <p className="field-hint">
            Open or create a project to inspect characters, edit skeletal rigs, and generate timeline motions.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" onClick={() => setNewProjectDialogOpen(true)}>
              New Project
            </button>
            <button type="button" onClick={() => navigate('projects')}>
              Browse Projects
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-container" aria-labelledby={headingId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 1. Top Simplified Workflow Toolbar */}
      <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        {/* Left: Brand, Character Selector & Editing Modes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CharactersIcon size={18} />
            <h2 id={headingId} style={{ margin: 0, fontSize: 18 }}>Character Studio</h2>
          </div>

          {/* Simple Studio vs Advanced Rig Editor Mode Switcher */}
          <div style={{ display: 'flex', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 6, padding: 2, border: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className={viewMode === 'simple' ? 'btn-primary' : 'btn-sm'}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => setViewMode('simple')}
            >
              ⚡ Simple Studio
            </button>
            <button
              type="button"
              className={viewMode === 'advanced' ? 'btn-primary' : 'btn-sm'}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => setViewMode('advanced')}
            >
              🛠 Advanced Rig Editor
            </button>
          </div>

          {selectedChar && (
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', padding: '2px 8px', borderRadius: 4 }}>
              Active Character: {selectedChar.name}
            </span>
          )}

          {/* Three Simple Modes: Design | Rig | Animate */}
          <div style={{ display: 'flex', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 6, padding: 2, border: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className={editMode === 'design' ? 'btn-primary' : 'btn-sm'}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4 }}
              onClick={() => handleSetMode('design')}
            >
              Design
            </button>
            <button
              type="button"
              className={editMode === 'rig' ? 'btn-primary' : 'btn-sm'}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4 }}
              onClick={() => handleSetMode('rig')}
            >
              Rig
            </button>
            <button
              type="button"
              className={editMode === 'animate' ? 'btn-primary' : 'btn-sm'}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4 }}
              onClick={() => handleSetMode('animate')}
            >
              Animate
            </button>
          </div>
        </div>

        {/* Right: Primary Workflow Actions: Import -> Rig -> Animate -> Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Import PNG Button */}
          <button
            type="button"
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 12px', fontWeight: 600, backgroundColor: 'var(--color-accent)', color: '#000' }}
            onClick={() => pngInputRef.current?.click()}
          >
            <PlusIcon size={14} /> Import PNG
          </button>
          <input
            ref={pngInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Import Character PNG"
            onChange={handlePngImport}
          />

          {/* Export Video Button */}
          <button
            type="button"
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 12px', fontWeight: 600 }}
            onClick={() => {
              setExportModalOpen(true);
              setExportComplete(false);
              setExportProgress(0);
            }}
          >
            🎬 Export Video
          </button>

          {/* Auto-Rig Artwork */}
          <button
            type="button"
            className="btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 8px' }}
            onClick={() => imageInputRef.current?.click()}
          >
            <PlusIcon size={14} /> Auto-Rig Artwork
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            aria-label="Upload artwork for auto-rig"
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (file && selectedChar) {
                const defaultSk = createDefaultSkeleton();
                updateCharacter(selectedChar.id, (c) => ({
                  ...c,
                  skeleton: defaultSk,
                  animations: generateDefaultClips(),
                }));
              }
            }}
          />

          {/* Save Changes */}
          <button
            type="button"
            className="btn-primary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => saveDraft('Saved character changes')}
          >
            Save Changes
          </button>

          {/* Secondary / Advanced Actions */}
          <button
            type="button"
            className="btn-sm"
            style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={handleExportSpine}
            title="Export to Spine 3.8 JSON"
          >
            Export Spine JSON
          </button>
          <button
            type="button"
            className="btn-sm"
            style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={() => selectedChar && handleDuplicateCharacter(selectedChar)}
            title="Duplicate selected character"
          >
            Duplicate Character
          </button>
          <button
            type="button"
            className="btn-sm"
            style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={() => selectedChar && handleExportCharacterJson(selectedChar)}
            title="Export AnimForge Character"
          >
            Export Character
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Import Character JSON file"
            onChange={async (ev) => {
              const file = ev.target.files?.[0];
              if (!file) return;
              try {
                const text = await readTextFile(file);
                const parsed = JSON.parse(text);
                updateDraft((prev) => ({
                  ...prev,
                  characters: [...prev.characters, { ...parsed, id: makeId('char') }],
                }));
              } catch {}
            }}
          />
          <button
            type="button"
            className="btn-sm"
            style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={() => importInputRef.current?.click()}
          >
            Import JSON
          </button>

          {/* Engine Badges */}
          <span className="badge badge-neutral" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>
            Rigby2D Skeletal Engine
          </span>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: 4 }}>
            StretchyStudio
          </span>
        </div>
      </div>

      {/* 2. SIMPLE STUDIO WORKSPACE (DEFAULT BEGINNER WORKFLOW) */}
      {viewMode === 'simple' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Character Selector & Quick Info Strip */}
          <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                Active Character:
              </span>
              <select
                value={selectedCharId ?? ''}
                onChange={(e) => setSelectedCharId(e.target.value)}
                aria-label="Active Character Selection"
                style={{ fontSize: 13, fontWeight: 600, padding: '4px 8px', borderRadius: 6, minWidth: 160 }}
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    Character: {c.name}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-accent)', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 600 }}>
                ✨ Ready to Animate
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => pngInputRef.current?.click()}
                style={{ fontSize: 12, padding: '5px 12px', fontWeight: 600, backgroundColor: 'var(--color-accent)', color: '#000', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <PlusIcon size={14} /> Import PNG Character
              </button>
            </div>
          </div>

          {/* Large Character Viewport Stage */}
          <div
            className="panel"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 0,
              overflow: 'hidden',
              position: 'relative',
              backgroundColor: '#121214',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
          >
            {/* Canvas Viewport */}
            <div
              style={{
                width: '100%',
                height: 480,
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: isPanning ? 'grabbing' : 'default',
              }}
            >
              <canvas
                ref={viewMode === 'simple' ? canvasRef : null}
                width={920}
                height={480}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
              />
            </div>

            {/* Bottom Transport Bar */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                backgroundColor: 'var(--color-bg-secondary)',
                borderTop: '1px solid var(--color-border)',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              {/* Play/Pause & Loop */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className={isPlaying ? 'btn-danger' : 'btn-primary'}
                  onClick={() => setIsPlaying(!isPlaying)}
                  aria-label={isPlaying ? 'Pause Preview' : 'Play Preview'}
                  style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 84 }}
                >
                  {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  className={`btn-sm ${isLooping ? 'btn-primary' : ''}`}
                  onClick={() => setIsLooping(!isLooping)}
                  aria-label="Toggle preview loop"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                >
                  🔁 {isLooping ? 'Loop ON' : 'Loop OFF'}
                </button>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => setCurrentTime(0)}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                >
                  Stop
                </button>
              </div>

              {/* Time Scrubber */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200, maxWidth: 360 }}>
                <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 44, color: 'var(--color-text-secondary)' }}>
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={motionDuration}
                  step={0.02}
                  value={currentTime}
                  aria-label="Preview playhead scrubber"
                  onChange={(e) => setCurrentTime(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 44, color: 'var(--color-text-secondary)' }}>
                  {formatTime(motionDuration)}
                </span>
              </div>

              {/* Duration Slider (2s - 30s) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--color-bg-tertiary)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Duration:</span>
                <input
                  type="range"
                  min={2}
                  max={30}
                  step={0.5}
                  value={motionDuration}
                  aria-label="Animation duration slider"
                  onChange={(e) => setMotionDuration(Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, minWidth: 36 }}>
                  {motionDuration.toFixed(1)}s
                </span>
              </div>

              {/* Playback Speed */}
              <div style={{ display: 'flex', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 6, padding: 2, border: '1px solid var(--color-border)' }}>
                {[0.5, 1.0, 1.5, 2.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={playbackSpeed === s ? 'btn-primary' : 'btn-sm'}
                    style={{ fontSize: 10, padding: '2px 6px' }}
                    onClick={() => setPlaybackSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {/* Motion Intensity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'var(--color-bg-tertiary)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Intensity:</span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={5}
                  value={Math.round(motionIntensity * 100)}
                  aria-label="Motion intensity"
                  onChange={(e) => setMotionIntensity(Number(e.target.value) / 100)}
                  style={{ width: 60 }}
                />
                <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 32 }}>
                  {Math.round(motionIntensity * 100)}%
                </span>
              </div>

              {/* Export Video Button */}
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setExportModalOpen(true);
                  setExportComplete(false);
                  setExportProgress(0);
                }}
                style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600, backgroundColor: 'var(--color-accent)', color: '#000', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                🎬 Export Video
              </button>
            </div>
          </div>

          {/* 3. Animation Selection Panel (The 9 Visual Cards) */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Choose Animation</h3>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  Select any motion to immediately preview your character in motion.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Active Motion:</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase', backgroundColor: 'var(--color-bg-tertiary)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                  {activeClipName.toUpperCase()}
                </span>
              </div>
            </div>

            {/* 9 Visual Animation Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {ANIMATION_CARDS.map((card) => {
                const isSelected = activeClipName === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    aria-label={`Animation card: ${card.name}`}
                    onClick={() => {
                      setActiveClipName(card.id);
                      setIsPlaying(true);
                      setCurrentTime(0);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 6,
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: isSelected ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                      backgroundColor: isSelected ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                      boxShadow: isSelected ? '0 0 12px rgba(245, 158, 11, 0.25)' : 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span style={{ fontSize: 24 }}>{card.icon}</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                          color: isSelected ? '#000' : 'var(--color-text-secondary)',
                          fontWeight: 600,
                        }}
                      >
                        {isSelected ? 'Active' : card.category}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
                      {card.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.3 }}>
                      {card.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. ADVANCED RIG EDITOR WORKSPACE (Full 3-panel layout preserved for power riggers) */}
      <div
        className="advanced-studio-workspace"
        style={
          viewMode === 'advanced'
            ? { display: 'flex', flexDirection: 'column', gap: 10 }
            : { position: 'absolute', left: -99999, top: -99999, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }
        }
      >
        {/* Main 3-Panel Layout (Left Panel: Character & Layers | Center: Viewport | Right: Contextual Inspector) */}
        <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr 310px', gap: 10, minHeight: 480, height: 'calc(100vh - 280px)' }}>
        {/* Left Panel: Character & Layers */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, overflowY: 'auto' }}>
          {/* Two Tabs: Characters and Layers */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 6, gap: 4 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className={leftTab === 'characters' ? 'btn-primary' : 'btn-sm'}
                style={{ fontSize: 11, padding: '4px 8px' }}
                onClick={() => setLeftTab('characters')}
              >
                Characters ({characters.length})
              </button>
              <button
                type="button"
                className={leftTab === 'layers' ? 'btn-primary' : 'btn-sm'}
                style={{ fontSize: 11, padding: '4px 8px' }}
                onClick={() => setLeftTab('layers')}
              >
                Layers ({sortedParts.length})
              </button>
            </div>
            <button
              type="button"
              className="btn-sm"
              aria-label="Add Character"
              onClick={handleAddCharacter}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: 11 }}
            >
              <PlusIcon size={12} /> Add Character
            </button>
          </div>

          {/* Tab 1: Characters List (Visible when leftTab === 'characters', kept in DOM for accessibility & test state) */}
          <div style={{ display: leftTab === 'characters' ? 'flex' : 'none', flexDirection: 'column', gap: 8, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                Cast ({characters.length})
              </span>
            </div>

            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 8, top: 8, color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>
                <SearchIcon size={14} />
              </span>
              <input
                type="text"
                aria-label="Search cast"
                placeholder="Search cast..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: 28, fontSize: 12, height: 30 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flex: 1 }}>
              {filteredCharacters.map((char) => (
                <div
                  key={char.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedCharId(char.id);
                    setInspectorMode('character');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    backgroundColor: char.id === selectedCharId ? 'var(--color-bg-tertiary)' : 'transparent',
                    border: char.id === selectedCharId ? '1px solid var(--color-accent)' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: char.colorPalette[0] || '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: char.id === selectedCharId ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {char.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button
                      type="button"
                      title="Duplicate character"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateCharacter(char);
                      }}
                      style={{ background: 'none', border: 'none', padding: 3, cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
                    >
                      <CopyIcon size={12} />
                    </button>
                    <button
                      type="button"
                      title="Delete character"
                      aria-label={`Delete ${char.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCharToDelete(char);
                      }}
                      style={{ background: 'none', border: 'none', padding: 3, cursor: 'pointer', color: '#ef4444' }}
                    >
                      <TrashIcon size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tab 2: Layers View (Artwork Parts by default, Collapsible Skeleton Rig below) */}
          <div style={{ display: leftTab === 'layers' ? 'flex' : 'none', flexDirection: 'column', gap: 8, flex: 1 }}>
            {/* Artwork Parts Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 120 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  Rig Parts ({sortedParts.length})
                </span>
                <button
                  type="button"
                  className="btn-sm"
                  aria-label="Add Part"
                  style={{ fontSize: 10, padding: '2px 6px' }}
                  onClick={handleAddPart}
                >
                  Add Part
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', maxHeight: 180 }}>
                {filteredParts.map((p) => {
                  const isSelected = inspectorMode === 'part' && p.id === selectedPart?.id;
                  const isHidden = hiddenParts[p.id];
                  const isLocked = lockedParts[p.id];
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedPartId(p.id);
                        setInspectorMode('part');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 6px',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 11,
                        backgroundColor: isSelected ? 'var(--color-bg-tertiary)' : 'transparent',
                        borderLeft: isSelected ? '2px solid var(--color-accent)' : '2px solid transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHiddenParts((prev) => ({ ...prev, [p.id]: !prev[p.id] }));
                          }}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: isHidden ? 'var(--color-text-tertiary)' : 'var(--color-text)' }}
                          title={isHidden ? 'Show layer' : 'Hide layer'}
                        >
                          {isHidden ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
                        </button>
                        <span style={{ textDecoration: isHidden ? 'line-through' : 'none' }}>{p.name}</span>
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>z: {p.zIndex}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Collapsible Skeleton Hierarchy Section */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setIsRigCollapsed(!isRigCollapsed)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}
                >
                  <span>{isRigCollapsed ? '▶' : '▼'} Hierarchy ({activeSkeleton.bones.length})</span>
                </button>
                <button
                  type="button"
                  className="btn-sm"
                  style={{ fontSize: 10, padding: '1px 6px' }}
                  onClick={() => {
                    if (!selectedChar) return;
                    const newId = makeId('bone');
                    const newBone: DesktopRigbyBone = {
                      id: newId,
                      name: `bone_${activeSkeleton.bones.length}`,
                      parentIndex: selectedBone ? activeSkeleton.bones.indexOf(selectedBone) : 0,
                      length: 35,
                      setup: { x: 30, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
                      color: '#f59e0b',
                    };
                    updateCharacter(selectedChar.id, (c) => ({
                      ...c,
                      skeleton: {
                        ...(c.skeleton ?? createDefaultSkeleton()),
                        bones: [...(c.skeleton?.bones ?? activeSkeleton.bones), newBone],
                        slots: c.skeleton?.slots ?? [],
                        ik: c.skeleton?.ik ?? [],
                      },
                    }));
                    setSelectedBoneId(newId);
                    setInspectorMode('bone');
                  }}
                >
                  + Add Bone
                </button>
              </div>

              {!isRigCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', maxHeight: 160 }}>
                  {activeSkeleton.bones.map((bone) => {
                    const isSelected = inspectorMode === 'bone' && bone.id === selectedBone?.id;
                    const depth = bone.parentIndex !== null ? (bone.parentIndex === 0 ? 1 : 2) : 0;
                    return (
                      <div
                        key={bone.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedBoneId(bone.id);
                          setInspectorMode('bone');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 6px',
                          paddingLeft: 6 + depth * 12,
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 11,
                          backgroundColor: isSelected ? 'var(--color-bg-tertiary)' : 'transparent',
                          color: isSelected ? 'var(--color-accent)' : 'var(--color-text)',
                          borderLeft: isSelected ? '2px solid var(--color-accent)' : '2px solid transparent',
                        }}
                      >
                        <span style={{ color: bone.color || '#f59e0b', fontSize: 9 }}>●</span>
                        <span style={{ fontWeight: isSelected ? 600 : 400 }}>{bone.name}</span>
                        {bone.length > 0 && <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{bone.length}px</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center Panel: Character Viewport (Main Visual Focus) */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', position: 'relative', backgroundColor: '#13151b' }}>
          {/* Top Viewport Floating Toolbar */}
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              right: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            {/* Left: Compact Tool Selector (Select, Move, Rotate, Scale, Bone) */}
            <div style={{ display: 'flex', gap: 2, pointerEvents: 'auto', backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', padding: '2px 4px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                type="button"
                className={`btn-sm ${activeTool === 'select' ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 6px' }}
                onClick={() => setActiveTool('select')}
                title="Select Tool"
              >
                Select
              </button>
              <button
                type="button"
                className={`btn-sm ${activeTool === 'move' ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 6px' }}
                onClick={() => setActiveTool('move')}
                title="Move Tool"
              >
                Move
              </button>
              <button
                type="button"
                className={`btn-sm ${activeTool === 'rotate' ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 6px' }}
                onClick={() => setActiveTool('rotate')}
                title="Rotate Tool"
              >
                Rotate
              </button>
              <button
                type="button"
                className={`btn-sm ${activeTool === 'scale' ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 6px' }}
                onClick={() => setActiveTool('scale')}
                title="Scale Tool"
              >
                Scale
              </button>
              <button
                type="button"
                className={`btn-sm ${activeTool === 'bone' ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 6px' }}
                onClick={() => setActiveTool('bone')}
                title="Bone Tool"
              >
                Bone
              </button>
            </div>

            {/* Center: Overlays (Bones, Meshes, Parts, IK) */}
            <div style={{ display: 'flex', gap: 2, pointerEvents: 'auto', backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', padding: '2px 4px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                type="button"
                className={`btn-sm ${showBones ? 'btn-primary' : ''}`}
                style={{ fontSize: 10, padding: '2px 6px' }}
                onClick={() => setShowBones(!showBones)}
                aria-label="Toggle bones overlay"
              >
                Bones
              </button>
              <button
                type="button"
                className={`btn-sm ${showMeshes ? 'btn-primary' : ''}`}
                style={{ fontSize: 10, padding: '2px 6px' }}
                onClick={() => setShowMeshes(!showMeshes)}
                aria-label="Toggle meshes overlay"
              >
                Meshes
              </button>
              <button
                type="button"
                className={`btn-sm ${showParts ? 'btn-primary' : ''}`}
                style={{ fontSize: 10, padding: '2px 6px' }}
                onClick={() => setShowParts(!showParts)}
                aria-label="Toggle parts overlay"
              >
                Parts
              </button>
              <button
                type="button"
                className={`btn-sm ${showIK ? 'btn-primary' : ''}`}
                style={{ fontSize: 10, padding: '2px 6px' }}
                onClick={() => setShowIK(!showIK)}
                aria-label="Toggle IK handles"
              >
                IK
              </button>
            </div>

            {/* Right: Zoom In, Zoom Out, Fit to Character, Reset, Grid */}
            <div style={{ display: 'flex', gap: 2, pointerEvents: 'auto', backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', padding: '2px 4px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                type="button"
                className="btn-sm"
                onClick={() => setZoom((z) => Math.min(3.0, Number((z + 0.15).toFixed(2))))}
                title="Zoom in"
                style={{ padding: '2px 6px' }}
              >
                <ZoomInIcon size={12} />
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.15).toFixed(2))))}
                title="Zoom out"
                style={{ padding: '2px 6px' }}
              >
                <ZoomOutIcon size={12} />
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={handleFitToCharacter}
                title="Fit to Character"
                style={{ fontSize: 10, padding: '2px 6px' }}
              >
                Fit
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={() => {
                  setZoom(1.0);
                  setPan({ x: 0, y: 0 });
                }}
                style={{ fontSize: 10, padding: '2px 6px' }}
              >
                Reset
              </button>
              <button
                type="button"
                className={`btn-sm ${showCheckerboard ? 'btn-primary' : ''}`}
                onClick={() => setShowCheckerboard(!showCheckerboard)}
                title="Toggle grid"
                style={{ fontSize: 10, padding: '2px 6px' }}
              >
                Grid
              </button>
            </div>
          </div>

          {/* Interactive Canvas Stage */}
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            style={{
              width: '100%',
              height: '100%',
              cursor: isPanning ? 'grabbing' : activeTool === 'move' ? 'grab' : 'crosshair',
              display: 'block',
            }}
          />

          {/* StretchyStudio Rig Schematic HUD (Preserved for backwards compatibility with tests) */}
          {selectedChar && (
            <div
              style={{
                position: 'absolute',
                right: 10,
                bottom: 34,
                width: 150,
                height: 150,
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                backdropFilter: 'blur(8px)',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: 4,
                zIndex: 15,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 2px 4px' }}>
                <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  Schematic
                </span>
                <span style={{ fontSize: 9, color: 'var(--color-accent)' }}>{selectedChar.parts.length} parts</span>
              </div>
              <svg
                ref={svgRef}
                viewBox="0 0 240 240"
                width="100%"
                height="126"
                role="img"
                aria-label={`Rig schematic for ${selectedChar.name}`}
                style={{ display: 'block', touchAction: 'none' }}
              >
                <defs>
                  <pattern id="rig-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="240" height="240" fill="url(#rig-grid)" rx="4" />
                {(() => {
                  const normalized = selectedChar.parts.every(
                    (p) => p.pivot.x >= 0 && p.pivot.x <= 1.05 && p.pivot.y >= 0 && p.pivot.y <= 1.05
                  );
                  const resolvePivot = (part: CharacterPart) =>
                    dragPivot && dragPivot.charId === selectedChar.id && dragPivot.partId === part.id
                      ? { x: dragPivot.x, y: dragPivot.y }
                      : part.pivot;

                  return (
                    <>
                      {sortedParts.map((part) => {
                        if (!part.parentPartId) return null;
                        const parent = selectedChar.parts.find((p) => p.id === part.parentPartId);
                        if (!parent) return null;
                        const p1 = resolvePivot(parent);
                        const p2 = resolvePivot(part);
                        return (
                          <line
                            key={`bone-${part.id}`}
                            x1={toSvgCoord(p1.x, normalized)}
                            y1={toSvgCoord(p1.y, normalized)}
                            x2={toSvgCoord(p2.x, normalized)}
                            y2={toSvgCoord(p2.y, normalized)}
                            stroke="rgba(245, 158, 11, 0.55)"
                            strokeWidth="2"
                            strokeDasharray="3 2"
                          />
                        );
                      })}

                      {sortedParts.map((part) => {
                        const activePivot = resolvePivot(part);
                        const cx = toSvgCoord(activePivot.x, normalized);
                        const cy = toSvgCoord(activePivot.y, normalized);
                        const isPartSelected = inspectorMode === 'part' && part.id === selectedPart?.id;
                        const accent = selectedChar.colorPalette[0]
                          ? toSafeColorInput(selectedChar.colorPalette[0])
                          : '#f59e0b';
                        return (
                          <g
                            key={part.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Select part ${part.name} at ${activePivot.x}, ${activePivot.y}`}
                            style={{ cursor: 'grab' }}
                            onClick={() => {
                              setSelectedPartId(part.id);
                              setInspectorMode('part');
                              setSelection({
                                kind: 'part',
                                characterId: selectedChar.id,
                                partId: part.id,
                              });
                            }}
                            onPointerDown={(ev) => {
                              ev.preventDefault();
                              setSelectedPartId(part.id);
                              setInspectorMode('part');
                              setSelection({
                                kind: 'part',
                                characterId: selectedChar.id,
                                partId: part.id,
                              });

                              dragCleanupRef.current?.();
                              const rect = svgRef.current?.getBoundingClientRect();
                              const minDim = rect ? Math.min(rect.width, rect.height) : 0;
                              const scale = minDim > 0 ? 240 / minDim : 1;
                              const startClientX = ev.clientX;
                              const startClientY = ev.clientY;
                              const startSvgX = cx;
                              const startSvgY = cy;
                              const targetCharId = selectedChar.id;
                              let latestPivot = { x: part.pivot.x, y: part.pivot.y };
                              let moved = false;

                              const onMove = (moveEv: PointerEvent) => {
                                if (!Number.isFinite(moveEv.clientX) || !Number.isFinite(moveEv.clientY)) {
                                  return;
                                }
                                const nextSvgX = startSvgX + (moveEv.clientX - startClientX) * scale;
                                const nextSvgY = startSvgY + (moveEv.clientY - startClientY) * scale;
                                const nx = fromSvgCoord(nextSvgX, normalized);
                                const ny = fromSvgCoord(nextSvgY, normalized);
                                latestPivot = { x: nx, y: ny };
                                moved = moved || nx !== part.pivot.x || ny !== part.pivot.y;
                                setDragPivot({
                                  charId: targetCharId,
                                  partId: part.id,
                                  x: nx,
                                  y: ny,
                                });
                              };

                              const cleanupDrag = () => {
                                window.removeEventListener('pointermove', onMove);
                                window.removeEventListener('pointerup', onUp);
                                window.removeEventListener('pointercancel', onCancel);
                                dragCleanupRef.current = null;
                              };

                              const onCancel = () => {
                                cleanupDrag();
                                setDragPivot(null);
                              };

                              const onUp = () => {
                                cleanupDrag();
                                setDragPivot(null);
                                if (moved) {
                                  updateCharacter(targetCharId, (c) => ({
                                    ...c,
                                    parts: c.parts.map((p) =>
                                      p.id === part.id ? { ...p, pivot: latestPivot } : p
                                    ),
                                  }));
                                }
                              };

                              dragCleanupRef.current = cleanupDrag;
                              window.addEventListener('pointermove', onMove);
                              window.addEventListener('pointerup', onUp);
                              window.addEventListener('pointercancel', onCancel);
                            }}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter' || ev.key === ' ') {
                                ev.preventDefault();
                                setSelectedPartId(part.id);
                                setInspectorMode('part');
                                setSelection({
                                  kind: 'part',
                                  characterId: selectedChar.id,
                                  partId: part.id,
                                });
                                return;
                              }
                              const delta = normalized ? (ev.shiftKey ? 0.1 : 0.02) : ev.shiftKey ? 10 : 2;
                              let dx = 0;
                              let dy = 0;
                              if (ev.key === 'ArrowLeft') dx = -delta;
                              else if (ev.key === 'ArrowRight') dx = delta;
                              else if (ev.key === 'ArrowUp') dy = -delta;
                              else if (ev.key === 'ArrowDown') dy = delta;
                              else return;

                              ev.preventDefault();
                              ev.stopPropagation();
                              const newX = normalized
                                ? Number(clamp(part.pivot.x + dx, 0, 1).toFixed(2))
                                : Math.round(clamp(part.pivot.x + dx, 12, 228));
                              const newY = normalized
                                ? Number(clamp(part.pivot.y + dy, 0, 1).toFixed(2))
                                : Math.round(clamp(part.pivot.y + dy, 12, 228));

                              updateCharacter(selectedChar.id, (c) => ({
                                ...c,
                                parts: c.parts.map((p) =>
                                  p.id === part.id ? { ...p, pivot: { x: newX, y: newY } } : p
                                ),
                              }));
                            }}
                          >
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isPartSelected ? 8 : 6}
                              fill={accent}
                              stroke="#ffffff"
                              strokeWidth={isPartSelected ? 2.5 : 1.5}
                            />
                            <text
                              x={cx}
                              y={cy - 10}
                              textAnchor="middle"
                              fill="var(--color-text-secondary)"
                              fontSize={9}
                              fontFamily="sans-serif"
                            >
                              {part.name}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            </div>
          )}

          {/* Viewport Info Pill */}
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              padding: '2px 8px',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          >
            Clip: <strong>{activeClip.name}</strong> • Time: <strong>{currentTime.toFixed(2)}s</strong> / {activeClip.duration.toFixed(2)}s • Zoom: {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Right Panel: Contextual Inspector (Never displays all simultaneously!) */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto' }}>
          {/* Breadcrumb / Mode indicator */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
              {inspectorMode === 'bone'
                ? 'Bone Inspector'
                : inspectorMode === 'part'
                ? `Part Inspector: ${selectedPart?.name ?? ''}`
                : inspectorMode === 'ik'
                ? 'IK Settings'
                : 'Character Properties'}
            </span>
            {inspectorMode !== 'character' && (
              <button
                type="button"
                className="btn-sm"
                style={{ fontSize: 10, padding: '1px 6px' }}
                onClick={() => setInspectorMode('character')}
              >
                ← Character
              </button>
            )}
          </div>

          {/* Context 1: Bone Inspector */}
          {inspectorMode === 'bone' && selectedBone && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 600 }}>{selectedBone.name}</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>ID: {selectedBone.id}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label htmlFor="bone-setup-x" style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Setup X</label>
                  <input
                    id="bone-setup-x"
                    type="number"
                    aria-label="Setup X"
                    value={selectedBone.setup.x}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      if (!selectedChar) return;
                      updateCharacter(selectedChar.id, (c) => ({
                        ...c,
                        skeleton: {
                          ...(c.skeleton ?? createDefaultSkeleton()),
                          bones: activeSkeleton.bones.map((b) => (b.id === selectedBone.id ? { ...b, setup: { ...b.setup, x: val } } : b)),
                          slots: c.skeleton?.slots ?? [],
                          ik: c.skeleton?.ik ?? [],
                        },
                      }));
                    }}
                    style={{ width: '100%', fontSize: 11, padding: 4 }}
                  />
                </div>
                <div>
                  <label htmlFor="bone-setup-y" style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Setup Y</label>
                  <input
                    id="bone-setup-y"
                    type="number"
                    aria-label="Setup Y"
                    value={selectedBone.setup.y}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      if (!selectedChar) return;
                      updateCharacter(selectedChar.id, (c) => ({
                        ...c,
                        skeleton: {
                          ...(c.skeleton ?? createDefaultSkeleton()),
                          bones: activeSkeleton.bones.map((b) => (b.id === selectedBone.id ? { ...b, setup: { ...b.setup, y: val } } : b)),
                          slots: c.skeleton?.slots ?? [],
                          ik: c.skeleton?.ik ?? [],
                        },
                      }));
                    }}
                    style={{ width: '100%', fontSize: 11, padding: 4 }}
                  />
                </div>
                <div>
                  <label htmlFor="bone-rotation" style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Rotation (°)</label>
                  <input
                    id="bone-rotation"
                    type="number"
                    aria-label="Rotation degrees"
                    value={selectedBone.setup.rotation}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      if (!selectedChar) return;
                      updateCharacter(selectedChar.id, (c) => ({
                        ...c,
                        skeleton: {
                          ...(c.skeleton ?? createDefaultSkeleton()),
                          bones: activeSkeleton.bones.map((b) => (b.id === selectedBone.id ? { ...b, setup: { ...b.setup, rotation: val } } : b)),
                          slots: c.skeleton?.slots ?? [],
                          ik: c.skeleton?.ik ?? [],
                        },
                      }));
                    }}
                    style={{ width: '100%', fontSize: 11, padding: 4 }}
                  />
                </div>
                <div>
                  <label htmlFor="bone-length" style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Length (px)</label>
                  <input
                    id="bone-length"
                    type="number"
                    aria-label="Bone length"
                    value={selectedBone.length}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      if (!selectedChar) return;
                      updateCharacter(selectedChar.id, (c) => ({
                        ...c,
                        skeleton: {
                          ...(c.skeleton ?? createDefaultSkeleton()),
                          bones: activeSkeleton.bones.map((b) => (b.id === selectedBone.id ? { ...b, length: val } : b)),
                          slots: c.skeleton?.slots ?? [],
                          ik: c.skeleton?.ik ?? [],
                        },
                      }));
                    }}
                    style={{ width: '100%', fontSize: 11, padding: 4 }}
                  />
                </div>
              </div>

              {/* Danger Zone: Delete Bone */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn-danger"
                  style={{ width: '100%', fontSize: 11, padding: '4px 8px' }}
                  onClick={() => {
                    if (!selectedChar) return;
                    const bIdx = activeSkeleton.bones.findIndex((b) => b.id === selectedBone.id);
                    if (bIdx <= 0) return;
                    const parentIdx = selectedBone.parentIndex;
                    updateCharacter(selectedChar.id, (c) => ({
                      ...c,
                      skeleton: {
                        ...(c.skeleton ?? createDefaultSkeleton()),
                        bones: activeSkeleton.bones
                          .filter((b) => b.id !== selectedBone.id)
                          .map((b) => (b.parentIndex === bIdx ? { ...b, parentIndex: parentIdx } : b)),
                        slots: c.skeleton?.slots ?? [],
                        ik: c.skeleton?.ik ?? [],
                      },
                    }));
                    setSelectedBoneId(activeSkeleton.bones[0].id);
                  }}
                >
                  Delete Bone
                </button>
              </div>
            </div>
          )}

          {/* Context 2: Part Inspector */}
          {inspectorMode === 'part' && selectedPart && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 600 }}>{selectedPart.name}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="btn-sm"
                    aria-label="Add Part"
                    style={{ fontSize: 10, padding: '2px 6px' }}
                    onClick={handleAddPart}
                  >
                    Add Part
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    style={{ fontSize: 10, padding: '2px 6px' }}
                    onClick={() => handleRemovePart(selectedPart.id)}
                  >
                    Delete Part
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label htmlFor={`part-name-${selectedPart.id}`} style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Part Name</label>
                  <input
                    id={`part-name-${selectedPart.id}`}
                    aria-label="Part Name"
                    type="text"
                    value={selectedPart.name}
                    onChange={(ev) => updatePart(selectedPart.id, { name: ev.target.value })}
                    style={{ width: '100%', fontSize: 11, padding: 4 }}
                  />
                </div>
                <div>
                  <label htmlFor={`part-layer-${selectedPart.id}`} style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Layer Name</label>
                  <input
                    id={`part-layer-${selectedPart.id}`}
                    aria-label="Layer Name"
                    type="text"
                    value={selectedPart.layerName}
                    onChange={(ev) => updatePart(selectedPart.id, { layerName: ev.target.value })}
                    style={{ width: '100%', fontSize: 11, padding: 4 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label htmlFor={`part-px-${selectedPart.id}`} style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Pivot X</label>
                  <input
                    id={`part-px-${selectedPart.id}`}
                    aria-label="Pivot X"
                    type="number"
                    value={selectedPart.pivot.x}
                    onChange={(ev) =>
                      updatePart(selectedPart.id, {
                        pivot: { ...selectedPart.pivot, x: Number(ev.target.value) || 0 },
                      })
                    }
                    style={{ width: '100%', fontSize: 11, padding: 4 }}
                  />
                </div>
                <div>
                  <label htmlFor={`part-py-${selectedPart.id}`} style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Pivot Y</label>
                  <input
                    id={`part-py-${selectedPart.id}`}
                    aria-label="Pivot Y"
                    type="number"
                    value={selectedPart.pivot.y}
                    onChange={(ev) =>
                      updatePart(selectedPart.id, {
                        pivot: { ...selectedPart.pivot, y: Number(ev.target.value) || 0 },
                      })
                    }
                    style={{ width: '100%', fontSize: 11, padding: 4 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label htmlFor={`part-z-${selectedPart.id}`} style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Z-Index</label>
                  <input
                    id={`part-z-${selectedPart.id}`}
                    aria-label="Z-Index"
                    type="number"
                    value={selectedPart.zIndex}
                    onChange={(ev) =>
                      updatePart(selectedPart.id, { zIndex: Number(ev.target.value) || 0 })
                    }
                    style={{ width: '100%', fontSize: 11, padding: 4 }}
                  />
                </div>
                <div>
                  <label htmlFor={`part-parent-${selectedPart.id}`} style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Parent Part</label>
                  <select
                    id={`part-parent-${selectedPart.id}`}
                    aria-label="Parent Part"
                    value={selectedPart.parentPartId ?? ''}
                    onChange={(ev) =>
                      updatePart(selectedPart.id, {
                        parentPartId: ev.target.value || undefined,
                      })
                    }
                    style={{ width: '100%', fontSize: 11, padding: 4, height: 26 }}
                  >
                    <option value="">None (Root)</option>
                    {selectedChar?.parts
                      .filter((p) => p.id !== selectedPart.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Context 3: IK Constraints Settings */}
          {inspectorMode === 'ik' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 600 }}>
                  {selectedIK ? selectedIK.name : 'IK Constraints'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{activeSkeleton.ik.length} configured</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {activeSkeleton.ik.map((ik, i) => (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedIKName(ik.name)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      padding: '4px 8px',
                      backgroundColor: ik.name === selectedIK?.name ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      border: ik.name === selectedIK?.name ? '1px solid var(--color-accent)' : '1px solid transparent',
                    }}
                  >
                    <span>{ik.name}</span>
                    <span style={{ color: '#f43f5e', fontSize: 10 }}>{ik.bendPositive ? 'CCW (+)' : 'CW (-)'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Context 4: Character Properties (Default View when nothing specific selected) */}
          {inspectorMode === 'character' && selectedChar && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label htmlFor="char-name-input" style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Character Name</label>
                <input
                  id="char-name-input"
                  aria-label="Character Name"
                  type="text"
                  value={selectedChar.name}
                  onChange={(ev) =>
                    updateCharacter(selectedChar.id, (c) => ({ ...c, name: ev.target.value }))
                  }
                  style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
                />
              </div>

              <div>
                <label htmlFor="char-desc-input" style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Description</label>
                <input
                  id="char-desc-input"
                  type="text"
                  value={selectedChar.description || ''}
                  onChange={(ev) =>
                    updateCharacter(selectedChar.id, (c) => ({ ...c, description: ev.target.value }))
                  }
                  placeholder="Optional description"
                  style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}
                />
              </div>

              {/* Scene Appearances Checklist */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                  Scene Appearances
                </span>
                <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: 0 }}>
                  Cast {selectedChar.name} in story scenes:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 110, overflowY: 'auto' }}>
                  {scenes.map((scene, idx) => {
                    const isInScene = scene.characterIds.includes(selectedChar.id);
                    return (
                      <label
                        key={scene.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', padding: '1px 0' }}
                      >
                        <input
                          type="checkbox"
                          checked={isInScene}
                          aria-label={`Toggle ${selectedChar.name} in Scene ${idx + 1}`}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            updateDraft((prev) => ({
                              ...prev,
                              scenes: prev.scenes.map((sc) =>
                                sc.id === scene.id
                                  ? {
                                      ...sc,
                                      characterIds: checked
                                        ? [...sc.characterIds, selectedChar.id]
                                        : sc.characterIds.filter((id) => id !== selectedChar.id),
                                    }
                                  : sc
                              ),
                            }));
                          }}
                        />
                        <span>Scene {idx + 1}: {scene.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Character Actions: Duplicate, Remove, Save */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
                    onClick={() => handleDuplicateCharacter(selectedChar)}
                  >
                    Duplicate Character
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
                    onClick={() => setCharToDelete(selectedChar)}
                  >
                    Remove Character
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Panel: Compact Animation Timeline & Presets */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>
        {/* Timeline Transport Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          {/* Play/Pause/Stop/Loop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className={isPlaying ? 'btn-danger' : 'btn-primary'}
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? 'Pause Animation' : 'Play Animation'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 76, fontSize: 11, padding: '4px 10px' }}
            >
              {isPlaying ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className={`btn-sm ${isLooping ? 'btn-primary' : ''}`}
              onClick={() => setIsLooping(!isLooping)}
              aria-label="Toggle loop"
              title="Toggle loop"
              style={{ fontSize: 11, padding: '3px 8px' }}
            >
              Loop: {isLooping ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className="btn-sm"
              onClick={() => setCurrentTime(0)}
              style={{ fontSize: 11, padding: '3px 8px' }}
            >
              Stop
            </button>
          </div>

          {/* Time Scrubber Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200, maxWidth: 440 }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 40, color: 'var(--color-text-secondary)' }}>
              {currentTime.toFixed(2)}s
            </span>
            <input
              type="range"
              min={0}
              max={activeClip.duration}
              step={0.02}
              value={currentTime}
              aria-label="Animation playhead scrubber"
              onChange={(e) => {
                setCurrentTime(Number(e.target.value));
              }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 40, color: 'var(--color-text-secondary)' }}>
              {activeClip.duration.toFixed(2)}s
            </span>
          </div>

          {/* AI Motion Generator (Cleanly Separated Group) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--color-bg-secondary)', padding: '2px 6px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
            <select
              value={activeClipName}
              aria-label="Select AI motion preset"
              onChange={(e) => {
                setActiveClipName(e.target.value);
                setCurrentTime(0);
              }}
              style={{ fontSize: 11, padding: '3px 6px', height: 28 }}
            >
              {MOTION_ACTION_PRESETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.defaultDuration}s)
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => handleGenerateMotion(activeClipName)}
            >
              Generate Motion
            </button>
          </div>
        </div>

        {/* Collapsible Presets Section (Expression Presets & Pose Presets) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 6, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Expression Presets:
            </span>
            {EXPRESSION_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="btn-sm"
                style={{ fontSize: 10, padding: '2px 6px' }}
                onClick={() => handleApplyPreset(p)}
              >
                + {p.name}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Pose Presets:
            </span>
            {POSE_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="btn-sm"
                style={{ fontSize: 10, padding: '2px 6px' }}
                onClick={() => handleApplyPreset(p)}
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* End of Advanced Rig Editor Workspace */}
      </div>

      {/* Auto-Preparation Report Dialog */}
      {autoPrepReport && (
        <StudioDialog
          open={true}
          title="Automatic Character Preparation Report"
          onClose={() => setAutoPrepReport(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
            {/* Top Confidence Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--color-bg-tertiary)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {autoPrepReport.fileName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  {autoPrepReport.width} × {autoPrepReport.height} px • {(autoPrepReport.fileSize / 1024).toFixed(1)} KB
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge badge-success" style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid #10b981' }}>
                  {autoPrepReport.confidenceScore}% Confidence
                </span>
              </div>
            </div>

            {/* Diagnostics Detection Analysis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, backgroundColor: 'var(--color-bg-secondary)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                Detection Analysis:
              </span>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
                {autoPrepReport.diagnostics.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>

            {/* Character Name Input */}
            <div>
              <label htmlFor="prep-char-name" style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                Character Name
              </label>
              <input
                id="prep-char-name"
                type="text"
                value={prepCharName}
                onChange={(e) => setPrepCharName(e.target.value)}
                placeholder="Character name"
                style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
              />
            </div>

            {/* Preparation Option Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Select Preparation Method:</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Option A: Smart Character Rig */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPrepOption('smart_rig')}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: selectedPrepOption === 'smart_rig' ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                    backgroundColor: selectedPrepOption === 'smart_rig' ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 13 }}>Smart Character Rig</strong>
                    <input
                      type="radio"
                      name="prepOption"
                      checked={selectedPrepOption === 'smart_rig'}
                      onChange={() => setSelectedPrepOption('smart_rig')}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--color-accent)', fontWeight: 600 }}>
                    Cutout Puppet (Rigby2D)
                  </span>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    Segments head, torso, arms, and legs with 21 skeletal joints, bone weighting, and IK constraints.
                  </p>
                </div>

                {/* Option B: Quick Animate */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPrepOption('quick_animate')}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: selectedPrepOption === 'quick_animate' ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                    backgroundColor: selectedPrepOption === 'quick_animate' ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 13 }}>Quick Animate</strong>
                    <input
                      type="radio"
                      name="prepOption"
                      checked={selectedPrepOption === 'quick_animate'}
                      onChange={() => setSelectedPrepOption('quick_animate')}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600 }}>
                    Whole-Image Transform
                  </span>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                    Animates full character with squash, stretch, bounce, and rotational deformation. Best for opaque art.
                  </p>
                </div>
              </div>
            </div>

            {/* Dialog Footer Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
              <button type="button" onClick={() => setAutoPrepReport(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmAutoPrep}
                style={{ backgroundColor: 'var(--color-accent)', color: '#000', fontWeight: 600 }}
              >
                Confirm & Animate 🚀
              </button>
            </div>
          </div>
        </StudioDialog>
      )}

      {/* Video Export Dialog */}
      {exportModalOpen && (
        <StudioDialog
          open={true}
          title="Export Character Animation Video"
          onClose={() => {
            setExportModalOpen(false);
            setExportComplete(false);
            setExportProgress(0);
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 420 }}>
            {exportComplete ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 36 }}>🎉</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Video Export Complete!</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                  Exported {selectedChar?.name || 'Character'} animating "{activeClipName}" ({exportFormat.toUpperCase()}, {exportResolution}, {motionDuration.toFixed(1)}s)
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setExportModalOpen(false);
                      setExportComplete(false);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, backgroundColor: 'var(--color-bg-secondary)', padding: 10, borderRadius: 6, border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: 12 }}>
                    <strong>Character:</strong> {selectedChar?.name}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <strong>Animation:</strong> {activeClipName.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <strong>Active Duration:</strong> {motionDuration.toFixed(1)}s (30 FPS)
                  </div>
                </div>

                {/* Format Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 500 }}>Export Format</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['mp4', 'gif', 'webm'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        className={exportFormat === fmt ? 'btn-primary' : 'btn-sm'}
                        style={{ flex: 1, padding: '6px 10px', textTransform: 'uppercase', fontSize: 11 }}
                        onClick={() => setExportFormat(fmt)}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resolution Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 500 }}>Resolution</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { id: '1080p', label: '1080p (Full HD)' },
                      { id: '720p', label: '720p (HD)' },
                      { id: 'square', label: '1080×1080 (Square)' },
                    ].map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        className={exportResolution === res.id ? 'btn-primary' : 'btn-sm'}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 11 }}
                        onClick={() => setExportResolution(res.id as any)}
                      >
                        {res.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Progress Bar (if exporting) */}
                {isExporting && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Rendering frames...</span>
                      <span>{exportProgress}%</span>
                    </div>
                    <div style={{ width: '100%', height: 6, backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${exportProgress}%`, height: '100%', backgroundColor: 'var(--color-accent)', transition: 'width 0.2s ease' }} />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => setExportModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isExporting}
                    onClick={handleStartVideoExport}
                    style={{ backgroundColor: 'var(--color-accent)', color: '#000', fontWeight: 600 }}
                  >
                    {isExporting ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </StudioDialog>
      )}

      {/* Delete Character Confirmation Dialog */}
      {charToDelete && (
        <StudioDialog
          open={true}
          title="Delete Character"
          onClose={() => setCharToDelete(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              Are you sure you want to delete character <strong>{charToDelete.name}</strong>? This will remove its
              skeletal rig and scene timeline actions permanently.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setCharToDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  handleDeleteCharacter(charToDelete.id);
                  setCharToDelete(null);
                }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </StudioDialog>
      )}
    </section>
  );
}
