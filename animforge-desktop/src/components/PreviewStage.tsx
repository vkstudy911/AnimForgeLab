import { useEffect, useId, useRef, useState } from 'react';
import type {
  GiveMotionPreviewResult,
  ProjectDetail,
  RenderProgressPayload,
  StageControlsApi,
} from '../types';
import {
  FullscreenIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  SkipBackIcon,
  SkipForwardIcon,
  StepBackIcon,
  StepForwardIcon,
  StopIcon,
  VolumeIcon,
  VolumeMuteIcon,
} from './ui/Icons';

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
  playheadTime?: number;
  onPlayheadChange?: (t: number) => void;
  onRegisterControls?: (api: StageControlsApi | null) => void;
  defaultSafeZones?: boolean;
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
type StageZoom = 'fit' | '0.5' | '1' | '1.5';

type MediaLikeElement = HTMLElement & {
  currentTime?: number;
  duration?: number;
  paused?: boolean;
  muted?: boolean;
  loop?: boolean;
  playbackRate?: number;
  play?: () => Promise<void> | void;
  pause?: () => void;
};

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
  playheadTime,
  onPlayheadChange,
  onRegisterControls,
  defaultSafeZones = true,
}: PreviewStageProps) {
  const progressId = useId();
  const zoomSelectId = useId();
  const speedSelectId = useId();
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('loading');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewMode, setViewMode] = useState<StageViewMode>('bundle');
  const [zoom, setZoom] = useState<StageZoom>('fit');
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<0.5 | 1 | 2>(1);
  const [loop, setLoop] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(defaultSafeZones);
  const [qaOpen, setQaOpen] = useState(true);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadedScriptRef = useRef<{ url: string; loader: (src: string) => Promise<void> } | null>(
    null
  );
  const prevVideoUrlRef = useRef<string | null>(null);
  const prevBundleUrlRef = useRef<string | null>(null);
  const emittedPlayheadRef = useRef<number | null>(null);

  const effectiveLoader = loadPlayerScript ?? defaultLoadPlayerScript;
  const projectDuration =
    project?.scenes.reduce(
      (sum, s) => sum + (Number.isFinite(s.duration) ? Math.max(0, s.duration) : 0),
      0
    ) ?? 0;
  const effectiveDuration = duration > 0 ? duration : projectDuration;

  useEffect(() => {
    setShowSafeZones(defaultSafeZones);
  }, [defaultSafeZones]);

  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      if (bundleUrl) {
        setViewMode('bundle');
      } else if (videoUrl) {
        setViewMode('video');
      }
    } else {
      if (videoUrl && videoUrl !== prevVideoUrlRef.current) {
        setViewMode('video');
      } else if (bundleUrl && bundleUrl !== prevBundleUrlRef.current && videoUrl === prevVideoUrlRef.current) {
        setViewMode('bundle');
      }
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
    setCurrentTime(0);
    setDuration(0);
  }, [bundleUrl, videoUrl, viewMode]);

  useEffect(() => {
    if (previewResult && previewResult.issues.length > 0) {
      setQaOpen(true);
    }
  }, [previewResult]);

  const showVideo = Boolean(videoUrl && (viewMode === 'video' || !bundleUrl));
  const showPlayer = Boolean(!showVideo && bundleUrl && scriptReady);

  useEffect(() => {
    const el: MediaLikeElement | null = showVideo
      ? (videoRef.current as MediaLikeElement | null)
      : showPlayer
        ? (playerRef.current as MediaLikeElement | null)
        : null;

    if (!el) return;

    const syncTimes = () => {
      const cur = typeof el.currentTime === 'number' && Number.isFinite(el.currentTime) ? el.currentTime : 0;
      const dur = typeof el.duration === 'number' && Number.isFinite(el.duration) ? el.duration : 0;
      setCurrentTime(cur);
      setDuration(dur);
      if (onPlayheadChange) {
        emittedPlayheadRef.current = cur;
        onPlayheadChange(cur);
      }
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
    el.addEventListener('loadedmetadata', onReady);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      el.removeEventListener('ready', onReady);
      el.removeEventListener('loadedmetadata', onReady);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [project?.id, previewRev, bundleUrl, videoUrl, scriptReady, viewMode, showVideo, showPlayer, onPlayheadChange]);

  useEffect(() => {
    if (typeof playheadTime !== 'number' || !Number.isFinite(playheadTime)) return;
    setCurrentTime(playheadTime);
    if (
      emittedPlayheadRef.current !== null &&
      Math.abs(playheadTime - emittedPlayheadRef.current) < 0.001
    ) {
      emittedPlayheadRef.current = null;
      return;
    }
    emittedPlayheadRef.current = null;
    const el: MediaLikeElement | null = showVideo
      ? (videoRef.current as MediaLikeElement | null)
      : showPlayer
        ? (playerRef.current as MediaLikeElement | null)
        : null;
    if (el) {
      if (typeof (el as unknown as { seekTo?: (t: number) => void }).seekTo === 'function') {
        try {
          (el as unknown as { seekTo: (t: number) => void }).seekTo(playheadTime);
        } catch {
          // Ignore
        }
      } else if (typeof el.currentTime === 'number' && Math.abs(el.currentTime - playheadTime) > 0.05) {
        try {
          el.currentTime = playheadTime;
        } catch {
          // Ignore read-only currentTime on custom elements
        }
      }
    }
  }, [playheadTime, showVideo, showPlayer]);

  const getActiveMedia = (): MediaLikeElement | null =>
    showVideo
      ? (videoRef.current as MediaLikeElement | null)
      : showPlayer
        ? (playerRef.current as MediaLikeElement | null)
        : null;

  const seekTo = (nextTime: number) => {
    const safeNext = Number.isFinite(nextTime) ? nextTime : 0;
    const clamped = Math.max(0, Math.min(effectiveDuration || 0, safeNext));
    setCurrentTime(clamped);
    onPlayheadChange?.(clamped);
    const el = getActiveMedia();
    if (el) {
      if (typeof (el as unknown as { seekTo?: (t: number) => void }).seekTo === 'function') {
        try {
          (el as unknown as { seekTo: (t: number) => void }).seekTo(clamped);
        } catch {
          // Ignore
        }
      } else if ('currentTime' in el) {
        try {
          el.currentTime = clamped;
        } catch {
          // Ignore non-writable currentTime
        }
      }
    }
  };

  const togglePlayPause = () => {
    const el = getActiveMedia();
    if (!el) return;
    if (playbackState === 'playing') {
      try {
        el.pause?.();
      } catch {
        // Ignore
      }
      setPlaybackState('paused');
    } else {
      try {
        const res = el.play?.();
        if (res && typeof (res as Promise<void>).catch === 'function') {
          (res as Promise<void>).catch(() => {
            // Ignore autoplay restriction errors in test/headless
          });
        }
      } catch {
        // Ignore
      }
      setPlaybackState('playing');
    }
  };

  const stop = () => {
    const el = getActiveMedia();
    if (el) {
      try {
        el.pause?.();
      } catch {
        // Ignore
      }
    }
    setPlaybackState('paused');
    seekTo(0);
  };

  const stepFrame = (deltaFrames: number) => {
    const rawFps = project?.fps;
    const fps = typeof rawFps === 'number' && Number.isFinite(rawFps) && rawFps > 0 ? rawFps : 30;
    const baseTime = typeof playheadTime === 'number' ? playheadTime : currentTime;
    const nextTime = Number((baseTime + deltaFrames / fps).toFixed(4));
    seekTo(nextTime);
  };

  useEffect(() => {
    const el = getActiveMedia();
    if (!el) return;
    try {
      el.muted = muted;
      el.loop = loop;
      el.playbackRate = playbackRate;
    } catch {
      // Ignore read-only properties on custom elements
    }
  }, [muted, loop, playbackRate, showVideo, showPlayer, bundleUrl, videoUrl, previewRev]);

  const controlsRef = useRef<StageControlsApi>({
    togglePlayPause: () => {},
    stepFrame: () => {},
    stop: () => {},
  });
  controlsRef.current.togglePlayPause = togglePlayPause;
  controlsRef.current.stepFrame = stepFrame;
  controlsRef.current.stop = stop;

  useEffect(() => {
    if (!onRegisterControls) return;
    const api: StageControlsApi = {
      togglePlayPause: () => controlsRef.current.togglePlayPause(),
      stepFrame: (deltaFrames) => controlsRef.current.stepFrame(deltaFrames),
      stop: () => controlsRef.current.stop(),
    };
    onRegisterControls(api);
    return () => {
      onRegisterControls(null);
    };
  }, [onRegisterControls]);

  const handleFullscreen = () => {
    try {
      void viewportRef.current?.requestFullscreen?.();
    } catch {
      // Ignore fullscreen rejection
    }
  };

  const progressPercent = Math.min(100, Math.max(0, Math.round(renderProgress?.progress ?? 0)));
  const stageZoomValue = zoom === 'fit' ? 1 : Number(zoom);
  const displayTime = typeof playheadTime === 'number' ? playheadTime : currentTime;
  const timeSummary = `${formatTime(displayTime)} / ${formatTime(effectiveDuration)}`;

  return (
    <section className="panel stage-panel" aria-label="Animation Preview Stage">
      <div className="stage-toolbar">
        <div className="stage-actions">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Stage Preview</h2>
            <p className="stage-subtitle" style={{ fontSize: 'var(--text-xs)' }}>
              {project
                ? `${project.name} (${project.width}x${project.height} @ ${project.fps} fps)`
                : 'Select or create a project to preview and render.'}
            </p>
          </div>

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

        <div className="stage-toolbar-right">
          <label htmlFor={zoomSelectId} className="sr-only">
            Stage Zoom
          </label>
          <select
            id={zoomSelectId}
            aria-label="Stage Zoom"
            value={zoom}
            onChange={(ev) => setZoom(ev.target.value as StageZoom)}
            style={{ width: 'auto', padding: '3px 6px', fontSize: 'var(--text-xs)' }}
          >
            <option value="fit">Fit</option>
            <option value="0.5">50%</option>
            <option value="1">100%</option>
            <option value="1.5">150%</option>
          </select>

          <button
            type="button"
            aria-pressed={showSafeZones}
            onClick={() => setShowSafeZones((s) => !s)}
            title="Toggle broadcast safe-zone overlay"
            style={{ fontSize: 'var(--text-xs)' }}
          >
            Safe Zones
          </button>

          <button
            type="button"
            aria-label="Fullscreen preview"
            title="Fullscreen preview"
            onClick={handleFullscreen}
          >
            <FullscreenIcon size={14} />
          </button>

          {previewResult ? (
            <button
              type="button"
              className={`badge ${previewResult.ok ? 'badge-pass' : 'badge-fail'}`}
              aria-expanded={qaOpen}
              onClick={() => setQaOpen((o) => !o)}
              title="Toggle GiveMotion QA report"
            >
              {previewResult.ok ? 'Preview Ready' : `Errors (${previewResult.errors})`}
            </button>
          ) : null}
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

      <div ref={viewportRef} className="stage-viewport-matte">
        <div
          className="stage-canvas-frame"
          style={
            {
              '--stage-aspect': project ? `${project.width} / ${project.height}` : '16 / 9',
              '--stage-ratio': project
                ? String(Math.max(0.1, project.width) / Math.max(1, project.height))
                : String(16 / 9),
              '--stage-zoom': String(stageZoomValue),
            } as React.CSSProperties
          }
        >
          {!project ? (
            <div className="stage-empty-box">
              <p className="stage-empty">No project active.</p>
            </div>
          ) : showVideo && videoUrl ? (
            <video
              ref={videoRef}
              key={videoUrl}
              className="stage-video"
              controls
              muted={muted}
              loop={loop}
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
              muted={muted ? '' : undefined}
              loop={loop ? '' : undefined}
              rate={String(playbackRate)}
              className="stage-gm-player"
            />
          ) : bundleUrl && !scriptError ? (
            <div className="stage-empty-box">
              <p className="stage-empty">Loading GiveMotion player...</p>
            </div>
          ) : (
            <div className="stage-empty-box">
              <p className="stage-empty">
                Click Preview Bundle to compile and inspect the GiveMotion composition.
              </p>
            </div>
          )}

          {showSafeZones && project ? <div className="stage-safe-zone" aria-hidden="true" /> : null}
        </div>
      </div>

      <div className="stage-transport">
        <button
          type="button"
          aria-label="Skip to start"
          onClick={() => seekTo(0)}
          disabled={!project}
        >
          <SkipBackIcon size={14} />
        </button>

        <button
          type="button"
          aria-label="Step back 1 frame"
          title="Step back 1 frame (ArrowLeft)"
          onClick={() => stepFrame(-1)}
          disabled={!project}
        >
          <StepBackIcon size={14} />
        </button>

        <button
          type="button"
          className="transport-play-btn btn-primary"
          aria-label={playbackState === 'playing' ? 'Pause' : 'Play'}
          onClick={togglePlayPause}
          disabled={!showPlayer && !showVideo}
        >
          {playbackState === 'playing' ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </button>

        <button
          type="button"
          aria-label="Stop"
          title="Stop playback and return to 0s"
          onClick={stop}
          disabled={!project}
        >
          <StopIcon size={13} />
        </button>

        <button
          type="button"
          aria-label="Step forward 1 frame"
          title="Step forward 1 frame (ArrowRight)"
          onClick={() => stepFrame(1)}
          disabled={!project}
        >
          <StepForwardIcon size={14} />
        </button>

        <button
          type="button"
          aria-label="Skip to end"
          onClick={() => seekTo(effectiveDuration)}
          disabled={!project}
        >
          <SkipForwardIcon size={14} />
        </button>

        <input
          type="range"
          className="transport-scrubber"
          aria-label="Stage playhead scrubber"
          min={0}
          max={Math.max(0.1, effectiveDuration)}
          step={0.05}
          value={Math.min(displayTime, Math.max(0.1, effectiveDuration))}
          onChange={(ev) => seekTo(Number(ev.target.value))}
          disabled={!project}
        />

        <button
          type="button"
          aria-label={muted ? 'Unmute stage audio' : 'Mute stage audio'}
          title={muted ? 'Unmute stage audio' : 'Mute stage audio'}
          aria-pressed={muted}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? <VolumeMuteIcon size={14} /> : <VolumeIcon size={14} />}
        </button>

        <button
          type="button"
          aria-label="Loop playback"
          title="Loop playback"
          aria-pressed={loop}
          onClick={() => setLoop((l) => !l)}
        >
          <RepeatIcon size={14} />
        </button>

        <label htmlFor={speedSelectId} className="sr-only">
          Playback speed
        </label>
        <select
          id={speedSelectId}
          aria-label="Playback speed"
          value={String(playbackRate)}
          onChange={(ev) => setPlaybackRate(Number(ev.target.value) as 0.5 | 1 | 2)}
          style={{ width: 'auto', padding: '3px 6px', fontSize: 'var(--text-xs)' }}
        >
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="2">2x</option>
        </select>

        {showPlayer ? (
          <span className="badge badge-pass">
            {playbackState.charAt(0).toUpperCase() + playbackState.slice(1)}
          </span>
        ) : null}

        <span className="playback-time mono">{timeSummary}</span>
      </div>

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

      {previewResult && qaOpen ? (
        <div className="qa-drawer">
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
