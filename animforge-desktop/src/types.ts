import type React from 'react';

export interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  status: string;
  width: number;
  height: number;
  fps: number;
  updatedAt: string;
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
  timeline: {
    duration: number;
    fps: number;
    characterActions: unknown[];
    cameraMoves: unknown[];
    audioTracks: unknown[];
    [key: string]: unknown;
  };
  transition: {
    type: string;
    duration: number;
    [key: string]: unknown;
  };
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
  storyboard?: unknown;
  characters: unknown[];
  assets: unknown[];
  scenes: SceneDetail[];
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
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

export interface RenderProjectResult {
  renderJob: {
    id: string;
    projectId: string;
    status: string;
    progress: number;
    [key: string]: unknown;
  };
  videoPath: string;
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
