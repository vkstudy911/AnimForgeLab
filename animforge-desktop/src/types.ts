import type React from 'react';

export type WorkspaceId =
  | 'home'
  | 'projects'
  | 'story'
  | 'studio'
  | 'characters'
  | 'assets'
  | 'render'
  | 'diagnostics'
  | 'settings'
  | 'agents';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export type EngineId = 'givemotion' | 'remotion' | 'stretchystudio' | 'composite';

export interface StoryBeat {
  beatNumber: number;
  sceneTitle: string;
  visualSummary: string;
  characterInteractions: string;
  cameraNotes: string;
  soundNotes?: string;
  targetDurationSeconds: number;
}

export interface Storyboard {
  id: string;
  projectId: string;
  logline: string;
  artStyle: string;
  beats: StoryBeat[];
  totalDurationSeconds: number;
  createdAt: string;
}

export interface CharacterPart {
  id: string;
  name: string;
  layerName: string;
  pivot: { x: number; y: number };
  zIndex: number;
  parentPartId?: string;
}

export type CharacterActionName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'wave'
  | 'smile'
  | 'blink'
  | 'look_around'
  | 'custom';

export interface CharacterAction {
  actionId: string;
  name: CharacterActionName;
  startTime: number;
  duration: number;
  parameters: Record<string, unknown>;
}

export interface CharacterItem {
  id: string;
  name: string;
  description: string;
  parts: CharacterPart[];
  defaultRigId?: string;
  colorPalette: string[];
}

export type AssetType =
  | 'character'
  | 'background'
  | 'prop'
  | 'audio'
  | 'font'
  | 'model'
  | 'reference';

export interface AssetItem {
  id: string;
  name: string;
  type: AssetType;
  uri: string;
  mimeType?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type CameraMoveType = 'static' | 'pan' | 'zoom' | 'push' | 'pull' | 'dolly' | 'shake';
export type CameraEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';

export interface CameraMovement {
  type: CameraMoveType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startZoom: number;
  endZoom: number;
  easing: CameraEasing;
  duration: number;
}

export interface AudioTrackItem {
  assetId: string;
  startTime: number;
  volume: number;
  loop: boolean;
  muted?: boolean;
}

export interface AnimationTimeline {
  duration: number;
  fps: number;
  characterActions: CharacterAction[];
  cameraMoves: CameraMovement[];
  audioTracks: AudioTrackItem[];
  [key: string]: unknown;
}

export type TransitionType = 'none' | 'fade' | 'wipe' | 'slide' | 'dissolve';

export interface SceneTransition {
  type: TransitionType | string;
  duration: number;
  [key: string]: unknown;
}

export interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  status: string;
  preferredEngine?: string;
  width: number;
  height: number;
  fps: number;
  updatedAt: string;
  hasBundle?: boolean;
  hasVideo?: boolean;
}

export interface SceneDetail {
  id: string;
  projectId: string;
  sequenceIndex: number;
  title: string;
  description: string;
  duration: number;
  backgroundAssetId?: string;
  characterIds: string[];
  timeline: AnimationTimeline;
  transition: SceneTransition;
  [key: string]: unknown;
}

export interface ProjectDetail {
  id: string;
  name: string;
  prompt: string;
  width: number;
  height: number;
  fps: number;
  preferredEngine: string;
  status: string;
  storyboard?: Storyboard;
  characters: CharacterItem[];
  assets: AssetItem[];
  scenes: SceneDetail[];
  createdAt: string;
  updatedAt: string;
  hasBundle?: boolean;
  hasVideo?: boolean;
  [key: string]: unknown;
}

export interface ProjectCreateOptions {
  width?: number;
  height?: number;
  fps?: number;
  preferredEngine?: EngineId;
}

export interface CreateProjectResult {
  project: ProjectDetail;
  projectDir: string;
}

export interface GiveMotionCheckIssue {
  severity?: string | null;
  code?: string | null;
  message: string;
}

export interface GiveMotionPreviewResult {
  projectId: string;
  ok: boolean;
  errors: number;
  warnings: number;
  notes: number;
  issues: GiveMotionCheckIssue[];
  bundleDir: string;
  bundleIndexHtml: string;
  playerHtml: string;
}

export interface RenderProgressPayload {
  jobId: string;
  projectId: string;
  phase: string;
  progress: number;
  done?: number | null;
  total?: number | null;
  fps?: number | null;
  eta?: number | null;
}

export interface FfprobeMetadata {
  formatName: string | null;
  durationSeconds: number | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  fps?: number | null;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
}

export interface RenderProjectResult {
  renderJob: {
    id: string;
    projectId: string;
    status: string;
    progress: number;
    [key: string]: unknown;
  };
  videoPath: string;
  ffprobe?: FfprobeMetadata | null;
  artifactKind?: string | null;
}

export interface DeleteProjectResult {
  projectId: string;
  deleted: boolean;
}

export interface RenderJobRecord {
  id: string;
  projectId: string;
  engine: string;
  status: string;
  progress: number;
  outputFilePath?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface ProjectAssetWithStatus extends AssetItem {
  existsOnDisk: boolean;
  workspaceRelativePath?: string;
}

export interface WorkspaceAssetsResult {
  projectId?: string;
  projectAssets?: ProjectAssetWithStatus[];
  projectAssetFiles: string[];
  workspaceLibraryFiles: string[];
}

export interface ImportAssetResult {
  project: ProjectDetail;
  asset: AssetItem;
  copiedTo: string;
  workspaceRelativePath: string;
}

export type DeterministicAgentKind = 'story_director' | 'character_manager' | 'scene_planner';

export interface AgentRunResult {
  project: ProjectDetail;
  agent: DeterministicAgentKind;
  summary: string;
}

export interface StudioDiskConfig {
  defaultWidth: number;
  defaultHeight: number;
  defaultFps: number;
  defaultEngine: EngineId;
  density: 'comfortable' | 'compact';
  reducedEffects: boolean;
  showSafeZonesByDefault: boolean;
}

export interface ConfigResult {
  config: StudioDiskConfig;
  configPath: string;
  exists: boolean;
}

export interface PreviewServerProbeResult {
  reachable: boolean;
  baseUrl: string;
  latencyMs: number;
  statusCode: number | null;
  error: string | null;
}

export interface StageControlsApi {
  togglePlayPause: () => void;
  stepFrame: (deltaFrames: number) => void;
  stop: () => void;
}

export interface CancelRenderResult {
  projectId: string;
  cancelled: boolean;
}

export interface StudioBusyState {
  loadingList: boolean;
  loadingProject: boolean;
  creating: boolean;
  saving: boolean;
  previewing: boolean;
  rendering: boolean;
  cancelling: boolean;
}

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface DoctorCheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  summary: string;
  detail: string | null;
}

export interface DoctorReport {
  overall: CheckStatus;
  workspaceRoot: string;
  checks: DoctorCheckItem[];
  checkedAtEpochMs: number;
}

export type StudioSelection =
  | { kind: 'project'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'beat'; beatNumber: number }
  | { kind: 'character'; id: string }
  | { kind: 'part'; characterId: string; partId: string }
  | { kind: 'asset'; id: string }
  | { kind: 'action'; sceneId: string; actionId: string }
  | { kind: 'camera'; sceneId: string; index: number }
  | { kind: 'audio'; sceneId: string; index: number };

export interface WorkspaceLayoutPrefs {
  leftPanelWidth: number;
  rightPanelWidth: number;
  timelineHeight: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  timelineCollapsed: boolean;
}

export interface StudioSettingsPrefs {
  density: 'comfortable' | 'compact';
  reducedEffects: boolean;
  defaultWidth: number;
  defaultHeight: number;
  defaultFps: 24 | 30 | 60;
  defaultEngine: EngineId;
  showSafeZonesByDefault: boolean;
}

export interface RenderHistoryEntry {
  jobId: string;
  projectId: string;
  projectName: string;
  engine: string;
  status: string;
  videoPath: string;
  finishedAt: string;
  width: number;
  height: number;
  fps: number;
  error?: string;
  ffprobe?: FfprobeMetadata | null;
  artifactKind?: string | null;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'gm-player': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        controls?: boolean | '';
        autoplay?: boolean | '';
        loop?: boolean | '';
        muted?: boolean | '';
        rate?: number | string;
        data?: string;
      };
    }
  }
}
