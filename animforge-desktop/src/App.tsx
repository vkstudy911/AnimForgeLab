import { CommandPaletteDialog } from './components/layout/CommandPaletteDialog';
import { NewProjectDialog } from './components/layout/NewProjectDialog';
import { StudioHeader } from './components/layout/StudioHeader';
import { WorkspaceRail } from './components/layout/WorkspaceRail';
import { StudioDialog } from './components/ui/StudioDialog';
import { WorkspaceErrorBoundary } from './components/ui/WorkspaceErrorBoundary';
import { StudioProvider, useStudioContext } from './context/StudioContext';
import { AgentCenterWorkspace } from './workspaces/AgentCenterWorkspace';
import { AnimationEditor } from './workspaces/AnimationEditor';
import { AssetLibrary } from './workspaces/AssetLibrary';
import { CharacterStudio } from './workspaces/CharacterStudio';
import { DiagnosticsWorkspace } from './workspaces/DiagnosticsWorkspace';
import { HomeDashboard } from './workspaces/HomeDashboard';
import { ProjectManager } from './workspaces/ProjectManager';
import { RenderWorkspace } from './workspaces/RenderWorkspace';
import { SettingsWorkspace } from './workspaces/SettingsWorkspace';
import { StoryScenesWorkspace } from './workspaces/StoryScenesWorkspace';

const WORKSPACE_LABELS: Record<string, string> = {
  home: 'Home',
  projects: 'Projects',
  story: 'Story & Scenes',
  studio: 'Animation Studio',
  characters: 'Character Studio',
  assets: 'Asset Library',
  render: 'Render & Export',
  diagnostics: 'Diagnostics',
  settings: 'Settings',
  agents: 'Agent Center',
};

function WorkbenchContent() {
  const {
    activeWorkspace,
    navigate,
    error,
    clearError,
    announcement,
    previewBaseUrl,
    renderingProjectId,
    renderProgress,
    cancelRender,
    busy,
    setCommandPaletteOpen,
    pendingSwitchProjectId,
    confirmPendingSwitch,
    projects,
  } = useStudioContext();

  const renderWorkspaceView = () => {
    switch (activeWorkspace) {
      case 'home':
        return <HomeDashboard />;
      case 'projects':
        return <ProjectManager />;
      case 'story':
        return <StoryScenesWorkspace />;
      case 'studio':
        return <AnimationEditor />;
      case 'characters':
        return <CharacterStudio />;
      case 'assets':
        return <AssetLibrary />;
      case 'render':
        return <RenderWorkspace />;
      case 'diagnostics':
        return <DiagnosticsWorkspace />;
      case 'settings':
        return <SettingsWorkspace />;
      case 'agents':
        return <AgentCenterWorkspace />;
      default:
        return <HomeDashboard />;
    }
  };

  const pendingTargetName =
    projects.find((p) => p.id === pendingSwitchProjectId)?.name ?? pendingSwitchProjectId ?? '';

  return (
    <div className="workbench-shell">
      <StudioHeader />

      <div className="workbench-body">
        <WorkspaceRail activeWorkspace={activeWorkspace} onSelect={navigate} />

        <main className="workbench-main">
          {error ? (
            <div role="alert" className="studio-alert">
              <span>{error}</span>
              <button type="button" onClick={clearError}>
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="workbench-workspace-slot">
            <WorkspaceErrorBoundary
              workspaceName={WORKSPACE_LABELS[activeWorkspace] ?? activeWorkspace}
              onResetHome={() => navigate('home')}
            >
              {renderWorkspaceView()}
            </WorkspaceErrorBoundary>
          </div>
        </main>
      </div>

      <footer className="workbench-footer">
        <div className="footer-left">
          <span className="mono">{WORKSPACE_LABELS[activeWorkspace]}</span>
          <span aria-live="polite" className="footer-live-text">
            {announcement}
          </span>
        </div>

        <div className="footer-right">
          {renderingProjectId ? (
            <span className="footer-render-chip mono">
              <span>
                Rendering {renderingProjectId}:{' '}
                {Math.min(100, Math.max(0, Math.round(renderProgress?.progress ?? 0)))}%
              </span>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void cancelRender()}
                disabled={busy.cancelling}
                style={{ padding: '1px 6px', fontSize: '11px' }}
              >
                {busy.cancelling ? 'Cancelling...' : 'Cancel'}
              </button>
            </span>
          ) : null}

          {previewBaseUrl ? (
            <span className="mono field-hint" title="Local sandboxed PreviewServer origin">
              Preview: {previewBaseUrl.replace(/^https?:\/\//, '')}
            </span>
          ) : null}

          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCommandPaletteOpen(true)}
            style={{ padding: '1px 6px', fontSize: '11px' }}
          >
            Cmd/Ctrl+K
          </button>
        </div>
      </footer>

      <NewProjectDialog />
      <CommandPaletteDialog />

      <StudioDialog
        open={pendingSwitchProjectId !== null}
        title="Unsaved Changes"
        onClose={() => void confirmPendingSwitch('cancel')}
      >
        <p style={{ marginBottom: 14 }}>
          You have unsaved changes in the active project. Save before opening{' '}
          <strong>{pendingTargetName}</strong>?
        </p>
        <div className="dialog-footer-actions">
          <button type="button" onClick={() => void confirmPendingSwitch('cancel')}>
            Cancel
          </button>
          <button type="button" onClick={() => void confirmPendingSwitch('discard')}>
            Discard Changes
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void confirmPendingSwitch('save')}
            disabled={busy.saving}
          >
            {busy.saving ? 'Saving...' : 'Save & Open'}
          </button>
        </div>
      </StudioDialog>
    </div>
  );
}

export default function App() {
  return (
    <StudioProvider>
      <WorkbenchContent />
    </StudioProvider>
  );
}
