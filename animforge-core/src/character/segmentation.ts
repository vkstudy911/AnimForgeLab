import { BodyPartRole, BodySide, DetectedPart } from '../../schemas/character.rigby.js';
import { classify } from './engine/rigby/index.js';

export interface ImageDimension {
  width: number;
  height: number;
}

export interface SilhouetteBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface LayerHint {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  imagePath?: string;
  alpha?: Uint8Array;
}

export interface SegmentationOptions {
  width: number;
  height: number;
  alphaData?: Uint8Array;
  layers?: LayerHint[];
  imagePath?: string;
}

/**
 * Computes the tight bounding box of all non-transparent pixels in an alpha buffer.
 */
export function getSilhouetteBounds(
  width: number,
  height: number,
  alphaData: Uint8Array,
  threshold = 16
): SilhouetteBounds {
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaData[y * width + x] >= threshold) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) {
    return { minX: 0, maxX: width, minY: 0, maxY: height, width, height };
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Generates an 8-point smoothed bounding polygon for a box, in normalized [0..1] coordinates.
 */
function makePartPolygon(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  totalW: number,
  totalH: number
): Array<[number, number]> {
  const norm = (px: number, py: number): [number, number] => [
    Math.round((px / totalW) * 1000) / 1000,
    Math.round((py / totalH) * 1000) / 1000,
  ];

  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const r = 0.15; // corner inset
  const dx = (x1 - x0) * r;
  const dy = (y1 - y0) * r;

  return [
    norm(x0 + dx, y0),
    norm(x1 - dx, y0),
    norm(x1, y0 + dy),
    norm(x1, y1 - dy),
    norm(x1 - dx, y1),
    norm(x0 + dx, y1),
    norm(x0, y1 - dy),
    norm(x0, y0 + dy),
  ];
}

/**
 * Segments an image or layered artwork into AnimForge Body Parts with anatomical heuristics.
 */
export function segmentCharacter(options: SegmentationOptions): DetectedPart[] {
  const { width, height, alphaData, layers, imagePath } = options;

  // Case 1: Layered artwork (PSD or pre-split layers)
  if (layers && layers.length > 0) {
    return segmentLayeredArtwork(layers, width, height, imagePath);
  }

  // Case 2: Flat PNG with alpha channel or whole canvas
  const bounds = alphaData
    ? getSilhouetteBounds(width, height, alphaData)
    : { minX: 0, maxX: width, minY: 0, maxY: height, width, height };

  return segmentFlatSilhouette(bounds, width, height, imagePath);
}

function segmentLayeredArtwork(
  layers: LayerHint[],
  totalW: number,
  totalH: number,
  baseImagePath?: string
): DetectedPart[] {
  const parts: DetectedPart[] = [];

  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    const classified = classify(l.name);
    const role: BodyPartRole = (classified?.role as BodyPartRole) || inferRoleFromNameOrPos(l.name, l, totalW, totalH);
    const side: BodySide = classified?.side ?? (l.x + l.width / 2 > totalW / 2 ? 'l' : 'r');

    const x0 = l.x;
    const y0 = l.y;
    const x1 = l.x + l.width;
    const y1 = l.y + l.height;

    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const pivot = calculateDefaultPivot(role, side, x0, y0, x1, y1);

    parts.push({
      id: `part_${i + 1}_${l.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: l.name,
      role,
      side,
      zIndex: l.zIndex ?? defaultZIndex(role, side),
      polygon: makePartPolygon(x0, y0, x1, y1, totalW, totalH),
      centroid: [Math.round((cx / totalW) * 1000) / 1000, Math.round((cy / totalH) * 1000) / 1000],
      pivot: [Math.round((pivot[0] / totalW) * 1000) / 1000, Math.round((pivot[1] / totalH) * 1000) / 1000],
      imagePath: l.imagePath || baseImagePath,
      confidence: classified ? 0.98 : 0.85,
    });
  }

  return parts;
}

function inferRoleFromNameOrPos(name: string, l: LayerHint, totalW: number, totalH: number): BodyPartRole {
  const lower = name.toLowerCase();
  if (lower.includes('head') || lower.includes('face')) return 'head';
  if (lower.includes('eye')) return 'eye';
  if (lower.includes('mouth') || lower.includes('lip')) return 'mouth';
  if (lower.includes('body') || lower.includes('torso') || lower.includes('chest')) return 'torso';
  if (lower.includes('pelvis') || lower.includes('hip')) return 'pelvis';
  if (lower.includes('arm')) return 'upperarm';
  if (lower.includes('forearm')) return 'forearm';
  if (lower.includes('hand')) return 'hand';
  if (lower.includes('thigh') || lower.includes('leg')) return 'thigh';
  if (lower.includes('shin')) return 'shin';
  if (lower.includes('foot') || lower.includes('shoe')) return 'foot';

  // Position fallback
  const relY = (l.y + l.height / 2) / totalH;
  if (relY < 0.3) return 'head';
  if (relY < 0.6) return 'torso';
  return 'thigh';
}

/**
 * Standard humanoid anatomical template for decomposing a 2D flat character silhouette.
 */
function segmentFlatSilhouette(
  b: SilhouetteBounds,
  totalW: number,
  totalH: number,
  imagePath?: string
): DetectedPart[] {
  const parts: DetectedPart[] = [];

  const bx = b.minX;
  const by = b.minY;
  const bw = b.width;
  const bh = b.height;
  const midX = bx + bw / 2;

  // Normalized anatomical regions relative to character bounding box
  // 1. Head
  const headX0 = bx + bw * 0.22;
  const headX1 = bx + bw * 0.78;
  const headY0 = by;
  const headY1 = by + bh * 0.28;
  parts.push(createPart('part_head', 'Head', 'head', null, 5, headX0, headY0, headX1, headY1, totalW, totalH, imagePath, 0.96));

  // Face landmarks
  const eyeLeftX0 = midX + bw * 0.05;
  const eyeLeftX1 = midX + bw * 0.16;
  const eyeY0 = by + bh * 0.12;
  const eyeY1 = by + bh * 0.18;
  parts.push(createPart('part_eye_l', 'Eye Left', 'eye', 'l', 10, eyeLeftX0, eyeY0, eyeLeftX1, eyeY1, totalW, totalH, imagePath, 0.92));

  const eyeRightX0 = midX - bw * 0.16;
  const eyeRightX1 = midX - bw * 0.05;
  parts.push(createPart('part_eye_r', 'Eye Right', 'eye', 'r', 10, eyeRightX0, eyeY0, eyeRightX1, eyeY1, totalW, totalH, imagePath, 0.92));

  const mouthX0 = midX - bw * 0.09;
  const mouthX1 = midX + bw * 0.09;
  const mouthY0 = by + bh * 0.21;
  const mouthY1 = by + bh * 0.25;
  parts.push(createPart('part_mouth', 'Mouth', 'mouth', null, 10, mouthX0, mouthY0, mouthX1, mouthY1, totalW, totalH, imagePath, 0.90));

  // 2. Torso (Chest & Pelvis)
  const torsoX0 = bx + bw * 0.25;
  const torsoX1 = bx + bw * 0.75;
  const torsoY0 = by + bh * 0.27;
  const torsoY1 = by + bh * 0.52;
  parts.push(createPart('part_torso', 'Torso', 'torso', null, 0, torsoX0, torsoY0, torsoX1, torsoY1, totalW, totalH, imagePath, 0.95));

  const pelvisY0 = by + bh * 0.50;
  const pelvisY1 = by + bh * 0.60;
  parts.push(createPart('part_pelvis', 'Pelvis', 'pelvis', null, 0, torsoX0, pelvisY0, torsoX1, pelvisY1, totalW, totalH, imagePath, 0.93));

  // 3. Left Arm (Screen right, character's anatomical left)
  const armLX0 = midX + bw * 0.24;
  const armLX1 = bx + bw;
  const upperarmLY0 = by + bh * 0.28;
  const upperarmLY1 = by + bh * 0.42;
  parts.push(createPart('part_upperarm_l', 'Upper Arm Left', 'upperarm', 'l', 2, armLX0, upperarmLY0, armLX1, upperarmLY1, totalW, totalH, imagePath, 0.91));

  const forearmLY0 = by + bh * 0.42;
  const forearmLY1 = by + bh * 0.56;
  parts.push(createPart('part_forearm_l', 'Forearm Left', 'forearm', 'l', 3, armLX0, forearmLY0, armLX1, forearmLY1, totalW, totalH, imagePath, 0.91));

  const handLY0 = by + bh * 0.56;
  const handLY1 = by + bh * 0.65;
  parts.push(createPart('part_hand_l', 'Hand Left', 'hand', 'l', 4, armLX0, handLY0, armLX1, handLY1, totalW, totalH, imagePath, 0.89));

  // 4. Right Arm (Screen left, character's anatomical right)
  const armRX0 = bx;
  const armRX1 = midX - bw * 0.24;
  parts.push(createPart('part_upperarm_r', 'Upper Arm Right', 'upperarm', 'r', -2, armRX0, upperarmLY0, armRX1, upperarmLY1, totalW, totalH, imagePath, 0.91));
  parts.push(createPart('part_forearm_r', 'Forearm Right', 'forearm', 'r', -1, armRX0, forearmLY0, armRX1, forearmLY1, totalW, totalH, imagePath, 0.91));
  parts.push(createPart('part_hand_r', 'Hand Right', 'hand', 'r', -1, armRX0, handLY0, armRX1, handLY1, totalW, totalH, imagePath, 0.89));

  // 5. Left Leg (Screen right, character's anatomical left)
  const legLX0 = midX + bw * 0.04;
  const legLX1 = midX + bw * 0.36;
  const thighLY0 = by + bh * 0.58;
  const thighLY1 = by + bh * 0.76;
  parts.push(createPart('part_thigh_l', 'Thigh Left', 'thigh', 'l', 1, legLX0, thighLY0, legLX1, thighLY1, totalW, totalH, imagePath, 0.92));

  const shinLY0 = by + bh * 0.76;
  const shinLY1 = by + bh * 0.92;
  parts.push(createPart('part_shin_l', 'Shin Left', 'shin', 'l', 1, legLX0, shinLY0, legLX1, shinLY1, totalW, totalH, imagePath, 0.92));

  const footLY0 = by + bh * 0.92;
  const footLY1 = by + bh;
  parts.push(createPart('part_foot_l', 'Foot Left', 'foot', 'l', 2, legLX0 - bw * 0.02, footLY0, legLX1 + bw * 0.05, footLY1, totalW, totalH, imagePath, 0.90));

  // 6. Right Leg (Screen left, character's anatomical right)
  const legRX0 = midX - bw * 0.36;
  const legRX1 = midX - bw * 0.04;
  parts.push(createPart('part_thigh_r', 'Thigh Right', 'thigh', 'r', -1, legRX0, thighLY0, legRX1, thighLY1, totalW, totalH, imagePath, 0.92));
  parts.push(createPart('part_shin_r', 'Shin Right', 'shin', 'r', -1, legRX0, shinLY0, legRX1, shinLY1, totalW, totalH, imagePath, 0.92));
  parts.push(createPart('part_foot_r', 'Foot Right', 'foot', 'r', -1, legRX0 - bw * 0.05, footLY0, legRX1 + bw * 0.02, footLY1, totalW, totalH, imagePath, 0.90));

  return parts;
}

function createPart(
  id: string,
  name: string,
  role: BodyPartRole,
  side: BodySide,
  zIndex: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  totalW: number,
  totalH: number,
  imagePath?: string,
  confidence = 0.9
): DetectedPart {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const pivot = calculateDefaultPivot(role, side, x0, y0, x1, y1);

  return {
    id,
    name,
    role,
    side,
    zIndex,
    polygon: makePartPolygon(x0, y0, x1, y1, totalW, totalH),
    centroid: [Math.round((cx / totalW) * 1000) / 1000, Math.round((cy / totalH) * 1000) / 1000],
    pivot: [Math.round((pivot[0] / totalW) * 1000) / 1000, Math.round((pivot[1] / totalH) * 1000) / 1000],
    imagePath,
    confidence,
  };
}

function calculateDefaultPivot(
  role: BodyPartRole,
  side: BodySide,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): [number, number] {
  const mx = (x0 + x1) / 2;
  switch (role) {
    case 'head':
      return [mx, y1 - (y1 - y0) * 0.1]; // Neck base
    case 'torso':
      return [mx, y1 - (y1 - y0) * 0.2]; // Hip pivot
    case 'pelvis':
      return [mx, y0 + (y1 - y0) * 0.2]; // Base of spine
    case 'upperarm':
      return [side === 'l' ? x0 + (x1 - x0) * 0.2 : x1 - (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.15]; // Shoulder
    case 'forearm':
      return [side === 'l' ? x0 + (x1 - x0) * 0.3 : x1 - (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.1]; // Elbow
    case 'hand':
      return [mx, y0 + (y1 - y0) * 0.15]; // Wrist
    case 'thigh':
      return [mx, y0 + (y1 - y0) * 0.15]; // Hip socket
    case 'shin':
      return [mx, y0 + (y1 - y0) * 0.1]; // Knee
    case 'foot':
      return [side === 'l' ? x0 + (x1 - x0) * 0.3 : x1 - (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.2]; // Ankle
    case 'eye':
    case 'mouth':
    case 'nose':
    default:
      return [mx, (y0 + y1) / 2];
  }
}

function defaultZIndex(role: BodyPartRole, side: BodySide): number {
  switch (role) {
    case 'eye':
    case 'eyebrow':
    case 'mouth':
    case 'nose':
      return 10;
    case 'head':
      return 5;
    case 'hand':
      return side === 'r' ? -1 : 4;
    case 'forearm':
      return side === 'r' ? -1 : 3;
    case 'upperarm':
      return side === 'r' ? -2 : 2;
    case 'foot':
      return side === 'r' ? -1 : 2;
    case 'shin':
      return side === 'r' ? -1 : 1;
    case 'thigh':
      return side === 'r' ? -1 : 1;
    case 'pelvis':
    case 'torso':
    default:
      return 0;
  }
}
