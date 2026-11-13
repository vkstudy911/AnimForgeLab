import { useEffect, useId, useState } from 'react';
import { useStudioContext } from '../../context/StudioContext';
import type {
  AssetType,
  CameraEasing,
  CameraMoveType,
  CameraMovement,
  CharacterAction,
  CharacterActionName,
  SceneDetail,
  TransitionType,
} from '../../types';
import { PlusIcon, SaveIcon } from '../ui/Icons';
import { NumericInput } from '../ui/NumericInput';

const TRANSITION_TYPES: TransitionType[] = ['none', 'fade', 'wipe', 'slide', 'dissolve'];
const CAMERA_TYPES: CameraMoveType[] = ['static', 'pan', 'zoom', 'push', 'pull', 'dolly', 'shake'];
const CAMERA_EASINGS: CameraEasing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring'];
const ASSET_TYPES: AssetType[] = [
  'character',
  'background',
  'prop',
  'audio',
  'font',
  'model',
  'reference',
];
const ACTION_NAMES: CharacterActionName[] = [
  'idle',
  'walk',
  'run',
  'wave',
  'smile',
  'blink',
  'look_around',
  'custom',
];

function createDefaultCameraMove(duration: number, overrides?: Partial<CameraMovement>): CameraMovement {
  return {
    type: 'static',
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    startZoom: 1,
    endZoom: 1,
    easing: 'ease-in-out',
    duration: Math.max(0.5, duration),
    ...overrides,
  };
}

export function CueInspector() {
  const {
    draftProject,
    selectedSceneId,
    selection,
    setSelection,
    updateDraft,
    saveDraft,
    navigate,
    revealInWorkspace,
    isDirty,
    busy,
  } = useStudioContext();

  const titleId = useId();
  const descId = useId();
  const durationId = useId();
  const transTypeId = useId();
  const transDurId = useId();
  const camTypeId = useId();
  const camEaseId = useId();
  const charSelectId = useId();
  const actionSelectId = useId();

  const [newActionCharId, setNewActionCharId] = useState<string>('hero');
  const [newActionName, setNewActionName] = useState<CharacterActionName>('wave');

  useEffect(() => {
    if (!draftProject) return;
    if (draftProject.characters.length > 0) {
      const stillValid = draftProject.characters.some((c) => c.id === newActionCharId);
      if (!stillValid) {
        setNewActionCharId(draftProject.characters[0].id);
      }
    } else if (newActionCharId !== 'hero') {
      setNewActionCharId('hero');
    }
  }, [draftProject, newActionCharId]);

  if (!draftProject) return null;

  const orderedScenes = [...draftProject.scenes].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  const activeScene =
    orderedScenes.find((s) => s.id === selectedSceneId) ?? orderedScenes[0] ?? null;

  const updateScene = (sceneId: string, updater: (scene: SceneDetail) => SceneDetail) => {
    updateDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) => (s.id === sceneId ? updater(s) : s)),
    }));
  };

  if (!activeScene) {
    return (
      <div className="studio-pane-scroll">
        <p className="field-hint">Add or select a scene to inspect and edit its cues.</p>
      </div>
    );
  }

  const firstCam = activeScene.timeline.cameraMoves[0];

  const safeSceneDur = Number.isFinite(activeScene.duration) ? Math.max(0.25, activeScene.duration) : 1;

  const handleAddAction = () => {
    const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newAction: CharacterAction = {
      actionId,
      name: newActionName,
      startTime: 0,
      duration: Math.min(1.5, Math.max(0.5, safeSceneDur)),
      parameters: { characterId: newActionCharId },
    };

    updateScene(activeScene.id, (scene) => ({
      ...scene,
      timeline: {
        ...scene.timeline,
        characterActions: [...scene.timeline.characterActions, newAction],
      },
    }));
    setSelection({ kind: 'action', sceneId: activeScene.id, actionId });
  };

  const handleAddCamera = () => {
    const nextIndex = activeScene.timeline.cameraMoves.length;
    const newCam = createDefaultCameraMove(Math.min(2, safeSceneDur));
    updateScene(activeScene.id, (scene) => ({
      ...scene,
      timeline: {
        ...scene.timeline,
        cameraMoves: [...scene.timeline.cameraMoves, newCam],
      },
    }));
    setSelection({ kind: 'camera', sceneId: activeScene.id, index: nextIndex });
  };

  const renderSelectedCueSection = () => {
    if (!selection) return null;

    if (selection.kind === 'character') {
      const char = draftProject.characters.find((c) => c.id === selection.id);
      if (!char) return null;
      return (
        <section
          aria-label="Selected Character Inspector"
          style={{
            padding: 8,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-strong)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 'var(--text-xs)' }}>Selected Character</strong>
            <button type="button" onClick={() => navigate('characters')}>
              Character Studio
            </button>
          </div>
          <div className="field">
            <label htmlFor="insp-char-name">Character Name</label>
            <input
              id="insp-char-name"
              type="text"
              value={char.name}
              onChange={(ev) =>
                updateDraft((prev) => ({
                  ...prev,
                  characters: prev.characters.map((c) =>
                    c.id === char.id ? { ...c, name: ev.target.value } : c
                  ),
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="insp-char-desc">Character Description</label>
            <textarea
              id="insp-char-desc"
              value={char.description}
              onChange={(ev) =>
                updateDraft((prev) => ({
                  ...prev,
                  characters: prev.characters.map((c) =>
                    c.id === char.id ? { ...c, description: ev.target.value } : c
                  ),
                }))
              }
            />
          </div>
        </section>
      );
    }

    if (selection.kind === 'asset') {
      const asset = draftProject.assets.find((a) => a.id === selection.id);
      if (!asset) return null;
      return (
        <section
          aria-label="Selected Asset Inspector"
          style={{
            padding: 8,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-strong)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 'var(--text-xs)' }}>Selected Asset</strong>
            <button type="button" onClick={() => navigate('assets')}>
              Asset Library
            </button>
          </div>
          <div className="field">
            <label htmlFor="insp-asset-name">Asset Name</label>
            <input
              id="insp-asset-name"
              type="text"
              value={asset.name}
              onChange={(ev) =>
                updateDraft((prev) => ({
                  ...prev,
                  assets: prev.assets.map((a) =>
                    a.id === asset.id ? { ...a, name: ev.target.value } : a
                  ),
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="insp-asset-type">Asset Category</label>
            <select
              id="insp-asset-type"
              value={asset.type}
              onChange={(ev) =>
                updateDraft((prev) => ({
                  ...prev,
                  assets: prev.assets.map((a) =>
                    a.id === asset.id ? { ...a, type: ev.target.value as AssetType } : a
                  ),
                }))
              }
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <p className="field-hint mono" style={{ wordBreak: 'break-all' }}>
            {asset.uri}
          </p>
          <button type="button" onClick={() => void revealInWorkspace(asset.uri)}>
            Reveal Asset File
          </button>
        </section>
      );
    }

    if (selection.kind === 'action') {
      const cueScene = draftProject.scenes.find((s) => s.id === selection.sceneId);
      const action = cueScene?.timeline.characterActions.find(
        (a) => a.actionId === selection.actionId
      );
      if (!cueScene || !action) return null;

      const updateAction = (patch: Partial<CharacterAction>) => {
        updateScene(cueScene.id, (scene) => ({
          ...scene,
          timeline: {
            ...scene.timeline,
            characterActions: scene.timeline.characterActions.map((a) =>
              a.actionId === action.actionId ? { ...a, ...patch } : a
            ),
          },
        }));
      };

      const updateParam = (key: string, value: unknown) => {
        updateAction({
          parameters: {
            ...(action.parameters ?? {}),
            [key]: value,
          },
        });
      };

      const deleteAction = () => {
        updateScene(cueScene.id, (scene) => ({
          ...scene,
          timeline: {
            ...scene.timeline,
            characterActions: scene.timeline.characterActions.filter(
              (a) => a.actionId !== action.actionId
            ),
          },
        }));
        setSelection({ kind: 'scene', id: cueScene.id });
      };

      const assignedCharId = String(action.parameters?.characterId ?? 'hero');

      return (
        <section
          aria-label="Selected Action Cue"
          style={{
            padding: 8,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--track-action-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 'var(--text-xs)' }}>Selected Action Cue</strong>
            <button type="button" className="btn-danger" onClick={deleteAction}>
              Delete Action
            </button>
          </div>

          <div className="dialog-two-col">
            <div className="field">
              <label htmlFor="cue-action-char">Cue Character</label>
              <select
                id="cue-action-char"
                value={assignedCharId}
                onChange={(ev) => updateParam('characterId', ev.target.value)}
              >
                {draftProject.characters.length > 0 ? (
                  draftProject.characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                ) : (
                  <option value="hero">Hero (Default)</option>
                )}
              </select>
            </div>

            <div className="field">
              <label htmlFor="cue-action-name">Cue Action</label>
              <select
                id="cue-action-name"
                value={action.name}
                onChange={(ev) => updateAction({ name: ev.target.value as CharacterActionName })}
              >
                {ACTION_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="dialog-two-col">
            <div className="field">
              <label htmlFor="cue-action-start">Start (s)</label>
              <NumericInput
                id="cue-action-start"
                min={0}
                step={0.1}
                value={action.startTime}
                onCommit={(val) => updateAction({ startTime: val })}
              />
            </div>

            <div className="field">
              <label htmlFor="cue-action-dur">Length (s)</label>
              <NumericInput
                id="cue-action-dur"
                min={0.1}
                step={0.1}
                strictPositive
                value={action.duration}
                onCommit={(val) => updateAction({ duration: val })}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="cue-action-expr">Expression / Motion Note</label>
            <input
              id="cue-action-expr"
              type="text"
              placeholder="e.g. excited, gentle"
              value={String(action.parameters?.expression ?? '')}
              onChange={(ev) => updateParam('expression', ev.target.value)}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}>
            <input
              type="checkbox"
              checked={Boolean(action.parameters?.hasSmile)}
              onChange={(ev) => updateParam('hasSmile', ev.target.checked)}
            />
            <span>Smile expression</span>
          </label>
        </section>
      );
    }

    if (selection.kind === 'camera') {
      const cueScene = draftProject.scenes.find((s) => s.id === selection.sceneId);
      const cam = cueScene?.timeline.cameraMoves[selection.index];
      if (!cueScene || !cam) return null;

      const updateCam = (patch: Partial<CameraMovement>) => {
        updateScene(cueScene.id, (scene) => ({
          ...scene,
          timeline: {
            ...scene.timeline,
            cameraMoves: scene.timeline.cameraMoves.map((c, idx) =>
              idx === selection.index ? { ...c, ...patch } : c
            ),
          },
        }));
      };

      const deleteCam = () => {
        updateScene(cueScene.id, (scene) => ({
          ...scene,
          timeline: {
            ...scene.timeline,
            cameraMoves: scene.timeline.cameraMoves.filter((_, idx) => idx !== selection.index),
          },
        }));
        setSelection({ kind: 'scene', id: cueScene.id });
      };

      return (
        <section
          aria-label="Selected Camera Cue"
          style={{
            padding: 8,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--track-camera-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 'var(--text-xs)' }}>
              Selected Camera Cue #{selection.index + 1}
            </strong>
            <button type="button" className="btn-danger" onClick={deleteCam}>
              Delete Camera
            </button>
          </div>

          <div className="dialog-two-col">
            <div className="field">
              <label htmlFor="cue-cam-type">Move Type</label>
              <select
                id="cue-cam-type"
                value={cam.type}
                onChange={(ev) => updateCam({ type: ev.target.value as CameraMoveType })}
              >
                {CAMERA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="cue-cam-sel-easing">Cue Easing</label>
              <select
                id="cue-cam-sel-easing"
                value={cam.easing}
                onChange={(ev) => updateCam({ easing: ev.target.value as CameraEasing })}
              >
                {CAMERA_EASINGS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="cue-cam-dur">Duration (s)</label>
            <NumericInput
              id="cue-cam-dur"
              min={0.1}
              step={0.1}
              strictPositive
              value={cam.duration}
              onCommit={(val) => updateCam({ duration: val })}
            />
          </div>

          <div className="dialog-two-col">
            <div className="field">
              <label htmlFor="cue-cam-start-x">Start X</label>
              <NumericInput
                id="cue-cam-start-x"
                step={5}
                value={cam.startX}
                onCommit={(val) => updateCam({ startX: val })}
              />
            </div>
            <div className="field">
              <label htmlFor="cue-cam-start-y">Start Y</label>
              <NumericInput
                id="cue-cam-start-y"
                step={5}
                value={cam.startY}
                onCommit={(val) => updateCam({ startY: val })}
              />
            </div>
          </div>

          <div className="dialog-two-col">
            <div className="field">
              <label htmlFor="cue-cam-end-x">End X</label>
              <NumericInput
                id="cue-cam-end-x"
                step={5}
                value={cam.endX}
                onCommit={(val) => updateCam({ endX: val })}
              />
            </div>
            <div className="field">
              <label htmlFor="cue-cam-end-y">End Y</label>
              <NumericInput
                id="cue-cam-end-y"
                step={5}
                value={cam.endY}
                onCommit={(val) => updateCam({ endY: val })}
              />
            </div>
          </div>

          <div className="dialog-two-col">
            <div className="field">
              <label htmlFor="cue-cam-zoom-start">Start Zoom</label>
              <NumericInput
                id="cue-cam-zoom-start"
                min={0.2}
                max={4}
                step={0.1}
                strictPositive
                value={cam.startZoom}
                onCommit={(val) => updateCam({ startZoom: val })}
              />
            </div>
            <div className="field">
              <label htmlFor="cue-cam-zoom-end">End Zoom</label>
              <NumericInput
                id="cue-cam-zoom-end"
                min={0.2}
                max={4}
                step={0.1}
                strictPositive
                value={cam.endZoom}
                onCommit={(val) => updateCam({ endZoom: val })}
              />
            </div>
          </div>
        </section>
      );
    }

    if (selection.kind === 'audio') {
      const cueScene = draftProject.scenes.find((s) => s.id === selection.sceneId);
      const track = cueScene?.timeline.audioTracks[selection.index];
      if (!cueScene || !track) return null;

      const audioAssets = draftProject.assets.filter((a) => a.type === 'audio');

      const updateAudio = (patch: Partial<typeof track>) => {
        updateScene(cueScene.id, (scene) => ({
          ...scene,
          timeline: {
            ...scene.timeline,
            audioTracks: scene.timeline.audioTracks.map((t, idx) =>
              idx === selection.index ? { ...t, ...patch } : t
            ),
          },
        }));
      };

      const deleteAudio = () => {
        updateScene(cueScene.id, (scene) => ({
          ...scene,
          timeline: {
            ...scene.timeline,
            audioTracks: scene.timeline.audioTracks.filter((_, idx) => idx !== selection.index),
          },
        }));
        setSelection({ kind: 'scene', id: cueScene.id });
      };

      return (
        <section
          aria-label="Selected Audio Cue"
          style={{
            padding: 8,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--track-audio-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 'var(--text-xs)' }}>Selected Audio Cue</strong>
            <button type="button" className="btn-danger" onClick={deleteAudio}>
              Delete Audio
            </button>
          </div>

          <div className="field">
            <label htmlFor="cue-audio-asset">Audio Asset</label>
            <select
              id="cue-audio-asset"
              value={track.assetId}
              onChange={(ev) => updateAudio({ assetId: ev.target.value })}
            >
              {audioAssets.some((a) => a.id === track.assetId) ? null : (
                <option value={track.assetId}>{track.assetId}</option>
              )}
              {audioAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </div>

          <div className="dialog-two-col">
            <div className="field">
              <label htmlFor="cue-audio-start">Start (s)</label>
              <NumericInput
                id="cue-audio-start"
                min={0}
                step={0.1}
                value={track.startTime}
                onCommit={(val) => updateAudio({ startTime: val })}
              />
            </div>

            <div className="field">
              <label htmlFor="cue-audio-vol">Volume</label>
              <NumericInput
                id="cue-audio-vol"
                min={0}
                max={1}
                step={0.05}
                value={track.volume}
                onCommit={(val) => updateAudio({ volume: val })}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}>
            <input
              type="checkbox"
              checked={track.loop}
              onChange={(ev) => updateAudio({ loop: ev.target.checked })}
            />
            <span>Loop audio track</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)' }}>
            <input
              type="checkbox"
              checked={Boolean(track.muted)}
              onChange={(ev) => updateAudio({ muted: ev.target.checked })}
            />
            <span>Mute audio cue</span>
          </label>
        </section>
      );
    }

    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="studio-pane-scroll">
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Scene Details</h3>

        <div className="field">
          <label htmlFor={titleId}>Scene Title</label>
          <input
            id={titleId}
            type="text"
            value={activeScene.title}
            onChange={(ev) =>
              updateScene(activeScene.id, (scene) => ({ ...scene, title: ev.target.value }))
            }
          />
        </div>

        <div className="field">
          <label htmlFor={descId}>Description</label>
          <textarea
            id={descId}
            value={activeScene.description}
            onChange={(ev) =>
              updateScene(activeScene.id, (scene) => ({ ...scene, description: ev.target.value }))
            }
          />
        </div>

        <div className="field">
          <label htmlFor={durationId}>Duration (s)</label>
          <NumericInput
            id={durationId}
            min={0.5}
            step={0.5}
            strictPositive
            value={activeScene.duration}
            onCommit={(val) =>
              updateScene(activeScene.id, (scene) => ({
                ...scene,
                duration: val,
                timeline: { ...scene.timeline, duration: val },
              }))
            }
          />
        </div>

        <div className="dialog-two-col">
          <div className="field">
            <label htmlFor={transTypeId}>Transition</label>
            <select
              id={transTypeId}
              value={activeScene.transition.type}
              onChange={(ev) =>
                updateScene(activeScene.id, (scene) => ({
                  ...scene,
                  transition: { ...scene.transition, type: ev.target.value as TransitionType },
                }))
              }
            >
              {TRANSITION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={transDurId}>Trans. Dur (s)</label>
            <NumericInput
              id={transDurId}
              min={0}
              step={0.1}
              value={activeScene.transition.duration}
              onCommit={(val) =>
                updateScene(activeScene.id, (scene) => ({
                  ...scene,
                  transition: { ...scene.transition, duration: val },
                }))
              }
            />
          </div>
        </div>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: 4 }}>
          Camera Movement
        </h3>

        <div className="dialog-two-col">
          <div className="field">
            <label htmlFor={camTypeId}>Camera Type</label>
            <select
              id={camTypeId}
              value={firstCam?.type ?? 'static'}
              onChange={(ev) => {
                const type = ev.target.value as CameraMoveType;
                updateScene(activeScene.id, (scene) => {
                  const moves = [...scene.timeline.cameraMoves];
                  if (moves.length === 0) {
                    moves.push(createDefaultCameraMove(scene.duration, { type }));
                  } else {
                    moves[0] = { ...moves[0], type };
                  }
                  return { ...scene, timeline: { ...scene.timeline, cameraMoves: moves } };
                });
              }}
            >
              {CAMERA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={camEaseId}>Easing</label>
            <select
              id={camEaseId}
              value={firstCam?.easing ?? 'ease-in-out'}
              onChange={(ev) => {
                const easing = ev.target.value as CameraEasing;
                updateScene(activeScene.id, (scene) => {
                  const moves = [...scene.timeline.cameraMoves];
                  if (moves.length === 0) {
                    moves.push(createDefaultCameraMove(scene.duration, { easing }));
                  } else {
                    moves[0] = { ...moves[0], easing };
                  }
                  return { ...scene, timeline: { ...scene.timeline, cameraMoves: moves } };
                });
              }}
            >
              {CAMERA_EASINGS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddCamera}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <PlusIcon size={14} />
          <span>+ Add Camera Cue</span>
        </button>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: 4 }}>
          Character Actions
        </h3>

        <div className="dialog-two-col">
          <div className="field">
            <label htmlFor={charSelectId}>Character</label>
            <select
              id={charSelectId}
              value={newActionCharId}
              onChange={(ev) => setNewActionCharId(ev.target.value)}
            >
              {draftProject.characters.length > 0 ? (
                draftProject.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              ) : (
                <option value="hero">Hero (Default)</option>
              )}
            </select>
          </div>

          <div className="field">
            <label htmlFor={actionSelectId}>Action</label>
            <select
              id={actionSelectId}
              value={newActionName}
              onChange={(ev) => setNewActionName(ev.target.value as CharacterActionName)}
            >
              {ACTION_NAMES.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddAction}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <PlusIcon size={14} />
          <span>Add Action</span>
        </button>

        {renderSelectedCueSection()}
      </div>

      <div
        style={{
          padding: 10,
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <button
          type="button"
          className={isDirty ? 'btn-primary' : undefined}
          disabled={!draftProject || busy.saving}
          onClick={() => void saveDraft()}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <SaveIcon size={14} />
          <span>{busy.saving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
}
