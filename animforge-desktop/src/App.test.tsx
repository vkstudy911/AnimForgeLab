import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  width: 1920,
  height: 1080,
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
      duration: 5,
      characterIds: [],
      timeline: { duration: 5, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
      transition: { type: 'fade', duration: 0.4 },
    },
  ],
  characters: [
    {
      id: 'char_boy',
      name: 'Boy',
      description: 'Protagonist',
      parts: [],
      colorPalette: ['#f59e0b'],
    },
  ],
  assets: [],
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const SECOND_PROJECT: ProjectDetail = {
  ...CREATED_PROJECT,
  id: 'proj_app_2',
  name: 'Moonlight Walk',
  scenes: [
    {
      ...CREATED_PROJECT.scenes[0],
      id: 'scene_2',
      projectId: 'proj_app_2',
      title: 'Pier Stroll',
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#/home';
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
        return [
          {
            id: 'proj_app_2',
            name: 'Moonlight Walk',
            prompt: 'Moonlight stroll along pier',
            status: 'scenes_planned',
            width: 1280,
            height: 720,
            fps: 30,
            updatedAt: '2026-11-12T00:00:00.000Z',
          },
        ];
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

describe('AnimForge Studio Multi-Page Workbench', () => {
  it('renders landmark shell, switches theme, and navigates all 10 workspaces cleanly', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'AnimForge Studio' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Healthy' })).toBeTruthy();
    });

    const themeBtn = screen.getByRole('button', { name: /Theme: dark/i });
    fireEvent.click(themeBtn);
    expect(document.documentElement.dataset.resolvedTheme).toBe('light');

    const railNav = screen.getByRole('navigation', { name: 'Studio Workspaces' });
    fireEvent.click(within(railNav).getByRole('button', { name: 'Diagnostics' }));
    await waitFor(() => {
      expect(screen.getByText('OS & Arch')).toBeTruthy();
    });

    const railLabels = [
      'Projects',
      'Story & Scenes',
      'Animation Studio',
      'Character Studio',
      'Asset Library',
      'Render & Export',
      'Settings',
      'Agent Center',
      'Home',
    ];
    for (const label of railLabels) {
      fireEvent.click(within(railNav).getByRole('button', { name: label }));
    }
    expect(screen.getByRole('heading', { name: /Welcome to AnimForge Studio/i })).toBeTruthy();
  });

  it('keeps Create Project submit enabled on empty inputs in Projects page, focuses invalid input, and announces blur validation politely', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Healthy' })).toBeTruthy());

    const railNav = screen.getByRole('navigation', { name: 'Studio Workspaces' });
    fireEvent.click(within(railNav).getByRole('button', { name: 'Projects' }));

    const nameInput = screen.getByLabelText(/^Project Name/i) as HTMLInputElement;
    const submitBtn = screen.getByRole('button', { name: 'Create Project' }) as HTMLButtonElement;

    expect(submitBtn.disabled).toBe(false);
    expect(nameInput.getAttribute('aria-invalid')).toBe('false');
    expect(nameInput.getAttribute('aria-describedby')).toBeNull();

    vi.useFakeTimers();
    fireEvent.change(nameInput, { target: { value: 'Temp' } });
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.blur(nameInput);
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(500);
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
  });

  it('creates project into Studio, saves scene changes, previews <gm-player>, preserves unsaved draft when render finishes, and guards dirty project switch', async () => {
    let resolveRender!: (val: unknown) => void;

    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'run_doctor':
          return Promise.resolve({
            overall: 'PASS',
            workspaceRoot: '/Users/vipinkumar/Desktop/animator /AnimForgeLab',
            checkedAtEpochMs: 1,
            checks: [
              { id: 'os', label: 'OS & Arch', status: 'PASS', summary: 'macos (aarch64)', detail: null },
            ],
          });
        case 'get_preview_base_url':
          return Promise.resolve('http://127.0.0.1:49200');
        case 'project_list':
          return Promise.resolve([
            {
              id: 'proj_app_2',
              name: 'Moonlight Walk',
              prompt: 'Moonlight stroll',
              status: 'scenes_planned',
              width: 1280,
              height: 720,
              fps: 30,
              updatedAt: '2026-11-12T00:00:00.000Z',
            },
          ]);
        case 'project_create_from_prompt':
          return Promise.resolve({
            project: CREATED_PROJECT,
            projectDir: '/ws/projects/proj_app_1',
          });
        case 'project_load':
          return Promise.resolve(SECOND_PROJECT);
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Healthy' })).toBeTruthy());

    const railNav = screen.getByRole('navigation', { name: 'Studio Workspaces' });
    fireEvent.click(within(railNav).getByRole('button', { name: 'Projects' }));
    fireEvent.change(screen.getByLabelText(/^Project Name/i), {
      target: { value: 'Comet Chase' },
    });
    fireEvent.change(screen.getByLabelText(/^Prompt/i), {
      target: { value: 'A squirrel chasing a glowing comet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Launchpad')).toBeTruthy();
    });

    const sceneInput = screen.getByLabelText(/^Scene Title$/i) as HTMLInputElement;
    fireEvent.change(sceneInput, { target: { value: 'Liftoff Beat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_save', {
        project: expect.objectContaining({
          scenes: [expect.objectContaining({ title: 'Liftoff Beat' })],
        }),
      });
    });

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

    fireEvent.click(screen.getByRole('button', { name: 'Export MP4' }));

    // Edit scene title while render runs: finishing render MUST NOT wipe unsaved draft
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

    expect((screen.getByLabelText(/^Scene Title$/i) as HTMLInputElement).value).toBe('Unsaved Draft Title');
    expect(screen.getByText('Unsaved Changes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Switch active project' }));
    fireEvent.click(screen.getByRole('button', { name: /Moonlight Walk/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Unsaved Changes' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Pier Stroll')).toBeTruthy();
    });
  });

  it('wires Undo/Redo buttons & shortcuts, CommandPalette Studio actions, and Space/Arrow stage shortcuts while ignoring inputs', async () => {
    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'run_doctor':
          return Promise.resolve({
            overall: 'PASS',
            workspaceRoot: '/Users/vipinkumar/Desktop/animator /AnimForgeLab',
            checkedAtEpochMs: 1,
            checks: [
              { id: 'os', label: 'OS & Arch', status: 'PASS', summary: 'macos (aarch64)', detail: null },
            ],
          });
        case 'get_preview_base_url':
          return Promise.resolve('http://127.0.0.1:49200');
        case 'project_list':
          return Promise.resolve([
            {
              id: 'proj_app_1',
              name: 'Comet Chase',
              prompt: 'A squirrel chasing a glowing comet',
              status: 'scenes_planned',
              width: 1920,
              height: 1080,
              fps: 30,
              updatedAt: '2026-11-12T00:00:00.000Z',
            },
          ]);
        case 'project_load':
          return Promise.resolve(CREATED_PROJECT);
        case 'project_save':
          return Promise.resolve({
            ...(args as { project: ProjectDetail }).project,
            updatedAt: '2026-11-12T00:02:00.000Z',
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
        default:
          return Promise.resolve(null);
      }
    });

    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      if (node instanceof HTMLScriptElement) {
        queueMicrotask(() => node.dispatchEvent(new Event('load')));
      }
      return node;
    });

    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Healthy' })).toBeTruthy());

    // Open project into Studio
    fireEvent.click(screen.getByRole('button', { name: 'Switch active project' }));
    fireEvent.click(screen.getByRole('button', { name: /Comet Chase/i }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Launchpad')).toBeTruthy();
    });

    const undoBtn = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    const redoBtn = screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);

    // Edit Scene Title -> Undo/Redo buttons & Cmd+Z/Cmd+Shift+Z work
    const sceneInput = screen.getByLabelText(/^Scene Title$/i) as HTMLInputElement;
    fireEvent.change(sceneInput, { target: { value: 'Comet Orbit' } });
    expect(sceneInput.value).toBe('Comet Orbit');
    expect(undoBtn.disabled).toBe(false);

    fireEvent.click(undoBtn);
    expect(sceneInput.value).toBe('Launchpad');
    expect(redoBtn.disabled).toBe(false);

    fireEvent.click(redoBtn);
    expect(sceneInput.value).toBe('Comet Orbit');

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(sceneInput.value).toBe('Launchpad');

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(sceneInput.value).toBe('Comet Orbit');

    // Command Palette exposes Save Changes and Preview Bundle actions
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const paletteDialog = screen.getByRole('dialog', { name: 'Quick Command Palette' });
    const paletteSearch = within(paletteDialog).getByLabelText(
      'Search workspaces, projects, and scenes'
    );
    fireEvent.change(paletteSearch, { target: { value: 'Save Changes' } });
    fireEvent.click(within(paletteDialog).getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_save', {
        project: expect.objectContaining({
          scenes: [expect.objectContaining({ title: 'Comet Orbit' })],
        }),
      });
    });

    // Preview via Command Palette
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const paletteDialog2 = screen.getByRole('dialog', { name: 'Quick Command Palette' });
    fireEvent.change(
      within(paletteDialog2).getByLabelText('Search workspaces, projects, and scenes'),
      { target: { value: 'Preview Bundle' } }
    );
    fireEvent.click(within(paletteDialog2).getByRole('button', { name: /Preview Bundle/i }));

    await waitFor(() => {
      expect(container.querySelector('gm-player')).toBeTruthy();
    });

    const gmPlayer = container.querySelector('gm-player') as HTMLElement & {
      play?: () => void;
      pause?: () => void;
    };
    const playMock = vi.fn();
    gmPlayer.play = playMock;
    gmPlayer.pause = vi.fn();

    // Space inside an input must NOT toggle playback
    sceneInput.focus();
    fireEvent.keyDown(sceneInput, { key: ' ', code: 'Space' });
    expect(playMock).not.toHaveBeenCalled();

    // Space outside inputs/buttons MUST toggle registered PreviewStage playback
    (document.body as HTMLElement).focus();
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(playMock).toHaveBeenCalledTimes(1);

    // Space inside <gm-player> or <video> must NOT be hijacked by global Space shortcut
    gmPlayer.tabIndex = 0;
    gmPlayer.focus();
    const ev = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    gmPlayer.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('NewProjectDialog resets dirty inputs on Cancel, syncs Settings defaults on reopen, guards Cmd+S while open, and restores focus cleanly', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Healthy' })).toBeTruthy());

    // Change Settings default FPS to 60 and engine to Remotion first
    const railNav = screen.getByRole('navigation', { name: 'Studio Workspaces' });
    fireEvent.click(within(railNav).getByRole('button', { name: 'Settings' }));
    const settingsRegion = screen.getByRole('region', { name: 'Settings' });
    fireEvent.click(within(settingsRegion).getByRole('button', { name: '60 fps' }));
    fireEvent.click(within(settingsRegion).getByRole('button', { name: /Remotion/i }));

    // Open New Project dialog from Home
    fireEvent.click(within(railNav).getByRole('button', { name: 'Home' }));
    const newBtn = screen.getByRole('button', { name: '+ New Project' });
    newBtn.focus();
    fireEvent.click(newBtn);

    const dialog = screen.getByRole('dialog', { name: 'New Project' });
    // Segmented rows use group labels rather than unassociated <label> elements
    expect(within(dialog).getByRole('group', { name: 'Aspect Ratio' })).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'FPS' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '60', pressed: true })).toBeTruthy();
    expect((within(dialog).getByLabelText('Preferred Engine') as HTMLSelectElement).value).toBe('remotion');

    const saveCallsBefore = mockInvoke.mock.calls.filter(([c]) => c === 'project_save').length;
    fireEvent.keyDown(dialog, { key: 's', ctrlKey: true });
    expect(mockInvoke.mock.calls.filter(([c]) => c === 'project_save').length).toBe(saveCallsBefore);

    const modalName = within(dialog).getByLabelText(/Project Name/i) as HTMLInputElement;
    const modalPrompt = within(dialog).getByLabelText(/Animation Prompt/i) as HTMLTextAreaElement;
    fireEvent.change(modalName, { target: { value: 'Temporary Draft Name' } });
    fireEvent.change(modalPrompt, { target: { value: 'Temporary Draft Prompt' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'New Project' })).toBeNull();
    expect(document.activeElement).toBe(newBtn);

    // Reopen dialog: stale dirty inputs must be cleared cleanly
    fireEvent.click(newBtn);
    const reopenedDialog = screen.getByRole('dialog', { name: 'New Project' });
    expect((within(reopenedDialog).getByLabelText(/Project Name/i) as HTMLInputElement).value).toBe('');
    expect((within(reopenedDialog).getByLabelText(/Animation Prompt/i) as HTMLTextAreaElement).value).toBe('');
  });
});
