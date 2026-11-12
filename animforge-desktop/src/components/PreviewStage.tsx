import { useEffect, useId, useRef, useState } from 'react';
import type {
  GiveMotionPreviewResult,
  ProjectDetail,
  RenderProgressPayload,
} from '../types';

export interface PreviewStageProps {
  project: ProjectDetail | null;
  previewResult: GiveMotionPreviewResult | null;
  previewRev: number;
  bundleUrl: string | null;
  playerScriptUrl: string | null;
  videoUrl: string | null;
  previewing: boolean;
  rendering: boolean;
  cancelling: boolean;
  renderProgress: RenderProgressPayload | null;
  onPreview: () => void;
  onRender: () => void;
  onCancelRender: () => void;
  loadPlayerScript?: (src: string) => Promise<void>;
}

const inFlightScripts = new Map<string, Promise<void>>();

export function defaultLoadPlayerScript(src: string): Promise<void> {
  if (typeof customElements !== 'undefined' && customElements.get('gm-player')) {
    return Promise.resolve();
  }

  const existingPromise = inFlightScripts.get(src);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.gmPlayer = '1';

    script.addEventListener(
      'load',
      () => {
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      'error',
      () => {
        inFlightScripts.delete(src);
        script.remove();
        reject(new Error(`Failed to load gm-player.js from ${src}`));
      },
      { once: true }
    );

    document.head.appendChild(script);
  });

  inFlightScripts.set(src, promise);
  return promise;
}

type PlaybackState = 'loading' | 'ready' | 'playing' | 'paused' | 'ended';
type StageViewMode = 'bundle' | 'video';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function PreviewStage({
  project,
  previewResult,
  previewRev,
  bundleUrl,
  playerScriptUrl,
  videoUrl,
  previewing,
  rendering,
  cancelling,
  renderProgress,
  onPreview,
  onRender,
  onCancelRender,
  loadPlayerScript,
}: PreviewStageProps) {
  const progressId = useId();
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('loading');
  const [timeSummary, setTimeSummary] = useState<string>('0:00 / 0:00');
  const [viewMode, setViewMode] = useState<StageViewMode>('bundle');

  const playerRef = useRef<HTMLElement | null>(null);
  const loadedScriptRef = useRef<{ url: string; loader: (src: string) => Promise<void> } | null>(
    null
  );
  const prevVideoUrlRef = useRef<string | null>(null);
  const prevBundleUrlRef = useRef<string | null>(null);

  const effectiveLoader = loadPlayerScript ?? defaultLoadPlayerScript;

  useEffect(() => {
    if (videoUrl && videoUrl !== prevVideoUrlRef.current) {
      setViewMode('video');
    } else if (!videoUrl && bundleUrl) {
      setViewMode('bundle');
    } else if (bundleUrl && bundleUrl !== prevBundleUrlRef.current && videoUrl === prevVideoUrlRef.current) {
      setViewMode('bundle');
    }
    prevVideoUrlRef.current = videoUrl;
    prevBundleUrlRef.current = bundleUrl;
  }, [bundleUrl, videoUrl]);

  useEffect(() => {
    if (!playerScriptUrl) {
      setScriptReady(false);
      setScriptError(null);
      return;
    }

    if (
      loadedScriptRef.current &&
      loadedScriptRef.current.url === playerScriptUrl &&
      loadedScriptRef.current.loader === effectiveLoader
    ) {
      setScriptReady(true);
      setScriptError(null);
      return;
    }

    let cancelled = false;
    setScriptReady(false);
    setScriptError(null);

    effectiveLoader(playerScriptUrl)
      .then(() => {
        if (cancelled) return;
        loadedScriptRef.current = { url: playerScriptUrl, loader: effectiveLoader };
        setScriptReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        loadedScriptRef.current = null;
        setScriptReady(false);
        setScriptError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [playerScriptUrl, previewRev, retryNonce, effectiveLoader]);

  useEffect(() => {
    setPlaybackState('loading');
    setTimeSummary('0:00 / 0:00');
  }, [bundleUrl, viewMode]);

  useEffect(() => {
    const el = playerRef.current as
      | (HTMLElement & { currentTime?: number; duration?: number })
      | null;
    if (!el || !scriptReady || !bundleUrl || viewMode !== 'bundle') {
      return;
    }

    const syncTimes = () => {
      const cur = typeof el.currentTime === 'number' ? el.currentTime : 0;
      const dur = typeof el.duration === 'number' ? el.duration : 0;
      setTimeSummary(`${formatTime(cur)} / ${formatTime(dur)}`);
    };

    const onReady = () => {
      setPlaybackState('ready');
      syncTimes();
    };
    const onPlay = () => {
      setPlaybackState('playing');
    };
    const onPause = () => {
      setPlaybackState('paused');
    };
    const onEnded = () => {
      setPlaybackState('ended');
      syncTimes();
    };
    const onTimeUpdate = () => {
      syncTimes();
    };

    el.addEventListener('ready', onReady);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      el.removeEventListener('ready', onReady);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [project?.id, previewRev, bundleUrl, scriptReady, viewMode]);

  const showVideo = Boolean(videoUrl && (viewMode === 'video' || !bundleUrl));
  const showPlayer = Boolean(!showVideo && bundleUrl && scriptReady);
  const progressPercent = Math.min(100, Math.max(0, Math.round(renderProgress?.progress ?? 0)));

  return (
    <section className="panel stage-panel">
      <div className="stage-header">
        <div>
          <h2>Stage Preview</h2>
          <p className="stage-subtitle">
            {project
              ? `${project.name} (${project.width}x${project.height} @ ${project.fps} fps)`
              : 'Select or create a project to preview and render.'}
          </p>
        </div>

        <div className="stage-actions">
          {bundleUrl && videoUrl ? (
            <div className="view-switch">
              <button
                type="button"
                aria-pressed={viewMode === 'bundle'}
                onClick={() => setViewMode('bundle')}
              >
                Interactive Player
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'video'}
                onClick={() => setViewMode('video')}
              >
                Rendered MP4
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onPreview}
            disabled={!project || previewing || rendering}
          >
            {previewing ? 'Bundling...' : 'Preview Bundle'}
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={onRender}
            disabled={!project || rendering || previewing}
          >
            {rendering ? 'Rendering...' : 'Render MP4'}
          </button>
        </div>
      </div>

      {rendering ? (
        <div className="render-progress-box">
          <div className="render-progress-top">
            <label htmlFor={progressId}>
              Render progress ({renderProgress?.phase ?? 'starting'}) — {progressPercent}%
            </label>
            <button type="button" onClick={onCancelRender} disabled={cancelling}>
              {cancelling ? 'Cancelling...' : 'Cancel Render'}
            </button>
          </div>
          <progress id={progressId} className="render-progress-bar" max={100} value={progressPercent}>
            {progressPercent}%
          </progress>
          {renderProgress ? (
            <p className="render-meta">
              {renderProgress.done != null && renderProgress.total != null
                ? `Frames ${renderProgress.done} / ${renderProgress.total}`
                : 'Preparing frames'}
              {renderProgress.fps != null ? ` · ${renderProgress.fps.toFixed(1)} fps` : ''}
              {renderProgress.eta != null ? ` · ETA ${renderProgress.eta.toFixed(1)}s` : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {scriptError ? (
        <div role="alert" className="studio-alert">
          <span>Player script error: {scriptError}</span>
          <button type="button" onClick={() => setRetryNonce((n) => n + 1)}>
            Retry Player
          </button>
        </div>
      ) : null}

      <div
        className="stage-viewport"
        style={
          project
            ? ({ '--stage-aspect': `${project.width} / ${project.height}` } as React.CSSProperties)
            : undefined
        }
      >
        {!project ? (
          <p className="stage-empty">No project active.</p>
        ) : showVideo && videoUrl ? (
          <video
            key={videoUrl}
            className="stage-video"
            controls
            width={project.width}
            height={project.height}
            src={videoUrl}
          />
        ) : showPlayer && bundleUrl ? (
          <gm-player
            key={`${project.id}:${previewRev}`}
            ref={playerRef}
            src={bundleUrl}
            controls=""
            className="stage-gm-player"
          />
        ) : bundleUrl && !scriptError ? (
          <p className="stage-empty">Loading GiveMotion player...</p>
        ) : (
          <p className="stage-empty">
            Click Preview Bundle to compile and inspect the GiveMotion composition.
          </p>
        )}
      </div>

      {showPlayer ? (
        <div className="playback-bar">
          <span className="badge badge-pass">
            {playbackState.charAt(0).toUpperCase() + playbackState.slice(1)}
          </span>
          <span className="playback-time">{timeSummary}</span>
        </div>
      ) : null}

      {project && project.scenes.length > 0 ? (
        <details className="scene-description-details" open={Boolean(showVideo)}>
          <summary>Accessible Scene Description &amp; Script</summary>
          <ol className="scene-description-list">
            {project.scenes.map((scene) => (
              <li key={scene.id}>
                <strong>{scene.title}</strong> ({scene.duration}s):{' '}
                <span>{scene.description}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {previewResult ? (
        <div className="qa-panel">
          <div className="qa-summary-row">
            <h3>GiveMotion QA Check</h3>
            <span className={`badge ${previewResult.ok ? 'badge-pass' : 'badge-fail'}`}>
              {previewResult.ok ? 'PASS' : 'ERRORS'}
            </span>
            <span className="qa-counts">
              {previewResult.errors} errors · {previewResult.warnings} warnings · {previewResult.notes}{' '}
              notes
            </span>
          </div>
          {previewResult.issues.length > 0 ? (
            <ul className="qa-issues" role="list">
              {previewResult.issues.map((issue, idx) => {
                const sev = (issue.severity || 'note').toLowerCase();
                const badgeClass =
                  sev === 'error'
                    ? 'badge-fail'
                    : sev === 'warning'
                      ? 'badge-warn'
                      : 'badge-pass';
                return (
                  <li key={`${issue.code ?? 'issue'}-${idx}`} className="qa-issue-item">
                    <span className={`badge ${badgeClass}`}>{sev.toUpperCase()}</span>
                    {issue.code ? <code className="qa-code">{issue.code}</code> : null}
                    <span>{issue.message}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
