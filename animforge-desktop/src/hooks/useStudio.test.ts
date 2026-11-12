import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDetail, RenderProgressPayload } from '../types';
import { useStudio } from './useStudio';

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

const SAMPLE_PROJECT: ProjectDetail = {
  id: 'proj_1',
  name: 'Solar Sail',
  prompt: 'Animated solar sail unfolding in orbit',
  width: 1280,
  height: 720,
  fps: 30,
  preferredEngine: 'givemotion',
  status: 'scenes_planned',
  scenes: [
    {
      id: 'scene_1',
      projectId: 'proj_1',
      sequenceIndex: 0,
      title: 'Intro',
      description: 'Opening beat in orbit',
      duration: 3,
      characterIds: [],
      timeline: { duration: 3, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
      transition: { type: 'fade', duration: 0.5 },
    },
  ],
  characters: [],
  assets: [],
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
};

const SECOND_PROJECT: ProjectDetail = {
  ...SAMPLE_PROJECT,
  id: 'proj_2',
  name: 'Lunar Rover',
  prompt: 'Tiny rover bounces across crater',
  scenes: [{ ...SAMPLE_PROJECT.scenes[0], id: 'scene_2', projectId: 'proj_2', title: 'Landing' }],
};

describe('useStudio', () => {
  let progressHandler: ((ev: { payload: RenderProgressPayload }) => void) | null = null;
  let mockUnlisten: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockReset();
    progressHandler = null;
    mockUnlisten = vi.fn();
    mockListen.mockImplementation(
      async (_event: string, cb: (ev: { payload: RenderProgressPayload }) => void) => {
        progressHandler = cb;
        return mockUnlisten;
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads preview base url and project list on mount, creates, saves, and computes versioned preview urls', async () => {
    mockInvoke
      .mockResolvedValueOnce('http://127.0.0.1:49152') // get_preview_base_url
      .mockResolvedValueOnce([]) // project_list
      .mockResolvedValueOnce({ project: SAMPLE_PROJECT, projectDir: '/ws/projects/proj_1' }) // project_create_from_prompt
      .mockResolvedValueOnce([
        {
          id: 'proj_1',
          name: 'Solar Sail',
          prompt: 'Animated solar sail unfolding in orbit',
          status: 'scenes_planned',
          width: 1280,
          height: 720,
          fps: 30,
          updatedAt: '2026-11-11T00:00:00.000Z',
        },
      ]) // project_list refresh
      .mockResolvedValueOnce({
        ...SAMPLE_PROJECT,
        scenes: [{ ...SAMPLE_PROJECT.scenes[0], title: 'Orbit Reveal' }],
      }) // project_save
      .mockResolvedValueOnce({
        projectId: 'proj_1',
        ok: true,
        errors: 0,
        warnings: 0,
        notes: 0,
        issues: [],
        bundleDir: '/ws/projects/proj_1/bundle',
        bundleIndexHtml: '/ws/projects/proj_1/bundle/index.html',
        playerHtml: '/ws/projects/proj_1/bundle/player.html',
      }); // project_preview

    const { result, unmount } = renderHook(() => useStudio());

    await waitFor(() => {
      expect(result.current.previewBaseUrl).toBe('http://127.0.0.1:49152');
      expect(result.current.busy.loadingList).toBe(false);
    });

    await act(async () => {
      await result.current.createProject('Solar Sail', 'Animated solar sail unfolding in orbit');
    });

    expect(mockInvoke).toHaveBeenCalledWith('project_create_from_prompt', {
      input: { name: 'Solar Sail', prompt: 'Animated solar sail unfolding in orbit' },
    });
    expect(result.current.activeProject?.id).toBe('proj_1');

    await act(async () => {
      await result.current.saveSceneTitle('scene_1', 'Orbit Reveal');
    });

    expect(mockInvoke).toHaveBeenCalledWith('project_save', {
      project: expect.objectContaining({
        id: 'proj_1',
        scenes: [expect.objectContaining({ id: 'scene_1', title: 'Orbit Reveal' })],
      }),
    });
    expect(result.current.activeProject?.scenes[0].title).toBe('Orbit Reveal');

    await act(async () => {
      await result.current.previewProject();
    });

    expect(mockInvoke).toHaveBeenCalledWith('project_preview', { projectId: 'proj_1' });
    expect(result.current.bundleUrl).toBe(
      'http://127.0.0.1:49152/projects/proj_1/bundle/index.html?v=1'
    );
    expect(result.current.playerScriptUrl).toBe(
      'http://127.0.0.1:49152/projects/proj_1/bundle/gm-player.js'
    );

    unmount();
    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it('tracks live render progress for active project only, ignores other projects, supports render video url & cancellation', async () => {
    mockInvoke
      .mockResolvedValueOnce('http://127.0.0.1:50001') // get_preview_base_url
      .mockResolvedValueOnce([
        {
          id: 'proj_1',
          name: 'Solar Sail',
          prompt: 'Prompt',
          status: 'scenes_planned',
          width: 1280,
          height: 720,
          fps: 30,
          updatedAt: '2026-11-11T00:00:00.000Z',
        },
      ]) // project_list
      .mockResolvedValueOnce(SAMPLE_PROJECT); // project_load

    const { result } = renderHook(() => useStudio());
    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    await act(async () => {
      await result.current.selectProject('proj_1');
    });
    expect(result.current.activeProject?.id).toBe('proj_1');

    await act(async () => {
      progressHandler?.({
        payload: {
          jobId: 'job_other',
          projectId: 'proj_other',
          phase: 'frames',
          progress: 90,
          done: 27,
          total: 30,
          fps: 12,
          eta: 0.3,
        },
      });
    });
    expect(result.current.renderProgress).toBeNull();

    let resolveRender!: (val: unknown) => void;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'project_render') {
        return new Promise((res) => {
          resolveRender = res;
        });
      }
      if (cmd === 'project_cancel_render') {
        return Promise.resolve({ projectId: 'proj_1', cancelled: true });
      }
      return Promise.resolve(null);
    });

    let renderPromise!: Promise<boolean>;
    act(() => {
      renderPromise = result.current.renderProject();
    });

    await act(async () => {
      progressHandler?.({
        payload: {
          jobId: 'job_1',
          projectId: 'proj_1',
          phase: 'frames',
          progress: 50,
          done: 45,
          total: 90,
          fps: 15.5,
          eta: 2.9,
        },
      });
    });
    expect(result.current.renderProgress?.progress).toBe(50);
    expect(result.current.busy.rendering).toBe(true);

    await act(async () => {
      await result.current.cancelRender();
    });
    expect(mockInvoke).toHaveBeenCalledWith('project_cancel_render', { projectId: 'proj_1' });

    await act(async () => {
      resolveRender({
        renderJob: { id: 'job_1', projectId: 'proj_1', status: 'completed', progress: 100 },
        videoPath: '/ws/projects/proj_1/output.mp4',
      });
      await renderPromise;
    });

    expect(result.current.videoUrl).toBe('http://127.0.0.1:50001/projects/proj_1/output.mp4?v=1');
    expect(result.current.busy.rendering).toBe(false);
  });

  it('clears busy flags across overlapping project switches, prevents stale overwrite on A -> B -> A, and cancels actual rendering project', async () => {
    let resolveSlowPreview!: (val: unknown) => void;
    let resolveRender!: (val: unknown) => void;

    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'get_preview_base_url':
          return Promise.resolve('http://127.0.0.1:50002');
        case 'project_list':
          return Promise.resolve([
            {
              id: 'proj_1',
              name: 'Solar Sail',
              prompt: 'Prompt 1',
              status: 'scenes_planned',
              width: 1280,
              height: 720,
              fps: 30,
              updatedAt: '2026-11-11T00:00:00.000Z',
            },
            {
              id: 'proj_2',
              name: 'Lunar Rover',
              prompt: 'Prompt 2',
              status: 'scenes_planned',
              width: 1280,
              height: 720,
              fps: 30,
              updatedAt: '2026-11-11T00:00:00.000Z',
            },
          ]);
        case 'project_load':
          return Promise.resolve(
            args?.projectId === 'proj_1' ? SAMPLE_PROJECT : SECOND_PROJECT
          );
        case 'project_preview':
          return new Promise((res) => {
            resolveSlowPreview = res;
          });
        case 'project_render':
          return new Promise((res) => {
            resolveRender = res;
          });
        case 'project_cancel_render':
          return Promise.resolve({ projectId: String(args?.projectId), cancelled: true });
        default:
          return Promise.resolve(null);
      }
    });

    const { result } = renderHook(() => useStudio(), { wrapper: React.StrictMode });
    await waitFor(() => expect(result.current.busy.loadingList).toBe(false));
    expect(mockUnlisten).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.selectProject('proj_1');
    });

    let slowPreviewPromise!: Promise<unknown>;
    act(() => {
      slowPreviewPromise = result.current.previewProject();
    });
    expect(result.current.busy.previewing).toBe(true);

    // Switch A -> B -> A before first preview finishes
    await act(async () => {
      await result.current.selectProject('proj_2');
      await result.current.selectProject('proj_1');
    });
    expect(result.current.activeProject?.id).toBe('proj_1');
    expect(result.current.bundleUrl).toBeNull();

    // Old preview settles: must clear busy.previewing AND NOT attach stale bundle to fresh proj_1 visit
    await act(async () => {
      resolveSlowPreview({
        projectId: 'proj_1',
        ok: true,
        errors: 0,
        warnings: 0,
        notes: 0,
        issues: [],
        bundleDir: '/ws/projects/proj_1/bundle',
        bundleIndexHtml: '/ws/projects/proj_1/bundle/index.html',
        playerHtml: '/ws/projects/proj_1/bundle/player.html',
      });
      await slowPreviewPromise;
    });
    expect(result.current.busy.previewing).toBe(false);
    expect(result.current.bundleUrl).toBeNull();

    // Start render on proj_1, then switch to proj_2 while rendering
    let renderPromise!: Promise<boolean>;
    act(() => {
      renderPromise = result.current.renderProject();
    });
    expect(result.current.busy.rendering).toBe(true);
    expect(result.current.renderingProjectId).toBe('proj_1');

    await act(async () => {
      await result.current.selectProject('proj_2');
    });
    expect(result.current.renderingProjectId).toBe('proj_1');

    // cancelRender MUST target proj_1, not proj_2
    await act(async () => {
      await result.current.cancelRender();
    });
    expect(mockInvoke).toHaveBeenCalledWith('project_cancel_render', { projectId: 'proj_1' });

    await act(async () => {
      resolveRender({
        renderJob: { id: 'job_1', projectId: 'proj_1', status: 'completed', progress: 100 },
        videoPath: '/ws/projects/proj_1/output.mp4',
      });
      await renderPromise;
    });

    expect(result.current.busy.rendering).toBe(false);
    expect(result.current.renderingProjectId).toBeNull();
    expect(result.current.videoUrl).toBeNull();
  });

  it('prevents slow initial project_list from clobbering newly created project, handles same-tick cancel, and surfaces RENDER_CANCELLED as status', async () => {
    let resolveInitialList!: (val: unknown) => void;
    let rejectRender!: (err: unknown) => void;

    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'get_preview_base_url':
          return Promise.resolve('http://127.0.0.1:50003');
        case 'project_list':
          if (mockInvoke.mock.calls.filter(([c]) => c === 'project_list').length === 1) {
            return new Promise((res) => {
              resolveInitialList = res;
            });
          }
          return Promise.resolve([
            {
              id: 'proj_1',
              name: 'Solar Sail',
              prompt: 'Animated solar sail unfolding in orbit',
              status: 'scenes_planned',
              width: 1280,
              height: 720,
              fps: 30,
              updatedAt: '2026-11-11T00:00:00.000Z',
            },
          ]);
        case 'project_create_from_prompt':
          return Promise.resolve({ project: SAMPLE_PROJECT, projectDir: '/ws/projects/proj_1' });
        case 'project_render':
          return new Promise((_res, rej) => {
            rejectRender = rej;
          });
        case 'project_cancel_render':
          return Promise.resolve({ projectId: String(args?.projectId), cancelled: true });
        default:
          return Promise.resolve(null);
      }
    });

    const { result } = renderHook(() => useStudio());

    await act(async () => {
      await result.current.createProject('Solar Sail', 'Animated solar sail unfolding in orbit');
    });
    expect(result.current.projects).toHaveLength(1);

    // Late initial empty list resolves AFTER createProject -> must not clobber projects
    await act(async () => {
      resolveInitialList([]);
      await Promise.resolve();
    });
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].id).toBe('proj_1');

    // Same-tick double renderProject ignores second trigger while first render is still active
    let renderPromise!: Promise<boolean>;
    let duplicateResult = true;
    await act(async () => {
      renderPromise = result.current.renderProject();
      duplicateResult = await result.current.renderProject();
    });
    expect(duplicateResult).toBe(false);
    expect(mockInvoke.mock.calls.filter(([c]) => c === 'project_render')).toHaveLength(1);
    expect(result.current.busy.rendering).toBe(true);
    expect(result.current.renderingProjectId).toBe('proj_1');

    // Same-tick cancelRender resolves target project via synchronous ref
    await act(async () => {
      await result.current.cancelRender();
    });
    expect(mockInvoke).toHaveBeenCalledWith('project_cancel_render', { projectId: 'proj_1' });

    let renderOk = true;
    await act(async () => {
      rejectRender(new Error('[RENDER_CANCELLED] Render cancelled by user'));
      renderOk = await renderPromise;
    });
    expect(renderOk).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.statusMessage).toBe('Render cancelled.');
  });
});
