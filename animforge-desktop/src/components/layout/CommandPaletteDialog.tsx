import { useEffect, useMemo, useState } from 'react';
import { useStudioContext } from '../../context/StudioContext';
import { StudioDialog } from '../ui/StudioDialog';
import { WORKSPACE_NAV_ENTRIES } from './WorkspaceRail';

export function CommandPaletteDialog() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    projects,
    draftProject,
    isDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    saveDraft,
    previewProject,
    renderProject,
    busy,
    navigate,
    openProject,
    setSelectedSceneId,
    setNewProjectDialogOpen,
  } = useStudioContext();

  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!commandPaletteOpen) {
      setQuery('');
    }
  }, [commandPaletteOpen]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions: Array<{
      key: string;
      kind: string;
      title: string;
      subtitle: string;
      disabled?: boolean;
      run: () => void;
    }> = [
      {
        key: 'act:undo',
        kind: 'Action',
        title: 'Undo Edit',
        subtitle: 'Cmd/Ctrl+Z',
        disabled: !canUndo,
        run: () => undo(),
      },
      {
        key: 'act:redo',
        kind: 'Action',
        title: 'Redo Edit',
        subtitle: 'Cmd/Ctrl+Shift+Z',
        disabled: !canRedo,
        run: () => redo(),
      },
      {
        key: 'act:save',
        kind: 'Action',
        title: 'Save Changes',
        subtitle: 'Cmd/Ctrl+S',
        disabled: !draftProject || !isDirty || busy.saving,
        run: () => void saveDraft(),
      },
      {
        key: 'act:preview',
        kind: 'Action',
        title: 'Preview Bundle',
        subtitle: 'Compile & stage preview',
        disabled: !draftProject || busy.previewing || busy.rendering,
        run: () => {
          navigate('studio');
          void previewProject();
        },
      },
      {
        key: 'act:render',
        kind: 'Action',
        title: 'Render / Export MP4',
        subtitle: 'Render active project',
        disabled: !draftProject || busy.rendering || busy.previewing,
        run: () => void renderProject(),
      },
    ].filter((a) => !q || a.title.toLowerCase().includes(q) || a.kind.toLowerCase().includes(q));

    const pages = WORKSPACE_NAV_ENTRIES.filter(
      (p) => !q || p.label.toLowerCase().includes(q) || p.id.includes(q)
    ).map((p) => ({
      key: `ws:${p.id}`,
      kind: 'Workspace',
      title: p.label,
      subtitle: p.shortcut,
      disabled: false,
      run: () => navigate(p.id),
    }));

    const projs = projects
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q))
      .slice(0, 6)
      .map((p) => ({
        key: `proj:${p.id}`,
        kind: 'Project',
        title: p.name,
        subtitle: `${p.width}x${p.height} · ${p.status}`,
        disabled: false,
        run: () => void openProject(p.id, 'studio'),
      }));

    const scenes = (draftProject?.scenes ?? [])
      .filter((s) => !q || s.title.toLowerCase().includes(q))
      .map((s, idx) => ({
        key: `scene:${s.id}`,
        kind: 'Scene',
        title: `${idx + 1}. ${s.title}`,
        subtitle: `${s.duration}s`,
        disabled: false,
        run: () => {
          setSelectedSceneId(s.id);
          navigate('studio');
        },
      }));

    return [...actions, ...pages, ...projs, ...scenes];
  }, [
    query,
    projects,
    draftProject,
    isDirty,
    canUndo,
    canRedo,
    busy.saving,
    busy.previewing,
    busy.rendering,
    undo,
    redo,
    saveDraft,
    previewProject,
    renderProject,
    navigate,
    openProject,
    setSelectedSceneId,
  ]);

  return (
    <StudioDialog
      open={commandPaletteOpen}
      title="Quick Command Palette"
      onClose={() => {
        setQuery('');
        setCommandPaletteOpen(false);
      }}
    >
      <div className="command-palette">
        <input
          type="search"
          autoFocus
          placeholder="Jump to action, workspace, project, or scene..."
          aria-label="Search workspaces, projects, and scenes"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
        />
        <div className="command-palette-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setQuery('');
              setCommandPaletteOpen(false);
              setNewProjectDialogOpen(true);
            }}
          >
            + Create New Project
          </button>
        </div>
        <ul className="command-palette-list" role="list">
          {matches.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="command-palette-item"
                disabled={item.disabled}
                onClick={() => {
                  item.run();
                  setQuery('');
                  setCommandPaletteOpen(false);
                }}
              >
                <span className="badge badge-neutral">{item.kind}</span>
                <span className="command-palette-title">{item.title}</span>
                <span className="mono field-hint">{item.subtitle}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 ? <li className="field-hint">No matching items.</li> : null}
        </ul>
      </div>
    </StudioDialog>
  );
}
