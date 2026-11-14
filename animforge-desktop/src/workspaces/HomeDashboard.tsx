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
import { StudioButton } from '../components/ui/StudioButton';
import { StudioTooltip } from '../components/ui/StudioTooltip';

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

function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    renderHistory,
    busy,
  } = useStudioContext();

  const recentProjects = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  const totalProjects = projects.length;
  const scenesPlannedCount = projects.filter(
    (p) => p.status.toLowerCase().includes('scenes_planned') || p.status.toLowerCase().includes('plan')
  ).length;
  const renderedCount = projects.filter(
    (p) => p.status.toLowerCase() === 'rendered' || p.status.toLowerCase() === 'completed'
  ).length;

  // Storage estimate: ~14MB per project draft data + ~28MB per rendered artifact in renderHistory
  const estStorageMb = totalProjects === 0 ? 0 : Math.round(totalProjects * 14 + (renderHistory?.length ?? 0) * 28);
  const formattedStorage = estStorageMb >= 1024 ? `${(estStorageMb / 1024).toFixed(1)} GB` : `${estStorageMb} MB`;

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
      {/* Welcome Banner */}
      <section className="panel" aria-labelledby="home-welcome-heading">
        <div className="page-header-row">
          <div>
            <h2 id="home-welcome-heading">Welcome to AnimForge Studio</h2>
            <p className="field-hint" style={{ marginTop: 4 }}>
              Local-first 2D storyboarding, keyframe animation, and deterministic MP4 rendering.
            </p>
          </div>
          <StudioButton
            variant="primary"
            onClick={() => setNewProjectDialogOpen(true)}
            icon={<PlusIcon size={14} />}
          >
            + New Project
          </StudioButton>
        </div>

        <nav
          aria-label="Quick Workspace Navigation"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}
        >
          <StudioButton variant="secondary" size="sm" onClick={() => navigate('projects')} icon={<ProjectsIcon size={14} />}>
            Projects
          </StudioButton>
          <StudioButton variant="secondary" size="sm" onClick={() => navigate('story')} icon={<StoryIcon size={14} />}>
            Story &amp; Scenes
          </StudioButton>
          <StudioButton variant="secondary" size="sm" onClick={() => navigate('studio')} icon={<StudioIcon size={14} />}>
            Animation Studio
          </StudioButton>
          <StudioButton variant="secondary" size="sm" onClick={() => navigate('render')} icon={<RenderIcon size={14} />}>
            Render &amp; Export
          </StudioButton>
          <StudioButton variant="secondary" size="sm" onClick={() => navigate('diagnostics')} icon={<DiagnosticsIcon size={14} />}>
            Diagnostics
          </StudioButton>
        </nav>
      </section>

      {/* Project Statistics Banner */}
      <section className="panel" aria-label="Project Statistics" style={{ padding: '12px 16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="field-hint" style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Projects
            </span>
            <strong style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{totalProjects}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="field-hint" style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Scenes Planned
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{scenesPlannedCount}</strong>
              {scenesPlannedCount > 0 ? <StatusBadge tone="warn">Active</StatusBadge> : null}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="field-hint" style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Rendered / Completed
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{renderedCount}</strong>
              {renderedCount > 0 ? <StatusBadge tone="pass">Ready</StatusBadge> : null}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="field-hint" style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Est. Storage
            </span>
            <strong className="mono" style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{formattedStorage}</strong>
          </div>
        </div>
      </section>

      {/* Active Render Notification */}
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
              <StudioButton variant="secondary" onClick={() => navigate('render')}>
                View Render
              </StudioButton>
              <StudioButton
                variant="danger"
                onClick={() => void cancelRender()}
                disabled={busy.cancelling}
              >
                {busy.cancelling ? 'Cancelling...' : 'Cancel'}
              </StudioButton>
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
        {/* Starter Templates */}
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
                <StudioButton
                  variant="secondary"
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
                  loading={busy.creating}
                >
                  Launch Template
                </StudioButton>
              </article>
            ))}
          </div>
        </section>

        {/* System Health Card */}
        <section className="panel" aria-labelledby="env-health-heading">
          <div className="page-header-row" style={{ marginBottom: 10 }}>
            <h3 id="env-health-heading">System Health</h3>
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

      {/* Recent Projects & Activity Feed */}
      <section className="panel" aria-labelledby="recent-projects-heading">
        <div className="page-header-row" style={{ marginBottom: 10 }}>
          <h3 id="recent-projects-heading">Recent Projects</h3>
          <StudioButton variant="secondary" size="sm" onClick={() => navigate('projects')}>
            Manage All ({projects.length})
          </StudioButton>
        </div>

        {busy.loadingList ? (
          <p className="field-hint">Loading workspace projects...</p>
        ) : recentProjects.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <ProjectsIcon size={28} className="field-hint" />
            <div>
              <strong style={{ display: 'block', marginBottom: 4 }}>No projects in workspace</strong>
              <p className="field-hint">
                Launch one of the starter templates above or create a new custom animation project.
              </p>
            </div>
            <StudioButton
              variant="primary"
              onClick={() => setNewProjectDialogOpen(true)}
              icon={<PlusIcon size={14} />}
            >
              + New Project
            </StudioButton>
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
                  <StudioTooltip content={p.name}>
                    <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </strong>
                  </StudioTooltip>
                  <StatusBadge tone={projectStatusTone(p.status)}>{p.status}</StatusBadge>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span className="mono">
                    {p.width}x{p.height} · {p.fps} FPS
                  </span>
                  {p.preferredEngine ? (
                    <span className="badge badge-neutral" style={{ fontSize: 'var(--text-xs)' }}>
                      {p.preferredEngine}
                    </span>
                  ) : null}
                </div>
                <div className="mono field-hint" style={{ fontSize: 'var(--text-xs)' }}>
                  Updated {formatActivityTime(p.updatedAt)}
                </div>
                <StudioButton
                  variant="primary"
                  onClick={() => void openProject(p.id, 'studio')}
                  disabled={busy.loadingProject}
                >
                  Open
                </StudioButton>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
