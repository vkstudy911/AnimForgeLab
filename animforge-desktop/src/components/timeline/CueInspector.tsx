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

export type KeyframeEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface KeyframeItem {
  id: string;
  time: number;
  property: string;
  value: number;
  easing?: KeyframeEasing;
}

export interface CueInspectorProps {
  selectedKeyframeId?: string | null;
  onSelectKeyframe?: (id: string | null) => void;
}

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

export function CueInspector({
  selectedKeyframeId,
  onSelectKeyframe,
}: CueInspectorProps = {}) {
  const {
    draftProject,
    selectedSceneId,
    selection,
    setSelection,
    playheadTime,
    updateDraft,
    saveDraft,
    navigate,
    revealInWorkspace,
    isDirty,
    busy,
  } = useStudioContext();

  const [localKeyframeId, setLocalKeyframeId] = useState<string | null>(null);
  const activeKfId = selectedKeyframeId !== undefined ? selectedKeyframeId : localKeyframeId;
  const setActiveKfId = onSelectKeyframe ?? setLocalKeyframeId;

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

  const effectiveCharId =
    (draftProject.characters.some((c) => c.id === newActionCharId)
      ? newActionCharId
      : draftProject.characters[0]?.id) ?? 'hero';

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
      parameters: { characterId: effectiveCharId },
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
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Palette:</span>
            {char.colorPalette.map((col, idx) => (
              <span
                key={`${char.id}-pal-${idx}`}
                title={col}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  backgroundColor: col,
                  border: '1px solid var(--border-subtle)',
                }}
              />
            ))}
          </div>
        </section>
      );
    }

    if (selection.kind === 'asset') {
      const asset = draftProject.assets.find((a) => a.id === selection.id);
      if (!asset) return null;

      const updateAssetType = (nextType: AssetType) => {
        updateDraft((prev) => ({
          ...prev,
          assets: prev.assets.map((a) => (a.id === asset.id ? { ...a, type: nextType } : a)),
        }));
      };

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
            <strong style={{ fontSize: 'var(--text-xs)' }}>Asset: {asset.name}</strong>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => navigate('assets')}
              style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }}
            >
              Library
            </button>
          </div>
          <div className="field">
            <label htmlFor="cue-asset-type">Asset Type</label>
            <select
              id="cue-asset-type"
              value={asset.type}
              onChange={(ev) => updateAssetType(ev.target.value as AssetType)}
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
      const rawKfs = action.parameters?.keyframes;
      const actionKeyframes: KeyframeItem[] = Array.isArray(rawKfs)
        ? (rawKfs as KeyframeItem[])
        : [];
      const selectedKeyframe = actionKeyframes.find((k) => k.id === activeKfId) ?? null;

      const handleAddKeyframeToAction = () => {
        const offset = Math.max(0, Math.min(action.duration, playheadTime - action.startTime));
        const newKf: KeyframeItem = {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          time: Number(offset.toFixed(2)),
          property: 'positionX',
          value: Number(action.parameters?.positionX ?? 0),
          easing: 'ease-in-out',
        };
        const nextKfs = [...actionKeyframes, newKf].sort((a, b) => a.time - b.time);
        updateParam('keyframes', nextKfs);
        setActiveKfId(newKf.id);
      };

      const handleUpdateKeyframe = (kfId: string, patch: Partial<KeyframeItem>) => {
        const nextKfs = actionKeyframes.map((k) => (k.id === kfId ? { ...k, ...patch } : k));
        updateParam('keyframes', nextKfs);
      };

      const handleDeleteKeyframeFromAction = (kfId: string) => {
        const nextKfs = actionKeyframes.filter((k) => k.id !== kfId);
        updateParam('keyframes', nextKfs);
        if (activeKfId === kfId) {
          setActiveKfId(null);
        }
      };

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

          {/* Transform controls for CharacterAction */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Transform Controls
            </span>
            <div className="dialog-two-col">
              <div className="field">
                <label htmlFor="cue-action-pos-x">Position X</label>
                <NumericInput
                  id="cue-action-pos-x"
                  aria-label="Position X"
                  step={1}
                  value={Number(action.parameters?.positionX ?? 0)}
                  onCommit={(val) => updateParam('positionX', val)}
                />
              </div>
              <div className="field">
                <label htmlFor="cue-action-pos-y">Position Y</label>
                <NumericInput
                  id="cue-action-pos-y"
                  aria-label="Position Y"
                  step={1}
                  value={Number(action.parameters?.positionY ?? 0)}
                  onCommit={(val) => updateParam('positionY', val)}
                />
              </div>
            </div>

            <div className="dialog-two-col">
              <div className="field">
                <label htmlFor="cue-action-scale">Scale</label>
                <NumericInput
                  id="cue-action-scale"
                  aria-label="Scale"
                  min={0.01}
                  max={10}
                  step={0.05}
                  strictPositive
                  value={Number(action.parameters?.scale ?? 1)}
                  onCommit={(val) => updateParam('scale', val)}
                />
              </div>
              <div className="field">
                <label htmlFor="cue-action-rotation">Rotation</label>
                <NumericInput
                  id="cue-action-rotation"
                  aria-label="Rotation"
                  step={1}
                  value={Number(action.parameters?.rotation ?? 0)}
                  onCommit={(val) => updateParam('rotation', val)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="cue-action-opacity">Opacity</label>
              <NumericInput
                id="cue-action-opacity"
                aria-label="Opacity"
                min={0}
                max={1}
                step={0.05}
                value={Number(action.parameters?.opacity ?? 1)}
                onCommit={(val) => updateParam('opacity', val)}
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

          {/* Keyframe Inspector for CharacterAction */}
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                Keyframes ({actionKeyframes.length})
              </span>
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: '11px', padding: '2px 6px' }}
                onClick={handleAddKeyframeToAction}
              >
                + Add Keyframe
              </button>
            </div>

            {actionKeyframes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {actionKeyframes.map((kf) => {
                  const isSel = activeKfId === kf.id;
                  return (
                    <div
                      key={kf.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveKfId(kf.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setActiveKfId(kf.id);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '3px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: isSel ? 'var(--bg-surface-active, rgba(255,255,255,0.1))' : 'var(--bg-surface)',
                        border: isSel ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="keyframe-diamond" aria-hidden="true" style={{ width: 6, height: 6 }} />
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{kf.time.toFixed(2)}s</span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                          {kf.property}: {kf.value}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete keyframe ${kf.id}`}
                        className="btn-ghost"
                        style={{ padding: '0 4px', fontSize: '11px', color: 'var(--accent-red)' }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleDeleteKeyframeFromAction(kf.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="field-hint" style={{ margin: 0, fontSize: '11px' }}>
                No keyframes on this action yet.
              </p>
            )}

            {selectedKeyframe ? (
              <div
                aria-label="Keyframe Inspector"
                style={{
                  marginTop: 4,
                  padding: 8,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-strong)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 'var(--text-xs)' }}>Edit Keyframe</strong>
                  <button
                    type="button"
                    className="btn-danger"
                    aria-label="Delete Keyframe"
                    style={{ fontSize: '11px', padding: '1px 6px' }}
                    onClick={() => handleDeleteKeyframeFromAction(selectedKeyframe.id)}
                  >
                    Delete Keyframe
                  </button>
                </div>

                <div className="dialog-two-col">
                  <div className="field">
                    <label htmlFor="cue-kf-time">Time (s)</label>
                    <NumericInput
                      id="cue-kf-time"
                      aria-label="Keyframe Time"
                      min={0}
                      max={action.duration}
                      step={0.05}
                      value={selectedKeyframe.time}
                      onCommit={(val) => handleUpdateKeyframe(selectedKeyframe.id, { time: val })}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="cue-kf-property">Property</label>
                    <select
                      id="cue-kf-property"
                      aria-label="Keyframe Property"
                      value={selectedKeyframe.property}
                      onChange={(ev) =>
                        handleUpdateKeyframe(selectedKeyframe.id, { property: ev.target.value })
                      }
                    >
                      <option value="positionX">Position X</option>
                      <option value="positionY">Position Y</option>
                      <option value="scale">Scale</option>
                      <option value="rotation">Rotation</option>
                      <option value="opacity">Opacity</option>
                    </select>
                  </div>
                </div>

                <div className="dialog-two-col">
                  <div className="field">
                    <label htmlFor="cue-kf-val">Value</label>
                    <NumericInput
                      id="cue-kf-val"
                      aria-label="Keyframe Value"
                      step={
                        selectedKeyframe.property === 'opacity' || selectedKeyframe.property === 'scale'
                          ? 0.05
                          : 1
                      }
                      value={selectedKeyframe.value}
                      onCommit={(val) => handleUpdateKeyframe(selectedKeyframe.id, { value: val })}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="cue-kf-easing">Easing</label>
                    <select
                      id="cue-kf-easing"
                      aria-label="Keyframe Easing"
                      value={selectedKeyframe.easing ?? 'ease-in-out'}
                      onChange={(ev) =>
                        handleUpdateKeyframe(selectedKeyframe.id, {
                          easing: ev.target.value as KeyframeEasing,
                        })
                      }
                    >
                      <option value="linear">linear</option>
                      <option value="ease-in">ease-in</option>
                      <option value="ease-out">ease-out</option>
                      <option value="ease-in-out">ease-in-out</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      );
    }

    if (selection.kind === 'camera') {
      const cueScene = draftProject.scenes.find((s) => s.id === selection.sceneId);
      const cam = cueScene?.timeline.cameraMoves[selection.index];
      if (!cueScene || !cam) return null;

      const updateCam = (patch: Partial<CameraMovement> & Record<string, unknown>) => {
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

      const rawCamKfs = (cam as CameraMovement & { keyframes?: KeyframeItem[] }).keyframes;
      const camKeyframes: KeyframeItem[] = Array.isArray(rawCamKfs) ? rawCamKfs : [];
      const selectedCamKf = camKeyframes.find((k) => k.id === activeKfId) ?? null;

      const handleAddCameraKeyframe = () => {
        const offset = Math.max(0, Math.min(cam.duration, playheadTime));
        const newKf: KeyframeItem = {
          id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          time: Number(offset.toFixed(2)),
          property: 'zoom',
          value: cam.startZoom,
          easing: 'ease-in-out',
        };
        const nextKfs = [...camKeyframes, newKf].sort((a, b) => a.time - b.time);
        updateCam({ keyframes: nextKfs });
        setActiveKfId(newKf.id);
      };

      const handleUpdateCamKeyframe = (kfId: string, patch: Partial<KeyframeItem>) => {
        const nextKfs = camKeyframes.map((k) => (k.id === kfId ? { ...k, ...patch } : k));
        updateCam({ keyframes: nextKfs });
      };

      const handleDeleteCamKeyframe = (kfId: string) => {
        const nextKfs = camKeyframes.filter((k) => k.id !== kfId);
        updateCam({ keyframes: nextKfs });
        if (activeKfId === kfId) {
          setActiveKfId(null);
        }
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

          {/* Keyframe Inspector for Camera */}
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                Camera Keyframes ({camKeyframes.length})
              </span>
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: '11px', padding: '2px 6px' }}
                onClick={handleAddCameraKeyframe}
              >
                + Add Keyframe
              </button>
            </div>

            {camKeyframes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {camKeyframes.map((kf) => {
                  const isSel = activeKfId === kf.id;
                  return (
                    <div
                      key={kf.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveKfId(kf.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setActiveKfId(kf.id);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '3px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: isSel ? 'var(--bg-surface-active, rgba(255,255,255,0.1))' : 'var(--bg-surface)',
                        border: isSel ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="keyframe-diamond" aria-hidden="true" style={{ width: 6, height: 6 }} />
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{kf.time.toFixed(2)}s</span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                          {kf.property}: {kf.value}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete camera keyframe ${kf.id}`}
                        className="btn-ghost"
                        style={{ padding: '0 4px', fontSize: '11px', color: 'var(--accent-red)' }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleDeleteCamKeyframe(kf.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {selectedCamKf ? (
              <div
                aria-label="Camera Keyframe Inspector"
                style={{
                  marginTop: 4,
                  padding: 8,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-strong)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 'var(--text-xs)' }}>Edit Camera Keyframe</strong>
                  <button
                    type="button"
                    className="btn-danger"
                    aria-label="Delete Camera Keyframe"
                    style={{ fontSize: '11px', padding: '1px 6px' }}
                    onClick={() => handleDeleteCamKeyframe(selectedCamKf.id)}
                  >
                    Delete Keyframe
                  </button>
                </div>

                <div className="dialog-two-col">
                  <div className="field">
                    <label htmlFor="cue-cam-kf-time">Time (s)</label>
                    <NumericInput
                      id="cue-cam-kf-time"
                      aria-label="Camera Keyframe Time"
                      min={0}
                      max={cam.duration}
                      step={0.05}
                      value={selectedCamKf.time}
                      onCommit={(val) => handleUpdateCamKeyframe(selectedCamKf.id, { time: val })}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="cue-cam-kf-property">Property</label>
                    <select
                      id="cue-cam-kf-property"
                      aria-label="Camera Keyframe Property"
                      value={selectedCamKf.property}
                      onChange={(ev) =>
                        handleUpdateCamKeyframe(selectedCamKf.id, { property: ev.target.value })
                      }
                    >
                      <option value="zoom">Zoom</option>
                      <option value="startX">Start X</option>
                      <option value="startY">Start Y</option>
                      <option value="endX">End X</option>
                      <option value="endY">End Y</option>
                    </select>
                  </div>
                </div>

                <div className="dialog-two-col">
                  <div className="field">
                    <label htmlFor="cue-cam-kf-val">Value</label>
                    <NumericInput
                      id="cue-cam-kf-val"
                      aria-label="Camera Keyframe Value"
                      step={selectedCamKf.property === 'zoom' ? 0.05 : 5}
                      value={selectedCamKf.value}
                      onCommit={(val) => handleUpdateCamKeyframe(selectedCamKf.id, { value: val })}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="cue-cam-kf-easing">Easing</label>
                    <select
                      id="cue-cam-kf-easing"
                      aria-label="Camera Keyframe Easing"
                      value={selectedCamKf.easing ?? 'ease-in-out'}
                      onChange={(ev) =>
                        handleUpdateCamKeyframe(selectedCamKf.id, {
                          easing: ev.target.value as KeyframeEasing,
                        })
                      }
                    >
                      <option value="linear">linear</option>
                      <option value="ease-in">ease-in</option>
                      <option value="ease-out">ease-out</option>
                      <option value="ease-in-out">ease-in-out</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : null}
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
    <div className="studio-pane-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Scene Properties</h3>

        <div className="field">
          <label htmlFor={titleId}>Scene Title</label>
          <input
            id={titleId}
            type="text"
            value={activeScene.title}
            onChange={(ev) => updateScene(activeScene.id, (s) => ({ ...s, title: ev.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor={descId}>Description</label>
          <textarea
            id={descId}
            rows={2}
            value={activeScene.description}
            onChange={(ev) =>
              updateScene(activeScene.id, (s) => ({ ...s, description: ev.target.value }))
            }
          />
        </div>

        <div className="field">
          <label htmlFor={durationId}>Duration (s)</label>
          <NumericInput
            id={durationId}
            min={0.5}
            step={0.25}
            strictPositive
            value={activeScene.duration}
            onCommit={(val) =>
              updateScene(activeScene.id, (s) => ({
                ...s,
                duration: val,
                timeline: { ...s.timeline, duration: val },
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
                updateScene(activeScene.id, (s) => ({
                  ...s,
                  transition: { ...s.transition, type: ev.target.value as TransitionType },
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
              max={2}
              step={0.1}
              value={activeScene.transition.duration}
              onCommit={(val) =>
                updateScene(activeScene.id, (s) => ({
                  ...s,
                  transition: { ...s.transition, duration: val },
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
              value={effectiveCharId}
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
