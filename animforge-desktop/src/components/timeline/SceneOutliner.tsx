import { useState } from 'react';
import { useStudioContext } from '../../context/StudioContext';
import type { SceneDetail } from '../../types';
import {
  AssetsIcon,
  CharactersIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  LayersIcon,
  PlusIcon,
  TrashIcon,
} from '../ui/Icons';
import { SceneThumb } from '../ui/SceneThumb';
import { StatusBadge } from '../ui/StatusBadge';
import { StudioTabs } from '../ui/StudioTabs';

function sortScenes(scenes: SceneDetail[]): SceneDetail[] {
  return [...scenes].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
}

function sceneStartTime(ordered: SceneDetail[], sceneId: string): number {
  let offset = 0;
  for (const s of ordered) {
    if (s.id === sceneId) break;
    offset += Math.max(0.5, Number.isFinite(s.duration) ? s.duration : 1);
  }
  return Number(offset.toFixed(3));
}

export function SceneOutliner() {
  const {
    draftProject,
    selectedSceneId,
    setSelectedSceneId,
    selection,
    setSelection,
    setPlayheadTime,
    updateDraft,
    navigate,
  } = useStudioContext();

  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  if (!draftProject) return null;

  const orderedScenes = sortScenes(draftProject.scenes);
  const activeScene = orderedScenes.find((s) => s.id === selectedSceneId) ?? orderedScenes[0] ?? null;

  const selectSceneAndSeek = (sceneId: string, scenesList: SceneDetail[] = orderedScenes) => {
    setSelectedSceneId(sceneId);
    setSelection({ kind: 'scene', id: sceneId });
    setPlayheadTime(sceneStartTime(scenesList, sceneId));
  };

  const handleAddScene = () => {
    const nextNum = draftProject.scenes.length + 1;
    const newId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newScene: SceneDetail = {
      id: newId,
      projectId: draftProject.id,
      sequenceIndex: orderedScenes.length,
      title: `Scene ${nextNum}`,
      description: 'New animated scene',
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

    const nextScenes = [...orderedScenes, newScene].map((s, idx) => ({
      ...s,
      sequenceIndex: idx,
    }));
    updateDraft((prev) => ({
      ...prev,
      scenes: [...sortScenes(prev.scenes), newScene].map((s, idx) => ({
        ...s,
        sequenceIndex: idx,
      })),
    }));
    selectSceneAndSeek(newId, nextScenes);
  };

  const handleDuplicateScene = (scene: SceneDetail) => {
    const newId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cloned: SceneDetail = {
      ...structuredClone(scene),
      id: newId,
      title: `${scene.title} Copy`,
      timeline: {
        ...structuredClone(scene.timeline),
        characterActions: scene.timeline.characterActions.map((a) => ({
          ...structuredClone(a),
          actionId: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        })),
      },
    };
    const idx = orderedScenes.findIndex((s) => s.id === scene.id);
    const nextList = [...orderedScenes];
    nextList.splice(idx >= 0 ? idx + 1 : nextList.length, 0, cloned);
    const reindexed = nextList.map((s, i) => ({ ...s, sequenceIndex: i }));

    updateDraft((prev) => {
      const list = sortScenes(prev.scenes);
      const pos = list.findIndex((s) => s.id === scene.id);
      const inserted = [...list];
      inserted.splice(pos >= 0 ? pos + 1 : inserted.length, 0, cloned);
      return {
        ...prev,
        scenes: inserted.map((s, i) => ({ ...s, sequenceIndex: i })),
      };
    });
    selectSceneAndSeek(newId, reindexed);
  };

  const handleDeleteScene = (sceneId: string) => {
    if (orderedScenes.length <= 1) return;
    const idx = orderedScenes.findIndex((s) => s.id === sceneId);
    const remaining = orderedScenes.filter((s) => s.id !== sceneId).map((s, i) => ({
      ...s,
      sequenceIndex: i,
    }));
    updateDraft((prev) => {
      if (prev.scenes.length <= 1) return prev;
      return {
        ...prev,
        scenes: sortScenes(prev.scenes)
          .filter((s) => s.id !== sceneId)
          .map((s, i) => ({ ...s, sequenceIndex: i })),
      };
    });
    if (remaining.length > 0) {
      const fallback = remaining[Math.min(idx, remaining.length - 1)];
      const selectionPointsToDeleted =
        selection !== null &&
        ((selection.kind === 'scene' && selection.id === sceneId) ||
          ('sceneId' in selection && selection.sceneId === sceneId));
      if (selectedSceneId === sceneId || selectionPointsToDeleted) {
        selectSceneAndSeek(fallback.id, remaining);
      }
    }
  };

  const commitInlineRename = (sceneId: string) => {
    const trimmed = editingTitle.trim();
    setEditingSceneId(null);
    if (!trimmed) return;
    const current = orderedScenes.find((s) => s.id === sceneId);
    if (!current || current.title === trimmed) return;
    updateDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, title: trimmed } : s)),
    }));
  };

  const handleMoveScene = (sceneId: string, delta: -1 | 1) => {
    updateDraft((prev) => {
      const list = sortScenes(prev.scenes);
      const idx = list.findIndex((s) => s.id === sceneId);
      const targetIdx = idx + delta;
      if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return prev;

      const swapped = [...list];
      const [moved] = swapped.splice(idx, 1);
      swapped.splice(targetIdx, 0, moved);

      return {
        ...prev,
        scenes: swapped.map((s, i) => ({ ...s, sequenceIndex: i })),
      };
    });
  };

  const handleToggleCharacterOnScene = (characterId: string) => {
    if (!activeScene) return;
    updateDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => {
        if (scene.id !== activeScene.id) return scene;
        const exists = scene.characterIds.includes(characterId);
        return {
          ...scene,
          characterIds: exists
            ? scene.characterIds.filter((id) => id !== characterId)
            : [...scene.characterIds, characterId],
        };
      }),
    }));
  };

  const handleToggleBackground = (assetId: string) => {
    if (!activeScene) return;
    updateDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => {
        if (scene.id !== activeScene.id) return scene;
        return {
          ...scene,
          backgroundAssetId: scene.backgroundAssetId === assetId ? undefined : assetId,
        };
      }),
    }));
  };

  const handleAddAudioTrack = (assetId: string) => {
    if (!activeScene) return;
    updateDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => {
        if (scene.id !== activeScene.id) return scene;
        return {
          ...scene,
          timeline: {
            ...scene.timeline,
            audioTracks: [
              ...scene.timeline.audioTracks,
              { assetId, startTime: 0, volume: 0.8, loop: false },
            ],
          },
        };
      }),
    }));
  };

  const scenesContent = (
    <div className="studio-pane-scroll">
      <button
        type="button"
        className="btn-primary"
        onClick={handleAddScene}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <PlusIcon size={14} />
        <span>+ Add Scene</span>
      </button>

      {orderedScenes.length === 0 ? (
        <p className="field-hint">No scenes yet. Add a scene to start animating.</p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="list">
          {orderedScenes.map((scene, idx) => {
            const firstChar = draftProject.characters.find((c) =>
              scene.characterIds.includes(c.id)
            );
            const isSelected = scene.id === activeScene?.id;
            const isEditing = editingSceneId === scene.id;
            return (
              <li key={scene.id} style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
                {isEditing ? (
                  <div className="scene-card-btn">
                    <SceneThumb
                      title={scene.title}
                      palette={firstChar?.colorPalette}
                      badge={String(idx + 1).padStart(2, '0')}
                    />
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <input
                        type="text"
                        aria-label="Rename scene title"
                        autoFocus
                        value={editingTitle}
                        onChange={(ev) => setEditingTitle(ev.target.value)}
                        onBlur={() => commitInlineRename(scene.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') {
                            ev.preventDefault();
                            commitInlineRename(scene.id);
                          } else if (ev.key === 'Escape') {
                            ev.preventDefault();
                            setEditingSceneId(null);
                          }
                        }}
                      />
                      <div className="field-hint mono">
                        {scene.duration}s · {scene.timeline.characterActions.length} cues
                      </div>
                      {scene.characterIds.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 3,
                            marginTop: 3,
                          }}
                        >
                          {scene.characterIds.map((charId) => {
                            const char = draftProject.characters.find((c) => c.id === charId);
                            if (!char) return null;
                            return (
                              <span
                                key={charId}
                                className="character-pill"
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '999px',
                                  background: 'var(--bg-surface-elevated, rgba(255,255,255,0.08))',
                                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.15))',
                                  color: 'var(--text-secondary, #94a3b8)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                }}
                              >
                                <span
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: '50%',
                                    backgroundColor: char.colorPalette?.[0] ?? 'var(--accent-primary)',
                                  }}
                                />
                                {char.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="scene-card-btn"
                    aria-pressed={isSelected}
                    title="Click to select & seek; double-click to rename"
                    onClick={() => selectSceneAndSeek(scene.id)}
                    onDoubleClick={() => {
                      setEditingSceneId(scene.id);
                      setEditingTitle(scene.title);
                    }}
                  >
                    <SceneThumb
                      title={scene.title}
                      palette={firstChar?.colorPalette}
                      badge={String(idx + 1).padStart(2, '0')}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 'var(--text-sm)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {scene.title}
                      </div>
                      <div className="field-hint mono">
                        {scene.duration}s · {scene.timeline.characterActions.length} cues
                      </div>
                      {scene.characterIds.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 3,
                            marginTop: 3,
                          }}
                        >
                          {scene.characterIds.map((charId) => {
                            const char = draftProject.characters.find((c) => c.id === charId);
                            if (!char) return null;
                            return (
                              <span
                                key={charId}
                                className="character-pill"
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '999px',
                                  background: 'var(--bg-surface-elevated, rgba(255,255,255,0.08))',
                                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.15))',
                                  color: 'var(--text-secondary, #94a3b8)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                }}
                              >
                                <span
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: '50%',
                                    backgroundColor: char.colorPalette?.[0] ?? 'var(--accent-primary)',
                                  }}
                                />
                                {char.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </button>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    alignContent: 'center',
                    gap: 2,
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Move ${scene.title} up`}
                    title="Move scene up"
                    disabled={idx === 0}
                    onClick={() => handleMoveScene(scene.id, -1)}
                    style={{ padding: '2px 4px', lineHeight: 1 }}
                  >
                    <ChevronUpIcon size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Duplicate ${scene.title}`}
                    title="Duplicate scene"
                    onClick={() => handleDuplicateScene(scene)}
                    style={{ padding: '2px 4px', lineHeight: 1 }}
                  >
                    <CopyIcon size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${scene.title} down`}
                    title="Move scene down"
                    disabled={idx === orderedScenes.length - 1}
                    onClick={() => handleMoveScene(scene.id, 1)}
                    style={{ padding: '2px 4px', lineHeight: 1 }}
                  >
                    <ChevronDownIcon size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${scene.title}`}
                    title={
                      orderedScenes.length <= 1
                        ? 'At least one scene is required'
                        : 'Delete scene'
                    }
                    disabled={orderedScenes.length <= 1}
                    onClick={() => handleDeleteScene(scene.id)}
                    style={{ padding: '2px 4px', lineHeight: 1 }}
                  >
                    <TrashIcon size={11} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const charactersContent = (
    <div className="studio-pane-scroll">
      {draftProject.characters.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="field-hint">No characters defined in this project yet.</p>
          <button type="button" onClick={() => navigate('characters')}>
            Open Characters Workspace
          </button>
        </div>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="list">
          {draftProject.characters.map((char) => {
            const inScene = Boolean(activeScene?.characterIds.includes(char.id));
            return (
              <li
                key={char.id}
                style={{
                  padding: 8,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: 0, textAlign: 'left', fontWeight: 600 }}
                    onClick={() => setSelection({ kind: 'character', id: char.id })}
                  >
                    {char.name}
                  </button>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {char.colorPalette.slice(0, 4).map((hex, i) => (
                      <span
                        key={`${char.id}-swatch-${i}`}
                        aria-hidden="true"
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: hex,
                          border: '1px solid var(--border-strong)',
                        }}
                      />
                    ))}
                  </div>
                </div>
                {char.description ? (
                  <p className="field-hint" style={{ margin: 0 }}>
                    {char.description}
                  </p>
                ) : null}
                <button
                  type="button"
                  aria-pressed={inScene}
                  disabled={!activeScene}
                  className={inScene ? 'btn-primary' : undefined}
                  onClick={() => handleToggleCharacterOnScene(char.id)}
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  {inScene ? 'In Active Scene' : 'Add to Scene'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const assetsContent = (
    <div className="studio-pane-scroll">
      {draftProject.assets.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="field-hint">No assets imported in this project yet.</p>
          <button type="button" onClick={() => navigate('assets')}>
            Open Assets Workspace
          </button>
        </div>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="list">
          {draftProject.assets.map((asset) => {
            const isBg = activeScene?.backgroundAssetId === asset.id;
            return (
              <li
                key={asset.id}
                style={{
                  padding: 8,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      padding: 0,
                      textAlign: 'left',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    onClick={() => setSelection({ kind: 'asset', id: asset.id })}
                  >
                    {asset.name}
                  </button>
                  <StatusBadge tone="neutral">{asset.type}</StatusBadge>
                </div>
                {asset.type === 'audio' ? (
                  <button
                    type="button"
                    disabled={!activeScene}
                    onClick={() => handleAddAudioTrack(asset.id)}
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    Add Audio Cue
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-pressed={isBg}
                    disabled={!activeScene}
                    className={isBg ? 'btn-primary' : undefined}
                    onClick={() => handleToggleBackground(asset.id)}
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    {isBg ? 'Scene Background' : 'Set Background'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) auto',
        flex: 1,
        minHeight: 0,
      }}
    >
      <StudioTabs
        label="Project Outliner"
        className="outliner-tabs"
        panelsClassName="outliner-tabpanels"
        tabs={[
          {
            id: 'scenes',
            label: 'Scenes',
            icon: <LayersIcon size={13} />,
            content: scenesContent,
          },
          {
            id: 'characters',
            label: 'Characters',
            icon: <CharactersIcon size={13} />,
            content: charactersContent,
          },
          {
            id: 'assets',
            label: 'Assets',
            icon: <AssetsIcon size={13} />,
            content: assetsContent,
          },
        ]}
      />

      <div className="project-info-box" aria-label="Project Info">
        <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', marginBottom: 2 }}>
          Project Info
        </div>
        <div className="project-info-row">
          <span>Resolution</span>
          <span className="mono">
            {draftProject.width} x {draftProject.height}
          </span>
        </div>
        <div className="project-info-row">
          <span>FPS</span>
          <span className="mono">{draftProject.fps}</span>
        </div>
        <div className="project-info-row">
          <span>Engine</span>
          <span className="mono">{draftProject.preferredEngine}</span>
        </div>
      </div>
    </div>
  );
}
