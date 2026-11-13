import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioProvider, useStudioContext } from '../context/StudioContext';
import type { ProjectDetail, ProjectSummary, RenderProgressPayload } from '../types';
import { DiagnosticsWorkspace } from './DiagnosticsWorkspace';
import { HomeDashboard } from './HomeDashboard';
import { ProjectManager } from './ProjectManager';
import { RenderWorkspace } from './RenderWorkspace';
import { SettingsWorkspace } from './SettingsWorkspace';
import { StoryScenesWorkspace } from './StoryScenesWorkspace';

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

const SAMPLE_SUMMARIES: ProjectSummary[] = [
  {
    id: 'proj_1',
    name: 'Comet Chase',
    prompt: 'A squirrel chasing a glowing comet',
    status: 'scenes_planned',
    width: 1920,
    height: 1080,
    fps: 30,
    updatedAt: '2026-11-12T10:00:00.000Z',
  },
  {
    id: 'proj_2',
    name: 'Lantern Fox',
    prompt: 'Fox crossing a twilight bridge',
    status: 'rendered',
    width: 1280,
    height: 720,
    fps: 24,
    updatedAt: '2026-11-11T09:00:00.000Z',
  },
];

function makeProjectDetail(overrides?: Partial<ProjectDetail>): ProjectDetail {
  return {
    id: 'proj_1',
    name: 'Comet Chase',
    prompt: 'A squirrel chasing a glowing comet',
    width: 1920,
    height: 1080,
    fps: 30,
    preferredEngine: 'givemotion',
    status: 'scenes_planned',
    storyboard: {
      id: 'sb_1',
      projectId: 'proj_1',
      logline: 'A squirrel leaps across twilight roofs to catch a falling star.',
      artStyle: 'Warm cel-shaded dusk',
      totalDurationSeconds: 5,
      createdAt: '2026-11-12T00:00:00.000Z',
      beats: [
        {
          beatNumber: 1,
          sceneTitle: 'Rooftop Watch',
          visualSummary: 'Squirrel spots the golden streak.',
          characterInteractions: 'Solo anticipation',
          cameraNotes: 'Slow push in',
          targetDurationSeconds: 2,
        },
      ],
    },
    scenes: [
      {
        id: 'scene_1',
        projectId: 'proj_1',
        sequenceIndex: 0,
        title: 'Launchpad',
        description: 'Squirrel prepares to leap',
        duration: 2,
        characterIds: [],
        timeline: { duration: 2, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
        transition: { type: 'fade', duration: 0.4 },
      },
      {
        id: 'scene_2',
        projectId: 'proj_1',
        sequenceIndex: 1,
        title: 'Comet Glide',
        description: 'Soaring beside the comet tail',
        duration: 3,
        characterIds: [],
        timeline: { duration: 3, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
        transition: { type: 'dissolve', duration: 0.5 },
      },
    ],
    characters: [],
    assets: [],
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T10:00:00.000Z',
    ...overrides,
  };
}

function Harness({ children }: { children: React.ReactNode }) {
  const { activeWorkspace, announcement, selectedSceneId, discardDraft } = useStudioContext();
  return (
    <div>
      <div data-testid="active-workspace">{activeWorkspace}</div>
      <div data-testid="selected-scene-id">{selectedSceneId ?? ''}</div>
      <button type="button" onClick={discardDraft}>
        Harness Discard
      </button>
      <div aria-live="polite" data-testid="live-region">
        {announcement}
      </div>
      {children}
    </div>
  );
}

function renderWithProvider(ui: React.ReactNode) {
  return render(
    <StudioProvider>
      <Harness>{ui}</Harness>
    </StudioProvider>
  );
}

let progressHandler: ((ev: { payload: RenderProgressPayload }) => void) | null = null;

beforeEach(() => {
  window.location.hash = '#/home';
  progressHandler = null;
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockListen.mockImplementation(
    async (eventName: string, cb: (ev: { payload: RenderProgressPayload }) => void) => {
      if (eventName === 'animforge://render-progress') {
        progressHandler = cb;
      }
      return vi.fn();
    }
  );

  mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case 'run_doctor':
        return {
          overall: 'PASS',
          workspaceRoot: '/Users/vipinkumar/Desktop/animator /AnimForgeLab',
          checkedAtEpochMs: 1700000000000,
          checks: [
            {
              id: 'ffmpeg',
              label: 'FFmpeg & ffprobe',
              status: 'PASS',
              summary: 'ffmpeg 9.0.1 / ffprobe 9.0.1',
              detail: null,
            },
          ],
        };
      case 'get_preview_base_url':
        return 'http://127.0.0.1:49200';
      case 'project_list':
        return SAMPLE_SUMMARIES;
      case 'project_load':
        return makeProjectDetail({ id: String(args?.projectId ?? 'proj_1') });
      case 'project_save':
        return {
          ...(args as { project: ProjectDetail }).project,
          updatedAt: '2026-11-12T12:00:00.000Z',
        };
      case 'project_create_from_prompt': {
        const input = (args as { input: Record<string, unknown> }).input;
        return {
          project: makeProjectDetail({
            id: 'proj_created',
            name: String(input.name),
            prompt: String(input.prompt),
            width: Number(input.width ?? 1920),
            height: Number(input.height ?? 1080),
            fps: Number(input.fps ?? 30),
          }),
          projectDir: '/ws/projects/proj_created',
        };
      }
      case 'project_cancel_render':
        return { projectId: String(args?.projectId ?? 'proj_1'), cancelled: true };
      case 'config_get':
        return {
          config: {
            defaultWidth: 1920,
            defaultHeight: 1080,
            defaultFps: 30,
            defaultEngine: 'givemotion',
            density: 'comfortable',
            reducedEffects: false,
            showSafeZonesByDefault: true,
          },
          configPath: '/ws/animforge.config.json',
          exists: true,
        };
      case 'config_save':
        return {
          config: (args as { config: unknown }).config,
          configPath: '/ws/animforge.config.json',
          exists: true,
        };
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

describe('Management Workspaces & Diagnostics', () => {
  it('ProjectManager validates empty inputs with accessible blur & submit feedback and submits project_create_from_prompt', async () => {
    renderWithProvider(<ProjectManager />);
    await waitFor(() => expect(screen.getByText('Comet Chase')).toBeTruthy());

    // Duplicate and Delete are now enabled and backed by worker RPCs
    expect((screen.getAllByRole('button', { name: 'Duplicate' })[0] as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getAllByRole('button', { name: 'Delete' })[0] as HTMLButtonElement).disabled).toBe(false);

    const nameInput = screen.getByRole('textbox', { name: /Project Name/ }) as HTMLInputElement;
    const promptInput = screen.getByRole('textbox', { name: /Prompt/ }) as HTMLTextAreaElement;
    const submitBtn = screen.getByRole('button', { name: 'Create Project' }) as HTMLButtonElement;

    expect(submitBtn.disabled).toBe(false);

    // 450ms blur announcement on touched empty field
    vi.useFakeTimers();
    fireEvent.change(nameInput, { target: { value: 'Temp' } });
    fireEvent.change(nameInput, { target: { value: '  ' } });
    fireEvent.blur(nameInput);
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('live-region').textContent).toContain('Enter a project name.');
    vi.useRealTimers();

    // Submit empty focuses invalid input and sets aria-describedby
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.click(submitBtn);
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    const errId = nameInput.getAttribute('aria-describedby');
    expect(errId).toBeTruthy();
    expect(document.getElementById(errId!)?.textContent).toBe('Enter a project name.');
    expect(document.activeElement).toBe(nameInput);

    // Fill valid fields, pick 9:16 + 60 FPS, and submit
    fireEvent.change(nameInput, { target: { value: 'Skyline Runner' } });
    fireEvent.change(promptInput, { target: { value: 'Parkour silhouette at sunset' } });
    fireEvent.click(screen.getByRole('button', { name: '9:16' }));
    fireEvent.click(screen.getByRole('button', { name: '60' }));
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_create_from_prompt', {
        input: {
          name: 'Skyline Runner',
          prompt: 'Parkour silhouette at sunset',
          width: 1080,
          height: 1920,
          fps: 60,
          preferredEngine: 'givemotion',
        },
      });
      expect(screen.getByTestId('active-workspace').textContent).toBe('studio');
    });
  });

  it('HomeDashboard opens a recent project in studio and navigates to diagnostics', async () => {
    renderWithProvider(<HomeDashboard />);
    await waitFor(() => expect(screen.getByText('Comet Chase')).toBeTruthy());

    const openButtons = screen.getAllByRole('button', { name: 'Open' });
    fireEvent.click(openButtons[0]);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_load', { projectId: 'proj_1' });
      expect(screen.getByTestId('active-workspace').textContent).toBe('studio');
    });

    fireEvent.click(screen.getByRole('button', { name: /passed/i }));
    expect(screen.getByTestId('active-workspace').textContent).toBe('diagnostics');
  });

  it('StoryScenesWorkspace reorders scenes, edits scene details, and saves via project_save', async () => {
    renderWithProvider(
      <>
        <HomeDashboard />
        <StoryScenesWorkspace />
      </>
    );

    await waitFor(() => expect(screen.getByText('Comet Chase')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);

    await waitFor(() => expect(screen.getByText('Storyboard Overview')).toBeTruthy());
    expect(screen.getByText(/Warm cel-shaded dusk/)).toBeTruthy();

    // Move Scene 2 ("Comet Glide") up to index 0
    fireEvent.click(screen.getByRole('button', { name: 'Move Comet Glide up' }));

    // Edit selected scene ("Launchpad") title and duration
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Ignition Beat' } });
    const durationInput = screen.getByLabelText('Duration (s)') as HTMLInputElement;
    fireEvent.change(durationInput, { target: { value: '4.5' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Save Story' })[0]);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_save', {
        project: expect.objectContaining({
          scenes: [
            expect.objectContaining({ id: 'scene_2', sequenceIndex: 0 }),
            expect.objectContaining({
              id: 'scene_1',
              sequenceIndex: 1,
              title: 'Ignition Beat',
              duration: 4.5,
            }),
          ],
        }),
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit in Studio' }));
    expect(screen.getByTestId('selected-scene-id').textContent).toBe('scene_1');
    expect(screen.getByTestId('active-workspace').textContent).toBe('studio');
  });

  it('ProjectManager duplicates, renames active clean project without reverting, confirms deletes, reveals folder, imports JSON, and edits active project settings', async () => {
    const importedDetail = makeProjectDetail({ id: 'proj_imported', name: 'Imported Comet' });
    let storedProj1 = makeProjectDetail({ id: 'proj_1' });
    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'run_doctor':
          return { overall: 'PASS', workspaceRoot: '/ws', checkedAtEpochMs: 1, checks: [] };
        case 'get_preview_base_url':
          return 'http://127.0.0.1:49200';
        case 'project_list':
          return SAMPLE_SUMMARIES.map((s) => (s.id === 'proj_1' ? { ...s, name: storedProj1.name } : s));
        case 'project_load':
          return String(args?.projectId ?? 'proj_1') === 'proj_1'
            ? structuredClone(storedProj1)
            : makeProjectDetail({ id: String(args?.projectId ?? 'proj_1') });
        case 'project_save': {
          const next = structuredClone((args as { project: ProjectDetail }).project);
          if (next.id === 'proj_1') {
            storedProj1 = { ...next, updatedAt: '2026-11-12T12:00:00.000Z' };
          }
          return {
            ...next,
            updatedAt: '2026-11-12T12:00:00.000Z',
          };
        }
        case 'project_duplicate':
          return {
            project: makeProjectDetail({ id: 'proj_copy', name: 'Comet Chase (Copy)' }),
            projectDir: '/ws/projects/proj_copy',
          };
        case 'project_delete':
          return { projectId: String(args?.projectId ?? 'proj_1'), deleted: true };
        case 'project_import':
          return {
            project: importedDetail,
            projectDir: '/ws/projects/proj_imported',
          };
        case 'reveal_in_workspace':
          return `/ws/${String(args?.path ?? '')}`;
        default:
          return null;
      }
    });

    renderWithProvider(
      <>
        <HomeDashboard />
        <div data-testid="pm-ws">
          <ProjectManager />
        </div>
      </>
    );

    const pm = within(screen.getByTestId('pm-ws'));
    await waitFor(() => expect(pm.getByText('Comet Chase')).toBeTruthy());

    // Open proj_1 first so Active Project Settings panel appears
    fireEvent.click(pm.getAllByRole('button', { name: 'Open' })[0]);
    await waitFor(() => {
      expect(pm.getByRole('heading', { name: 'Active Project Settings' })).toBeTruthy();
    });

    // Rename active clean project -> activeProject/draftProject must reload new name
    fireEvent.click(pm.getAllByRole('button', { name: 'Rename' })[0]);
    const renameInput = pm.getByLabelText('New name for Comet Chase') as HTMLInputElement;
    fireEvent.change(renameInput, { target: { value: 'Comet Velocity' } });
    fireEvent.click(pm.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(pm.getByText(/Editing open project/)).toBeTruthy();
      expect(pm.getByText('Comet Velocity')).toBeTruthy();
    });

    // NumericInput allows intermediate typing ('', '1') before valid value ('1280')
    const widthInput = pm.getByLabelText('Width (px)') as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '' } });
    expect(widthInput.value).toBe('');
    fireEvent.change(widthInput, { target: { value: '1' } });
    expect(widthInput.value).toBe('1');
    fireEvent.change(widthInput, { target: { value: '1280' } });
    fireEvent.click(pm.getByRole('button', { name: 'Save Project Settings' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_save', {
        project: expect.objectContaining({ id: 'proj_1', name: 'Comet Velocity', width: 1280 }),
      });
    });

    // Reveal Folder
    fireEvent.click(pm.getAllByRole('button', { name: 'Reveal Folder' })[0]);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('reveal_in_workspace', { path: 'projects/proj_1' });
    });

    // Duplicate
    fireEvent.click(pm.getAllByRole('button', { name: 'Duplicate' })[0]);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_duplicate', { projectId: 'proj_1' });
      expect(pm.getByText('Comet Chase (Copy)')).toBeTruthy();
    });

    // Delete with confirmation
    fireEvent.click(pm.getAllByRole('button', { name: 'Delete' })[0]);
    fireEvent.click(pm.getByRole('button', { name: 'Confirm Delete' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_delete', { projectId: 'proj_copy' });
    });

    // Malformed Import JSON shows accessible error
    const fileInput = pm.getByLabelText('Import Project JSON file') as HTMLInputElement;
    const badFile = new File(['{not json'], 'bad.animforge.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    await waitFor(() => {
      expect(pm.getByRole('alert').textContent).toMatch(/JSON|Invalid/i);
    });

    // Valid Import JSON calls project_import
    const goodFile = new File([JSON.stringify(importedDetail)], 'good.animforge.json', {
      type: 'application/json',
    });
    fireEvent.change(fileInput, { target: { files: [goodFile] } });
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_import', {
        project: expect.objectContaining({ id: 'proj_imported', name: 'Imported Comet' }),
      });
      expect(pm.getByText('Imported Comet')).toBeTruthy();
    });

    // Open Comet Velocity again so it is the active dirty project during inline rename
    const cometCard = pm.getByText('Comet Velocity').closest('li') as HTMLElement;
    fireEvent.click(within(cometCard).getByRole('button', { name: 'Open' }));
    await waitFor(() => {
      expect((pm.getByLabelText('Width (px)') as HTMLInputElement).value).toBe('1280');
    });

    // Inline rename while active project is dirty keeps new title if draft edits are discarded
    fireEvent.change(pm.getByLabelText('Width (px)'), { target: { value: '1440' } });
    fireEvent.click(within(cometCard).getByRole('button', { name: 'Rename' }));
    const dirtyRenameInput = pm.getByLabelText('New name for Comet Velocity') as HTMLInputElement;
    fireEvent.change(dirtyRenameInput, { target: { value: 'Comet Renamed Dirty' } });
    fireEvent.click(pm.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_save', {
        project: expect.objectContaining({ id: 'proj_1', name: 'Comet Renamed Dirty' }),
      });
    });
    expect(pm.getAllByText('Comet Renamed Dirty').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Harness Discard' }));
    expect((pm.getByLabelText('Width (px)') as HTMLInputElement).value).toBe('1280');
    expect(pm.getByText(/Editing open project/)).toBeTruthy();
    expect(pm.getAllByText('Comet Renamed Dirty').length).toBeGreaterThan(0);
  });

  it('StoryScenesWorkspace edits storyboard & beats, creates scene from beat, duplicates/deletes scenes, and runs deterministic agents', async () => {
    const replannedProject = makeProjectDetail({
      scenes: [
        ...makeProjectDetail().scenes,
        {
          id: 'scene_3',
          projectId: 'proj_1',
          sequenceIndex: 2,
          title: 'Starfall Finale',
          description: 'Generated beat 3',
          duration: 3,
          characterIds: [],
          timeline: { duration: 3, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
          transition: { type: 'fade', duration: 0.4 },
        },
      ],
    });
    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'run_doctor':
          return { overall: 'PASS', workspaceRoot: '/ws', checkedAtEpochMs: 1, checks: [] };
        case 'get_preview_base_url':
          return 'http://127.0.0.1:49200';
        case 'project_list':
          return SAMPLE_SUMMARIES;
        case 'project_load':
          return makeProjectDetail({ id: String(args?.projectId ?? 'proj_1') });
        case 'project_save':
          return {
            ...(args as { project: ProjectDetail }).project,
            updatedAt: '2026-11-12T12:00:00.000Z',
          };
        case 'run_deterministic_agent':
          return {
            project: replannedProject,
            agent: String(args?.agent ?? 'story_director'),
            summary: 'Applied deterministic plan.',
          };
        default:
          return null;
      }
    });

    renderWithProvider(
      <>
        <HomeDashboard />
        <div data-testid="story-ws">
          <StoryScenesWorkspace />
        </div>
      </>
    );

    const storyWs = within(screen.getByTestId('story-ws'));
    await waitFor(() => expect(screen.getByText('Comet Chase')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    await waitFor(() => expect(storyWs.getByText('Storyboard Overview')).toBeTruthy());

    // Edit storyboard logline and art style
    const loglineInput = storyWs.getByLabelText('Storyboard Logline') as HTMLTextAreaElement;
    const styleInput = storyWs.getByLabelText('Art Style') as HTMLInputElement;
    fireEvent.change(loglineInput, { target: { value: 'Updated comet quest logline.' } });
    fireEvent.change(styleInput, { target: { value: 'Watercolor Gouache' } });

    // Create Scene from Beat 1
    fireEvent.click(storyWs.getByRole('button', { name: 'Create Scene from Beat 1' }));
    expect(storyWs.getByText(/3 scenes/i)).toBeTruthy();

    // Duplicate Scene 1 and delete Scene 2
    fireEvent.click(storyWs.getByRole('button', { name: 'Duplicate selected scene' }));
    expect(storyWs.getByText(/4 scenes/i)).toBeTruthy();

    fireEvent.click(storyWs.getByRole('button', { name: 'Delete selected scene' }));
    expect(storyWs.getByText(/3 scenes/i)).toBeTruthy();

    // Save Story persists edited storyboard
    fireEvent.click(storyWs.getAllByRole('button', { name: 'Save Story' })[0]);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_save', {
        project: expect.objectContaining({
          storyboard: expect.objectContaining({
            logline: 'Updated comet quest logline.',
            artStyle: 'Watercolor Gouache',
          }),
        }),
      });
    });

    // Deterministic StoryDirector + confirmed ScenePlanner
    fireEvent.click(storyWs.getByRole('button', { name: /Regenerate Storyboard/i }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run_deterministic_agent', {
        projectId: 'proj_1',
        agent: 'story_director',
      });
    });

    fireEvent.click(storyWs.getByRole('button', { name: /Plan Scenes from Storyboard/i }));
    fireEvent.click(storyWs.getByRole('button', { name: 'Confirm Replace Scenes' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run_deterministic_agent', {
        projectId: 'proj_1',
        agent: 'scene_planner',
      });
    });
  });

  it('RenderWorkspace shows idle 0% state, tracks live renderProgress, and supports cancelRender', async () => {
    let resolveRender!: (val: unknown) => void;
    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'run_doctor':
          return {
            overall: 'PASS',
            workspaceRoot: '/ws',
            checkedAtEpochMs: 1,
            checks: [],
          };
        case 'get_preview_base_url':
          return 'http://127.0.0.1:49200';
        case 'project_list':
          return SAMPLE_SUMMARIES;
        case 'project_load':
          return makeProjectDetail({ id: String(args?.projectId ?? 'proj_1') });
        case 'project_render':
          return new Promise((res) => {
            resolveRender = res;
          });
        case 'project_cancel_render':
          return { projectId: String(args?.projectId ?? 'proj_1'), cancelled: true };
        default:
          return null;
      }
    });

    renderWithProvider(
      <>
        <HomeDashboard />
        <div data-testid="render-ws">
          <RenderWorkspace />
        </div>
      </>
    );

    const renderWs = within(screen.getByTestId('render-ws'));

    await waitFor(() => expect(screen.getByText('Comet Chase')).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);

    await waitFor(() => expect(renderWs.getByText('1920x1080')).toBeTruthy());
    expect(renderWs.getByText('Idle — Ready to Render')).toBeTruthy();
    expect(renderWs.getByText('0%')).toBeTruthy();
    expect(renderWs.queryByText(/Planned/i)).toBeNull();

    fireEvent.click(renderWs.getByRole('button', { name: 'Render MP4' }));

    await waitFor(() => expect(progressHandler).not.toBeNull());
    act(() => {
      progressHandler!({
        payload: {
          jobId: 'job_1',
          projectId: 'proj_1',
          phase: 'encoding',
          progress: 68,
          done: 41,
          total: 60,
          fps: 12.5,
          eta: 1.5,
        },
      });
    });

    expect(renderWs.getByText('68%')).toBeTruthy();
    expect(renderWs.getByText('Rendering (encoding) — 68%')).toBeTruthy();
    expect(renderWs.getByText('Frames 41 / 60')).toBeTruthy();
    expect(renderWs.getByText('12.5 fps')).toBeTruthy();
    expect(renderWs.getByText('ETA 1.5s')).toBeTruthy();

    fireEvent.click(renderWs.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_cancel_render', { projectId: 'proj_1' });
    });

    await act(async () => {
      resolveRender({
        renderJob: { id: 'job_1', projectId: 'proj_1', status: 'completed', progress: 100 },
        videoPath: '/ws/projects/proj_1/output.mp4',
      });
    });

    await waitFor(() => {
      const video = document.querySelector('video');
      expect(video?.getAttribute('src')).toBe(
        'http://127.0.0.1:49200/projects/proj_1/output.mp4?v=1'
      );
      expect(renderWs.getByText('/ws/projects/proj_1/output.mp4')).toBeTruthy();
    });
  });

  it('RenderWorkspace loads SQLite render history, edits Output Config overrides, reveals MP4, retries failed jobs, and displays ffprobe metadata', async () => {
    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'run_doctor':
          return { overall: 'PASS', workspaceRoot: '/ws', checkedAtEpochMs: 1, checks: [] };
        case 'get_preview_base_url':
          return 'http://127.0.0.1:49200';
        case 'project_list':
          return SAMPLE_SUMMARIES;
        case 'project_load':
          return makeProjectDetail({ id: String(args?.projectId ?? 'proj_1') });
        case 'project_save':
          return {
            ...(args as { project: ProjectDetail }).project,
            updatedAt: '2026-11-12T12:00:00.000Z',
          };
        case 'project_list_render_jobs':
          return [
            {
              id: 'job_hist_1',
              projectId: 'proj_1',
              engine: 'givemotion',
              status: 'completed',
              progress: 100,
              outputFilePath: '/ws/projects/proj_1/output.mp4',
              startedAt: '2026-11-12T10:00:00.000Z',
              finishedAt: '2026-11-12T10:00:12.000Z',
            },
            {
              id: 'job_hist_fail',
              projectId: 'proj_1',
              engine: 'remotion',
              status: 'failed',
              progress: 40,
              error: 'FFmpeg timed out',
              startedAt: '2026-11-12T09:00:00.000Z',
              finishedAt: '2026-11-12T09:00:05.000Z',
            },
          ];
        case 'reveal_in_workspace':
          return String(args?.path ?? '');
        case 'project_render':
          return {
            renderJob: { id: 'job_retry_1', projectId: 'proj_1', engine: 'remotion', status: 'completed', progress: 100 },
            videoPath: '/ws/projects/proj_1/output.mp4',
            ffprobe: {
              formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
              durationSeconds: 4.5,
              codec: 'h264',
              width: 1280,
              height: 720,
              fps: 60,
              hasVideoStream: true,
              hasAudioStream: false,
            },
            artifactKind: 'mp4',
          };
        default:
          return null;
      }
    });

    renderWithProvider(
      <>
        <HomeDashboard />
        <div data-testid="render-ws">
          <RenderWorkspace />
        </div>
      </>
    );

    const renderWs = within(screen.getByTestId('render-ws'));

    // Initial SQLite render history loaded
    await waitFor(() => {
      expect(renderWs.getByText('/ws/projects/proj_1/output.mp4')).toBeTruthy();
      expect(renderWs.getByText(/FFmpeg timed out/)).toBeTruthy();
    });

    // Refresh History triggers project_list_render_jobs
    fireEvent.click(renderWs.getByRole('button', { name: 'Refresh History' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_list_render_jobs', {});
    });

    // Reveal MP4 calls reveal_in_workspace
    fireEvent.click(renderWs.getByRole('button', { name: 'Reveal MP4' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('reveal_in_workspace', {
        path: '/ws/projects/proj_1/output.mp4',
      });
    });

    // Open project so Output Config becomes interactive
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    await waitFor(() => {
      expect(renderWs.getByLabelText('Width (px)')).toBeTruthy();
    });

    fireEvent.change(renderWs.getByLabelText('Width (px)'), { target: { value: '1280' } });
    fireEvent.change(renderWs.getByLabelText('Height (px)'), { target: { value: '720' } });
    fireEvent.change(renderWs.getByLabelText('FPS'), { target: { value: '60' } });
    fireEvent.change(renderWs.getByLabelText('Engine'), { target: { value: 'remotion' } });
    expect(renderWs.getByText('1280x720')).toBeTruthy();

    // Retry failed job saves dirty Output Config overrides + renders with ffprobe readout
    const retryButtons = renderWs.getAllByRole('button', { name: 'Retry' });
    fireEvent.click(retryButtons[1]);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_save', {
        project: expect.objectContaining({
          id: 'proj_1',
          width: 1280,
          height: 720,
          fps: 60,
          preferredEngine: 'remotion',
        }),
      });
      expect(mockInvoke).toHaveBeenCalledWith('project_render', { projectId: 'proj_1' });
      expect(renderWs.getByText(/h264/i)).toBeTruthy();
      expect(renderWs.getByText(/4\.5s/)).toBeTruthy();
    });
  });

  it('DiagnosticsWorkspace renders PreviewServer URL, probes live connection status, and shows DoctorBar checks', async () => {
    let probeCalls = 0;
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'run_doctor':
          return {
            overall: 'PASS',
            workspaceRoot: '/ws',
            checkedAtEpochMs: 1,
            checks: [
              { id: 'ffmpeg', label: 'FFmpeg & ffprobe', status: 'PASS', summary: 'ffmpeg 9.0.1', detail: null },
            ],
          };
        case 'get_preview_base_url':
          return 'http://127.0.0.1:49200';
        case 'probe_preview_server':
          probeCalls += 1;
          if (probeCalls === 1) {
            return {
              reachable: true,
              baseUrl: 'http://127.0.0.1:49200',
              latencyMs: 12,
              statusCode: 200,
              error: null,
            };
          }
          return {
            reachable: false,
            baseUrl: 'http://127.0.0.1:49200',
            latencyMs: 5,
            statusCode: null,
            error: 'Connection refused',
          };
        default:
          return null;
      }
    });

    renderWithProvider(<DiagnosticsWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('http://127.0.0.1:49200')).toBeTruthy();
      expect(screen.getByText('FFmpeg & ffprobe')).toBeTruthy();
      expect(screen.getByText(/Reachable \(12 ms\)/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Probe Connection' }));
    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeTruthy();
      expect(screen.getByText(/Connection refused/i)).toBeTruthy();
    });
  });

  it('HomeDashboard renders Project Statistics banner and tracks project metrics', async () => {
    renderWithProvider(<HomeDashboard />);
    await waitFor(() => expect(screen.getByText('Comet Chase')).toBeTruthy());

    // Statistics Banner
    expect(screen.getByText('Total Projects')).toBeTruthy();
    expect(screen.getByText('Scenes Planned')).toBeTruthy();
    expect(screen.getByText('Rendered / Completed')).toBeTruthy();
    expect(screen.getByText('Est. Storage')).toBeTruthy();

    const statBanner = screen.getByLabelText('Project Statistics');
    expect(within(statBanner).getByText('2')).toBeTruthy();
    expect(within(statBanner).getAllByText('1').length).toBeGreaterThanOrEqual(2);
  });

  it('ProjectManager sorts projects by Name and Date and filters by status', async () => {
    renderWithProvider(<ProjectManager />);
    await waitFor(() => expect(screen.getByText('Comet Chase')).toBeTruthy());

    const sortSelect = screen.getByLabelText('Sort projects');
    const filterSelect = screen.getByLabelText('Filter by status');

    // Filter by rendered
    fireEvent.change(filterSelect, { target: { value: 'rendered' } });
    expect(screen.getByText('Lantern Fox')).toBeTruthy();
    expect(screen.queryByText('Comet Chase')).toBeNull();

    // Filter back to all
    fireEvent.change(filterSelect, { target: { value: 'all' } });
    expect(screen.getByText('Comet Chase')).toBeTruthy();
    expect(screen.getByText('Lantern Fox')).toBeTruthy();

    // Sort by Name: Z-A
    fireEvent.change(sortSelect, { target: { value: 'name_desc' } });
    const itemsDesc = screen.getAllByRole('listitem');
    expect(within(itemsDesc[0]).getByText('Lantern Fox')).toBeTruthy();
    expect(within(itemsDesc[1]).getByText('Comet Chase')).toBeTruthy();

    // Sort by Name: A-Z
    fireEvent.change(sortSelect, { target: { value: 'name_asc' } });
    const itemsAsc = screen.getAllByRole('listitem');
    expect(within(itemsAsc[0]).getByText('Comet Chase')).toBeTruthy();
    expect(within(itemsAsc[1]).getByText('Lantern Fox')).toBeTruthy();

    // Sort by Date: Oldest first (Lantern Fox updated Nov 11, Comet Chase updated Nov 12)
    fireEvent.change(sortSelect, { target: { value: 'date_asc' } });
    const itemsOldest = screen.getAllByRole('listitem');
    expect(within(itemsOldest[0]).getByText('Lantern Fox')).toBeTruthy();
    expect(within(itemsOldest[1]).getByText('Comet Chase')).toBeTruthy();
  });

  it('SettingsWorkspace manages export defaults, triggers save notification, and persists disk configuration', async () => {
    renderWithProvider(<SettingsWorkspace />);
    await waitFor(() => expect(screen.getByText('Export Defaults')).toBeTruthy());

    // Switch export format to WEBM
    const webmBtn = screen.getByRole('button', { name: 'WEBM' });
    fireEvent.click(webmBtn);
    expect(webmBtn.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Export defaults updated successfully.')).toBeTruthy();

    // Change render quality to Draft
    const draftBtn = screen.getByRole('button', { name: /Draft \(CRF 28\)/i });
    fireEvent.click(draftBtn);
    expect(draftBtn.getAttribute('aria-pressed')).toBe('true');

    // Change export destination subfolder
    const folderInput = screen.getByLabelText('Export Destination Subfolder') as HTMLInputElement;
    fireEvent.change(folderInput, { target: { value: 'custom_renders' } });
    expect(folderInput.value).toBe('custom_renders');

    // Save to Disk persists configuration
    const saveDiskBtn = screen.getByRole('button', { name: 'Save to Disk' });
    fireEvent.click(saveDiskBtn);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('config_save', {
        config: expect.objectContaining({
          density: 'comfortable',
          defaultFps: 30,
          defaultWidth: 1920,
          defaultHeight: 1080,
        }),
      });
      expect(screen.getByText(/Studio configuration persisted to/i)).toBeTruthy();
    });

    // Reset to defaults
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    expect(screen.getByText('Configuration reset to studio factory defaults.')).toBeTruthy();
  });
});
