import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useStudioContext } from '../../context/StudioContext';
import type { SceneDetail } from '../../types';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MusicIcon,
  ScissorsIcon,
  UnlockIcon,
  VolumeIcon,
  VolumeMuteIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../ui/Icons';

const BASE_PX_PER_SEC = 64;

type TrackKey = 'scene' | 'actions' | 'camera' | 'audio';

const TRACK_ROWS: Array<{ key: TrackKey; label: string }> = [
  { key: 'scene', label: 'Scene' },
  { key: 'actions', label: 'Character Actions' },
  { key: 'camera', label: 'Camera' },
  { key: 'audio', label: 'Audio' },
];

type DragPreview =
  | {
      kind: 'action';
      mode: 'move' | 'resize';
      sceneId: string;
      actionId: string;
      startTime: number;
      duration: number;
    }
  | {
      kind: 'camera';
      mode: 'resize';
      sceneId: string;
      index: number;
      duration: number;
    }
  | {
      kind: 'audio';
      mode: 'move';
      sceneId: string;
      index: number;
      startTime: number;
    }
  | {
      kind: 'scene';
      mode: 'resize';
      sceneId: string;
      duration: number;
    };

function sortScenes(scenes: SceneDetail[]): SceneDetail[] {
  return [...scenes].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
}

function formatTimecode(seconds: number): string {
  const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const tenths = Math.floor((s * 10) % 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function snapValue(rawSec: number, enabled: boolean, magnetTargets: number[] = []): number {
  const safeSec = Number.isFinite(rawSec) ? rawSec : 0;
  const clamped = Math.max(0, safeSec);
  if (!enabled) return Number(clamped.toFixed(2));
  for (const target of magnetTargets) {
    if (Math.abs(clamped - target) <= 0.12) {
      return Number(Math.max(0, target).toFixed(2));
    }
  }
  return Number((Math.round(clamped * 4) / 4).toFixed(2));
}

export function MultiTrackTimeline({
  collapsed = false,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const {
    draftProject,
    selectedSceneId,
    setSelectedSceneId,
    selection,
    setSelection,
    playheadTime,
    setPlayheadTime,
    timelineZoom,
    setTimelineZoom,
    trackVisibility,
    toggleTrackVisibility,
    updateDraft,
  } = useStudioContext();

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [lockedTracks, setLockedTracks] = useState<Record<TrackKey, boolean>>({
    scene: false,
    actions: false,
    camera: false,
    audio: false,
  });
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  if (!draftProject) return null;

  const orderedScenes = sortScenes(draftProject.scenes);
  let cursor = 0;
  const sceneSpans = orderedScenes.map((scene) => {
    const rawDur =
      dragPreview?.kind === 'scene' && dragPreview.sceneId === scene.id
        ? dragPreview.duration
        : scene.duration;
    const dur = Math.max(0.5, Number.isFinite(rawDur) ? rawDur : 1);
    const span = { scene, start: cursor, duration: dur };
    cursor += dur;
    return span;
  });

  const totalDuration = Math.max(1, cursor);
  const pxPerSec = BASE_PX_PER_SEC * timelineZoom;
  const laneWidth = Math.max(520, Math.ceil(totalDuration * pxPerSec));
  const tickStep = timelineZoom < 0.75 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= Math.ceil(totalDuration); t += tickStep) {
    ticks.push(t);
  }

  const allAudioTracks = draftProject.scenes.flatMap((s) => s.timeline.audioTracks);
  const allAudioMuted =
    allAudioTracks.length > 0 && allAudioTracks.every((track) => Boolean(track.muted));

  const toggleTrackLock = (track: TrackKey) => {
    setLockedTracks((prev) => ({ ...prev, [track]: !prev[track] }));
  };

  const toggleAllAudioMute = () => {
    if (lockedTracks.audio || allAudioTracks.length === 0) return;
    const nextMuted = !allAudioMuted;
    updateDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => ({
        ...scene,
        timeline: {
          ...scene.timeline,
          audioTracks: scene.timeline.audioTracks.map((track) => ({
            ...track,
            muted: nextMuted,
          })),
        },
      })),
    }));
  };

  const scrubToClientX = (rulerEl: HTMLDivElement, clientX: number) => {
    const rect = rulerEl.getBoundingClientRect();
    const x = Math.max(0, clientX - rect.left);
    const nextTime = Math.min(totalDuration, Math.round((x / pxPerSec) * 100) / 100);
    setPlayheadTime(nextTime);
  };

  const handleRulerPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0) return;
    const rulerEl = ev.currentTarget;
    dragCleanupRef.current?.();
    scrubToClientX(rulerEl, ev.clientX);

    const onMove = (moveEv: PointerEvent) => {
      if (!Number.isFinite(moveEv.clientX)) return;
      scrubToClientX(rulerEl, moveEv.clientX);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      if (dragCleanupRef.current === cleanup) {
        dragCleanupRef.current = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
    dragCleanupRef.current = cleanup;
  };

  const handleRulerClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    scrubToClientX(ev.currentTarget, ev.clientX);
  };

  const handleRulerKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      setPlayheadTime(Math.min(totalDuration, Number((playheadTime + 0.25).toFixed(2))));
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      setPlayheadTime(Math.max(0, Number((playheadTime - 0.25).toFixed(2))));
    } else if (ev.key === 'Home') {
      ev.preventDefault();
      setPlayheadTime(0);
    } else if (ev.key === 'End') {
      ev.preventDefault();
      setPlayheadTime(totalDuration);
    }
  };

  const startPointerDrag = (
    ev: React.PointerEvent,
    computePreview: (deltaSec: number) => DragPreview,
    commitPreview: (finalPreview: DragPreview) => void
  ) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    dragCleanupRef.current?.();

    const startX = ev.clientX;
    let moved = false;
    let latestPreview = computePreview(0);

    const onMove = (moveEv: PointerEvent) => {
      if (!Number.isFinite(moveEv.clientX)) return;
      const dx = moveEv.clientX - startX;
      if (Math.abs(dx) >= 3) moved = true;
      latestPreview = computePreview(dx / pxPerSec);
      setDragPreview(latestPreview);
    };

    const removeListeners = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (dragCleanupRef.current === onCancel) {
        dragCleanupRef.current = null;
      }
    };

    const onUp = () => {
      removeListeners();
      setDragPreview(null);
      if (moved) {
        commitPreview(latestPreview);
      }
    };

    const onCancel = () => {
      removeListeners();
      setDragPreview(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    dragCleanupRef.current = onCancel;
  };

  const selectedActionOverlap = (() => {
    if (selection?.kind !== 'action' || lockedTracks.actions) return null;
    const span = sceneSpans.find((s) => s.scene.id === selection.sceneId);
    const action = span?.scene.timeline.characterActions.find(
      (a) => a.actionId === selection.actionId
    );
    if (!span || !action) return null;
    const localPlayhead = playheadTime - span.start;
    if (localPlayhead > action.startTime + 0.1 && localPlayhead < action.startTime + action.duration - 0.1) {
      return { span, action, localPlayhead };
    }
    return null;
  })();

  const sceneAtPlayhead = (() => {
    if (lockedTracks.scene) return null;
    for (const span of sceneSpans) {
      if (playheadTime > span.start + 0.25 && playheadTime < span.start + span.duration - 0.25) {
        return { span, offset: Number((playheadTime - span.start).toFixed(2)) };
      }
    }
    return null;
  })();

  const canSplitAtPlayhead = Boolean(selectedActionOverlap || sceneAtPlayhead);

  const handleSplitAtPlayhead = () => {
    if (selectedActionOverlap) {
      const { span, action, localPlayhead } = selectedActionOverlap;
      const splitOffset = Number(localPlayhead.toFixed(2));
      const firstDur = Number((splitOffset - action.startTime).toFixed(2));
      const secondDur = Number((action.startTime + action.duration - splitOffset).toFixed(2));
      if (firstDur < 0.1 || secondDur < 0.1) return;
      const secondId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      updateDraft((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) => {
          if (scene.id !== span.scene.id) return scene;
          return {
            ...scene,
            timeline: {
              ...scene.timeline,
              characterActions: scene.timeline.characterActions.flatMap((a) =>
                a.actionId === action.actionId
                  ? [
                      { ...a, duration: firstDur },
                      {
                        ...structuredClone(a),
                        actionId: secondId,
                        startTime: splitOffset,
                        duration: secondDur,
                      },
                    ]
                  : [a]
              ),
            },
          };
        }),
      }));
      return;
    }

    if (sceneAtPlayhead) {
      const { span, offset } = sceneAtPlayhead;
      const secondId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const secondDur = Number((span.duration - offset).toFixed(2));
      if (offset < 0.25 || secondDur < 0.25) return;
      updateDraft((prev) => {
        const list = sortScenes(prev.scenes);
        const idx = list.findIndex((s) => s.id === span.scene.id);
        if (idx < 0) return prev;
        const orig = list[idx];
        const firstActions = orig.timeline.characterActions
          .filter((a) => a.startTime + 0.1 <= offset)
          .map((a) => ({
            ...a,
            duration: Math.max(0.1, Math.min(a.duration, Number((offset - a.startTime).toFixed(2)))),
          }));
        const secondActions = orig.timeline.characterActions
          .filter((a) => a.startTime + a.duration - offset >= 0.1)
          .map((a) => ({
            ...structuredClone(a),
            actionId: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            startTime: Math.max(0, Number((a.startTime - offset).toFixed(2))),
            duration: Math.max(
              0.1,
              Math.min(
                secondDur,
                Number((a.startTime < offset ? a.startTime + a.duration - offset : a.duration).toFixed(2))
              )
            ),
          }));
        const firstScene: SceneDetail = {
          ...orig,
          duration: offset,
          timeline: {
            ...orig.timeline,
            duration: offset,
            characterActions: firstActions,
            cameraMoves: orig.timeline.cameraMoves.map((c) => ({
              ...c,
              duration: Math.max(0.1, Math.min(c.duration, offset)),
            })),
            audioTracks: orig.timeline.audioTracks.filter((t) => t.startTime < offset),
          },
        };
        const secondScene: SceneDetail = {
          ...structuredClone(orig),
          id: secondId,
          title: `${orig.title} (Part 2)`,
          duration: secondDur,
          timeline: {
            ...structuredClone(orig.timeline),
            duration: secondDur,
            characterActions: secondActions,
            cameraMoves: [],
            audioTracks: orig.timeline.audioTracks
              .filter((t) => t.startTime >= offset)
              .map((t) => ({ ...t, startTime: Number((t.startTime - offset).toFixed(2)) })),
          },
        };
        const nextList = [...list];
        nextList.splice(idx, 1, firstScene, secondScene);
        return {
          ...prev,
          scenes: nextList.map((s, i) => ({ ...s, sequenceIndex: i })),
        };
      });
      if (selection?.kind === 'action' && selection.sceneId === span.scene.id) {
        setSelection(null);
      }
    }
  };

  const handleClipDeleteKey = (
    ev: React.KeyboardEvent,
    track: TrackKey,
    target:
      | { kind: 'action'; sceneId: string; actionId: string }
      | { kind: 'camera'; sceneId: string; index: number }
      | { kind: 'audio'; sceneId: string; index: number }
      | { kind: 'scene'; sceneId: string }
  ) => {
    if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (lockedTracks[track]) return;

    if (target.kind === 'action') {
      updateDraft((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) =>
          scene.id === target.sceneId
            ? {
                ...scene,
                timeline: {
                  ...scene.timeline,
                  characterActions: scene.timeline.characterActions.filter(
                    (a) => a.actionId !== target.actionId
                  ),
                },
              }
            : scene
        ),
      }));
      setSelection({ kind: 'scene', id: target.sceneId });
    } else if (target.kind === 'camera') {
      updateDraft((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) =>
          scene.id === target.sceneId
            ? {
                ...scene,
                timeline: {
                  ...scene.timeline,
                  cameraMoves: scene.timeline.cameraMoves.filter((_, i) => i !== target.index),
                },
              }
            : scene
        ),
      }));
      setSelection({ kind: 'scene', id: target.sceneId });
    } else if (target.kind === 'audio') {
      updateDraft((prev) => ({
        ...prev,
        scenes: prev.scenes.map((scene) =>
          scene.id === target.sceneId
            ? {
                ...scene,
                timeline: {
                  ...scene.timeline,
                  audioTracks: scene.timeline.audioTracks.filter((_, i) => i !== target.index),
                },
              }
            : scene
        ),
      }));
      setSelection({ kind: 'scene', id: target.sceneId });
    } else if (target.kind === 'scene' && orderedScenes.length > 1) {
      const idx = orderedScenes.findIndex((s) => s.id === target.sceneId);
      const remaining = orderedScenes.filter((s) => s.id !== target.sceneId);
      updateDraft((prev) => {
        if (prev.scenes.length <= 1) return prev;
        return {
          ...prev,
          scenes: sortScenes(prev.scenes)
            .filter((s) => s.id !== target.sceneId)
            .map((s, i) => ({ ...s, sequenceIndex: i })),
        };
      });
      if (remaining.length > 0) {
        const fallback = remaining[Math.min(Math.max(0, idx), remaining.length - 1)];
        const staleSel =
          selection !== null &&
          ((selection.kind === 'scene' && selection.id === target.sceneId) ||
            ('sceneId' in selection && selection.sceneId === target.sceneId));
        if (selectedSceneId === target.sceneId || staleSel) {
          setSelectedSceneId(fallback.id);
          setSelection({ kind: 'scene', id: fallback.id });
        }
      }
    }
  };

  const adjustZoom = (delta: number) => {
    setTimelineZoom((z) => Math.min(4, Math.max(0.5, Number((z + delta).toFixed(2)))));
  };

  return (
    <section className="studio-timeline-dock" aria-label="Multi-Track Timeline">
      <div className="timeline-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>Timeline</span>
          <span className="mono field-hint">
            {formatTimecode(playheadTime)} / {formatTimecode(totalDuration)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            aria-pressed={snapEnabled}
            onClick={() => setSnapEnabled((s) => !s)}
            title="Snap drags to 0.25s grid and playhead"
            style={{ padding: '2px 6px', fontSize: '11px' }}
          >
            Snap
          </button>

          <button
            type="button"
            aria-label="Split at Playhead"
            title="Split selected action cue or scene at playhead"
            disabled={!canSplitAtPlayhead}
            onClick={handleSplitAtPlayhead}
            style={{
              padding: '2px 6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '11px',
            }}
          >
            <ScissorsIcon size={12} />
            <span>Split</span>
          </button>

          <button
            type="button"
            aria-label="Zoom out timeline"
            title="Zoom out timeline"
            disabled={timelineZoom <= 0.5}
            onClick={() => adjustZoom(-0.25)}
            style={{ padding: '2px 6px' }}
          >
            <ZoomOutIcon size={13} />
          </button>
          <span className="mono field-hint" style={{ minWidth: 38, textAlign: 'center' }}>
            {Math.round(timelineZoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in timeline"
            title="Zoom in timeline"
            disabled={timelineZoom >= 4}
            onClick={() => adjustZoom(0.25)}
            style={{ padding: '2px 6px' }}
          >
            <ZoomInIcon size={13} />
          </button>

          {onToggleCollapse ? (
            <button
              type="button"
              aria-label={collapsed ? 'Expand timeline' : 'Collapse timeline'}
              title={collapsed ? 'Expand timeline' : 'Collapse timeline'}
              onClick={onToggleCollapse}
              style={{ padding: '2px 6px' }}
            >
              {collapsed ? <ChevronUpIcon size={13} /> : <ChevronDownIcon size={13} />}
            </button>
          ) : null}
        </div>
      </div>

      {!collapsed ? (
        <div className="timeline-body">
          <div className="timeline-track-labels">
            {TRACK_ROWS.map((row) => {
              const visible = trackVisibility[row.key];
              const locked = lockedTracks[row.key];
              return (
                <div key={row.key} className="timeline-track-label-row">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {row.key === 'audio' ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        aria-pressed={allAudioMuted}
                        aria-label="Mute Audio track"
                        title={allAudioMuted ? 'Unmute Audio track' : 'Mute Audio track'}
                        disabled={allAudioTracks.length === 0 || locked}
                        onClick={toggleAllAudioMute}
                        style={{ padding: '2px 3px', opacity: allAudioMuted ? 0.5 : 1 }}
                      >
                        {allAudioMuted ? <VolumeMuteIcon size={12} /> : <VolumeIcon size={12} />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-pressed={locked}
                      aria-label={`Lock ${row.label} track`}
                      title={locked ? `Unlock ${row.label} track` : `Lock ${row.label} track`}
                      onClick={() => toggleTrackLock(row.key)}
                      style={{ padding: '2px 3px', opacity: locked ? 1 : 0.6 }}
                    >
                      {locked ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-pressed={visible}
                      aria-label={`Toggle ${row.label} track visibility`}
                      title={visible ? `Hide ${row.label}` : `Show ${row.label}`}
                      onClick={() => toggleTrackVisibility(row.key)}
                      style={{ padding: '2px 3px', opacity: visible ? 1 : 0.5 }}
                    >
                      {visible ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="timeline-lanes-scroll">
            <div style={{ position: 'relative', width: `${laneWidth}px`, minHeight: '100%' }}>
              <div
                className="timeline-ruler"
                role="slider"
                tabIndex={0}
                aria-label="Timeline playhead ruler"
                aria-valuemin={0}
                aria-valuemax={totalDuration}
                aria-valuenow={playheadTime}
                onPointerDown={handleRulerPointerDown}
                onClick={handleRulerClick}
                onKeyDown={handleRulerKeyDown}
              >
                {ticks.map((sec) => (
                  <span
                    key={`tick-${sec}`}
                    className="mono"
                    style={{
                      position: 'absolute',
                      left: `${sec * pxPerSec}px`,
                      top: 4,
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      borderLeft: '1px solid var(--border-subtle)',
                      paddingLeft: 4,
                      pointerEvents: 'none',
                    }}
                  >
                    {sec}s
                  </span>
                ))}
              </div>

              <div
                className="timeline-playhead"
                style={{ left: `${Math.min(laneWidth - 2, playheadTime * pxPerSec)}px` }}
                aria-hidden="true"
              />

              {/* Scene Lane */}
              <div
                className="timeline-lane"
                data-track="scene"
                data-locked={String(lockedTracks.scene)}
                style={{ opacity: trackVisibility.scene ? 1 : 0.25 }}
              >
                {trackVisibility.scene
                  ? sceneSpans.map(({ scene, start, duration }) => {
                      const isSelected =
                        selection?.kind === 'scene'
                          ? selection.id === scene.id
                          : selectedSceneId === scene.id;
                      const displayedDur =
                        dragPreview?.kind === 'scene' && dragPreview.sceneId === scene.id
                          ? dragPreview.duration
                          : duration;
                      return (
                        <button
                          key={`tl-scene-${scene.id}`}
                          type="button"
                          data-timeline-clip="true"
                          className="timeline-clip timeline-clip--scene"
                          aria-pressed={isSelected}
                          onClick={() => {
                            setSelectedSceneId(scene.id);
                            setSelection({ kind: 'scene', id: scene.id });
                          }}
                          onKeyDown={(ev) =>
                            handleClipDeleteKey(ev, 'scene', { kind: 'scene', sceneId: scene.id })
                          }
                          style={{
                            left: `${start * pxPerSec}px`,
                            width: `${Math.max(28, displayedDur * pxPerSec - 2)}px`,
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {scene.title}
                          </span>
                          <span className="mono" style={{ opacity: 0.85 }}>
                            {displayedDur}s
                          </span>
                          {!lockedTracks.scene ? (
                            <span
                              className="timeline-clip-handle"
                              aria-hidden="true"
                              onPointerDown={(ev) => {
                                ev.stopPropagation();
                                const origDur = scene.duration;
                                startPointerDrag(
                                  ev,
                                  (deltaSec) => ({
                                    kind: 'scene',
                                    mode: 'resize',
                                    sceneId: scene.id,
                                    duration: Math.max(
                                      0.5,
                                      snapValue(origDur + deltaSec, snapEnabled, [playheadTime - start])
                                    ),
                                  }),
                                  (finalP) => {
                                    if (finalP.kind !== 'scene' || finalP.duration === origDur) return;
                                    updateDraft((prev) => ({
                                      ...prev,
                                      scenes: prev.scenes.map((s) =>
                                        s.id === scene.id
                                          ? {
                                              ...s,
                                              duration: finalP.duration,
                                              timeline: { ...s.timeline, duration: finalP.duration },
                                            }
                                          : s
                                      ),
                                    }));
                                  }
                                );
                              }}
                            />
                          ) : null}
                        </button>
                      );
                    })
                  : null}
              </div>

              {/* Character Actions Lane */}
              <div
                className="timeline-lane"
                data-track="actions"
                data-locked={String(lockedTracks.actions)}
                style={{ opacity: trackVisibility.actions ? 1 : 0.25 }}
              >
                {trackVisibility.actions
                  ? sceneSpans.flatMap(({ scene, start, duration: sceneDur }) =>
                      scene.timeline.characterActions.map((action) => {
                        const isSelected =
                          selection?.kind === 'action' &&
                          selection.sceneId === scene.id &&
                          selection.actionId === action.actionId;
                        const charId = String(action.parameters?.characterId ?? '');
                        const charName = draftProject.characters.find((c) => c.id === charId)?.name;
                        const label = charName ? `${charName}: ${action.name}` : action.name;
                        const activeDrag =
                          dragPreview?.kind === 'action' &&
                          dragPreview.sceneId === scene.id &&
                          dragPreview.actionId === action.actionId
                            ? dragPreview
                            : null;
                        const displayedStart = activeDrag ? activeDrag.startTime : action.startTime;
                        const displayedDur = activeDrag ? activeDrag.duration : action.duration;

                        return (
                          <button
                            key={`tl-action-${scene.id}-${action.actionId}`}
                            type="button"
                            data-timeline-clip="true"
                            className="timeline-clip timeline-clip--action"
                            aria-pressed={isSelected}
                            onPointerDown={(ev) => {
                              if (lockedTracks.actions) return;
                              const origStart = action.startTime;
                              const origDur = action.duration;
                              const magnet = playheadTime - start;
                              startPointerDrag(
                                ev,
                                (deltaSec) => ({
                                  kind: 'action',
                                  mode: 'move',
                                  sceneId: scene.id,
                                  actionId: action.actionId,
                                  startTime: Math.min(
                                    Math.max(0, sceneDur - 0.1),
                                    snapValue(origStart + deltaSec, snapEnabled, [magnet])
                                  ),
                                  duration: origDur,
                                }),
                                (finalP) => {
                                  if (finalP.kind !== 'action' || finalP.startTime === origStart) return;
                                  updateDraft((prev) => ({
                                    ...prev,
                                    scenes: prev.scenes.map((s) =>
                                      s.id === scene.id
                                        ? {
                                            ...s,
                                            timeline: {
                                              ...s.timeline,
                                              characterActions: s.timeline.characterActions.map((a) =>
                                                a.actionId === action.actionId
                                                  ? { ...a, startTime: finalP.startTime }
                                                  : a
                                              ),
                                            },
                                          }
                                        : s
                                    ),
                                  }));
                                }
                              );
                            }}
                            onClick={() => {
                              setSelectedSceneId(scene.id);
                              setSelection({
                                kind: 'action',
                                sceneId: scene.id,
                                actionId: action.actionId,
                              });
                            }}
                            onKeyDown={(ev) =>
                              handleClipDeleteKey(ev, 'actions', {
                                kind: 'action',
                                sceneId: scene.id,
                                actionId: action.actionId,
                              })
                            }
                            title={`${label} (${displayedStart}s · ${displayedDur}s)`}
                            style={{
                              left: `${(start + displayedStart) * pxPerSec}px`,
                              width: `${Math.max(18, displayedDur * pxPerSec - 2)}px`,
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: 'currentColor',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {label}
                            </span>
                            {!lockedTracks.actions ? (
                              <span
                                className="timeline-clip-handle"
                                aria-hidden="true"
                                onPointerDown={(ev) => {
                                  ev.stopPropagation();
                                  const origStart = action.startTime;
                                  const origDur = action.duration;
                                  const magnet = playheadTime - start - origStart;
                                  startPointerDrag(
                                    ev,
                                    (deltaSec) => ({
                                      kind: 'action',
                                      mode: 'resize',
                                      sceneId: scene.id,
                                      actionId: action.actionId,
                                      startTime: origStart,
                                      duration: Math.max(
                                        0.2,
                                        snapValue(origDur + deltaSec, snapEnabled, [magnet])
                                      ),
                                    }),
                                    (finalP) => {
                                      if (finalP.kind !== 'action' || finalP.duration === origDur) return;
                                      updateDraft((prev) => ({
                                        ...prev,
                                        scenes: prev.scenes.map((s) =>
                                          s.id === scene.id
                                            ? {
                                                ...s,
                                                timeline: {
                                                  ...s.timeline,
                                                  characterActions: s.timeline.characterActions.map((a) =>
                                                    a.actionId === action.actionId
                                                      ? { ...a, duration: finalP.duration }
                                                      : a
                                                  ),
                                                },
                                              }
                                            : s
                                        ),
                                      }));
                                    }
                                  );
                                }}
                              />
                            ) : null}
                          </button>
                        );
                      })
                    )
                  : null}
              </div>

              {/* Camera Lane */}
              <div
                className="timeline-lane"
                data-track="camera"
                data-locked={String(lockedTracks.camera)}
                style={{ opacity: trackVisibility.camera ? 1 : 0.25 }}
              >
                {trackVisibility.camera
                  ? sceneSpans.flatMap(({ scene, start, duration }) => {
                      let camCursor = 0;
                      return scene.timeline.cameraMoves.map((cam, idx) => {
                        const rawCamDur =
                          dragPreview?.kind === 'camera' &&
                          dragPreview.sceneId === scene.id &&
                          dragPreview.index === idx
                            ? dragPreview.duration
                            : cam.duration || duration;
                        const camDur = Math.max(0.3, Math.min(duration, rawCamDur));
                        const camLeft = (start + camCursor) * pxPerSec;
                        camCursor += camDur;
                        const isSelected =
                          selection?.kind === 'camera' &&
                          selection.sceneId === scene.id &&
                          selection.index === idx;

                        return (
                          <button
                            key={`tl-cam-${scene.id}-${idx}`}
                            type="button"
                            data-timeline-clip="true"
                            className="timeline-clip timeline-clip--camera"
                            aria-pressed={isSelected}
                            onClick={() => {
                              setSelectedSceneId(scene.id);
                              setSelection({ kind: 'camera', sceneId: scene.id, index: idx });
                            }}
                            onKeyDown={(ev) =>
                              handleClipDeleteKey(ev, 'camera', {
                                kind: 'camera',
                                sceneId: scene.id,
                                index: idx,
                              })
                            }
                            style={{
                              left: `${camLeft}px`,
                              width: `${Math.max(36, camDur * pxPerSec - 2)}px`,
                            }}
                          >
                            <span className="keyframe-diamond" aria-hidden="true" />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {cam.type}
                            </span>
                            <span className="keyframe-diamond" aria-hidden="true" />
                            {!lockedTracks.camera ? (
                              <span
                                className="timeline-clip-handle"
                                aria-hidden="true"
                                onPointerDown={(ev) => {
                                  ev.stopPropagation();
                                  const origDur = cam.duration || duration;
                                  startPointerDrag(
                                    ev,
                                    (deltaSec) => ({
                                      kind: 'camera',
                                      mode: 'resize',
                                      sceneId: scene.id,
                                      index: idx,
                                      duration: Math.max(
                                        0.3,
                                        Math.min(duration, snapValue(origDur + deltaSec, snapEnabled))
                                      ),
                                    }),
                                    (finalP) => {
                                      if (finalP.kind !== 'camera' || finalP.duration === origDur) return;
                                      updateDraft((prev) => ({
                                        ...prev,
                                        scenes: prev.scenes.map((s) =>
                                          s.id === scene.id
                                            ? {
                                                ...s,
                                                timeline: {
                                                  ...s.timeline,
                                                  cameraMoves: s.timeline.cameraMoves.map((c, i) =>
                                                    i === idx ? { ...c, duration: finalP.duration } : c
                                                  ),
                                                },
                                              }
                                            : s
                                        ),
                                      }));
                                    }
                                  );
                                }}
                              />
                            ) : null}
                          </button>
                        );
                      });
                    })
                  : null}
              </div>

              {/* Audio Lane */}
              <div
                className="timeline-lane"
                data-track="audio"
                data-locked={String(lockedTracks.audio)}
                style={{ opacity: trackVisibility.audio ? 1 : 0.25 }}
              >
                {trackVisibility.audio
                  ? sceneSpans.flatMap(({ scene, start, duration }) =>
                      scene.timeline.audioTracks.map((track, idx) => {
                        const isSelected =
                          selection?.kind === 'audio' &&
                          selection.sceneId === scene.id &&
                          selection.index === idx;
                        const assetName =
                          draftProject.assets.find((a) => a.id === track.assetId)?.name ??
                          track.assetId;
                        const displayedStart =
                          dragPreview?.kind === 'audio' &&
                          dragPreview.sceneId === scene.id &&
                          dragPreview.index === idx
                            ? dragPreview.startTime
                            : track.startTime;
                        const spanDur = Math.max(0.5, duration - displayedStart);

                        return (
                          <button
                            key={`tl-audio-${scene.id}-${idx}`}
                            type="button"
                            data-timeline-clip="true"
                            data-muted={String(Boolean(track.muted))}
                            className="timeline-clip timeline-clip--audio"
                            aria-pressed={isSelected}
                            onPointerDown={(ev) => {
                              if (lockedTracks.audio) return;
                              const origStart = track.startTime;
                              const magnet = playheadTime - start;
                              startPointerDrag(
                                ev,
                                (deltaSec) => ({
                                  kind: 'audio',
                                  mode: 'move',
                                  sceneId: scene.id,
                                  index: idx,
                                  startTime: Math.min(
                                    Math.max(0, duration - 0.5),
                                    snapValue(origStart + deltaSec, snapEnabled, [magnet])
                                  ),
                                }),
                                (finalP) => {
                                  if (finalP.kind !== 'audio' || finalP.startTime === origStart) return;
                                  updateDraft((prev) => ({
                                    ...prev,
                                    scenes: prev.scenes.map((s) =>
                                      s.id === scene.id
                                        ? {
                                            ...s,
                                            timeline: {
                                              ...s.timeline,
                                              audioTracks: s.timeline.audioTracks.map((t, i) =>
                                                i === idx ? { ...t, startTime: finalP.startTime } : t
                                              ),
                                            },
                                          }
                                        : s
                                    ),
                                  }));
                                }
                              );
                            }}
                            onClick={() => {
                              setSelectedSceneId(scene.id);
                              setSelection({ kind: 'audio', sceneId: scene.id, index: idx });
                            }}
                            onKeyDown={(ev) =>
                              handleClipDeleteKey(ev, 'audio', {
                                kind: 'audio',
                                sceneId: scene.id,
                                index: idx,
                              })
                            }
                            style={{
                              left: `${(start + displayedStart) * pxPerSec}px`,
                              width: `${Math.max(40, spanDur * pxPerSec - 2)}px`,
                            }}
                          >
                            <MusicIcon size={11} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {assetName}
                            </span>
                          </button>
                        );
                      })
                    )
                  : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
