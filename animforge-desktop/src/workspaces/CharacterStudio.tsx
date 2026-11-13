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

  // Character & Part Selection
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [charToDelete, setCharToDelete] = useState<CharacterItem | null>(null);

  // Viewport & Canvas Controls
  const [viewMode, setViewMode] = useState<'rig' | 'parts'>('rig');
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [showCheckerboard, setShowCheckerboard] = useState(true);
  const [showBones, setShowBones] = useState(true);
  const [showMeshes, setShowMeshes] = useState(true);
  const [showParts, setShowParts] = useState(true);
  const [showIK, setShowIK] = useState(true);

  // Animation & Timeline Controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeClipName, setActiveClipName] = useState<string>('idle');
  const [motionIntensity, setMotionIntensity] = useState(1.0);
  const [motionDuration, setMotionDuration] = useState(2.0);

  // Auto-Rig Artwork Dialog
  const [isAutoRigOpen, setIsAutoRigOpen] = useState(false);
  const [autoRigArtName, setAutoRigArtName] = useState('CyberHero');

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
      activeSkeleton.bones[1] ?? // default to hip
      activeSkeleton.bones[0] ??
      null,
    [activeSkeleton, selectedBoneId]
  );

  const scenes = draftProject?.scenes ?? [];
  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    lastTimeRef.current = performance.now();
    const loop = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setCurrentTime((prev) => {
        let next = prev + dt;
        if (next >= activeClip.duration) {
          if (isLooping) {
            next = next % activeClip.duration;
          } else {
            setIsPlaying(false);
            return activeClip.duration;
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
  }, [isPlaying, isLooping, activeClip.duration]);

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

    // Helper: interpolate keyframe channel
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
    // Apply pan & zoom
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-200, -250); // Center around standard character rig origin

    // 1. Checkerboard Background
    if (showCheckerboard) {
      const size = 16;
      ctx.fillStyle = '#1c1e22';
      ctx.fillRect(-200, -200, 800, 900);
      ctx.fillStyle = '#22252b';
      for (let y = -200; y < 700; y += size) {
        for (let x = -200; x < 600; x += size) {
          if (((x / size) + (y / size)) % 2 === 0) {
            ctx.fillRect(x, y, size, size);
          }
        }
      }
    }

    // 2. Delaunay Mesh Wireframes
    if (showMeshes) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
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

    // 3. Body Parts Outlines
    if (showParts && selectedChar) {
      for (const part of selectedChar.parts) {
        const pv = part.pivot;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
        ctx.strokeStyle = part.id === selectedPart?.id ? '#f59e0b' : 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = part.id === selectedPart?.id ? 2 : 1;
        ctx.beginPath();
        ctx.arc(pv.x, pv.y, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '10px monospace';
        ctx.fillText(part.name, pv.x - 16, pv.y - 28);
      }
    }

    // 4. Rigby2D Tapered Bones & Joints
    if (showBones) {
      for (const eb of evaluatedBones) {
        const isSelected = eb.bone.id === selectedBone?.id;
        const color = eb.bone.color || '#f59e0b';
        const length = eb.bone.length;

        if (length > 0) {
          // Draw tapered bone shape
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

          ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.45)' : 'rgba(229, 161, 88, 0.2)';
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#fbbf24' : color;
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.stroke();
        }

        // Draw joint node circle
        ctx.beginPath();
        ctx.arc(eb.worldX, eb.worldY, isSelected ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#fbbf24' : color;
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 5. IK Constraint Lines & Handles
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

          // Draw target circle handle
          ctx.beginPath();
          ctx.arc(targetB.worldX, targetB.worldY, 7, 0, Math.PI * 2);
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [evaluatedBones, zoom, pan, showCheckerboard, showBones, showMeshes, showParts, showIK, selectedBone, selectedPart, selectedChar]);

  // Canvas Mouse Controls (Pan & Selection)
  const handleCanvasMouseDown = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (ev.button === 1 || ev.altKey || ev.shiftKey) {
      setIsPanning(true);
      setStartPan({ x: ev.clientX - pan.x, y: ev.clientY - pan.y });
      return;
    }

    // Hit test joints
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = ev.clientX - rect.left;
    const clientY = ev.clientY - rect.top;

    // Convert click into transformed rig space
    const rx = (clientX - (rect.width / 2 + pan.x)) / zoom + 200;
    const ry = (clientY - (rect.height / 2 + pan.y)) / zoom + 250;

    let closestBone: DesktopRigbyBone | null = null;
    let minDist = 20;

    for (const eb of evaluatedBones) {
      const d = Math.hypot(eb.worldX - rx, eb.worldY - ry);
      if (d < minDist) {
        minDist = d;
        closestBone = eb.bone;
      }
    }

    if (closestBone) {
      setSelectedBoneId(closestBone.id);
    }
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
    <section className="page-container" aria-labelledby={headingId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top Header Row */}
      <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CharactersIcon size={20} />
          <h2 id={headingId} style={{ margin: 0 }}>Character Studio</h2>
          <span className="badge badge-neutral" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
            Rigby2D Skeletal Engine
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: 4 }}>
            StretchyStudio
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
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
                // Auto-rig default skeleton
                const defaultSk = createDefaultSkeleton();
                updateCharacter(selectedChar.id, (c) => ({
                  ...c,
                  skeleton: defaultSk,
                  animations: generateDefaultClips(),
                }));
              }
            }}
          />
          <button type="button" onClick={handleExportSpine} title="Export to Spine 3.8 JSON">
            Export Spine JSON
          </button>
          <button type="button" onClick={() => selectedChar && handleExportCharacterJson(selectedChar)} title="Export AnimForge Character">
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
          <button type="button" onClick={() => importInputRef.current?.click()}>
            Import JSON
          </button>
        </div>
      </div>

      {/* Main Workspace 3-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 320px', gap: 12, minHeight: 520, height: 'calc(100vh - 290px)' }}>
        {/* Left Column: Cast & Bone Hierarchy Tree */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-secondary)' }}>
              Cast ({characters.length})
            </span>
            <button
              type="button"
              className="btn-sm"
              aria-label="Add Character"
              onClick={handleAddCharacter}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 12 }}
            >
              <PlusIcon size={12} /> Add Character
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: 9, color: 'var(--color-text-tertiary)', pointerEvents: 'none' }}>
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              aria-label="Search cast"
              placeholder="Search cast..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: 28, fontSize: 12, height: 32 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 130, overflowY: 'auto' }}>
            {filteredCharacters.map((char) => (
              <div
                key={char.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedCharId(char.id)}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: char.colorPalette[0] || '#f59e0b' }} />
                  <span style={{ fontSize: 13, fontWeight: char.id === selectedCharId ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {char.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    title="Duplicate character"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateCharacter(char);
                    }}
                    style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
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
                    style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#ef4444' }}
                  >
                    <TrashIcon size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />

          {/* Sub-Tabs: Skeleton Tree vs Parts */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className={viewMode === 'rig' ? 'btn-primary' : 'btn-sm'}
              style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
              onClick={() => setViewMode('rig')}
            >
              Skeleton ({activeSkeleton.bones.length})
            </button>
            <button
              type="button"
              className={viewMode === 'parts' ? 'btn-primary' : 'btn-sm'}
              style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
              onClick={() => setViewMode('parts')}
            >
              Parts ({sortedParts.length})
            </button>
          </div>

          {/* Bone Hierarchy Tree */}
          {viewMode === 'rig' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Hierarchy</span>
                <button
                  type="button"
                  className="btn-sm"
                  style={{ fontSize: 11, padding: '1px 6px' }}
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
                  }}
                >
                  + Add Bone
                </button>
              </div>

              {activeSkeleton.bones.map((bone, idx) => {
                const isSelected = bone.id === selectedBone?.id;
                const depth = bone.parentIndex !== null ? (bone.parentIndex === 0 ? 1 : 2) : 0;
                return (
                  <div
                    key={bone.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedBoneId(bone.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 6px',
                      paddingLeft: 8 + depth * 14,
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      backgroundColor: isSelected ? 'var(--color-bg-tertiary)' : 'transparent',
                      color: isSelected ? 'var(--color-accent)' : 'var(--color-text)',
                      borderLeft: isSelected ? '2px solid var(--color-accent)' : '2px solid transparent',
                    }}
                  >
                    <span style={{ color: bone.color || '#f59e0b', fontSize: 10 }}>●</span>
                    <span style={{ fontWeight: isSelected ? 600 : 400 }}>{bone.name}</span>
                    {bone.length > 0 && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{bone.length}px</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Body Parts List */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Rig Parts</span>
                <button
                  type="button"
                  className="btn-sm"
                  aria-label="Add Part"
                  style={{ fontSize: 11, padding: '1px 6px' }}
                  onClick={handleAddPart}
                >
                  Add Part
                </button>
              </div>
              {sortedParts.map((p) => {
                const isSelected = p.id === selectedPart?.id;
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPartId(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      backgroundColor: isSelected ? 'var(--color-bg-tertiary)' : 'transparent',
                      borderLeft: isSelected ? '2px solid var(--color-accent)' : '2px solid transparent',
                    }}
                  >
                    <span>{p.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>z: {p.zIndex}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Center Column: Interactive Rigby2D Viewport Canvas */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', position: 'relative' }}>
          {/* Top Viewport Floating Toolbar */}
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              right: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            {/* Viewport Overlay Toggles */}
            <div style={{ display: 'flex', gap: 4, pointerEvents: 'auto', backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)', padding: '3px 6px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                type="button"
                className={`btn-sm ${showBones ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setShowBones(!showBones)}
                aria-label="Toggle bones overlay"
              >
                Bones
              </button>
              <button
                type="button"
                className={`btn-sm ${showMeshes ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setShowMeshes(!showMeshes)}
                aria-label="Toggle meshes overlay"
              >
                Meshes
              </button>
              <button
                type="button"
                className={`btn-sm ${showParts ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setShowParts(!showParts)}
                aria-label="Toggle parts overlay"
              >
                Parts
              </button>
              <button
                type="button"
                className={`btn-sm ${showIK ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => setShowIK(!showIK)}
                aria-label="Toggle IK handles"
              >
                IK
              </button>
            </div>

            {/* Zoom / Pan Controls */}
            <div style={{ display: 'flex', gap: 4, pointerEvents: 'auto', backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)', padding: '3px 6px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
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
                onClick={() => {
                  setZoom(1.0);
                  setPan({ x: 0, y: 0 });
                }}
                style={{ fontSize: 11, padding: '2px 6px' }}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={() => setShowCheckerboard(!showCheckerboard)}
                title="Toggle checkerboard"
                style={{ fontSize: 11, padding: '2px 6px' }}
              >
                Grid
              </button>
            </div>
          </div>

          {/* Interactive Canvas Element */}
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
              cursor: isPanning ? 'grabbing' : 'crosshair',
              display: 'block',
            }}
          />

          {/* StretchyStudio Rig Schematic (SVG HUD) */}
          {selectedChar && (
            <div
              style={{
                position: 'absolute',
                right: 12,
                bottom: 38,
                width: 170,
                height: 170,
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
                height="146"
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
                      {/* Bone hierarchy lines */}
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

                      {/* Pivot nodes */}
                      {sortedParts.map((part) => {
                        const activePivot = resolvePivot(part);
                        const cx = toSvgCoord(activePivot.x, normalized);
                        const cy = toSvgCoord(activePivot.y, normalized);
                        const isPartSelected = part.id === selectedPart?.id;
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
                              setSelection({
                                kind: 'part',
                                characterId: selectedChar.id,
                                partId: part.id,
                              });
                            }}
                            onPointerDown={(ev) => {
                              ev.preventDefault();
                              setSelectedPartId(part.id);
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

          {/* Current Pose Status Pill */}
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              padding: '2px 8px',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          >
            Clip: <strong>{activeClip.name}</strong> • Time: <strong>{currentTime.toFixed(2)}s</strong> / {activeClip.duration.toFixed(2)}s • Zoom: {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Right Column: Rig Inspector & Scene Appearances */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, overflowY: 'auto' }}>
          {/* Bone Inspector */}
          {selectedBone ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                  Bone Inspector
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600 }}>{selectedBone.name}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Setup X</label>
                  <input
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
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Setup Y</label>
                  <input
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
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Rotation (°)</label>
                  <input
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
                  <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>Length (px)</label>
                  <input
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

              {/* Delete Bone Action */}
              <button
                type="button"
                className="btn-danger"
                style={{ fontSize: 11, padding: '4px 8px', marginTop: 4 }}
                onClick={() => {
                  if (!selectedChar) return;
                  const bIdx = activeSkeleton.bones.findIndex((b) => b.id === selectedBone.id);
                  if (bIdx <= 0) return; // Prevent deleting root
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
          ) : null}

          {/* IK Constraints Summary */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
              IK Constraints ({activeSkeleton.ik.length})
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {activeSkeleton.ik.map((ik, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 6px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 4 }}>
                  <span>{ik.name}</span>
                  <span style={{ color: '#f43f5e' }}>{ik.bendPositive ? 'CCW (+)' : 'CW (-)'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Part Inspector */}
          {selectedPart && (
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                  Part Inspector: {selectedPart.name}
                </span>
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

          {/* Character Details */}
          {selectedChar && (
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
            </div>
          )}

          {/* Scene Appearances Checklist */}
          {selectedChar && (
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                Scene Appearances
              </span>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                Cast {selectedChar.name} in project story scenes:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
                {scenes.map((scene, idx) => {
                  const isInScene = scene.characterIds.includes(selectedChar.id);
                  return (
                    <label
                      key={scene.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', padding: '2px 0' }}
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

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flex: 1, fontSize: 11, padding: '5px 8px' }}
                  onClick={() => saveDraft('Saved character changes')}
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  style={{ flex: 1, fontSize: 11, padding: '5px 8px' }}
                  onClick={() => handleDuplicateCharacter(selectedChar)}
                >
                  Duplicate Character
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  style={{ flex: 1, fontSize: 11, padding: '5px 8px' }}
                  onClick={() => setCharToDelete(selectedChar)}
                >
                  Remove Character
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel: Timeline Transport, AI Motion Clips & Expression Presets */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
        {/* Timeline Transport Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          {/* Play/Pause/Loop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className={isPlaying ? 'btn-danger' : 'btn-primary'}
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? 'Pause Animation' : 'Play Animation'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 80 }}
            >
              {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className={`btn-sm ${isLooping ? 'btn-primary' : ''}`}
              onClick={() => setIsLooping(!isLooping)}
              aria-label="Toggle loop"
              title="Toggle loop"
              style={{ fontSize: 11 }}
            >
              Loop: {isLooping ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className="btn-sm"
              onClick={() => setCurrentTime(0)}
              style={{ fontSize: 11 }}
            >
              Stop
            </button>
          </div>

          {/* Time Scrubber Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200, maxWidth: 450 }}>
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

          {/* AI Motion Generator Dropdown & Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={activeClipName}
              aria-label="Select AI motion preset"
              onChange={(e) => {
                setActiveClipName(e.target.value);
                setCurrentTime(0);
              }}
              style={{ fontSize: 12, padding: '4px 8px', height: 32 }}
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
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => handleGenerateMotion(activeClipName)}
            >
              Generate Motion
            </button>
          </div>
        </div>

        {/* Presets Row: Preserves existing expression and pose action tests */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Expression Presets:
            </span>
            {EXPRESSION_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="btn-sm"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => handleApplyPreset(p)}
              >
                + {p.name}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Pose Presets:
            </span>
            {POSE_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="btn-sm"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => handleApplyPreset(p)}
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

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
