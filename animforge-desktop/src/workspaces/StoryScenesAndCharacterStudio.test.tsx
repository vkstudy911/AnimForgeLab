import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioProvider, useStudioContext } from '../context/StudioContext';
import type { ProjectDetail, ProjectSummary, WorkspaceId } from '../types';
import { CharacterStudio } from './CharacterStudio';
import { StoryScenesWorkspace } from './StoryScenesWorkspace';

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

function makeMockProject(overrides?: Partial<ProjectDetail>): ProjectDetail {
  return {
    id: 'proj_test',
    name: 'Mythic Quest',
    prompt: 'A heroic adventure in an enchanted forest',
    width: 1920,
    height: 1080,
    fps: 30,
    preferredEngine: 'givemotion',
    status: 'scenes_planned',
    storyboard: {
      id: 'sb_test',
      projectId: 'proj_test',
      logline: 'A young mage embarks on a quest across the whispering woods.',
      artStyle: 'Stylized Fantasy',
      totalDurationSeconds: 6,
      createdAt: '2026-11-13T00:00:00.000Z',
      beats: [
        {
          beatNumber: 1,
          sceneTitle: 'The Awakening',
          visualSummary: 'Hero wakes up at dawn near the sacred rune.',
          characterInteractions: 'Hero inspects glowing stone',
          cameraNotes: 'Slow tilt down',
          soundNotes: 'Morning birds and distant hum',
          targetDurationSeconds: 3,
        },
      ],
    },
    characters: [
      {
        id: 'char_hero',
        name: 'Aria Mage',
        description: 'Apprentice elementalist with a wooden staff.',
        defaultRigId: 'rig_hero',
        colorPalette: ['#38bdf8', '#818cf8'],
        parts: [
          {
            id: 'part_torso',
            name: 'Torso',
            layerName: 'torso_layer',
            pivot: { x: 120, y: 130 },
            zIndex: 0,
          },
          {
            id: 'part_head',
            name: 'Head',
            layerName: 'head_layer',
            pivot: { x: 120, y: 80 },
            zIndex: 1,
            parentPartId: 'part_torso',
          },
        ],
      },
      {
        id: 'char_mentor',
        name: 'Elder Oakhaven',
        description: 'Wise tree guardian.',
        defaultRigId: 'rig_mentor',
        colorPalette: ['#10b981'],
        parts: [
          {
            id: 'part_trunk',
            name: 'Trunk',
            layerName: 'trunk_layer',
            pivot: { x: 120, y: 140 },
            zIndex: 0,
          },
        ],
      },
    ],
    assets: [
      {
        id: 'asset_bg_forest',
        name: 'Enchanted Forest BG',
        type: 'background',
        uri: 'assets/bg_forest.png',
        metadata: {},
        createdAt: '2026-11-13T00:00:00.000Z',
      },
      {
        id: 'asset_prop_staff',
        name: 'Magic Staff',
        type: 'prop',
        uri: 'assets/staff.png',
        metadata: {},
        createdAt: '2026-11-13T00:00:00.000Z',
      },
    ],
    scenes: [
      {
        id: 'scene_s1',
        projectId: 'proj_test',
        sequenceIndex: 0,
        title: 'Forest Clearing',
        description: 'Hero steps into the sunlight',
        duration: 3,
        characterIds: ['char_hero'],
        timeline: { duration: 3, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
        transition: { type: 'fade', duration: 0.4 },
      },
      {
        id: 'scene_s2',
        projectId: 'proj_test',
        sequenceIndex: 1,
        title: 'Ancient Shrine',
        description: 'Encounter with the elder',
        duration: 3,
        characterIds: [],
        timeline: { duration: 3, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
        transition: { type: 'dissolve', duration: 0.5 },
      },
    ],
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
    ...overrides,
  };
}

const SUMMARIES: ProjectSummary[] = [
  {
    id: 'proj_test',
    name: 'Mythic Quest',
    prompt: 'A heroic adventure',
    status: 'scenes_planned',
    width: 1920,
    height: 1080,
    fps: 30,
    updatedAt: '2026-11-13T10:00:00.000Z',
  },
];

function TestHarness({
  workspace = 'story',
  children,
}: {
  workspace?: WorkspaceId;
  children: React.ReactNode;
}) {
  const { openProject, activeWorkspace, selectedSceneId, navigate } = useStudioContext();

  useEffect(() => {
    navigate(workspace);
    void openProject('proj_test', workspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div data-testid="active-workspace">{activeWorkspace}</div>
      <div data-testid="selected-scene-id">{selectedSceneId}</div>
      {children}
    </div>
  );
}

describe('StoryScenesWorkspace & CharacterStudio Phase 2 Enhancements', () => {
  beforeEach(() => {
    localStorage.clear();
    mockInvoke.mockReset();
    mockListen.mockReset();
    mockListen.mockResolvedValue(() => {});

    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'run_doctor':
          return { overall: 'PASS', workspaceRoot: '/ws', checkedAtEpochMs: 1, checks: [] };
        case 'get_preview_base_url':
          return 'http://127.0.0.1:49200';
        case 'project_list':
          return SUMMARIES;
        case 'project_load':
          return makeMockProject();
        case 'project_save':
          return {
            ...(args as { project: ProjectDetail }).project,
            updatedAt: '2026-11-13T12:00:00.000Z',
          };
        case 'run_deterministic_agent':
          return {
            project: makeMockProject(),
            agent: String(args?.agent ?? 'scene_planner'),
            summary: 'Deterministic plan complete',
          };
        default:
          return null;
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('StoryScenesWorkspace manages story beats: add beat, edit beat fields, delete beat, and create scene from beat', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="story">
          <StoryScenesWorkspace />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Storyboard Overview')).toBeTruthy();
    });

    // 1. Add Beat
    fireEvent.click(screen.getByRole('button', { name: /Add Beat/i }));
    await waitFor(() => {
      expect(screen.getByText('Beat 2: Beat 2')).toBeTruthy();
    });

    // 2. Edit Beat 2 fields
    const beat2Title = screen.getByLabelText('Beat 2 Title') as HTMLInputElement;
    fireEvent.change(beat2Title, { target: { value: 'Shadow of the Colossus' } });

    const beat2Interactions = screen.getByLabelText('Beat 2 Interactions') as HTMLInputElement;
    fireEvent.change(beat2Interactions, { target: { value: 'Aria casts a protective barrier' } });

    const beat2Camera = screen.getByLabelText('Beat 2 Camera Notes') as HTMLInputElement;
    fireEvent.change(beat2Camera, { target: { value: 'Dramatic low-angle push' } });

    const beat2Sound = screen.getByLabelText('Beat 2 Sound Notes') as HTMLInputElement;
    fireEvent.change(beat2Sound, { target: { value: 'Deep bass pulse and choir crescendo' } });

    // 3. Create Scene from Beat 2
    fireEvent.click(screen.getByRole('button', { name: 'Create Scene from Beat 2' }));
    await waitFor(() => {
      expect(screen.getByText(/3 scenes/i)).toBeTruthy();
    });

    // 4. Delete Beat 1
    const deleteBeat1Btn = screen.getByRole('button', { name: 'Delete Beat 1' });
    fireEvent.click(deleteBeat1Btn);
    await waitFor(() => {
      // Re-indexed: Beat 2 became Beat 1
      expect(screen.getByText('Beat 1: Shadow of the Colossus')).toBeTruthy();
    });
  });

  it('StoryScenesWorkspace supports character assignment, background asset selector, direct scene navigation, and keyboard shortcuts', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="story">
          <StoryScenesWorkspace />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Forest Clearing')).toBeTruthy();
    });

    // Character assignment: Aria Mage is initially assigned to scene 1
    const ariaCheckbox = screen.getByLabelText('Assign Aria Mage to scene') as HTMLInputElement;
    expect(ariaCheckbox.checked).toBe(true);

    const elderCheckbox = screen.getByLabelText('Assign Elder Oakhaven to scene') as HTMLInputElement;
    expect(elderCheckbox.checked).toBe(false);

    // Toggle Elder Oakhaven to be assigned
    fireEvent.click(elderCheckbox);
    expect(elderCheckbox.checked).toBe(true);

    // Background asset dropdown
    const bgSelect = screen.getByLabelText('Scene Background Asset') as HTMLSelectElement;
    expect(bgSelect.value).toBe('');
    fireEvent.change(bgSelect, { target: { value: 'asset_bg_forest' } });
    expect(bgSelect.value).toBe('asset_bg_forest');
    expect(screen.getByText(/Linked Asset: Enchanted Forest BG/i)).toBeTruthy();

    // Direct scene navigation buttons: Next Scene and Prev Scene
    expect(screen.getByTestId('selected-scene-id').textContent).toBe('scene_s1');
    const nextBtn = screen.getByRole('button', { name: 'Next scene' });
    fireEvent.click(nextBtn);
    expect(screen.getByTestId('selected-scene-id').textContent).toBe('scene_s2');

    const prevBtn = screen.getByRole('button', { name: 'Previous scene' });
    fireEvent.click(prevBtn);
    expect(screen.getByTestId('selected-scene-id').textContent).toBe('scene_s1');

    // Keyboard shortcut navigation: '[' and ']'
    fireEvent.keyDown(window, { key: ']' });
    expect(screen.getByTestId('selected-scene-id').textContent).toBe('scene_s2');

    fireEvent.keyDown(window, { key: '[' });
    expect(screen.getByTestId('selected-scene-id').textContent).toBe('scene_s1');
  });

  it('CharacterStudio searches cast, toggles scene appearances, and deletes character with confirmed dialog', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
      expect(screen.getByText('Elder Oakhaven')).toBeTruthy();
    });

    // 1. Search cast
    const searchInput = screen.getByLabelText('Search cast') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'Elder' } });
    expect(screen.queryByText('Aria Mage')).toBeNull();
    expect(screen.getByText('Elder Oakhaven')).toBeTruthy();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Aria Mage')).toBeTruthy();
    expect(screen.getByText('Elder Oakhaven')).toBeTruthy();

    // 2. Scene appearances checklist
    // Aria Mage is selected by default; should appear in Scene 1 but not Scene 2
    const scene1Toggle = screen.getByLabelText('Toggle Aria Mage in Scene 1') as HTMLInputElement;
    const scene2Toggle = screen.getByLabelText('Toggle Aria Mage in Scene 2') as HTMLInputElement;
    expect(scene1Toggle.checked).toBe(true);
    expect(scene2Toggle.checked).toBe(false);

    // Toggle Aria into Scene 2
    fireEvent.click(scene2Toggle);
    expect(scene2Toggle.checked).toBe(true);

    // 3. Expressions & Poses presets
    expect(screen.getByRole('button', { name: '+ Happy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Surprised' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Stand' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Wave' })).toBeTruthy();

    // 4. Delete character with confirmed dialog
    const removeBtn = screen.getByRole('button', { name: 'Remove Character' });
    fireEvent.click(removeBtn);

    // Dialog is open
    expect(screen.getByText(/Are you sure you want to delete character/i)).toBeTruthy();

    // Cancel first
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Are you sure you want to delete character/i)).toBeNull();
    expect(screen.getByText('Aria Mage')).toBeTruthy();

    // Open and Confirm Delete
    fireEvent.click(screen.getByRole('button', { name: 'Remove Character' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    // Aria Mage is deleted; Elder Oakhaven becomes active
    await waitFor(() => {
      expect(screen.queryByText('Aria Mage')).toBeNull();
      expect(screen.getByText('Elder Oakhaven')).toBeTruthy();
    });
  });
});
