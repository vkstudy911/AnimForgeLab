import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useStudioContext } from '../../context/StudioContext';
import type { WorkspaceId } from '../../types';
import {
  AlertTriangleIcon,
  BrandLogoIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ExportIcon,
  MoonIcon,
  PlayIcon,
  ProjectsIcon,
  RedoIcon,
  RenderIcon,
  SaveIcon,
  StoryIcon,
  StudioIcon,
  SunIcon,
  UndoIcon,
  XCircleIcon,
} from '../ui/Icons';

const TOP_NAV_ITEMS: Array<{ id: WorkspaceId; label: string; icon: React.ReactNode }> = [
  { id: 'projects', label: 'Projects', icon: <ProjectsIcon size={14} /> },
  { id: 'story', label: 'Story', icon: <StoryIcon size={14} /> },
  { id: 'studio', label: 'Studio', icon: <StudioIcon size={14} /> },
  { id: 'render', label: 'Render', icon: <RenderIcon size={14} /> },
];

export function StudioHeader() {
  const {
    activeWorkspace,
    navigate,
    projects,
    draftProject,
    isDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    saveDraft,
    doctorReport,
    doctorLoading,
    resolvedTheme,
    themePreference,
    cycleThemePreference,
    previewProject,
    renderProject,
    cancelRender,
    openProject,
    setNewProjectDialogOpen,
    busy,
    renderingProjectId,
    clearBlurAnnouncement,
  } = useStudioContext();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (ev: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(ev.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const overall = doctorReport?.overall ?? null;
  const isRenderingHere = Boolean(draftProject && renderingProjectId === draftProject.id);

  const healthLabel = doctorLoading
    ? 'Checking'
    : overall === 'PASS'
      ? 'Healthy'
      : overall === 'WARN'
        ? 'Warnings'
        : overall === 'FAIL'
          ? 'Issues'
          : 'Diagnostics';

  const healthTone =
    overall === 'PASS'
      ? 'pass'
      : overall === 'WARN'
        ? 'warn'
        : overall === 'FAIL'
          ? 'fail'
          : 'neutral';

  return (
    <header className="workbench-header">
      <div className="workbench-header-left">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <BrandLogoIcon size={16} />
          </span>
          <h1 className="brand-title">AnimForge Studio</h1>
        </div>

        <div className="project-selector-wrap" ref={menuWrapRef}>
          <button
            type="button"
            className="project-selector-btn"
            aria-expanded={menuOpen}
            aria-controls="header-project-menu"
            aria-label="Switch active project"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="project-selector-thumb" aria-hidden="true">
              {draftProject ? draftProject.name.slice(0, 2).toUpperCase() : 'AF'}
            </span>
            <span className="project-selector-name">
              {draftProject ? draftProject.name : 'Select Project'}
            </span>
            <ChevronDownIcon size={13} />
          </button>

          {menuOpen ? (
            <div id="header-project-menu" className="header-popover header-popover-open">
              <div className="popover-head">
                <span>Workspace Projects</span>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setMenuOpen(false);
                    setNewProjectDialogOpen(true);
                  }}
                >
                  + New
                </button>
              </div>
              {projects.length === 0 ? (
                <p className="field-hint">No projects created yet.</p>
              ) : (
                <ul className="popover-list" role="list">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="popover-item"
                        aria-current={p.id === draftProject?.id ? 'true' : undefined}
                        onClick={() => {
                          setMenuOpen(false);
                          clearBlurAnnouncement();
                          void openProject(
                            p.id,
                            activeWorkspace === 'home' ? 'studio' : activeWorkspace
                          );
                        }}
                      >
                        <span>{p.name}</span>
                        <span className="mono field-hint">
                          {p.width}x{p.height} · {p.fps}fps
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="header-icon-btn"
          aria-label="Undo"
          title="Undo (Cmd/Ctrl+Z)"
          onClick={undo}
          disabled={!canUndo}
        >
          <UndoIcon size={14} />
        </button>

        <button
          type="button"
          className="header-icon-btn"
          aria-label="Redo"
          title="Redo (Cmd/Ctrl+Shift+Z)"
          onClick={redo}
          disabled={!canRedo}
        >
          <RedoIcon size={14} />
        </button>

        {isDirty ? (
          <span className="unsaved-pill" title="You have unsaved edits in the current project">
            <span className="unsaved-dot" aria-hidden="true" />
            <span>Unsaved Changes</span>
            <button
              type="button"
              className="unsaved-save-btn"
              onClick={() => void saveDraft()}
              disabled={busy.saving}
              title="Save project (Cmd/Ctrl+S)"
            >
              <SaveIcon size={12} />
              <span>{busy.saving ? 'Saving' : 'Save'}</span>
            </button>
          </span>
        ) : null}
      </div>

      <nav className="header-center-nav" aria-label="Primary Production Navigation">
        {TOP_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="header-nav-tab"
            aria-current={activeWorkspace === item.id ? 'page' : undefined}
            onClick={() => navigate(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="workbench-header-right">
        <button
          type="button"
          className={`header-health-pill badge-${healthTone}`}
          onClick={() => navigate('diagnostics')}
          title="Open System Diagnostics"
        >
          {overall === 'PASS' ? (
            <CheckCircleIcon size={13} />
          ) : overall === 'WARN' ? (
            <AlertTriangleIcon size={13} />
          ) : overall === 'FAIL' ? (
            <XCircleIcon size={13} />
          ) : null}
          <span>{healthLabel}</span>
        </button>

        <button
          type="button"
          className="header-icon-btn"
          onClick={cycleThemePreference}
          aria-label={`Theme: ${themePreference} (${resolvedTheme}). Click to switch`}
          title={`Theme: ${themePreference} (resolved ${resolvedTheme})`}
        >
          {resolvedTheme === 'dark' ? <SunIcon size={14} /> : <MoonIcon size={14} />}
        </button>

        <button
          type="button"
          className="header-preview-btn"
          onClick={() => {
            if (activeWorkspace !== 'studio') navigate('studio');
            void previewProject();
          }}
          disabled={!draftProject || busy.previewing || busy.rendering}
        >
          <span>{busy.previewing ? 'Bundling...' : 'Preview'}</span>
          <PlayIcon size={12} />
        </button>

        {isRenderingHere ? (
          <button
            type="button"
            className="btn-danger"
            onClick={() => void cancelRender()}
            disabled={busy.cancelling}
          >
            {busy.cancelling ? 'Cancelling...' : 'Cancel Export'}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary header-export-btn"
            onClick={() => void renderProject()}
            disabled={!draftProject || busy.rendering || busy.previewing}
          >
            <ExportIcon size={13} />
            <span>{busy.rendering ? 'Rendering...' : 'Export MP4'}</span>
          </button>
        )}
      </div>
    </header>
  );
}
