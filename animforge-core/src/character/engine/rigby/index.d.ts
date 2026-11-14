// SPDX-License-Identifier: MIT OR Apache-2.0
// TypeScript definitions for Rigby2D Core Engine

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scale_x: number;
  scale_y: number;
  shear_x: number;
  shear_y: number;
}

export class Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;

  constructor(a: number, b: number, c: number, d: number, tx: number, ty: number);
  apply(p: [number, number]): [number, number];
  inverse(): Affine;
  mul(other: Affine): Affine;
  rotation(): number;
  scaleX(): number;
  scaleY(): number;
}

export function transform(x: number, y: number, rotation?: number, scaleX?: number, scaleY?: number): Transform;
export function identityTransform(): Transform;
export function cloneTransform(t: Transform): Transform;
export function toAffine(t: Transform): Affine;
export function lerp(a: number, b: number, t: number): number;
export function wrapDegrees(deg: number): number;

export interface BoneData {
  name: string;
  parent: number | null;
  transform: Transform;
  length: number;
  inherit?: string;
  color?: string;
}

export interface SlotData {
  name: string;
  bone: number;
  attachment: any;
  color?: [number, number, number, number];
  blend?: string;
}

export interface AttachmentData {
  name: string;
  image: string;
  offset: Transform;
  width: number;
  height: number;
  type?: string;
}

export interface MeshAttachmentData extends AttachmentData {
  type: 'mesh';
  vertices: number[];
  uvs: number[];
  triangles: number[];
  edges?: number[];
  hull?: number;
}

export interface IkConstraintData {
  name: string;
  bones: [number, number];
  target: number;
  bendPositive: boolean;
  mix: number;
}

export class Skeleton {
  name: string;
  bones: BoneData[];
  slots: SlotData[];
  ik: IkConstraintData[];
  images: Array<{ name: string; path: string | null; width: number; height: number }>;
  animations: Map<string, any>;

  constructor();
  boneIndex(name: string): number | null;
  uniqueBoneName(base: string): string;
  slotIndex(name: string): number | null;
  findSlot(name: string): SlotData | null;
  defaultPose(): Pose;
}

export function makeBone(name: string, parent: number | null, t?: Partial<Transform>, length?: number): BoneData;
export function makeSlot(name: string, bone: number, attachment?: any): SlotData;
export function makeAttachment(name: string, image: string, offset?: Transform, width?: number, height?: number): AttachmentData;
export function makeMesh(name: string, image: string, offset: Transform, width: number, height: number, vertices: number[], uvs: number[], triangles: number[]): MeshAttachmentData;

export class Pose {
  world: Affine[];
  local: Transform[];

  constructor(skeleton: Skeleton);
  updateWorld(skeleton: Skeleton): void;
  worldVertices(skeleton: Skeleton, slotIndex: number, mesh: MeshAttachmentData): number[];
  quads(skeleton: Skeleton): Array<{
    slot: SlotData;
    attachment: AttachmentData;
    positions: number[];
    uvs: number[];
  }>;
  solveIk(skeleton: Skeleton, constraint: IkConstraintData, state: any): void;
}

export class Animation {
  name: string;
  duration: number;
  fps: number;
  timelines: any[];

  constructor(name: string, duration?: number, fps?: number);
}

export function setKey(anim: Animation, target: string, channel: string, time: number, value: any, curve?: any): void;

export interface PartInfo {
  name: string;
  role: string;
  side: 'l' | 'r' | null;
  index: number | null;
  g: {
    area: number;
    centroid: [number, number];
    axis: [number, number];
    extents: [number, number];
    bounds: [number, number, number, number];
  };
  from?: string;
}

export function classify(name: string): { role: string; side: 'l' | 'r' | null; index: number | null } | null;
export function boneKey(name: string): string;
export function findParts(doc: Skeleton, alphaOf: (name: string) => { width: number; height: number; data: Uint8Array } | null, options?: any): PartInfo[];
export function autoRig(doc: Skeleton, alphaOf: (name: string) => { width: number; height: number; data: Uint8Array } | null, options?: any): { warnings: string[] };

export function triangulateMesh(points: Array<[number, number]>, hull: number): Array<[number, number, number]>;
export function autoWeights(mesh: MeshAttachmentData, doc: Skeleton, pose: Pose, bones: number[]): void;

export function isSkeletonJson(json: any): boolean;
export function readSkeletonJson(json: any, name?: string): { skeleton: Skeleton; warnings: string[] };
export function writeSkeletonJson(doc: Skeleton, options?: any): any;
