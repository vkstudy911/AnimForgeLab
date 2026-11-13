import { useId } from 'react';
import { useStudioContext } from '../context/StudioContext';
import { ExportIcon, RenderIcon } from '../components/ui/Icons';
import { NumericInput } from '../components/ui/NumericInput';
import { StatusBadge } from '../components/ui/StatusBadge';
import type { EngineId, FfprobeMetadata } from '../types';

const RING_RADIUS = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatFfprobeSummary(probe: FfprobeMetadata): string {
  const parts: string[] = [];
  if (probe.codec) parts.push(probe.codec);
  if (probe.width != null && probe.height != null) parts.push(`${probe.width}x${probe.height}`);
  if (probe.durationSeconds != null) parts.push(`${probe.durationSeconds.toFixed(1)}s`);
  if (probe.hasVideoStream) parts.push('video');
  if (probe.hasAudioStream) parts.push('audio');
  return parts.join(' · ') || 'verified';
}

export function RenderWorkspace() {
  const {
    draftProject,
    updateDraft,
    renderingProjectId,
    renderProgress,
    renderProject,
    cancelRender,
    openProject,
    videoUrl,
    lastRenderResult,
    renderHistory,
    refreshRenderHistory,
    revealInWorkspace,
    busy,
    navigate,
    setNewProjectDialogOpen,
  } = useStudioContext();

  const widthId = useId();
  const heightId = useId();
  const fpsId = useId();
  const engineId = useId();

  const isRenderingHere = Boolean(
    draftProject && (renderingProjectId === draftProject.id || (busy.rendering && renderingProjectId === null))
  );
  const progressPct = isRenderingHere
    ? Math.min(100, Math.max(0, Math.round(renderProgress?.progress ?? 0)))
    : 0;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progressPct / 100);
  const previewVideoPath = lastRenderResult?.videoPath ?? null;
  const previewFfprobe = lastRenderResult?.ffprobe ?? null;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h2>Render &amp; Export</h2>
          <p className="field-hint">
            {draftProject
              ? `Active Project: ${draftProject.name}`
              : 'Select or create a project to export MP4 video.'}
          </p>
        </div>
        {!draftProject ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" onClick={() => setNewProjectDialogOpen(true)}>
              + New Project
            </button>
            <button type="button" onClick={() => navigate('projects')}>
              Browse Projects
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid-2">
        <section className="panel" aria-labelledby="render-status-heading">
          <div className="page-header-row" style={{ marginBottom: 14 }}>
            <h3 id="render-status-heading" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RenderIcon size={16} />
              <span>Render Queue &amp; Progress</span>
            </h3>
            <StatusBadge tone={isRenderingHere ? 'warn' : 'neutral'}>
              {isRenderingHere ? renderProgress?.phase ?? 'Rendering' : 'Idle'}
            </StatusBadge>
          </div>

          <div className="render-ring-wrap">
            <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
              <svg className="render-ring-svg" viewBox="0 0 96 96" aria-hidden="true">
                <circle
                  cx="48"
                  cy="48"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth="8"
                />
                <circle
                  cx="48"
                  cy="48"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--accent-amber)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <span
                className="mono"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  fontWeight: 700,
                }}
              >
                {progressPct}%
              </span>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong aria-live="polite">
                {isRenderingHere
                  ? `Rendering (${renderProgress?.phase ?? 'starting'}) — ${progressPct}%`
                  : 'Idle — Ready to Render'}
              </strong>

              {isRenderingHere && renderProgress ? (
                <div className="mono field-hint" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <span>
                    {renderProgress.done != null && renderProgress.total != null
                      ? `Frames ${renderProgress.done} / ${renderProgress.total}`
                      : 'Preparing frames'}
                  </span>
                  {renderProgress.fps != null ? <span>{renderProgress.fps.toFixed(1)} fps</span> : null}
                  {renderProgress.eta != null ? <span>ETA {renderProgress.eta.toFixed(1)}s</span> : null}
                </div>
              ) : (
                <p className="field-hint">
                  {draftProject
                    ? 'Deterministic Chromium + FFmpeg libx264 MP4 export.'
                    : 'Open a project to enable MP4 export.'}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {isRenderingHere ? (
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => void cancelRender()}
                    disabled={busy.cancelling}
                  >
                    {busy.cancelling ? 'Cancelling...' : 'Cancel'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void renderProject()}
                    disabled={!draftProject || busy.rendering || busy.previewing}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <ExportIcon size={14} />
                    <span>Render MP4</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="output-config-heading">
          <div className="page-header-row" style={{ marginBottom: 12 }}>
            <h3 id="output-config-heading">Output Config</h3>
            {draftProject ? (
              <span className="mono field-hint">
                {draftProject.width}x{draftProject.height}
              </span>
            ) : null}
          </div>
          {draftProject ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="dialog-two-col">
                <div className="field">
                  <label htmlFor={widthId}>Width (px)</label>
                  <NumericInput
                    id={widthId}
                    min={160}
                    max={7680}
                    step={2}
                    integer
                    disabled={isRenderingHere}
                    value={draftProject.width}
                    onCommit={(val) => updateDraft((prev) => ({ ...prev, width: val }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor={heightId}>Height (px)</label>
                  <NumericInput
                    id={heightId}
                    min={160}
                    max={4320}
                    step={2}
                    integer
                    disabled={isRenderingHere}
                    value={draftProject.height}
                    onCommit={(val) => updateDraft((prev) => ({ ...prev, height: val }))}
                  />
                </div>
              </div>

              <div className="dialog-two-col">
                <div className="field">
                  <label htmlFor={fpsId}>FPS</label>
                  <select
                    id={fpsId}
                    value={String(draftProject.fps)}
                    disabled={isRenderingHere}
                    onChange={(ev) => {
                      const val = Number(ev.target.value);
                      if (Number.isFinite(val) && val > 0) {
                        updateDraft((prev) => ({ ...prev, fps: val }));
                      }
                    }}
                  >
                    <option value="24">24 FPS</option>
                    <option value="30">30 FPS</option>
                    <option value="60">60 FPS</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={engineId}>Engine</label>
                  <select
                    id={engineId}
                    value={draftProject.preferredEngine}
                    disabled={isRenderingHere}
                    onChange={(ev) =>
                      updateDraft((prev) => ({
                        ...prev,
                        preferredEngine: ev.target.value as EngineId,
                      }))
                    }
                  >
                    <option value="givemotion">GiveMotion</option>
                    <option value="remotion">Remotion</option>
                    <option value="stretchystudio">StretchyStudio</option>
                    <option value="composite">Composite</option>
                  </select>
                </div>
              </div>

              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '6px 16px',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <dt className="field-hint">Format / Codec</dt>
                <dd className="mono">H.264 / MP4</dd>
                <dt className="field-hint">Output Path</dt>
                <dd className="mono" style={{ wordBreak: 'break-all' }}>
                  projects/{draftProject.id}/output.mp4
                </dd>
              </dl>
            </div>
          ) : (
            <p className="field-hint">No active project selected.</p>
          )}
        </section>
      </div>

      {videoUrl ? (
        <section className="panel" aria-labelledby="render-preview-heading">
          <div className="page-header-row" style={{ marginBottom: 10 }}>
            <div>
              <h3 id="render-preview-heading">Rendered MP4 Preview</h3>
              {previewFfprobe ? (
                <p className="mono field-hint">ffprobe: {formatFfprobeSummary(previewFfprobe)}</p>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="mono field-hint">{videoUrl}</span>
              {previewVideoPath ? (
                <button
                  type="button"
                  onClick={() => void revealInWorkspace(previewVideoPath)}
                >
                  Reveal Output
                </button>
              ) : null}
            </div>
          </div>
          <div
            style={{
              background: 'var(--bg-stage-matte)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              maxHeight: 420,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <video
              key={videoUrl}
              className="stage-video"
              controls
              src={videoUrl}
              width={draftProject?.width}
              height={draftProject?.height}
              style={{ maxHeight: 420 }}
            />
          </div>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="render-history-heading">
        <div className="page-header-row" style={{ marginBottom: 10 }}>
          <div>
            <h3 id="render-history-heading">Render History ({renderHistory.length})</h3>
            <p className="field-hint">Persisted SQLite render jobs with ffprobe output metadata.</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshRenderHistory()}
            disabled={busy.rendering}
          >
            Refresh History
          </button>
        </div>

        {renderHistory.length === 0 ? (
          <p className="field-hint">No render jobs recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th scope="col" style={{ padding: '6px 8px' }}>Project</th>
                  <th scope="col" style={{ padding: '6px 8px' }}>Resolution</th>
                  <th scope="col" style={{ padding: '6px 8px' }}>Engine</th>
                  <th scope="col" style={{ padding: '6px 8px' }}>Status</th>
                  <th scope="col" style={{ padding: '6px 8px' }}>Output</th>
                  <th scope="col" style={{ padding: '6px 8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {renderHistory.map((entry) => (
                  <tr key={entry.jobId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 500 }}>{entry.projectName}</td>
                    <td className="mono" style={{ padding: '7px 8px' }}>
                      {entry.width}x{entry.height} · {entry.fps}fps
                    </td>
                    <td className="mono" style={{ padding: '7px 8px' }}>
                      {entry.engine}
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <StatusBadge
                          tone={
                            entry.status === 'completed'
                              ? 'pass'
                              : entry.status === 'failed'
                                ? 'fail'
                                : 'neutral'
                          }
                        >
                          {entry.status}
                        </StatusBadge>
                        {entry.error ? (
                          <span className="field-hint" style={{ color: 'var(--status-fail)' }}>
                            {entry.error}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="mono field-hint" style={{ padding: '7px 8px' }}>
                      <div>{entry.videoPath || '—'}</div>
                      {entry.ffprobe ? (
                        <div>ffprobe: {formatFfprobeSummary(entry.ffprobe)}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {entry.videoPath ? (
                          <button
                            type="button"
                            onClick={() => void revealInWorkspace(entry.videoPath)}
                          >
                            {entry.artifactKind === 'spine_json' || entry.videoPath.endsWith('.json')
                              ? 'Reveal Output'
                              : 'Reveal MP4'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy.rendering || busy.previewing}
                          onClick={() => {
                            if (draftProject?.id === entry.projectId) {
                              void renderProject();
                            } else {
                              void openProject(entry.projectId, 'render');
                            }
                          }}
                        >
                          {draftProject?.id === entry.projectId ? 'Retry' : 'Open Project'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
