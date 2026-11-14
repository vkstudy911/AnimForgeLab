import { useEffect, useId, useState } from 'react';
import { useStudioContext } from '../context/StudioContext';
import type { SceneDetail, StoryBeat, TransitionType } from '../types';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  PlusIcon,
  SaveIcon,
  StudioIcon,
  TrashIcon,
} from '../components/ui/Icons';
import { NumericInput } from '../components/ui/NumericInput';
import { SceneThumb } from '../components/ui/SceneThumb';
import { StatusBadge } from '../components/ui/StatusBadge';

const TRANSITIONS: TransitionType[] = ['none', 'fade', 'wipe', 'slide', 'dissolve'];

export function StoryScenesWorkspace() {
  const {
    draftProject,
    isDirty,
    updateDraft,
    saveDraft,
    discardDraft,
    runDeterministicAgent,
    selectedSceneId,
    setSelectedSceneId,
    selection,
    setSelection,
    navigate,
    setNewProjectDialogOpen,
    busy,
  } = useStudioContext();

  const [confirmPlanScenes, setConfirmPlanScenes] = useState(false);

  const titleId = useId();
  const descId = useId();
  const durId = useId();
  const transId = useId();
  const transDurId = useId();
  const loglineId = useId();
  const artStyleId = useId();
  const bgAssetId = useId();

  const scenes = draftProject?.scenes ?? [];
  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;
  const activeIndex = activeScene ? scenes.findIndex((s) => s.id === activeScene.id) : -1;

  // Direct Scene-to-Scene Navigation keyboard shortcuts: [ and ] or Alt+ArrowLeft / Alt+ArrowRight
  useEffect(() => {
    const handleKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (ev.key === '[' || (ev.altKey && ev.key === 'ArrowLeft')) {
        if (activeIndex > 0) {
          ev.preventDefault();
          setSelectedSceneId(scenes[activeIndex - 1].id);
        }
      } else if (ev.key === ']' || (ev.altKey && ev.key === 'ArrowRight')) {
        if (activeIndex >= 0 && activeIndex < scenes.length - 1) {
          ev.preventDefault();
          setSelectedSceneId(scenes[activeIndex + 1].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, scenes, setSelectedSceneId]);

  if (!draftProject) {
    return (
      <div className="page-container">
        <section className="panel">
          <h2>Story &amp; Scenes</h2>
          <p className="field-hint" style={{ marginTop: 6, marginBottom: 12 }}>
            Open or create a project to edit its story beats, scene order, and transitions.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" onClick={() => setNewProjectDialogOpen(true)}>
              + New Project
            </button>
            <button type="button" onClick={() => navigate('projects')}>
              Browse Projects
            </button>
          </div>
        </section>
      </div>
    );
  }

  const handlePrevScene = () => {
    if (activeIndex > 0) {
      setSelectedSceneId(scenes[activeIndex - 1].id);
    }
  };

  const handleNextScene = () => {
    if (activeIndex >= 0 && activeIndex < scenes.length - 1) {
      setSelectedSceneId(scenes[activeIndex + 1].id);
    }
  };

  const handleAddScene = () => {
    const nextIdx = scenes.length;
    const newId = `scene_${Date.now()}_${nextIdx + 1}`;
    const newScene: SceneDetail = {
      id: newId,
      projectId: draftProject.id,
      sequenceIndex: nextIdx,
      title: `Scene ${nextIdx + 1}`,
      description: 'New story beat',
      duration: 3,
      characterIds: [],
      timeline: {
        duration: 3,
        fps: draftProject.fps,
        characterActions: [],
        cameraMoves: [],
        audioTracks: [],
      },
      transition: { type: 'fade', duration: 0.4 },
    };
    updateDraft((prev) => ({
      ...prev,
      scenes: [...prev.scenes, newScene],
    }));
    setSelectedSceneId(newId);
  };

  const handleMoveScene = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= scenes.length) return;
    updateDraft((prev) => {
      const copy = [...prev.scenes];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return {
        ...prev,
        scenes: copy.map((sc, idx) => ({ ...sc, sequenceIndex: idx })),
      };
    });
  };

  const updateActiveScene = (patch: Partial<SceneDetail>) => {
    if (!activeScene) return;
    updateDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((sc) => (sc.id === activeScene.id ? { ...sc, ...patch } : sc)),
    }));
  };

  const handleDuplicateSelectedScene = () => {
    if (!activeScene) return;
    const newId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let createdIndex = scenes.length;
    updateDraft((prev) => {
      const idx = prev.scenes.findIndex((s) => s.id === activeScene.id);
      const insertAt = idx >= 0 ? idx + 1 : prev.scenes.length;
      createdIndex = insertAt;
      const cloned: SceneDetail = {
        ...structuredClone(activeScene),
        id: newId,
        title: `${activeScene.title} (Copy)`,
        sequenceIndex: insertAt,
        timeline: {
          ...structuredClone(activeScene.timeline),
          characterActions: activeScene.timeline.characterActions.map((a, ai) => ({
            ...structuredClone(a),
            actionId: `act_${Date.now()}_${ai}`,
          })),
        },
      };
      const copy = [...prev.scenes];
      copy.splice(insertAt, 0, cloned);
      return {
        ...prev,
        scenes: copy.map((sc, i) => ({ ...sc, sequenceIndex: i })),
      };
    });
    if (createdIndex >= 0) {
      setSelectedSceneId(newId);
    }
  };

  const handleDeleteSelectedScene = () => {
    if (!activeScene || scenes.length <= 1) return;
    const idx = scenes.findIndex((s) => s.id === activeScene.id);
    const remaining = scenes.filter((s) => s.id !== activeScene.id);
    updateDraft((prev) => {
      if (prev.scenes.length <= 1) return prev;
      return {
        ...prev,
        scenes: prev.scenes
          .filter((s) => s.id !== activeScene.id)
          .map((sc, i) => ({ ...sc, sequenceIndex: i })),
      };
    });
    if (remaining.length > 0) {
      const next = remaining[Math.min(Math.max(0, idx), remaining.length - 1)];
      setSelectedSceneId(next.id);
    }
    if (selection?.kind === 'scene' && selection.id === activeScene.id) {
      setSelection(null);
    }
  };

  const handleCreateSceneFromBeat = (beat: StoryBeat) => {
    const dur = Math.max(0.5, Number(beat.targetDurationSeconds) || 3);
    const newId = `scene_${Date.now()}_b${beat.beatNumber}`;
    const newScene: SceneDetail = {
      id: newId,
      projectId: draftProject.id,
      sequenceIndex: scenes.length,
      title: beat.sceneTitle || `Beat ${beat.beatNumber}`,
      description: beat.visualSummary || '',
      duration: dur,
      characterIds: [],
      timeline: {
        duration: dur,
        fps: draftProject.fps,
        characterActions: [],
        cameraMoves: [],
        audioTracks: [],
      },
      transition: { type: 'fade', duration: 0.4 },
    };
    updateDraft((prev) => ({
      ...prev,
      scenes: [...prev.scenes, newScene].map((sc, i) => ({ ...sc, sequenceIndex: i })),
    }));
    setSelectedSceneId(newId);
  };

  const handleAddBeat = () => {
    updateDraft((prev) => {
      const currentBeats = prev.storyboard?.beats ?? [];
      const nextBeatNumber = currentBeats.length + 1;
      const newBeat: StoryBeat = {
        beatNumber: nextBeatNumber,
        sceneTitle: `Beat ${nextBeatNumber}`,
        visualSummary: `Visual summary for beat ${nextBeatNumber}`,
        characterInteractions: '',
        cameraNotes: 'Medium shot, eye level',
        soundNotes: '',
        targetDurationSeconds: 3,
      };
      const nextBeats = [...currentBeats, newBeat];
      const totalDurationSeconds = Number(
        nextBeats.reduce((sum, b) => sum + Math.max(0.5, Number(b.targetDurationSeconds) || 0), 0).toFixed(2)
      );
      return {
        ...prev,
        storyboard: {
          id: prev.storyboard?.id ?? `sb_${Date.now()}`,
          projectId: prev.id,
          logline: prev.storyboard?.logline ?? prev.prompt ?? 'Story logline...',
          artStyle: prev.storyboard?.artStyle ?? '2D Stylized Animation',
          beats: nextBeats,
          totalDurationSeconds,
          createdAt: prev.storyboard?.createdAt ?? new Date().toISOString(),
        },
      };
    });
  };

  const handleDeleteBeat = (beatNumber: number) => {
    updateDraft((prev) => {
      if (!prev.storyboard) return prev;
      const filtered = prev.storyboard.beats.filter((b) => b.beatNumber !== beatNumber);
      const reindexed = filtered.map((b, idx) => ({ ...b, beatNumber: idx + 1 }));
      const totalDurationSeconds = Number(
        reindexed.reduce((sum, b) => sum + Math.max(0.5, Number(b.targetDurationSeconds) || 0), 0).toFixed(2)
      );
      return {
        ...prev,
        storyboard: {
          ...prev.storyboard,
          beats: reindexed,
          totalDurationSeconds,
        },
      };
    });
  };

  const updateBeat = (beatNumber: number, patch: Partial<StoryBeat>) => {
    updateDraft((prev) => {
      if (!prev.storyboard) return prev;
      const nextBeats = prev.storyboard.beats.map((b) =>
        b.beatNumber === beatNumber ? { ...b, ...patch } : b
      );
      const totalDurationSeconds = Number(
        nextBeats.reduce((sum, b) => sum + Math.max(0.5, Number(b.targetDurationSeconds) || 0), 0).toFixed(2)
      );
      return {
        ...prev,
        storyboard: {
          ...prev.storyboard,
          beats: nextBeats,
          totalDurationSeconds,
        },
      };
    });
  };

  const storyboard = draftProject.storyboard;
  const bgAssets = draftProject.assets.filter((a) => a.type === 'background');
  const otherAssets = draftProject.assets.filter((a) => a.type !== 'background');

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h2>Story &amp; Scenes — {draftProject.name}</h2>
          <p className="field-hint">
            {scenes.length} scene{scenes.length === 1 ? '' : 's'} · Total{' '}
            {scenes.reduce((acc, s) => acc + (Number(s.duration) || 0), 0).toFixed(1)}s
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleAddScene}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <PlusIcon size={14} />
            <span>Add Scene</span>
          </button>
          {isDirty ? (
            <button type="button" onClick={discardDraft} disabled={busy.saving}>
              Discard
            </button>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            onClick={() => void saveDraft('Saved story & scenes.')}
            disabled={busy.saving || busy.rendering}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <SaveIcon size={14} />
            <span>{busy.saving ? 'Saving...' : 'Save Story'}</span>
          </button>
        </div>
      </div>

      {storyboard ? (
        <section className="panel" aria-labelledby="storyboard-overview-heading">
          <div className="page-header-row" style={{ marginBottom: 8 }}>
            <h3 id="storyboard-overview-heading">Storyboard Overview</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge tone="neutral">{storyboard.artStyle}</StatusBadge>
              <StatusBadge tone="pass">{storyboard.totalDurationSeconds}s</StatusBadge>
              <button
                type="button"
                onClick={handleAddBeat}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <PlusIcon size={13} />
                <span>Add Beat</span>
              </button>
              <button
                type="button"
                disabled={busy.saving || busy.rendering}
                onClick={() => {
                  setConfirmPlanScenes(false);
                  void runDeterministicAgent(draftProject.id, 'story_director');
                }}
              >
                Regenerate Storyboard (Deterministic)
              </button>
              <button
                type="button"
                disabled={busy.saving || busy.rendering}
                onClick={() => setConfirmPlanScenes(true)}
              >
                Plan Scenes from Storyboard (Deterministic)
              </button>
            </div>
          </div>

          {confirmPlanScenes ? (
            <div
              role="region"
              aria-label="Confirm scene regeneration"
              className="planned-callout"
              style={{ marginBottom: 10 }}
            >
              <span>
                Deterministic ScenePlanner will regenerate scenes from the storyboard beats, replacing custom scene edits.
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy.saving || busy.rendering}
                  onClick={async () => {
                    setConfirmPlanScenes(false);
                    await runDeterministicAgent(draftProject.id, 'scene_planner');
                  }}
                >
                  Confirm Replace Scenes
                </button>
                <button type="button" onClick={() => setConfirmPlanScenes(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="dialog-two-col" style={{ marginBottom: storyboard.beats.length > 0 ? 10 : 0 }}>
            <div className="field">
              <label htmlFor={loglineId}>Storyboard Logline</label>
              <textarea
                id={loglineId}
                value={storyboard.logline}
                onChange={(ev) =>
                  updateDraft((prev) =>
                    prev.storyboard
                      ? { ...prev, storyboard: { ...prev.storyboard, logline: ev.target.value } }
                      : prev
                  )
                }
              />
            </div>
            <div className="field">
              <label htmlFor={artStyleId}>Art Style</label>
              <input
                id={artStyleId}
                type="text"
                value={storyboard.artStyle}
                onChange={(ev) =>
                  updateDraft((prev) =>
                    prev.storyboard
                      ? { ...prev, storyboard: { ...prev.storyboard, artStyle: ev.target.value } }
                      : prev
                  )
                }
              />
            </div>
          </div>

          {storyboard.beats.length > 0 ? (
            <details open>
              <summary className="field-hint" style={{ cursor: 'pointer', marginBottom: 8 }}>
                Story Beats ({storyboard.beats.length})
              </summary>
              <ol
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 10,
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                }}
              >
                {storyboard.beats.map((beat) => (
                  <li
                    key={beat.beatNumber}
                    className="panel"
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontSize: 'var(--text-sm)' }}>
                        Beat {beat.beatNumber}: {beat.sceneTitle}
                      </strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="mono field-hint">{beat.targetDurationSeconds}s</span>
                        <button
                          type="button"
                          className="btn-ghost"
                          aria-label={`Delete Beat ${beat.beatNumber}`}
                          onClick={() => handleDeleteBeat(beat.beatNumber)}
                          style={{ padding: '2px 4px', color: 'var(--text-danger, #ef4444)' }}
                          title={`Delete Beat ${beat.beatNumber}`}
                        >
                          <TrashIcon size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor={`beat-title-${beat.beatNumber}`}>
                        Beat {beat.beatNumber} Title
                      </label>
                      <input
                        id={`beat-title-${beat.beatNumber}`}
                        type="text"
                        value={beat.sceneTitle}
                        onChange={(ev) =>
                          updateBeat(beat.beatNumber, { sceneTitle: ev.target.value })
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor={`beat-summary-${beat.beatNumber}`}>
                        Beat {beat.beatNumber} Summary
                      </label>
                      <input
                        id={`beat-summary-${beat.beatNumber}`}
                        type="text"
                        value={beat.visualSummary}
                        onChange={(ev) =>
                          updateBeat(beat.beatNumber, { visualSummary: ev.target.value })
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor={`beat-char-int-${beat.beatNumber}`}>
                        Beat {beat.beatNumber} Interactions
                      </label>
                      <input
                        id={`beat-char-int-${beat.beatNumber}`}
                        type="text"
                        placeholder="Dialogue or physical interaction notes..."
                        value={beat.characterInteractions || ''}
                        onChange={(ev) =>
                          updateBeat(beat.beatNumber, { characterInteractions: ev.target.value })
                        }
                      />
                    </div>

                    <div className="dialog-two-col">
                      <div className="field">
                        <label htmlFor={`beat-camera-${beat.beatNumber}`}>
                          Beat {beat.beatNumber} Camera Notes
                        </label>
                        <input
                          id={`beat-camera-${beat.beatNumber}`}
                          type="text"
                          placeholder="e.g. Pan left, Zoom in..."
                          value={beat.cameraNotes || ''}
                          onChange={(ev) =>
                            updateBeat(beat.beatNumber, { cameraNotes: ev.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`beat-sound-${beat.beatNumber}`}>
                          Beat {beat.beatNumber} Sound Notes
                        </label>
                        <input
                          id={`beat-sound-${beat.beatNumber}`}
                          type="text"
                          placeholder="Score, Foley, SFX..."
                          value={beat.soundNotes || ''}
                          onChange={(ev) =>
                            updateBeat(beat.beatNumber, { soundNotes: ev.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor={`beat-dur-${beat.beatNumber}`}>
                        Beat {beat.beatNumber} Duration (s)
                      </label>
                      <NumericInput
                        id={`beat-dur-${beat.beatNumber}`}
                        min={0.5}
                        step={0.5}
                        value={beat.targetDurationSeconds}
                        onCommit={(dur) =>
                          updateBeat(beat.beatNumber, { targetDurationSeconds: dur })
                        }
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCreateSceneFromBeat(beat)}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 }}
                    >
                      <PlusIcon size={12} />
                      <span>Create Scene from Beat {beat.beatNumber}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </section>
      ) : (
        <section className="panel" aria-label="Deterministic planning tools">
          <div className="page-header-row">
            <span className="field-hint">
              No storyboard generated yet. Add a story beat or generate a deterministic starter template.
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleAddBeat}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <PlusIcon size={13} />
                <span>+ Add Beat</span>
              </button>
              <button
                type="button"
                disabled={busy.saving || busy.rendering}
                onClick={() => void runDeterministicAgent(draftProject.id, 'story_director')}
              >
                Regenerate Storyboard (Deterministic)
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="split-layout">
        <section className="panel" aria-labelledby="scenes-sequence-heading">
          <div className="page-header-row" style={{ marginBottom: 10 }}>
            <h3 id="scenes-sequence-heading">Scene Sequence</h3>
            <button
              type="button"
              onClick={handleAddScene}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px' }}
            >
              <PlusIcon size={12} />
              <span>Add Scene</span>
            </button>
          </div>
          {scenes.length === 0 ? (
            <p className="field-hint">No scenes yet. Click + Add Scene to start.</p>
          ) : (
            <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, margin: 0 }}>
              {scenes.map((scene, idx) => {
                const selected = activeScene?.id === scene.id;
                return (
                  <li
                    key={scene.id}
                    className="panel"
                    style={{
                      background: selected ? 'var(--accent-amber-soft)' : 'var(--bg-surface-elevated)',
                      borderColor: selected ? 'var(--accent-amber)' : undefined,
                      padding: 10,
                      display: 'grid',
                      gridTemplateColumns: '112px minmax(0, 1fr) auto',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <SceneThumb title={scene.title} badge={`#${idx + 1}`} />

                    <button
                      type="button"
                      className="btn-ghost"
                      aria-pressed={selected}
                      onClick={() => setSelectedSceneId(scene.id)}
                      style={{
                        textAlign: 'left',
                        padding: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 3,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {scene.title}
                        </strong>
                        <span className="mono field-hint">{scene.duration}s</span>
                        <StatusBadge tone="neutral">{scene.transition?.type ?? 'none'}</StatusBadge>
                      </div>
                      <span
                        className="field-hint"
                        style={{
                          width: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {scene.description || 'No description'}
                      </span>
                    </button>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        type="button"
                        aria-label={`Move ${scene.title} up`}
                        disabled={idx === 0}
                        onClick={() => handleMoveScene(idx, -1)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 7px' }}
                      >
                        <ChevronUpIcon size={12} />
                        <span>Up</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${scene.title} down`}
                        disabled={idx === scenes.length - 1}
                        onClick={() => handleMoveScene(idx, 1)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 7px' }}
                      >
                        <ChevronDownIcon size={12} />
                        <span>Down</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="scene-detail-heading">
          <div className="page-header-row" style={{ marginBottom: 10 }}>
            <h3 id="scene-detail-heading">Scene Detail Editor</h3>
            {activeScene ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    aria-label="Previous scene"
                    disabled={activeIndex <= 0}
                    onClick={handlePrevScene}
                    title="Previous Scene (Shortcut: [ or Alt+Left)"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '3px 7px' }}
                  >
                    <ChevronLeftIcon size={12} />
                    <span>Prev</span>
                  </button>
                  <span className="mono field-hint" style={{ fontSize: 'var(--text-xs)' }}>
                    {activeIndex >= 0 ? `${activeIndex + 1}/${scenes.length}` : '—'}
                  </span>
                  <button
                    type="button"
                    aria-label="Next scene"
                    disabled={activeIndex < 0 || activeIndex >= scenes.length - 1}
                    onClick={handleNextScene}
                    title="Next Scene (Shortcut: ] or Alt+Right)"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '3px 7px' }}
                  >
                    <span>Next</span>
                    <ChevronRightIcon size={12} />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Duplicate selected scene"
                  onClick={handleDuplicateSelectedScene}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <CopyIcon size={13} />
                  <span>Duplicate</span>
                </button>
                <button
                  type="button"
                  aria-label="Delete selected scene"
                  className="btn-danger"
                  disabled={scenes.length <= 1}
                  onClick={handleDeleteSelectedScene}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <TrashIcon size={13} />
                  <span>Delete</span>
                </button>
              </div>
            ) : null}
          </div>
          {!activeScene ? (
            <p className="field-hint">Select or add a scene to edit its properties.</p>
          ) : (
            <div className="dialog-form">
              <div className="field">
                <label htmlFor={titleId}>Title</label>
                <input
                  id={titleId}
                  type="text"
                  value={activeScene.title}
                  onChange={(ev) => updateActiveScene({ title: ev.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor={descId}>Description</label>
                <textarea
                  id={descId}
                  value={activeScene.description}
                  onChange={(ev) => updateActiveScene({ description: ev.target.value })}
                />
              </div>

              <div className="dialog-two-col">
                <div className="field">
                  <label htmlFor={durId}>Duration (s)</label>
                  <NumericInput
                    id={durId}
                    min={0.2}
                    step={0.5}
                    value={activeScene.duration}
                    onCommit={(nextDur) =>
                      updateActiveScene({
                        duration: nextDur,
                        timeline: { ...activeScene.timeline, duration: nextDur },
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label htmlFor={transId}>Transition</label>
                  <select
                    id={transId}
                    value={String(activeScene.transition?.type ?? 'fade')}
                    onChange={(ev) =>
                      updateActiveScene({
                        transition: {
                          ...activeScene.transition,
                          type: ev.target.value,
                        },
                      })
                    }
                  >
                    {TRANSITIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor={transDurId}>Transition Duration (s)</label>
                <NumericInput
                  id={transDurId}
                  min={0}
                  max={5}
                  step={0.1}
                  value={activeScene.transition?.duration ?? 0.4}
                  onCommit={(dur) =>
                    updateActiveScene({
                      transition: {
                        ...activeScene.transition,
                        duration: dur,
                      },
                    })
                  }
                />
              </div>

              {/* Scene Background Asset Selector */}
              <div className="field">
                <label htmlFor={bgAssetId}>Scene Background Asset</label>
                <select
                  id={bgAssetId}
                  value={activeScene.backgroundAssetId ?? ''}
                  onChange={(ev) =>
                    updateActiveScene({
                      backgroundAssetId: ev.target.value || undefined,
                    })
                  }
                >
                  <option value="">None (Transparent / Canvas Default)</option>
                  {bgAssets.length > 0 ? (
                    <optgroup label="Background Assets">
                      {bgAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {otherAssets.length > 0 ? (
                    <optgroup label="Other Project Assets">
                      {otherAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name} ({asset.type})
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                {activeScene.backgroundAssetId ? (
                  <span className="field-hint" style={{ marginTop: 2, display: 'block' }}>
                    Linked Asset:{' '}
                    {draftProject.assets.find((a) => a.id === activeScene.backgroundAssetId)?.name ??
                      activeScene.backgroundAssetId}
                  </span>
                ) : null}
              </div>

              {/* Characters Assignment to Scene */}
              <div className="field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Cast in Scene</span>
                  <span className="mono field-hint">
                    {activeScene.characterIds.length} of {draftProject.characters.length} assigned
                  </span>
                </div>
                {draftProject.characters.length === 0 ? (
                  <p className="field-hint">
                    No characters created in cast yet.{' '}
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => navigate('characters')}
                      style={{ padding: '0 4px', textDecoration: 'underline' }}
                    >
                      Open Character Studio
                    </button>
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0' }}>
                    {draftProject.characters.map((char) => {
                      const isAssigned = activeScene.characterIds.includes(char.id);
                      return (
                        <label
                          key={char.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: isAssigned ? 'var(--accent-amber-soft)' : 'var(--bg-surface-elevated)',
                            border: `1px solid ${isAssigned ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                            cursor: 'pointer',
                            fontSize: 'var(--text-sm)',
                            fontWeight: isAssigned ? 600 : 400,
                          }}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Assign ${char.name} to scene`}
                            checked={isAssigned}
                            onChange={(ev) => {
                              const nextIds = ev.target.checked
                                ? [...activeScene.characterIds, char.id]
                                : activeScene.characterIds.filter((id) => id !== char.id);
                              updateActiveScene({ characterIds: nextIds });
                            }}
                          />
                          <span>{char.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void saveDraft('Saved story & scenes.')}
                  disabled={busy.saving || busy.rendering}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <SaveIcon size={14} />
                  <span>{busy.saving ? 'Saving...' : 'Save Story'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSceneId(activeScene.id);
                    navigate('studio');
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <StudioIcon size={14} />
                  <span>Edit in Studio</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
