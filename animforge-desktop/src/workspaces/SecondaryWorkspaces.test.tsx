import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioProvider, useStudioContext } from '../context/StudioContext';
import type { ProjectDetail, WorkspaceId } from '../types';
import { AgentCenterWorkspace } from './AgentCenterWorkspace';
import { AssetLibrary } from './AssetLibrary';
import { CharacterStudio } from './CharacterStudio';
import { SettingsWorkspace } from './SettingsWorkspace';

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

function makeSampleProject(): ProjectDetail {
  return {
    id: 'proj_sec_1',
    name: 'Moonlight Walk',
    prompt: 'A fox walks under a glowing moon',
    width: 1920,
    height: 1080,
    fps: 30,
    preferredEngine: 'givemotion',
    status: 'scenes_planned',
    storyboard: {
      id: 'sb_1',
      projectId: 'proj_sec_1',
      logline: 'A curious fox explores a neon moonlit rooftop.',
      artStyle: 'Painterly 2D',
      totalDurationSeconds: 6,
      createdAt: '2026-11-12T00:00:00.000Z',
      beats: [
        {
          beatNumber: 1,
          sceneTitle: 'Rooftop Arrival',
          visualSummary: 'Fox steps onto the ledge.',
          characterInteractions: 'Fox looks around.',
          cameraNotes: 'Slow push in',
          targetDurationSeconds: 3,
        },
        {
          beatNumber: 2,
          sceneTitle: 'Moon Gaze',
          visualSummary: 'Fox waves at the moon.',
          characterInteractions: 'Fox waves paw.',
          cameraNotes: 'Static wide',
          targetDurationSeconds: 3,
        },
      ],
    },
    characters: [
      {
        id: 'char_fox',
        name: 'Pip Fox',
        description: 'Amber desert fox',
        defaultRigId: 'rig-fox-v1',
        colorPalette: ['#f59e0b', '#1e293b'],
        parts: [
          {
            id: 'part_body',
            name: 'Body',
            layerName: 'fox_body',
            pivot: { x: 120, y: 140 },
            zIndex: 0,
          },
          {
            id: 'part_head',
            name: 'Head',
            layerName: 'fox_head',
            pivot: { x: 120, y: 80 },
            zIndex: 1,
            parentPartId: 'part_body',
          },
        ],
      },
    ],
    assets: [
      {
        id: 'asset_bg_1',
        name: 'Moonlit Roof',
        type: 'background',
        uri: 'assets/backgrounds/moon_roof.png',
        mimeType: 'image/png',
        metadata: {},
        createdAt: '2026-11-12T00:00:00.000Z',
      },
      {
        id: 'asset_sfx_1',
        name: 'Night Wind',
        type: 'audio',
        uri: 'assets/audio/night_wind.mp3',
        mimeType: 'audio/mpeg',
        metadata: {},
        createdAt: '2026-11-12T00:00:00.000Z',
      },
    ],
    scenes: [
      {
        id: 'scene_1',
        projectId: 'proj_sec_1',
        sequenceIndex: 0,
        title: 'Rooftop Arrival',
        description: 'Fox arrives on the roof',
        duration: 3,
        characterIds: ['char_fox'],
        timeline: {
          duration: 3,
          fps: 30,
          characterActions: [],
          cameraMoves: [],
          audioTracks: [],
        },
        transition: { type: 'fade', duration: 0.4 },
      },
    ],
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  };
}

function Harness({
  workspace,
  autoLoadProject = true,
  children,
}: {
  workspace: WorkspaceId;
  autoLoadProject?: boolean;
  children: React.ReactNode;
}) {
  const { openProject, activeWorkspace, navigate } = useStudioContext();

  useEffect(() => {
    navigate(workspace);
    if (autoLoadProject) {
      void openProject('proj_sec_1', workspace);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <span data-testid="active-workspace">{activeWorkspace}</span>
      {children}
    </div>
  );
}

let currentStoredProject: ProjectDetail;

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  document.documentElement.dataset.themePref = '';
  document.documentElement.dataset.resolvedTheme = '';
  document.documentElement.dataset.density = '';
  currentStoredProject = makeSampleProject();

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  mockInvoke.mockReset();
  mockListen.mockReset();
  mockListen.mockResolvedValue(vi.fn());

  mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case 'run_doctor':
        return {
          overall: 'PASS',
          workspaceRoot: '/Users/vipinkumar/Desktop/animator /AnimForgeLab',
          checkedAtEpochMs: 1,
          checks: [],
        };
      case 'get_preview_base_url':
        return 'http://127.0.0.1:49200';
      case 'project_list':
        return [
          {
            id: currentStoredProject.id,
            name: currentStoredProject.name,
            prompt: currentStoredProject.prompt,
            status: currentStoredProject.status,
            width: currentStoredProject.width,
            height: currentStoredProject.height,
            fps: currentStoredProject.fps,
            updatedAt: currentStoredProject.updatedAt,
          },
        ];
      case 'project_load':
        return structuredClone(currentStoredProject);
      case 'project_save': {
        const next = args?.project as ProjectDetail;
        currentStoredProject = {
          ...structuredClone(next),
          updatedAt: new Date(Date.now() + 1000).toISOString(),
        };
        return structuredClone(currentStoredProject);
      }
      case 'project_assets_list':
        return {
          projectId: currentStoredProject.id,
          projectAssets: currentStoredProject.assets.map((asset) => ({
            ...asset,
            existsOnDisk: asset.id === 'asset_bg_1' || asset.uri === 'assets/hero.png',
            workspaceRelativePath:
              asset.uri === 'assets/hero.png'
                ? 'projects/proj_sec_1/assets/hero.png'
                : asset.uri,
          })),
          projectAssetFiles: ['projects/proj_sec_1/assets/backgrounds/moon_roof.png'],
          workspaceLibraryFiles: ['assets/props/lantern.png'],
        };
      case 'project_import_asset': {
        const nextProject = {
          ...structuredClone(currentStoredProject),
          assets: [
            ...structuredClone(currentStoredProject.assets),
            {
              id: 'asset_ws_lantern',
              name: 'lantern.png',
              type: 'prop' as const,
              uri: 'assets/lantern.png',
              metadata: {},
              createdAt: '2026-11-12T00:00:00.000Z',
            },
          ],
        };
        currentStoredProject = nextProject;
        return {
          project: structuredClone(nextProject),
          asset: {
            id: 'asset_ws_lantern',
            name: 'lantern.png',
            type: 'prop',
            uri: 'assets/lantern.png',
            metadata: {},
            createdAt: '2026-11-12T00:00:00.000Z',
          },
          copiedTo: '/ws/projects/proj_sec_1/assets/lantern.png',
          workspaceRelativePath: 'projects/proj_sec_1/assets/lantern.png',
        };
      }
      case 'project_import_asset_bytes': {
        if (!args?.confirmOverwrite) {
          throw new Error("CONFLICT: Asset 'assets/hero.png' already exists; pass confirmOverwrite: true to replace");
        }
        const nextProject = {
          ...structuredClone(currentStoredProject),
          assets: [
            ...structuredClone(currentStoredProject.assets),
            {
              id: 'asset_uploaded_1',
              name: String(args?.name ?? 'hero.png'),
              type: (args?.assetType ?? 'character') as ProjectDetail['assets'][number]['type'],
              uri: 'assets/hero.png',
              metadata: {},
              createdAt: '2026-11-12T00:00:00.000Z',
            },
          ],
        };
        currentStoredProject = nextProject;
        return {
          project: structuredClone(nextProject),
          asset: {
            id: 'asset_uploaded_1',
            name: String(args?.name ?? 'hero.png'),
            type: String(args?.assetType ?? 'character'),
            uri: 'assets/hero.png',
            metadata: {},
            createdAt: '2026-11-12T00:00:00.000Z',
          },
          copiedTo: '/ws/projects/proj_sec_1/assets/hero.png',
          workspaceRelativePath: 'projects/proj_sec_1/assets/hero.png',
        };
      }
      case 'config_save':
        return {
          config: args?.config,
          configPath: '/ws/animforge.config.json',
          exists: true,
        };
      case 'run_deterministic_agent':
        return {
          project: structuredClone(currentStoredProject),
          agent: String(args?.agent ?? 'story_director'),
          summary: `Ran ${String(args?.agent ?? 'story_director')}.`,
        };
      case 'reveal_in_workspace':
        return `/ws/${String(args?.path ?? '')}`;
      default:
        return null;
    }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Secondary Workspaces', () => {
  it('CharacterStudio adds a character, edits rig parts, saves via project_save, and dispatches quick action', async () => {
    render(
      <StudioProvider>
        <Harness workspace="characters">
          <CharacterStudio />
        </Harness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Pip Fox')).toBeTruthy();
    });

    expect(screen.getByText(/StretchyStudio/i)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Rig schematic for Pip Fox' })).toBeTruthy();

    const svgEl = screen.getByRole('img', { name: 'Rig schematic for Pip Fox' }) as unknown as SVGSVGElement;
    vi.spyOn(svgEl, 'getBoundingClientRect').mockReturnValue({
      width: 320,
      height: 240,
      top: 0,
      left: 0,
      right: 320,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Pointer drag SVG pivot node uses uniform min(w, h) scaling and updates Pivot X/Y on pointerup
    if (typeof globalThis.PointerEvent === 'undefined') {
      (globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
    }
    const headHandle = screen.getByRole('button', { name: /Select part Head/i });
    fireEvent.pointerDown(headHandle, { clientX: 120, clientY: 80, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 145, clientY: 95, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 145, clientY: 95, pointerId: 1 });
    expect((screen.getByLabelText('Pivot X') as HTMLInputElement).value).toBe('145');
    expect((screen.getByLabelText('Pivot Y') as HTMLInputElement).value).toBe('95');

    // Keyboard ArrowRight nudge stops propagation & increments Pivot X cleanly
    fireEvent.keyDown(headHandle, { key: 'ArrowRight' });
    expect((screen.getByLabelText('Pivot X') as HTMLInputElement).value).toBe('147');

    // Duplicate Character
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Character' }));
    expect(screen.getByText('Pip Fox (Copy)')).toBeTruthy();

    // Import Character JSON
    const importInput = screen.getByLabelText('Import Character JSON file') as HTMLInputElement;
    const importedCharFile = new File(
      [
        JSON.stringify({
          name: 'Imported Crow',
          description: 'Night courier',
          colorPalette: ['#38bdf8'],
          parts: [
            { id: 'p1', name: 'Wing', layerName: 'crow_wing', pivot: { x: 100, y: 110 }, zIndex: 0 },
          ],
        }),
      ],
      'crow.character.json',
      { type: 'application/json' }
    );
    fireEvent.change(importInput, { target: { files: [importedCharFile] } });
    await waitFor(() => {
      expect(screen.getByText('Imported Crow')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Character' }));

    const nameInput = screen.getByLabelText('Character Name') as HTMLInputElement;
    expect(nameInput.value).toBe('Character 4');
    fireEvent.change(nameInput, { target: { value: 'Luna Owl' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Part' }));
    const zInput = screen.getByLabelText('Z-Index') as HTMLInputElement;
    fireEvent.change(zInput, { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      const saveCall = mockInvoke.mock.calls.find(([cmd]) => cmd === 'project_save');
      expect(saveCall).toBeTruthy();
      const savedPayload = saveCall?.[1] as { project: ProjectDetail };
      const added = savedPayload.project.characters.find((c) => c.name === 'Luna Owl');
      expect(added).toBeTruthy();
      expect(added?.parts.some((p) => p.zIndex === 5)).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: '+ Wave' }));
    expect(screen.getByTestId('active-workspace').textContent).toBe('studio');
  });

  it('AssetLibrary scans disk files, uploads/imports assets, edits metadata, reveals files, and cleans up scene refs on delete', async () => {
    render(
      <StudioProvider>
        <Harness workspace="assets">
          <AssetLibrary />
        </Harness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Moonlit Roof')).toBeTruthy();
      expect(screen.getByText('missing on disk')).toBeTruthy();
    });

    expect(mockInvoke).toHaveBeenCalledWith('project_assets_list', { projectId: 'proj_sec_1' });
    expect(screen.getByText('assets/props/lantern.png')).toBeTruthy();
    expect(screen.queryByText('projects/proj_sec_1/assets/backgrounds/moon_roof.png')).toBeNull();

    // Dirty draft edit is auto-saved before workspace asset import so unsaved edits are preserved
    fireEvent.change(screen.getByLabelText(/Asset Name/), { target: { value: 'Unsaved Asset Ref' } });
    fireEvent.change(screen.getByLabelText(/Workspace URI/), {
      target: { value: 'assets/props/unsaved_ref.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register Asset' }));

    // Import discovered workspace file -> flushes dirty project_save BEFORE project_import_asset
    fireEvent.click(screen.getByRole('button', { name: 'Import to Project' }));
    await waitFor(() => {
      const saveIdx = mockInvoke.mock.calls.findIndex(([cmd]) => cmd === 'project_save');
      const importIdx = mockInvoke.mock.calls.findIndex(([cmd]) => cmd === 'project_import_asset');
      expect(saveIdx).toBeGreaterThanOrEqual(0);
      expect(importIdx).toBeGreaterThan(saveIdx);
      expect(mockInvoke).toHaveBeenCalledWith('project_import_asset', {
        projectId: 'proj_sec_1',
        sourcePath: 'assets/props/lantern.png',
        assetType: 'background',
      });
    });

    // Upload file with CONFLICT -> Overwrite retry -> uploaded project asset previews & reveals under projects/<id>/assets/
    const uploadInput = screen.getByLabelText('Upload Asset File') as HTMLInputElement;
    const heroFile = new File(['png-bytes'], 'hero.png', { type: 'image/png' });
    fireEvent.change(uploadInput, { target: { files: [heroFile] } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Overwrite Existing Asset' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite Existing Asset' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'project_import_asset_bytes',
        expect.objectContaining({
          projectId: 'proj_sec_1',
          fileName: 'hero.png',
          confirmOverwrite: true,
        })
      );
      const uploadedImg = screen.getByAltText('hero.png') as HTMLImageElement;
      expect(uploadedImg.src).toBe('http://127.0.0.1:49200/projects/proj_sec_1/assets/hero.png');
    });

    // Reveal file for project-local uploaded hero.png uses projects/<id>/assets/hero.png
    const revealButtons = screen.getAllByRole('button', { name: 'Reveal File' });
    fireEvent.click(revealButtons[revealButtons.length - 1]);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('reveal_in_workspace', {
        path: 'projects/proj_sec_1/assets/hero.png',
      });
    });

    // Reveal file for shared workspace Moonlit Roof uses assets/backgrounds/moon_roof.png
    fireEvent.click(revealButtons[0]);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('reveal_in_workspace', {
        path: 'assets/backgrounds/moon_roof.png',
      });
    });

    const img = screen.getByAltText('Moonlit Roof') as HTMLImageElement;
    expect(img.src).toBe('http://127.0.0.1:49200/assets/backgrounds/moon_roof.png');

    // Filter to audio only and verify audio preview + Add to Scene Audio
    fireEvent.click(screen.getByRole('tab', { name: /^audio \(1\)/i }));
    expect(screen.queryByText('Moonlit Roof')).toBeNull();
    expect(screen.getByText('Night Wind')).toBeTruthy();
    const audioEl = document.querySelector('audio') as HTMLAudioElement | null;
    expect(audioEl).toBeTruthy();
    expect(audioEl?.src).toBe('http://127.0.0.1:49200/assets/audio/night_wind.mp3');

    // Add Night Wind audio track to active scene
    fireEvent.click(screen.getByRole('button', { name: 'Add to Scene Audio' }));
    await waitFor(() => {
      expect(screen.getByText('Scene Audio')).toBeTruthy();
    });

    // Inline edit asset name & remove strips scene refs
    fireEvent.click(screen.getByRole('button', { name: 'Edit asset Night Wind' }));
    const renameInput = screen.getByLabelText('Edit name for Night Wind') as HTMLInputElement;
    fireEvent.change(renameInput, { target: { value: 'Desert Breeze' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done editing Desert Breeze' }));
    expect(screen.getByText('Desert Breeze')).toBeTruthy();

    // Remove audio asset clears scene audioTracks on save
    fireEvent.click(screen.getByRole('button', { name: 'Remove asset Desert Breeze' }));

    // Switch back to All and register a new background asset
    fireEvent.click(screen.getByRole('tab', { name: /^All \(/i }));
    fireEvent.change(screen.getByLabelText(/Asset Name/), { target: { value: 'Dawn City' } });
    fireEvent.change(screen.getByLabelText(/Workspace URI/), {
      target: { value: 'assets/backgrounds/dawn_city.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register Asset' }));

    expect(screen.getByText('Dawn City')).toBeTruthy();

    // Assign Moonlit Roof as scene background -> persists via project_save
    const setBgButtons = screen.getAllByRole('button', { name: 'Set Scene Background' });
    fireEvent.click(setBgButtons[0]);

    await waitFor(() => {
      const saveCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'project_save');
      expect(saveCalls.length).toBeGreaterThan(0);
      const lastSave = saveCalls[saveCalls.length - 1]?.[1] as { project: ProjectDetail };
      expect(lastSave.project.scenes[0].backgroundAssetId).toBe('asset_bg_1');
      expect(lastSave.project.scenes[0].timeline.audioTracks.length).toBe(0);
      expect(lastSave.project.assets.some((a) => a.name === 'Dawn City')).toBe(true);
    });
  });

  it('SettingsWorkspace switches theme to light and system and persists studio preferences', async () => {
    render(
      <StudioProvider>
        <Harness workspace="settings" autoLoadProject={false}>
          <SettingsWorkspace />
        </Harness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run_doctor');
      expect(mockInvoke).toHaveBeenCalledWith('project_list');
    });

    const lightBtn = screen.getByRole('button', { name: /Light \(Warm Paper\)/i });
    fireEvent.click(lightBtn);
    expect(localStorage.getItem('animforge:theme')).toBe('light');
    expect(document.documentElement.dataset.themePref).toBe('light');
    expect(document.documentElement.dataset.resolvedTheme).toBe('light');

    const systemBtn = screen.getByRole('button', { name: /System \(Follow OS\)/i });
    fireEvent.click(systemBtn);
    expect(localStorage.getItem('animforge:theme')).toBe('system');
    expect(document.documentElement.dataset.themePref).toBe('system');
    expect(document.documentElement.dataset.resolvedTheme).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    fireEvent.click(screen.getByRole('button', { name: '9:16' }));
    fireEvent.click(screen.getByRole('button', { name: '60 fps' }));

    expect(document.documentElement.dataset.density).toBe('compact');
    const savedPrefs = JSON.parse(localStorage.getItem('animforge:settings') ?? '{}') as {
      density?: string;
      defaultWidth?: number;
      defaultHeight?: number;
      defaultFps?: number;
    };
    expect(savedPrefs.density).toBe('compact');
    expect(savedPrefs.defaultWidth).toBe(1080);
    expect(savedPrefs.defaultHeight).toBe(1920);
    expect(savedPrefs.defaultFps).toBe(60);
    expect(screen.getAllByText(/animforge\.config\.json/i).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    expect(document.documentElement.dataset.density).toBe('comfortable');
    const resetPrefs = JSON.parse(localStorage.getItem('animforge:settings') ?? '{}') as {
      density?: string;
      defaultWidth?: number;
      defaultFps?: number;
    };
    expect(resetPrefs.density).toBe('comfortable');
    expect(resetPrefs.defaultWidth).toBe(1920);
    expect(resetPrefs.defaultFps).toBe(30);

    expect(screen.getByText('AnimForge Studio v0.1.0')).toBeTruthy();
    expect(screen.getByText('Tauri 2 + React 18')).toBeTruthy();
  });

  it('AgentCenterWorkspace runs deterministic helpers, copies stdio command, and keeps external MCP stream honestly Planned', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <StudioProvider>
        <Harness workspace="agents">
          <AgentCenterWorkspace />
        </Harness>
      </StudioProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText('A curious fox explores a neon moonlit rooftop.')
      ).toBeTruthy();
    });

    expect(screen.getByText('animforge-core/src/mcp/index.ts')).toBeTruthy();
    expect(screen.getByText('previewServerExposed: false')).toBeTruthy();
    expect(screen.getByText('16 validated tools')).toBeTruthy();
    expect(screen.getByText('animforge://mcp-log')).toBeTruthy();
    expect(screen.getByText('Planned Scenes & Keyframes JSON (1 scenes)')).toBeTruthy();
    expect(screen.queryByText(/re-generation RPCs are not yet exposed/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Copy Command' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('animforge-core/dist/mcp/index.js'));

    fireEvent.click(screen.getByRole('button', { name: 'Run StoryDirector' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run_deterministic_agent', {
        projectId: 'proj_sec_1',
        agent: 'story_director',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Run CharacterManager' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run_deterministic_agent', {
        projectId: 'proj_sec_1',
        agent: 'character_manager',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Run ScenePlanner' }));
    expect(screen.getByRole('button', { name: 'Confirm Replace Scenes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Replace Scenes' }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('run_deterministic_agent', {
        projectId: 'proj_sec_1',
        agent: 'scene_planner',
      });
    });
  });
});
