import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioProvider, useStudioContext } from '../context/StudioContext';
import type { ProjectDetail } from '../types';
import { AnimationEditor } from './AnimationEditor';

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

const SAMPLE_PROJECT: ProjectDetail = {
  id: 'proj_studio_1',
  name: 'Robot Greeting',
  prompt: 'A friendly robot waving under the stars',
  width: 1920,
  height: 1080,
  fps: 30,
  preferredEngine: 'givemotion',
  status: 'scenes_planned',
  characters: [
    {
      id: 'char_bot',
      name: 'Bolt',
      description: 'Friendly copper robot',
      parts: [],
      colorPalette: ['#1c2438', '#f59e0b'],
    },
  ],
  assets: [
    {
      id: 'asset_bg_1',
      name: 'Night Observatory',
      type: 'background',
      uri: '/assets/night.png',
      metadata: {},
      createdAt: '2026-11-12T00:00:00.000Z',
    },
    {
      id: 'asset_sfx_1',
      name: 'Chime SFX',
      type: 'audio',
      uri: '/assets/chime.wav',
      metadata: {},
      createdAt: '2026-11-12T00:00:00.000Z',
    },
  ],
  scenes: [
    {
      id: 'scene_1',
      projectId: 'proj_studio_1',
      sequenceIndex: 0,
      title: 'Opening Wave',
      description: 'Bolt waves warmly at the camera',
      duration: 2.5,
      characterIds: ['char_bot'],
      timeline: {
        duration: 2.5,
        fps: 30,
        characterActions: [],
        cameraMoves: [
          {
            type: 'pan',
            startX: 0,
            startY: 0,
            endX: 40,
            endY: 0,
            startZoom: 1,
            endZoom: 1.1,
            easing: 'ease-in-out',
            duration: 2.5,
          },
        ],
        audioTracks: [],
      },
      transition: { type: 'fade', duration: 0.4 },
    },
    {
      id: 'scene_2',
      projectId: 'proj_studio_1',
      sequenceIndex: 1,
      title: 'Star Gaze',
      description: 'Bolt looks up at the comet',
      duration: 3,
      characterIds: [],
      timeline: {
        duration: 3,
        fps: 30,
        characterActions: [],
        cameraMoves: [],
        audioTracks: [],
      },
      transition: { type: 'dissolve', duration: 0.5 },
    },
  ],
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

function TestHarness() {
  const { openProject } = useStudioContext();
  return (
    <>
      <button type="button" onClick={() => void openProject('proj_studio_1', 'studio')}>
        Load Test Project
      </button>
      <AnimationEditor />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  mockInvoke.mockReset();
  mockListen.mockReset();
  mockListen.mockResolvedValue(vi.fn());

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
        return [
          {
            id: SAMPLE_PROJECT.id,
            name: SAMPLE_PROJECT.name,
            prompt: SAMPLE_PROJECT.prompt,
            status: SAMPLE_PROJECT.status,
            width: SAMPLE_PROJECT.width,
            height: SAMPLE_PROJECT.height,
            fps: SAMPLE_PROJECT.fps,
            updatedAt: SAMPLE_PROJECT.updatedAt,
          },
        ];
      case 'project_load':
        return structuredClone(SAMPLE_PROJECT);
      case 'project_save': {
        const proj = (args as { project: ProjectDetail }).project;
        return {
          ...proj,
          updatedAt: '2026-11-12T01:00:00.000Z',
        };
      }
      default:
        return null;
    }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderLoadedStudio() {
  const result = render(
    <StudioProvider>
      <TestHarness />
    </StudioProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Load Test Project' }));
  await waitFor(() => {
    expect(screen.getByDisplayValue('Opening Wave')).toBeTruthy();
  });
  return result;
}

describe('AnimationEditor workspace', () => {
  it('renders empty state when no project is loaded', async () => {
    render(
      <StudioProvider>
        <AnimationEditor />
      </StudioProvider>
    );

    expect(screen.getByRole('heading', { name: 'No Project Loaded in Studio' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New Project' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Browse Projects' })).toBeTruthy();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_list');
    });
  });

  it('adds a scene, selects scenes, reorders scenes, and displays Project Info card', async () => {
    await renderLoadedStudio();

    const outliner = screen.getByLabelText('Scene Outliner Panel');
    expect(within(outliner).getByText('1920 x 1080')).toBeTruthy();
    expect(within(outliner).getByText('30')).toBeTruthy();
    expect(within(outliner).getByText('givemotion')).toBeTruthy();

    // Select Scene 2
    const scene2Btn = within(outliner).getByRole('button', { name: /^Star Gaze/i });
    fireEvent.click(scene2Btn);
    expect(scene2Btn.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByDisplayValue('Star Gaze')).toBeTruthy();

    // Move Scene 2 up -> becomes first scene
    fireEvent.click(within(outliner).getByRole('button', { name: 'Move Star Gaze up' }));
    const sceneButtonsAfterMove = within(outliner)
      .getAllByRole('button')
      .filter((btn) => btn.classList.contains('scene-card-btn'));
    expect(sceneButtonsAfterMove[0].textContent).toContain('Star Gaze');

    // Add a new scene
    fireEvent.click(within(outliner).getByRole('button', { name: '+ Add Scene' }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Scene 3')).toBeTruthy();
    });

    const timeline = screen.getByLabelText('Multi-Track Timeline');
    expect(within(timeline).getByRole('button', { name: /Scene 3/i })).toBeTruthy();
  });

  it('adds a character action in CueInspector, reflects it in MultiTrackTimeline, and saves via project_save', async () => {
    await renderLoadedStudio();

    const inspector = screen.getByLabelText('Cue Inspector Panel');
    const actionSelect = within(inspector).getByLabelText('Action');
    fireEvent.change(actionSelect, { target: { value: 'wave' } });
    fireEvent.click(within(inspector).getByRole('button', { name: 'Add Action' }));

    // Appears in Timeline Character Actions lane & opens Selected Action Cue editor
    const timeline = screen.getByLabelText('Multi-Track Timeline');
    await waitFor(() => {
      const actionClip = within(timeline).getByRole('button', { name: /Bolt: wave/i });
      expect(actionClip).toBeTruthy();
      expect(actionClip.getAttribute('aria-pressed')).toBe('true');
    });
    expect(within(inspector).getByLabelText('Selected Action Cue')).toBeTruthy();

    // Click Save Changes -> invokes project_save with the new character action
    fireEvent.click(within(inspector).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('project_save', {
        project: expect.objectContaining({
          id: 'proj_studio_1',
          scenes: expect.arrayContaining([
            expect.objectContaining({
              id: 'scene_1',
              timeline: expect.objectContaining({
                characterActions: [
                  expect.objectContaining({
                    name: 'wave',
                    parameters: { characterId: 'char_bot' },
                  }),
                ],
              }),
            }),
          ]),
        }),
      });
    });
  });

  it('switches Left tabs (Scenes / Characters / Assets) and toggles character presence and background asset', async () => {
    await renderLoadedStudio();

    const outliner = screen.getByLabelText('Scene Outliner Panel');

    // Switch to Characters tab
    fireEvent.click(within(outliner).getByRole('tab', { name: 'Characters' }));
    const charToggle = within(outliner).getByRole('button', { name: 'In Active Scene' });
    expect(charToggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(charToggle);
    expect(within(outliner).getByRole('button', { name: 'Add to Scene' }).getAttribute('aria-pressed')).toBe(
      'false'
    );

    // Switch to Assets tab
    fireEvent.click(within(outliner).getByRole('tab', { name: 'Assets' }));
    const bgBtn = within(outliner).getByRole('button', { name: 'Set Background' });
    fireEvent.click(bgBtn);
    expect(
      within(outliner).getByRole('button', { name: 'Scene Background' }).getAttribute('aria-pressed')
    ).toBe('true');

    // Switch back to Scenes tab
    fireEvent.click(within(outliner).getByRole('tab', { name: 'Scenes' }));
    expect(within(outliner).getByRole('button', { name: '+ Add Scene' })).toBeTruthy();
  });

  it('supports timeline zoom, track visibility toggles, and clicking a camera clip updates Inspector', async () => {
    await renderLoadedStudio();

    const timeline = screen.getByLabelText('Multi-Track Timeline');
    const inspector = screen.getByLabelText('Cue Inspector Panel');

    // Zoom in
    fireEvent.click(within(timeline).getByRole('button', { name: 'Zoom in timeline' }));
    expect(within(timeline).getByText('125%')).toBeTruthy();

    // Click camera clip -> opens Selected Camera Cue in Inspector
    const camClip = within(timeline).getByRole('button', { name: /pan/i });
    fireEvent.click(camClip);
    expect(within(inspector).getByLabelText('Selected Camera Cue')).toBeTruthy();

    // Toggle Camera track visibility off -> hides clip
    fireEvent.click(within(timeline).getByRole('button', { name: 'Toggle Camera track visibility' }));
    expect(within(timeline).queryByRole('button', { name: /pan/i })).toBeNull();
  });

  it('C3 SceneOutliner: seeks playhead on select, duplicates scene, blocks deleting last scene, and supports double-click inline rename', async () => {
    await renderLoadedStudio();

    const outliner = screen.getByLabelText('Scene Outliner Panel');
    const timeline = screen.getByLabelText('Multi-Track Timeline');

    // Selecting Scene 2 ("Star Gaze") seeks playhead to cumulative start time (2.5s)
    fireEvent.click(within(outliner).getByRole('button', { name: /^Star Gaze/i }));
    const ruler = within(timeline).getByRole('slider', { name: 'Timeline playhead ruler' });
    expect(ruler.getAttribute('aria-valuenow')).toBe('2.5');

    // Duplicate Scene 1 -> creates "Opening Wave Copy" right after it (3 scenes total)
    fireEvent.click(within(outliner).getByRole('button', { name: 'Duplicate Opening Wave' }));
    expect(screen.getByDisplayValue('Opening Wave Copy')).toBeTruthy();

    // Double-click inline rename on "Opening Wave Copy" -> commits on Enter, restores on Escape
    const copyCard = within(outliner).getByRole('button', { name: /^Opening Wave Copy/i });
    fireEvent.doubleClick(copyCard);
    const renameInput = within(outliner).getByLabelText('Rename scene title') as HTMLInputElement;
    fireEvent.change(renameInput, { target: { value: 'Comet Encore' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });
    expect(screen.getByDisplayValue('Comet Encore')).toBeTruthy();

    // Delete "Comet Encore" and "Star Gaze", then verify last remaining scene Delete button is disabled
    fireEvent.click(within(outliner).getByRole('button', { name: 'Delete Comet Encore' }));
    fireEvent.click(within(outliner).getByRole('button', { name: 'Delete Star Gaze' }));
    const lastDeleteBtn = within(outliner).getByRole('button', {
      name: 'Delete Opening Wave',
    }) as HTMLButtonElement;
    expect(lastDeleteBtn.disabled).toBe(true);
  });

  it('C4 CueInspector: inspects characters & assets, edits action characterId/expression, adds camera cues, and swaps/mutes audio cues', async () => {
    await renderLoadedStudio();

    const outliner = screen.getByLabelText('Scene Outliner Panel');
    const inspector = screen.getByLabelText('Cue Inspector Panel');

    // Inspecting a character renders editable character card instead of blank panel
    fireEvent.click(within(outliner).getByRole('tab', { name: 'Characters' }));
    fireEvent.click(within(outliner).getByRole('button', { name: 'Bolt' }));
    const charSection = within(inspector).getByLabelText('Selected Character Inspector');
    fireEvent.change(within(charSection).getByLabelText('Character Name'), {
      target: { value: 'Bolt Mk II' },
    });
    expect(within(outliner).getByRole('button', { name: 'Bolt Mk II' })).toBeTruthy();

    // Inspecting an asset renders editable asset card + audio cue can be added
    fireEvent.click(within(outliner).getByRole('tab', { name: 'Assets' }));
    fireEvent.click(within(outliner).getByRole('button', { name: 'Chime SFX' }));
    expect(within(inspector).getByLabelText('Selected Asset Inspector')).toBeTruthy();
    fireEvent.click(within(outliner).getByRole('button', { name: 'Add Audio Cue' }));

    // Select Audio cue on timeline -> swap asset or toggle mute
    const timeline = screen.getByLabelText('Multi-Track Timeline');
    fireEvent.click(within(timeline).getByRole('button', { name: /Chime SFX/i }));
    const audioCueSection = within(inspector).getByLabelText('Selected Audio Cue');
    const muteCheckbox = within(audioCueSection).getByLabelText('Mute audio cue') as HTMLInputElement;
    fireEvent.click(muteCheckbox);
    expect(muteCheckbox.checked).toBe(true);

    // Add Action cue -> edit characterId and smile parameter
    fireEvent.click(within(inspector).getByRole('button', { name: 'Add Action' }));
    const actionCueSection = within(inspector).getByLabelText('Selected Action Cue');
    fireEvent.change(within(actionCueSection).getByLabelText('Cue Character'), {
      target: { value: 'char_bot' },
    });
    const smileBox = within(actionCueSection).getByLabelText('Smile expression') as HTMLInputElement;
    fireEvent.click(smileBox);
    expect(smileBox.checked).toBe(true);

    // Add Camera cue -> opens second camera move with X/Y coordinates & easing
    fireEvent.click(within(inspector).getByRole('button', { name: '+ Add Camera Cue' }));
    const camCueSection = within(inspector).getByLabelText('Selected Camera Cue');
    fireEvent.change(within(camCueSection).getByLabelText('Cue Easing'), {
      target: { value: 'spring' },
    });
    fireEvent.change(within(camCueSection).getByLabelText('End X'), {
      target: { value: '120' },
    });
    expect((within(camCueSection).getByLabelText('End X') as HTMLInputElement).value).toBe('120');
  });

  it('C5 MultiTrackTimeline: supports clip drag-move, right-edge resize, Split at Playhead, Track Lock & Mute, and Delete key', async () => {
    await renderLoadedStudio();

    const inspector = screen.getByLabelText('Cue Inspector Panel');
    const timeline = screen.getByLabelText('Multi-Track Timeline');

    // JSDOM does not ship native PointerEvent, so map PointerEvent -> MouseEvent so clientX is preserved
    if (typeof globalThis.PointerEvent === 'undefined') {
      (globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
    }

    // Add a wave action starting at 0s (duration 1.5s inside 2.5s Scene 1)
    fireEvent.click(within(inspector).getByRole('button', { name: 'Add Action' }));
    const actionClip = within(timeline).getByRole('button', { name: /Bolt: wave/i });

    // Drag-move action clip right by 32px (= 0.5s at 64px/s zoom=1) -> commits on pointerUp
    fireEvent.pointerDown(actionClip, { clientX: 0, button: 0 });
    fireEvent.pointerMove(window, { clientX: 32 });
    fireEvent.pointerUp(window, { clientX: 32 });

    const startInput = within(inspector).getByLabelText('Start (s)') as HTMLInputElement;
    expect(Number(startInput.value)).toBeCloseTo(0.5, 2);

    // Right-edge resize handle grows duration from 1.5s -> 1.75s (+16px = +0.25s)
    const resizeHandle = actionClip.querySelector('.timeline-clip-handle') as HTMLElement;
    expect(resizeHandle).toBeTruthy();
    fireEvent.pointerDown(resizeHandle, { clientX: 100, button: 0 });
    fireEvent.pointerMove(window, { clientX: 116 });
    fireEvent.pointerUp(window, { clientX: 116 });
    expect(Number((within(inspector).getByLabelText('Length (s)') as HTMLInputElement).value)).toBeCloseTo(
      1.75,
      2
    );

    // Move playhead to 1.25s (inside 0.5s..2.25s action cue) and click Split at Playhead
    const ruler = within(timeline).getByRole('slider', { name: 'Timeline playhead ruler' });
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 520,
      bottom: 24,
      width: 520,
      height: 24,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    fireEvent.click(ruler, { clientX: 80 }); // 80 / 64 = 1.25s
    expect(ruler.getAttribute('aria-valuenow')).toBe('1.25');

    fireEvent.click(within(timeline).getByRole('button', { name: 'Split at Playhead' }));
    const splitClips = within(timeline).getAllByRole('button', { name: /Bolt: wave/i });
    expect(splitClips).toHaveLength(2);

    // Lock Character Actions track -> Delete key is ignored while locked
    fireEvent.click(within(timeline).getByRole('button', { name: 'Lock Character Actions track' }));
    fireEvent.keyDown(splitClips[1], { key: 'Delete' });
    expect(within(timeline).getAllByRole('button', { name: /Bolt: wave/i })).toHaveLength(2);

    // Unlock -> Delete key removes focused clip
    fireEvent.click(within(timeline).getByRole('button', { name: 'Lock Character Actions track' }));
    fireEvent.keyDown(splitClips[1], { key: 'Delete' });
    expect(within(timeline).getAllByRole('button', { name: /Bolt: wave/i })).toHaveLength(1);
  });
});
