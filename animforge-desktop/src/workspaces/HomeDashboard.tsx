import { useStudioContext } from '../context/StudioContext';
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
  PlusIcon,
  StudioIcon,
  ProjectsIcon,
  StoryIcon,
  RenderIcon,
  DiagnosticsIcon,
} from '../components/ui/Icons';
import { SceneThumb } from '../components/ui/SceneThumb';
import { StatusBadge, type BadgeTone } from '../components/ui/StatusBadge';

interface StarterTemplate {
  id: string;
  label: string;
  projectName: string;
  prompt: string;
  width: number;
  height: number;
  fps: 24 | 30 | 60;
  palette: [string, string];
  badge: string;
}

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'cartoon-16-9',
    label: '16:9 Cartoon Story',
    projectName: 'Lantern Fox Adventure',
    prompt: 'A cheerful fox carrying a glowing paper lantern across a twilight woodland bridge.',
    width: 1920,
    height: 1080,
    fps: 30,
    palette: ['#1c2438', '#f59e0b'],
    badge: '16:9',
  },
  {
    id: 'vertical-9-16',
    label: '9:16 Vertical Short',
    projectName: 'Neon Rooftop Leap',
    prompt: 'A nimble courier cat leaping across neon-lit city rooftops in crisp vertical framing.',
    width: 1080,
    height: 1920,
    fps: 30,
    palette: ['#1b1838', '#38bdf8'],
    badge: '9:16',
  },
  {
    id: 'loop-1-1',
    label: '1:1 Loop',
    projectName: 'Orbiting Planet Loop',
    prompt: 'A stylized ringed planet with tiny moons drifting in a seamless 24fps celestial loop.',
    width: 1080,
    height: 1080,
    fps: 24,
    palette: ['#13292a', '#34d399'],
    badge: '1:1',
  },
  {
    id: 'classic-4-3',
    label: '4:3 Classic',
    projectName: 'Clockwork Workshop',
    prompt: 'A friendly brass robot winding floating gears inside a warm sunlit atelier.',
    width: 1440,
    height: 1080,
    fps: 24,
    palette: ['#2b1f18', '#fbbf24'],
    badge: '4:3',
  },
];

function projectStatusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s === 'rendered' || s === 'completed') return 'pass';
  if (s === 'rendering' || s === 'scenes_planned') return 'warn';
  if (s === 'failed' || s === 'error') return 'fail';
  return 'neutral';
}

export function HomeDashboard() {
  const {
    projects,
    draftProject,
    navigate,
    setNewProjectDialogOpen,
    createAndOpenProject,
    openProject,
    settingsPrefs,
    doctorReport,
    doctorLoading,
    doctorError,
    renderingProjectId,
    renderProgress,
    cancelRender,
    busy,
  } = useStudioContext();

  const recentProjects = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  const isRendering = renderingProjectId !== null || busy.rendering;
  const renderingName =
    projects.find((p) => p.id === renderingProjectId)?.name ??
    (draftProject?.id === renderingProjectId ? draftProject.name : renderingProjectId) ??
    'Active Project';
  const renderPct = Math.min(100, Math.max(0, Math.round(renderProgress?.progress ?? 0)));

  const passCount = doctorReport?.checks.filter((c) => c.status === 'PASS').length ?? 0;
  const warnCount = doctorReport?.checks.filter((c) => c.status === 'WARN').length ?? 0;
  const failCount = doctorReport?.checks.filter((c) => c.status === 'FAIL').length ?? 0;

  return (
    <div className="page-container">
      <section className="panel" aria-labelledby="home-welcome-heading">
        <div className="page-header-row">
          <div>
            <h2 id="home-welcome-heading">Welcome to AnimForge Studio</h2>
            <p className="field-hint" style={{ marginTop: 4 }}>
              Local-first 2D storyboarding, keyframe animation, and deterministic MP4 rendering.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setNewProjectDialogOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <PlusIcon size={14} />
            <span>+ New Project</span>
          </button>
        </div>

        <nav
          aria-label="Quick Workspace Navigation"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}
        >
          <button
            type="button"
            onClick={() => navigate('projects')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ProjectsIcon size={14} />
            <span>Projects</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('story')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <StoryIcon size={14} />
            <span>Story &amp; Scenes</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('studio')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <StudioIcon size={14} />
            <span>Animation Studio</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('render')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RenderIcon size={14} />
            <span>Render &amp; Export</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('diagnostics')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <DiagnosticsIcon size={14} />
            <span>Diagnostics</span>
          </button>
        </nav>
      </section>

      {isRendering ? (
        <section className="panel" aria-label="Active Render">
          <div className="page-header-row">
            <div>
              <h3>Active Render: {renderingName}</h3>
              <p className="field-hint">
                Phase: {renderProgress?.phase ?? 'Starting'} · {renderPct}%
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => navigate('render')}>
                View Render
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => void cancelRender()}
                disabled={busy.cancelling}
              >
                {busy.cancelling ? 'Cancelling...' : 'Cancel'}
              </button>
            </div>
          </div>
          <progress
            className="render-progress-bar"
            max={100}
            value={renderPct}
            style={{ marginTop: 10 }}
          >
            {renderPct}%
          </progress>
        </section>
      ) : null}

      <div className="grid-2">
        <section className="panel" aria-labelledby="starter-templates-heading">
          <div className="page-header-row" style={{ marginBottom: 10 }}>
            <h3 id="starter-templates-heading">Starter Templates</h3>
            <span className="field-hint">One-click project launch</span>
          </div>
          <div className="grid-2">
            {STARTER_TEMPLATES.map((tpl) => (
              <article
                key={tpl.id}
                className="panel"
                style={{
                  background: 'var(--bg-surface-elevated)',
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <SceneThumb title={tpl.label} palette={tpl.palette} badge={tpl.badge} />
                <div>
                  <div style={{ fontWeight: 600 }}>{tpl.label}</div>
                  <div className="mono field-hint">
                    {tpl.width}x{tpl.height} · {tpl.fps} FPS
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void createAndOpenProject(
                      tpl.projectName,
                      tpl.prompt,
                      {
                        width: tpl.width,
                        height: tpl.height,
                        fps: tpl.fps,
                        preferredEngine: settingsPrefs.defaultEngine,
                      },
                      'studio'
                    )
                  }
                  disabled={busy.creating || busy.rendering}
                >
                  {busy.creating ? 'Creating...' : 'Launch Template'}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="env-health-heading">
          <div className="page-header-row" style={{ marginBottom: 10 }}>
            <h3 id="env-health-heading">Environment Health</h3>
            {doctorReport ? (
              <StatusBadge
                tone={
                  doctorReport.overall === 'PASS'
                    ? 'pass'
                    : doctorReport.overall === 'WARN'
                      ? 'warn'
                      : 'fail'
                }
              >
                {doctorReport.overall}
              </StatusBadge>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => navigate('diagnostics')}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: 12,
              background: 'var(--bg-surface-elevated)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              {doctorReport?.overall === 'PASS' ? (
                <CheckCircleIcon size={16} />
              ) : doctorReport?.overall === 'WARN' ? (
                <AlertTriangleIcon size={16} />
              ) : doctorReport?.overall === 'FAIL' ? (
                <XCircleIcon size={16} />
              ) : (
                <DiagnosticsIcon size={16} />
              )}
              <span>
                {doctorLoading
                  ? 'Inspecting system dependencies...'
                  : doctorError
                    ? 'Diagnostics error — click to inspect'
                    : doctorReport
                      ? `${passCount} passed · ${warnCount} warnings · ${failCount} failed`
                      : 'Open Environment Diagnostics'}
              </span>
            </div>
            <span className="mono field-hint">
              {doctorReport?.workspaceRoot ?? 'Click to view FFmpeg, Chrome, and engine probes'}
            </span>
          </button>
        </section>
      </div>

      <section className="panel" aria-labelledby="recent-projects-heading">
        <div className="page-header-row" style={{ marginBottom: 10 }}>
          <h3 id="recent-projects-heading">Recent Projects</h3>
          <button type="button" onClick={() => navigate('projects')}>
            Manage All ({projects.length})
          </button>
        </div>

        {busy.loadingList ? (
          <p className="field-hint">Loading workspace projects...</p>
        ) : recentProjects.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p className="field-hint">No projects yet. Launch a starter template or create a new project.</p>
            <button type="button" className="btn-primary" onClick={() => setNewProjectDialogOpen(true)}>
              + New Project
            </button>
          </div>
        ) : (
          <div className="grid-3">
            {recentProjects.map((p) => (
              <article
                key={p.id}
                className="panel"
                style={{
                  background: 'var(--bg-surface-elevated)',
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <SceneThumb title={p.name} badge={`${p.width}x${p.height}`} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </strong>
                  <StatusBadge tone={projectStatusTone(p.status)}>{p.status}</StatusBadge>
                </div>
                <div className="mono field-hint">
                  {p.width}x{p.height} · {p.fps} FPS
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void openProject(p.id, 'studio')}
                  disabled={busy.loadingProject}
                >
                  Open
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
