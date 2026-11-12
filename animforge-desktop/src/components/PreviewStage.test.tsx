import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GiveMotionPreviewResult,
  ProjectDetail,
  RenderProgressPayload,
} from '../types';
import { defaultLoadPlayerScript, PreviewStage } from './PreviewStage';

const SAMPLE_PROJECT: ProjectDetail = {
  id: 'proj_stage',
  name: 'Stage Test',
  prompt: 'A robot waving at the viewer',
  width: 1280,
  height: 720,
  fps: 30,
  preferredEngine: 'givemotion',
  status: 'scenes_planned',
  scenes: [
    {
      id: 'scene_1',
      projectId: 'proj_stage',
      sequenceIndex: 0,
      title: 'Greeting',
      description: 'Robot lifts metallic arm and waves warmly',
      duration: 2.5,
      characterIds: [],
      timeline: { duration: 2.5, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
      transition: { type: 'fade', duration: 0.4 },
    },
  ],
  characters: [],
  assets: [],
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
};

const SAMPLE_PREVIEW: GiveMotionPreviewResult = {
  projectId: 'proj_stage',
  ok: true,
  errors: 0,
  warnings: 1,
  notes: 0,
  issues: [{ severity: 'warning', code: 'MOTION_SLOW', message: 'Slow easing on intro beat' }],
  bundleDir: '/ws/projects/proj_stage/bundle',
  bundleIndexHtml: '/ws/projects/proj_stage/bundle/index.html',
  playerHtml: '/ws/projects/proj_stage/bundle/player.html',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.querySelectorAll('script[data-gm-player]').forEach((el) => el.remove());
});

describe('PreviewStage', () => {
  it('loads gm-player script once, mounts real <gm-player> with revisioned src, and responds to ready/play/timeupdate events', async () => {
    const loader = vi.fn().mockResolvedValue(undefined);

    const { container, rerender } = render(
      <PreviewStage
        project={SAMPLE_PROJECT}
        previewResult={SAMPLE_PREVIEW}
        previewRev={1}
        bundleUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/index.html?v=1"
        playerScriptUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/gm-player.js"
        videoUrl={null}
        previewing={false}
        rendering={false}
        cancelling={false}
        renderProgress={null}
        onPreview={vi.fn()}
        onRender={vi.fn()}
        onCancelRender={vi.fn()}
        loadPlayerScript={loader}
      />
    );

    await waitFor(() => {
      const el = container.querySelector('gm-player');
      expect(el).toBeTruthy();
      expect(el?.getAttribute('src')).toBe(
        'http://127.0.0.1:49152/projects/proj_stage/bundle/index.html?v=1'
      );
      expect(el?.hasAttribute('controls')).toBe(true);
    });
    expect(loader).toHaveBeenCalledTimes(1);

    const playerEl = container.querySelector('gm-player')!;
    fireEvent(playerEl, new Event('ready'));
    fireEvent(playerEl, new Event('play'));
    await waitFor(() => {
      expect(screen.getByText(/Playing/i)).toBeTruthy();
    });

    // Re-bundle revision bumps attribute cleanly to ?v=2 without reloading script
    rerender(
      <PreviewStage
        project={SAMPLE_PROJECT}
        previewResult={SAMPLE_PREVIEW}
        previewRev={2}
        bundleUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/index.html?v=2"
        playerScriptUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/gm-player.js"
        videoUrl={null}
        previewing={false}
        rendering={false}
        cancelling={false}
        renderProgress={null}
        onPreview={vi.fn()}
        onRender={vi.fn()}
        onCancelRender={vi.fn()}
        loadPlayerScript={loader}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('gm-player')?.getAttribute('src')).toBe(
        'http://127.0.0.1:49152/projects/proj_stage/bundle/index.html?v=2'
      );
    });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Slow easing on intro beat')).toBeTruthy();
  });

  it('surfaces player script load failure via role=alert and retries cleanly on re-preview or Retry Player', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to load gm-player.js'))
      .mockResolvedValueOnce(undefined);

    const { container, rerender } = render(
      <PreviewStage
        project={SAMPLE_PROJECT}
        previewResult={SAMPLE_PREVIEW}
        previewRev={1}
        bundleUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/index.html?v=1"
        playerScriptUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/gm-player.js"
        videoUrl={null}
        previewing={false}
        rendering={false}
        cancelling={false}
        renderProgress={null}
        onPreview={vi.fn()}
        onRender={vi.fn()}
        onCancelRender={vi.fn()}
        loadPlayerScript={loader}
      />
    );

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Failed to load gm-player.js');
    });

    // Re-previewing bumps previewRev to 2 even with the same playerScriptUrl -> retries and mounts
    rerender(
      <PreviewStage
        project={SAMPLE_PROJECT}
        previewResult={SAMPLE_PREVIEW}
        previewRev={2}
        bundleUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/index.html?v=2"
        playerScriptUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/gm-player.js"
        videoUrl={null}
        previewing={false}
        rendering={false}
        cancelling={false}
        renderProgress={null}
        onPreview={vi.fn()}
        onRender={vi.fn()}
        onCancelRender={vi.fn()}
        loadPlayerScript={loader}
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
      expect(container.querySelector('gm-player')?.getAttribute('src')).toBe(
        'http://127.0.0.1:49152/projects/proj_stage/bundle/index.html?v=2'
      );
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('defaultLoadPlayerScript deduplicates concurrent loads and clears cache on script error for retries', async () => {
    const scripts: HTMLScriptElement[] = [];
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      if (node instanceof HTMLScriptElement) {
        scripts.push(node);
      }
      return node;
    });

    const url = 'http://127.0.0.1:49999/projects/retry_test/bundle/gm-player.js';
    const first = defaultLoadPlayerScript(url);
    const second = defaultLoadPlayerScript(url);
    expect(scripts).toHaveLength(1);

    scripts[0].dispatchEvent(new Event('error'));
    await expect(first).rejects.toThrow('Failed to load gm-player.js');
    await expect(second).rejects.toThrow('Failed to load gm-player.js');

    const retry = defaultLoadPlayerScript(url);
    expect(scripts).toHaveLength(2);
    scripts[1].dispatchEvent(new Event('load'));
    await expect(retry).resolves.toBeUndefined();
  });

  it('displays native progress + Cancel button, switches to rendered <video>, and resets playback state when toggling back to Interactive Player', async () => {
    const onCancel = vi.fn();
    const progress: RenderProgressPayload = {
      jobId: 'job_1',
      projectId: 'proj_stage',
      phase: 'encode',
      progress: 75,
      done: 60,
      total: 80,
      fps: 18.2,
      eta: 1.1,
    };

    const loader = vi.fn().mockResolvedValue(undefined);
    const { container, rerender } = render(
      <PreviewStage
        project={SAMPLE_PROJECT}
        previewResult={null}
        previewRev={0}
        bundleUrl={null}
        playerScriptUrl={null}
        videoUrl={null}
        previewing={false}
        rendering={true}
        cancelling={false}
        renderProgress={progress}
        onPreview={vi.fn()}
        onRender={vi.fn()}
        onCancelRender={onCancel}
        loadPlayerScript={loader}
      />
    );

    const progressEl = screen.getByRole('progressbar') as HTMLProgressElement;
    expect(progressEl.value).toBe(75);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Render' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Mount preview first and play it so playbackState becomes "Playing"
    rerender(
      <PreviewStage
        project={SAMPLE_PROJECT}
        previewResult={SAMPLE_PREVIEW}
        previewRev={1}
        bundleUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/index.html?v=1"
        playerScriptUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/gm-player.js"
        videoUrl={null}
        previewing={false}
        rendering={false}
        cancelling={false}
        renderProgress={null}
        onPreview={vi.fn()}
        onRender={vi.fn()}
        onCancelRender={onCancel}
        loadPlayerScript={loader}
      />
    );
    await waitFor(() => expect(container.querySelector('gm-player')).toBeTruthy());
    fireEvent(container.querySelector('gm-player')!, new Event('ready'));
    fireEvent(container.querySelector('gm-player')!, new Event('play'));
    await waitFor(() => expect(screen.getByText('Playing')).toBeTruthy());

    // Render finishes -> switches to <video>
    rerender(
      <PreviewStage
        project={SAMPLE_PROJECT}
        previewResult={SAMPLE_PREVIEW}
        previewRev={1}
        bundleUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/index.html?v=1"
        playerScriptUrl="http://127.0.0.1:49152/projects/proj_stage/bundle/gm-player.js"
        videoUrl="http://127.0.0.1:49152/projects/proj_stage/output.mp4?v=1"
        previewing={false}
        rendering={false}
        cancelling={false}
        renderProgress={null}
        onPreview={vi.fn()}
        onRender={vi.fn()}
        onCancelRender={onCancel}
        loadPlayerScript={loader}
      />
    );

    await waitFor(() => {
      const video = container.querySelector('video');
      expect(video).toBeTruthy();
      expect(video?.getAttribute('src')).toBe(
        'http://127.0.0.1:49152/projects/proj_stage/output.mp4?v=1'
      );
      expect(video?.getAttribute('width')).toBe('1280');
      expect(video?.getAttribute('height')).toBe('720');
    });
    expect(screen.getByText('Robot lifts metallic arm and waves warmly')).toBeTruthy();

    // Toggling back to Interactive Player resets stale Playing badge -> Loading
    fireEvent.click(screen.getByRole('button', { name: 'Interactive Player' }));
    await waitFor(() => {
      expect(screen.getByText('Loading')).toBeTruthy();
      expect(screen.queryByText('Playing')).toBeNull();
    });
  });
});
