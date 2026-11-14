import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioProvider, useStudioContext } from '../context/StudioContext';
import type { ProjectDetail, ProjectSummary, WorkspaceId } from '../types';
import { CharacterStudio } from './CharacterStudio';

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
    id: 'proj_character_test',
    name: 'Mythic Quest',
    prompt: 'A heroic adventure',
    width: 1920,
    height: 1080,
    fps: 30,
    preferredEngine: 'givemotion',
    status: 'scenes_planned',
    characters: [
      {
        id: 'char_aria',
        name: 'Aria Mage',
        description: 'Apprentice elementalist.',
        defaultRigId: 'rig_aria',
        colorPalette: ['#38bdf8', '#818cf8'],
        engine: 'rigby2d',
        skeleton: {
          bones: [
            { id: 'b_root', name: 'root', parentIndex: null, length: 0, setup: { x: 200, y: 380, rotation: 0, scaleX: 1, scaleY: 1 } },
            { id: 'b_hip', name: 'hip', parentIndex: 0, length: 45, setup: { x: 0, y: -140, rotation: 0, scaleX: 1, scaleY: 1 } },
            { id: 'b_chest', name: 'chest', parentIndex: 1, length: 55, setup: { x: 0, y: -45, rotation: 0, scaleX: 1, scaleY: 1 } },
            { id: 'b_neck', name: 'neck', parentIndex: 2, length: 18, setup: { x: 0, y: -55, rotation: 0, scaleX: 1, scaleY: 1 } },
            { id: 'b_head', name: 'head', parentIndex: 3, length: 50, setup: { x: 0, y: -18, rotation: 0, scaleX: 1, scaleY: 1 }, color: '#f59e0b' },
          ],
          slots: [],
          ik: [],
        },
        animations: {
          idle: { name: 'idle', duration: 2.0, fps: 30, bones: {} },
        },
        parts: [
          { id: 'part_torso', name: 'Torso', layerName: 'torso_layer', pivot: { x: 120, y: 130 }, zIndex: 0 },
          { id: 'part_head', name: 'Head', layerName: 'head_layer', pivot: { x: 120, y: 80 }, zIndex: 1, parentPartId: 'part_torso' },
        ],
      },
      {
        id: 'char_elder',
        name: 'Elder Oakhaven',
        description: 'Wise tree guardian.',
        defaultRigId: 'rig_elder',
        colorPalette: ['#10b981'],
        parts: [
          { id: 'part_trunk', name: 'Trunk', layerName: 'trunk_layer', pivot: { x: 120, y: 140 }, zIndex: 0 },
        ],
      },
    ],
    scenes: [
      {
        id: 'scene_1',
        projectId: 'proj_character_test',
        sequenceIndex: 0,
        title: 'Forest Clearing',
        description: 'Hero steps into the sunlight',
        duration: 3,
        characterIds: ['char_aria'],
        timeline: { duration: 3, fps: 30, characterActions: [], cameraMoves: [], audioTracks: [] },
        transition: { type: 'fade', duration: 0.4 },
      },
    ],
    assets: [],
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
    ...overrides,
  };
}

const SUMMARIES: ProjectSummary[] = [
  {
    id: 'proj_character_test',
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
  workspace = 'characters',
  children,
}: {
  workspace?: WorkspaceId;
  children: React.ReactNode;
}) {
  const { openProject, activeWorkspace, navigate } = useStudioContext();

  useEffect(() => {
    navigate(workspace);
    void openProject('proj_character_test', workspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div data-testid="active-workspace">{activeWorkspace}</div>
      {children}
    </div>
  );
}

describe('CharacterStudio Workspace & Rigby2D Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    mockInvoke.mockReset();
    mockListen.mockReset();
    mockListen.mockResolvedValue(() => {});

    // Stub canvas context to avoid jsdom getContext not implemented error
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn(() => ({ width: 40 })),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      drawImage: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'run_doctor':
          return { overall: 'PASS', workspaceRoot: '/ws', checkedAtEpochMs: 1, checks: [] };
        case 'project_list':
          return SUMMARIES;
        case 'project_load':
          return makeMockProject();
        case 'project_save':
          return {
            ...(args as { project: ProjectDetail }).project,
            updatedAt: '2026-11-13T12:00:00.000Z',
          };
        case 'character_invoke':
          return { status: 'success', data: {} };
        default:
          return {};
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Character Studio header with Rigby2D engine badge and action buttons', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Character Studio')).toBeTruthy();
      expect(screen.getByText('Rigby2D Skeletal Engine')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: /Auto-Rig Artwork/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export Spine JSON' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export Character' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import JSON' })).toBeTruthy();
  });

  it('toggles viewport overlays and canvas display controls', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    // Check overlay toggle buttons
    const bonesToggle = screen.getByLabelText('Toggle bones overlay');
    const meshesToggle = screen.getByLabelText('Toggle meshes overlay');
    const partsToggle = screen.getByLabelText('Toggle parts overlay');
    const ikToggle = screen.getByLabelText('Toggle IK handles');

    expect(bonesToggle).toBeTruthy();
    expect(meshesToggle).toBeTruthy();
    expect(partsToggle).toBeTruthy();
    expect(ikToggle).toBeTruthy();

    fireEvent.click(bonesToggle);
    fireEvent.click(meshesToggle);
    fireEvent.click(partsToggle);
    fireEvent.click(ikToggle);

    // Zoom controls
    const zoomInBtn = screen.getByTitle('Zoom in');
    const zoomOutBtn = screen.getByTitle('Zoom out');
    const resetZoomBtn = screen.getByRole('button', { name: 'Reset' });

    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomOutBtn);
    fireEvent.click(resetZoomBtn);

    // Canvas element exists
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('navigates bone hierarchy, adds a bone, and updates bone inspector properties', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    // Initial default skeleton bones
    expect(screen.getByText('root')).toBeTruthy();
    expect(screen.getAllByText('hip').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('chest')).toBeTruthy();
    expect(screen.getByText('head')).toBeTruthy();

    // Select bone "head"
    fireEvent.click(screen.getByText('head'));

    // Bone inspector should be visible
    expect(screen.getByText('Bone Inspector')).toBeTruthy();

    // Add bone
    const addBoneBtn = screen.getByRole('button', { name: '+ Add Bone' });
    fireEvent.click(addBoneBtn);

    // New bone should be created and listed
    await waitFor(() => {
      expect(screen.getAllByText(/bone_\d+/).length).toBeGreaterThanOrEqual(1);
    });

    // Edit Setup X, Setup Y, Rotation
    const setupXInput = screen.getByLabelText('Setup X') as HTMLInputElement;
    fireEvent.change(setupXInput, { target: { value: '15' } });
    expect(setupXInput.value).toBe('15');
  });

  it('controls timeline animation transport, scrubber and AI motion planner generation', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    // Timeline transport play / pause
    const playBtn = screen.getByLabelText('Play Animation');
    fireEvent.click(playBtn);
    expect(screen.getByLabelText('Pause Animation')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Pause Animation'));
    expect(screen.getByLabelText('Play Animation')).toBeTruthy();

    // Timeline scrubber
    const scrubber = screen.getByRole('slider', { name: 'Animation playhead scrubber' }) as HTMLInputElement;
    fireEvent.change(scrubber, { target: { value: '1.5' } });
    expect(scrubber.value).toBe('1.5');

    // AI Motion Generator
    const motionSelect = screen.getByLabelText('Select AI motion preset') as HTMLSelectElement;
    fireEvent.change(motionSelect, { target: { value: 'wave' } });
    expect(motionSelect.value).toBe('wave');

    const generateMotionBtn = screen.getByRole('button', { name: 'Generate Motion' });
    fireEvent.click(generateMotionBtn);

    // A new clip should be added and active
    await waitFor(() => {
      expect(screen.getByText('wave')).toBeTruthy();
    });

    // Expression & Pose Presets
    const happyPreset = screen.getByRole('button', { name: '+ Happy' });
    fireEvent.click(happyPreset);
  });

  it('triggers Spine JSON and Character export actions without error', async () => {
    // Mock URL.createObjectURL and revokeObjectURL
    const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
    const mockRevokeObjectURL = vi.fn();
    window.URL.createObjectURL = mockCreateObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL;

    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    const exportSpineBtn = screen.getByRole('button', { name: 'Export Spine JSON' });
    fireEvent.click(exportSpineBtn);
    expect(mockCreateObjectURL).toHaveBeenCalled();

    const exportCharBtn = screen.getByRole('button', { name: 'Export Character' });
    fireEvent.click(exportCharBtn);
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(2);
  });

  it('switches characters and updates left panel, viewport status, and character properties', async () => {
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

    // Default character is Aria Mage
    expect(screen.getByText(/Active Character:\s*Aria Mage/)).toBeTruthy();

    // Switch to Elder Oakhaven
    fireEvent.click(screen.getByText('Elder Oakhaven'));

    // Header updates to Elder Oakhaven
    await waitFor(() => {
      expect(screen.getByText(/Active Character:\s*Elder Oakhaven/)).toBeTruthy();
    });

    // Character Properties displays Elder Oakhaven
    const nameInput = screen.getByLabelText('Character Name') as HTMLInputElement;
    expect(nameInput.value).toBe('Elder Oakhaven');
  });

  it('displays contextual inspector exclusively for bone, part, and character without simultaneous stacking', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    // 1. Initial state: Character Properties is displayed; Bone Inspector and Part Inspector are NOT displayed
    expect(screen.getByText('Character Properties')).toBeTruthy();
    expect(screen.queryByText('Bone Inspector')).toBeNull();
    expect(screen.queryByText(/Part Inspector:/)).toBeNull();

    // 2. Select bone "head" -> Only Bone Inspector is displayed
    fireEvent.click(screen.getByText('head'));
    expect(screen.getByText('Bone Inspector')).toBeTruthy();
    expect(screen.queryByText('Character Properties')).toBeNull();
    expect(screen.queryByText(/Part Inspector:/)).toBeNull();

    // 3. Select an artwork part (e.g. Torso in layers tab) -> Only Part Inspector is displayed
    fireEvent.click(screen.getAllByText('Torso')[0]);
    expect(screen.getByText(/Part Inspector:\s*Torso/)).toBeTruthy();
    expect(screen.queryByText('Bone Inspector')).toBeNull();
    expect(screen.queryByText('Character Properties')).toBeNull();

    // 4. Return to Character Properties via back button
    const backBtn = screen.getByRole('button', { name: '← Character' });
    fireEvent.click(backBtn);
    expect(screen.getByText('Character Properties')).toBeTruthy();
    expect(screen.queryByText('Bone Inspector')).toBeNull();
    expect(screen.queryByText(/Part Inspector:/)).toBeNull();
  });

  it('switches editing modes (Design, Rig, Animate) adjusting tool context without destroying state', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    const designModeBtn = screen.getByRole('button', { name: 'Design' });
    const rigModeBtn = screen.getByRole('button', { name: 'Rig' });
    const animateModeBtn = screen.getByRole('button', { name: 'Animate' });

    // Switch to Rig mode
    fireEvent.click(rigModeBtn);
    expect(screen.getByText('Bone Inspector')).toBeTruthy();

    // Switch to Animate mode
    fireEvent.click(animateModeBtn);
    expect(screen.getByRole('slider', { name: 'Animation playhead scrubber' })).toBeTruthy();

    // Switch back to Design mode
    fireEvent.click(designModeBtn);
    expect(screen.getByText('Aria Mage')).toBeTruthy();
  });

  it('supports viewport fit to character, zoom in/out, and reset view', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    const fitBtn = screen.getByRole('button', { name: 'Fit' });
    const zoomInBtn = screen.getByTitle('Zoom in');
    const zoomOutBtn = screen.getByTitle('Zoom out');
    const resetBtn = screen.getByRole('button', { name: 'Reset' });

    fireEvent.click(fitBtn);
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomOutBtn);
    fireEvent.click(resetBtn);

    // Viewport canvas remains intact
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('renders Simple PNG Animation Studio default screen with 9 visual animation cards, duration slider and export CTA', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    // Simple Studio header & actions
    expect(screen.getByRole('button', { name: /Simple Studio/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Advanced Rig Editor/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import PNG' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Export Video/i }).length).toBeGreaterThanOrEqual(1);

    // 9 Visual Animation Cards are present
    const cardNames = ['Idle', 'Walk', 'Run', 'Dance', 'Jump', 'Wave', 'Happy', 'Sad', 'Surprise'];
    for (const name of cardNames) {
      expect(screen.getByRole('button', { name: `Animation card: ${name}` })).toBeTruthy();
    }

    // Transport controls
    expect(screen.getByRole('button', { name: 'Play Preview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Toggle preview loop/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Preview playhead scrubber' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Animation duration slider' })).toBeTruthy();
  });

  it('immediately applies animation and triggers playback when clicking Dance visual card', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    const danceCard = screen.getByRole('button', { name: 'Animation card: Dance' });
    fireEvent.click(danceCard);

    // Active motion updates to DANCE
    expect(screen.getByText('DANCE')).toBeTruthy();
    // Playback is active
    expect(screen.getByRole('button', { name: 'Pause Preview' })).toBeTruthy();
  });

  it('adjusts duration slider from 2s to 30s updating timeline limits', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    const durationSlider = screen.getByRole('slider', { name: 'Animation duration slider' }) as HTMLInputElement;
    fireEvent.change(durationSlider, { target: { value: '10' } });
    expect(durationSlider.value).toBe('10');
    expect(screen.getByText('10.0s')).toBeTruthy();
  });

  it('imports transparent PNG, displays auto-preparation report with landmarks and prepares Smart Character Rig', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    const pngInput = screen.getByLabelText('Import Character PNG') as HTMLInputElement;
    const samplePng = new File(['fake-png-data'], 'cyber_knight.png', { type: 'image/png' });

    fireEvent.change(pngInput, { target: { files: [samplePng] } });

    // Auto-preparation report dialog opens
    await waitFor(() => {
      expect(screen.getByText('Automatic Character Preparation Report')).toBeTruthy();
      expect(screen.getByText('cyber_knight.png')).toBeTruthy();
      expect(screen.getByText(/95% Confidence/i)).toBeTruthy();
      expect(screen.getAllByText(/Smart Character Rig/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Quick Animate/i).length).toBeGreaterThanOrEqual(1);
    });

    // Confirm auto-preparation
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Animate/i });
    fireEvent.click(confirmBtn);

    // Dialog closes and new character becomes active
    await waitFor(() => {
      expect(screen.queryByText('Automatic Character Preparation Report')).toBeNull();
      expect(screen.getByText('cyber_knight')).toBeTruthy();
    });
  });

  it('detects opaque PNG and recommends Quick Animate whole-image transform', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    const pngInput = screen.getByLabelText('Import Character PNG') as HTMLInputElement;
    const opaqueFile = new File(['fake-opaque-data'], 'badge_opaque.png', { type: 'image/png' });

    fireEvent.change(pngInput, { target: { files: [opaqueFile] } });

    await waitFor(() => {
      expect(screen.getByText('Automatic Character Preparation Report')).toBeTruthy();
      expect(screen.getByText(/Opaque background detected/i)).toBeTruthy();
      expect(screen.getAllByText(/Whole-Image Transform/i).length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Automatic Character Preparation Report')).toBeNull();
  });

  it('opens Export Video dialog, chooses format & resolution, and performs video export', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    const exportBtn = screen.getAllByRole('button', { name: /Export Video/i })[0];
    fireEvent.click(exportBtn);

    // Export dialog opens
    expect(screen.getByText('Export Character Animation Video')).toBeTruthy();
    expect(screen.getByText(/Full HD/i)).toBeTruthy();

    // Select GIF format
    const gifBtn = screen.getByRole('button', { name: 'GIF' });
    fireEvent.click(gifBtn);

    // Click Export GIF
    const startExportBtn = screen.getByRole('button', { name: 'Export GIF' });
    fireEvent.click(startExportBtn);

    // Export completes
    await waitFor(() => {
      expect(screen.getByText('Video Export Complete!')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Export Character Animation Video')).toBeNull();
  });

  it('switches between Simple Studio and Advanced Rig Editor cleanly', async () => {
    render(
      <StudioProvider>
        <TestHarness workspace="characters">
          <CharacterStudio />
        </TestHarness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Aria Mage')).toBeTruthy();
    });

    const advancedBtn = screen.getByRole('button', { name: /Advanced Rig Editor/i });
    const simpleBtn = screen.getByRole('button', { name: /Simple Studio/i });

    // Switch to Advanced
    fireEvent.click(advancedBtn);
    expect(screen.getByRole('slider', { name: 'Animation playhead scrubber' })).toBeTruthy();

    // Switch back to Simple
    fireEvent.click(simpleBtn);
    expect(screen.getByRole('slider', { name: 'Preview playhead scrubber' })).toBeTruthy();
  });
});
