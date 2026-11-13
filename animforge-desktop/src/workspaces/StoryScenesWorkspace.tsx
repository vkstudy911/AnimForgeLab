import { useId, useState } from 'react';
import { useStudioContext } from '../context/StudioContext';
import type { SceneDetail, StoryBeat, TransitionType } from '../types';
import {
  ChevronDownIcon,
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

  const scenes = draftProject.scenes;
  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;

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
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 8,
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
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <strong>
                        Beat {beat.beatNumber}: {beat.sceneTitle}
                      </strong>
                      <span className="mono field-hint">{beat.targetDurationSeconds}s</span>
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
                    {beat.cameraNotes ? (
                      <p className="mono field-hint">Cam: {beat.cameraNotes}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleCreateSceneFromBeat(beat)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
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
              No storyboard generated yet. Create a deterministic starter storyboard template.
            </span>
            <button
              type="button"
              disabled={busy.saving || busy.rendering}
              onClick={() => void runDeterministicAgent(draftProject.id, 'story_director')}
            >
              Regenerate Storyboard (Deterministic)
            </button>
          </div>
        </section>
      )}

      <div className="split-layout">
        <section className="panel" aria-labelledby="scenes-sequence-heading">
          <h3 id="scenes-sequence-heading" style={{ marginBottom: 10 }}>
            Scene Sequence
          </h3>
          {scenes.length === 0 ? (
            <p className="field-hint">No scenes yet. Click + Add Scene to start.</p>
          ) : (
            <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <div style={{ display: 'flex', gap: 6 }}>
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
