import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDetail } from './types';
import App from './App';

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

const CREATED_PROJECT: ProjectDetail = {
  id: 'proj_app_1',
  name: 'Comet Chase',
  prompt: 'A squirrel chasing a glowing comet',
  width: 1280,
  height: 720,
  fps: 30,
  preferredEngine: 'givemotion',
  status: 'scenes_planned',
  scenes: [
    {
      id: 'scene_1',
      projectId: 'proj_app_1',
      sequenceIndex: 0,
      title: 'Launchpad',
      description: 'Squirrel leaps toward a streaking comet',
      duration: 2,
      characterIds: [],
      timeline: { duration: 2, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
      transition: { type: 'fade', duration: 0.4 },
    },
  ],
  characters: [],
  assets: [],
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockListen.mockResolvedValue(vi.fn());

  mockInvoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case 'run_doctor':
        return {
          overall: 'PASS',
          workspaceRoot: '/Users/vipinkumar/Desktop/animator /AnimForgeLab',
          checkedAtEpochMs: 1,
          checks: [
            {
              id: 'os',
              label: 'OS & Arch',
              status: 'PASS',
              summary: 'macos (aarch64)',
              detail: null,
            },
          ],
        };
      case 'get_preview_base_url':
        return 'http://127.0.0.1:49200';
      case 'project_list':
        return [];
      default:
        return null;
    }
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('App desktop shell', () => {
  it('renders AnimForge Studio landmark structure and DoctorBar', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'AnimForge Studio' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('OS & Arch')).toBeTruthy();
    });
  });

  it('keeps Create Project submit enabled on empty inputs, highlights errors on submit, and announces blur errors politely', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('OS & Arch')).toBeTruthy());

    const nameInput = screen.getByRole('textbox', { name: 'Project Name' }) as HTMLInputElement;
    expect(screen.getByLabelText(/^Project Name/)).toBe(nameInput);
    const submitBtn = screen.getByRole('button', { name: 'Create Project' }) as HTMLButtonElement;

    expect(submitBtn.disabled).toBe(false);
    expect(nameInput.getAttribute('aria-invalid')).toBe('false');
    expect(nameInput.getAttribute('aria-describedby')).toBeNull();

    // Editing to non-empty then clearing and blurring announces politely via aria-live
    vi.useFakeTimers();
    fireEvent.change(nameInput, { target: { value: 'Temp' } });
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.blur(nameInput);
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(550);
    });
    const liveEl = document.querySelector('[aria-live="polite"]');
    expect(liveEl?.textContent).toContain('Project Name');
    expect(liveEl?.textContent).toContain('Enter a project name.');
    vi.useRealTimers();

    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.click(submitBtn);

    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    const errId = nameInput.getAttribute('aria-describedby');
    expect(errId).toBeTruthy();
    expect(document.getElementById(errId!)?.textContent).toBe('Enter a project name.');
    expect(document.activeElement).toBe(nameInput);

    // Clearing input resolves error cleanly
    fireEvent.change(nameInput, { target: { value: 'Comet Chase' } });
    expect(nameInput.getAttribute('aria-invalid')).toBe('false');
  });

  it('creates project, saves edited scene title, previews <gm-player> bundle, and preserves in-progress title edits when render completes', async () => {
    let resolveRender!: (val: unknown) => void;

    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'run_doctor':
          return Promise.resolve({
            overall: 'PASS',
            workspaceRoot: '/Users/vipinkumar/Desktop/animator /AnimForgeLab',
            checkedAtEpochMs: 1,
            checks: [
              {
                id: 'os',
                label: 'OS & Arch',
                status: 'PASS',
                summary: 'macos (aarch64)',
                detail: null,
              },
            ],
          });
        case 'get_preview_base_url':
          return Promise.resolve('http://127.0.0.1:49200');
        case 'project_list':
          return Promise.resolve([]);
        case 'project_create_from_prompt':
          return Promise.resolve({
            project: CREATED_PROJECT,
            projectDir: '/ws/projects/proj_app_1',
          });
        case 'project_save':
          return Promise.resolve({
            ...(args as { project: ProjectDetail }).project,
            updatedAt: '2026-11-12T00:01:00.000Z',
          });
        case 'project_preview':
          return Promise.resolve({
            projectId: 'proj_app_1',
            ok: true,
            errors: 0,
            warnings: 0,
            notes: 0,
            issues: [],
            bundleDir: '/ws/projects/proj_app_1/bundle',
            bundleIndexHtml: '/ws/projects/proj_app_1/bundle/index.html',
            playerHtml: '/ws/projects/proj_app_1/bundle/player.html',
          });
        case 'project_render':
          return new Promise((res) => {
            resolveRender = res;
          });
        default:
          return Promise.resolve(null);
      }
    });

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText('OS & Arch')).toBeTruthy());

    fireEvent.change(screen.getByRole('textbox', { name: 'Project Name' }), {
      target: { value: 'Comet Chase' },
    });
    fireEvent.change(screen.getByLabelText(/^Animation Prompt/), {
      target: { value: 'A squirrel chasing a glowing comet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Launchpad')).toBeTruthy();
    });

    const sceneInput = screen.getByRole('textbox', { name: 'Scene Title' }) as HTMLInputElement;
    fireEvent.change(sceneInput, { target: { value: 'Liftoff Beat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Scene' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_save', {
        project: expect.objectContaining({
          scenes: [expect.objectContaining({ title: 'Liftoff Beat' })],
        }),
      });
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        'Saved scene "Liftoff Beat".'
      );
    });

    // Fixing a blur-invalid Scene Title must NOT replay stale "Saved scene ..." into live region
    vi.useFakeTimers();
    fireEvent.change(sceneInput, { target: { value: '   ' } });
    fireEvent.blur(sceneInput);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      'Scene Title: Enter a scene title.'
    );
    fireEvent.change(sceneInput, { target: { value: 'Liftoff Beat' } });
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('');
    vi.useRealTimers();

    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      if (node instanceof HTMLScriptElement) {
        queueMicrotask(() => node.dispatchEvent(new Event('load')));
      }
      return node;
    });

    fireEvent.click(screen.getByRole('button', { name: 'Preview Bundle' }));

    await waitFor(() => {
      const gmPlayer = container.querySelector('gm-player');
      expect(gmPlayer).toBeTruthy();
      expect(gmPlayer?.getAttribute('src')).toBe(
        'http://127.0.0.1:49200/projects/proj_app_1/bundle/index.html?v=1'
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Render MP4' }));

    // Edit scene title while render runs: finishing the render MUST NOT wipe the unsaved draft
    fireEvent.change(sceneInput, { target: { value: 'Unsaved Draft Title' } });

    resolveRender({
      renderJob: { id: 'job_app_1', projectId: 'proj_app_1', status: 'completed', progress: 100 },
      videoPath: '/ws/projects/proj_app_1/output.mp4',
    });

    await waitFor(() => {
      const video = container.querySelector('video');
      expect(video).toBeTruthy();
      expect(video?.getAttribute('src')).toBe(
        'http://127.0.0.1:49200/projects/proj_app_1/output.mp4?v=1'
      );
    });

    expect((screen.getByRole('textbox', { name: 'Scene Title' }) as HTMLInputElement).value).toBe(
      'Unsaved Draft Title'
    );
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('MP4 render completed.');
  });
});
