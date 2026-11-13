import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CharactersIcon,
  CopyIcon,
  LayersIcon,
  PlayIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  TrashIcon,
} from '../components/ui/Icons';
import { StudioDialog } from '../components/ui/StudioDialog';
import { useStudioContext } from '../context/StudioContext';
import type { CharacterActionName, CharacterItem, CharacterPart } from '../types';

interface PresetItem {
  name: string;
  actionName: CharacterActionName;
  type: 'expression' | 'pose';
  params: Record<string, unknown>;
}

const EXPRESSION_PRESETS: PresetItem[] = [
  { name: 'Happy', actionName: 'smile', type: 'expression', params: { expression: 'happy', mood: 'happy' } },
  { name: 'Neutral', actionName: 'idle', type: 'expression', params: { expression: 'neutral', mood: 'neutral' } },
  { name: 'Surprised', actionName: 'custom', type: 'expression', params: { expression: 'surprised', mood: 'surprised' } },
  { name: 'Sad', actionName: 'custom', type: 'expression', params: { expression: 'sad', mood: 'sad' } },
  { name: 'Focused', actionName: 'look_around', type: 'expression', params: { expression: 'focused', mood: 'focused' } },
];

const POSE_PRESETS: PresetItem[] = [
  { name: 'Stand', actionName: 'idle', type: 'pose', params: { pose: 'stand' } },
  { name: 'Walk', actionName: 'walk', type: 'pose', params: { pose: 'walk' } },
  { name: 'Run', actionName: 'run', type: 'pose', params: { pose: 'run' } },
  { name: 'Wave', actionName: 'wave', type: 'pose', params: { pose: 'wave' } },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function toSvgCoord(val: number, normalized: boolean): number {
  if (!Number.isFinite(val)) return 120;
  if (normalized) {
    return clamp(28 + val * 184, 20, 220);
  }
  return clamp(val, 12, 228);
}

function fromSvgCoord(svgVal: number, normalized: boolean): number {
  if (normalized) {
    return Number(clamp((svgVal - 28) / 184, 0, 1).toFixed(2));
  }
  return Math.round(clamp(svgVal, 12, 228));
}

function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
    reader.readAsText(file);
  });
}

function parseImportedCharacter(raw: unknown): CharacterItem {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Character JSON must be an object.');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    throw new Error('Character JSON requires a non-empty string "name".');
  }

  const partIdMap = new Map<string, string>();
  const rawParts = Array.isArray(obj.parts) ? obj.parts : [];
  for (let i = 0; i < rawParts.length; i += 1) {
    const p = rawParts[i];
    if (p && typeof p === 'object') {
      const rec = p as Record<string, unknown>;
      const oldId = typeof rec.id === 'string' && rec.id ? rec.id : `idx-${i}`;
      partIdMap.set(oldId, makeId('part'));
    }
  }

  const parts: CharacterPart[] = rawParts
    .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
    .map((rec, i) => {
      const oldId = typeof rec.id === 'string' && rec.id ? rec.id : `idx-${i}`;
      const newId = partIdMap.get(oldId) ?? makeId('part');
      const pivotRaw = rec.pivot && typeof rec.pivot === 'object' ? (rec.pivot as Record<string, unknown>) : {};
      const px = typeof pivotRaw.x === 'number' && Number.isFinite(pivotRaw.x) ? pivotRaw.x : 120;
      const py = typeof pivotRaw.y === 'number' && Number.isFinite(pivotRaw.y) ? pivotRaw.y : 120;
      const parentMapped =
        typeof rec.parentPartId === 'string' ? partIdMap.get(rec.parentPartId) : undefined;
      return {
        id: newId,
        name: typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : `Part ${i + 1}`,
        layerName:
          typeof rec.layerName === 'string' && rec.layerName.trim()
            ? rec.layerName.trim()
            : `part_${i + 1}`,
        pivot: { x: px, y: py },
        zIndex: typeof rec.zIndex === 'number' && Number.isFinite(rec.zIndex) ? rec.zIndex : i,
        ...(parentMapped ? { parentPartId: parentMapped } : {}),
      };
    });

  const palette = Array.isArray(obj.colorPalette)
    ? obj.colorPalette.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : ['#f59e0b'];

  return {
    id: makeId('char'),
    name: obj.name.trim(),
    description: typeof obj.description === 'string' ? obj.description : '',
    defaultRigId: typeof obj.defaultRigId === 'string' ? obj.defaultRigId : undefined,
    colorPalette: palette.length > 0 ? palette : ['#f59e0b'],
    parts,
  };
}

function toSafeColorInput(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#f59e0b';
}

export function CharacterStudio() {
  const {
    draftProject,
    isDirty,
    updateDraft,
    saveDraft,
    discardDraft,
    busy,
    selectedSceneId,
    setSelectedSceneId,
    playheadTime,
    setSelection,
    navigate,
    setNewProjectDialogOpen,
  } = useStudioContext();

  const headingId = useId();
  const charNameId = useId();
  const charDescId = useId();
  const charRigId = useId();
  const sceneTargetId = useId();

  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [charToDelete, setCharToDelete] = useState<CharacterItem | null>(null);
  const [dragPivot, setDragPivot] = useState<{
    charId: string;
    partId: string;
    x: number;
    y: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  const characters = draftProject?.characters ?? [];

  const filteredCharacters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [characters, searchQuery]);

  useEffect(() => {
    if (characters.length === 0) {
      setSelectedCharId(null);
      setSelectedPartId(null);
      return;
    }
    const existing = characters.find((c) => c.id === selectedCharId);
    const chosen = existing ?? characters[0];
    if (chosen.id !== selectedCharId) {
      setSelectedCharId(chosen.id);
    }
    if (chosen.parts.length === 0) {
      setSelectedPartId(null);
    } else if (!chosen.parts.some((p) => p.id === selectedPartId)) {
      setSelectedPartId(chosen.parts[0].id);
    }
  }, [characters, selectedCharId, selectedPartId]);

  const selectedChar = useMemo(
    () => characters.find((c) => c.id === selectedCharId) ?? characters[0] ?? null,
    [characters, selectedCharId]
  );

  const sortedParts = useMemo(() => {
    if (!selectedChar) return [];
    return [...selectedChar.parts].sort((a, b) => a.zIndex - b.zIndex);
  }, [selectedChar]);

  const selectedPart = useMemo(
    () =>
      selectedChar?.parts.find((p) => p.id === selectedPartId) ??
      selectedChar?.parts[0] ??
      null,
    [selectedChar, selectedPartId]
  );

  const scenes = draftProject?.scenes ?? [];
  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;

  if (!draftProject) {
    return (
      <section className="page-container" aria-labelledby={headingId}>
        <div className="page-header-row">
          <h2 id={headingId}>Character Studio</h2>
        </div>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <p className="field-hint">
            Open or create a project to inspect characters, edit rig parts, and add timeline actions.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" onClick={() => setNewProjectDialogOpen(true)}>
              New Project
            </button>
            <button type="button" onClick={() => navigate('projects')}>
              Browse Projects
            </button>
          </div>
        </div>
      </section>
    );
  }

  const updateCharacter = (charId: string, updater: (char: CharacterItem) => CharacterItem) => {
    updateDraft((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => (c.id === charId ? updater(c) : c)),
    }));
  };

  const handleAddCharacter = () => {
    const idx = draftProject.characters.length + 1;
    const rootPartId = makeId('part');
    const nextChar: CharacterItem = {
      id: makeId('char'),
      name: `Character ${idx}`,
      description: '',
      defaultRigId: `rig-${idx}`,
      colorPalette: ['#f59e0b', '#38bdf8'],
      parts: [
        {
          id: rootPartId,
          name: 'Torso',
          layerName: 'torso_layer',
          pivot: { x: 120, y: 130 },
          zIndex: 0,
        },
      ],
    };
    updateDraft((prev) => ({
      ...prev,
      characters: [...prev.characters, nextChar],
    }));
    setSelectedCharId(nextChar.id);
    setSelectedPartId(rootPartId);
    setSelection({ kind: 'character', id: nextChar.id });
  };

  const handleDeleteCharacter = (charId: string) => {
    updateDraft((prev) => ({
      ...prev,
      characters: prev.characters.filter((c) => c.id !== charId),
      scenes: prev.scenes.map((sc) => ({
        ...sc,
        characterIds: sc.characterIds.filter((id) => id !== charId),
      })),
    }));
    if (selectedCharId === charId) {
      const remaining = characters.filter((c) => c.id !== charId);
      setSelectedCharId(remaining[0]?.id ?? null);
      setSelectedPartId(remaining[0]?.parts[0]?.id ?? null);
    }
  };

  const handleDuplicateCharacter = (char: CharacterItem) => {
    const partIdMap = new Map<string, string>();
    for (const part of char.parts) {
      partIdMap.set(part.id, makeId('part'));
    }
    const clonedParts: CharacterPart[] = char.parts.map((part) => ({
      ...part,
      id: partIdMap.get(part.id) ?? makeId('part'),
      pivot: { ...part.pivot },
      ...(part.parentPartId ? { parentPartId: partIdMap.get(part.parentPartId) } : {}),
    }));
    const clonedChar: CharacterItem = {
      ...char,
      id: makeId('char'),
      name: `${char.name} (Copy)`,
      colorPalette: [...char.colorPalette],
      parts: clonedParts,
    };
    updateDraft((prev) => ({
      ...prev,
      characters: [...prev.characters, clonedChar],
    }));
    setSelectedCharId(clonedChar.id);
    setSelectedPartId(clonedParts[0]?.id ?? null);
    setSelection({ kind: 'character', id: clonedChar.id });
  };

  const handleExportCharacterJson = (char: CharacterItem) => {
    const slug =
      char.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || char.id;
    const blob = new Blob([JSON.stringify(char, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.character.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportCharacterChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setImportError('Character JSON file exceeds 10 MB limit.');
      return;
    }
    setImportError(null);
    try {
      const rawText = await readTextFile(file);
      const parsed: unknown = JSON.parse(rawText);
      const imported = parseImportedCharacter(parsed);
      updateDraft((prev) => ({
        ...prev,
        characters: [...prev.characters, imported],
      }));
      setSelectedCharId(imported.id);
      setSelectedPartId(imported.parts[0]?.id ?? null);
      setSelection({ kind: 'character', id: imported.id });
    } catch (err: unknown) {
      setImportError(
        err instanceof Error
          ? `Invalid character JSON: ${err.message}`
          : `Invalid character JSON: ${String(err)}`
      );
    }
  };

  const handleAddPart = () => {
    if (!selectedChar) return;
    const idx = selectedChar.parts.length + 1;
    const maxZ = selectedChar.parts.reduce((acc, p) => Math.max(acc, p.zIndex), -1);
    const parentId = selectedPart?.id ?? selectedChar.parts[0]?.id;
    const newPart: CharacterPart = {
      id: makeId('part'),
      name: `Part ${idx}`,
      layerName: `part_${idx}`,
      pivot: { x: 120, y: Math.max(36, 130 - idx * 18) },
      zIndex: maxZ + 1,
      parentPartId: parentId,
    };
    updateCharacter(selectedChar.id, (c) => ({
      ...c,
      parts: [...c.parts, newPart],
    }));
    setSelectedPartId(newPart.id);
    setSelection({ kind: 'part', characterId: selectedChar.id, partId: newPart.id });
  };

  const updatePart = (partId: string, patch: Partial<CharacterPart>) => {
    if (!selectedChar) return;
    updateCharacter(selectedChar.id, (c) => ({
      ...c,
      parts: c.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)),
    }));
  };

  const handleRemovePart = (partId: string) => {
    if (!selectedChar) return;
    updateCharacter(selectedChar.id, (c) => ({
      ...c,
      parts: c.parts
        .filter((p) => p.id !== partId)
        .map((p) => (p.parentPartId === partId ? { ...p, parentPartId: undefined } : p)),
    }));
  };

  const handleApplyPreset = (preset: PresetItem) => {
    if (!selectedChar) return;
    if (!activeScene) {
      // If no active scene, still record parameter on character profile
      updateCharacter(selectedChar.id, (c) => ({
        ...c,
        description: c.description
          ? `${c.description.replace(/\[Default.*\]/, '').trim()} [Default ${preset.type}: ${preset.name}]`
          : `[Default ${preset.type}: ${preset.name}]`,
      }));
      return;
    }

    const actionId = makeId('act');
    const startTime = Number.isFinite(playheadTime)
      ? Math.max(0, Math.min(activeScene.duration, Number(playheadTime.toFixed(2))))
      : 0;
    const duration = Math.min(1.5, Math.max(0.5, activeScene.duration - startTime || 1.5));

    updateDraft((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === selectedChar.id
          ? {
              ...c,
              description: c.description
                ? `${c.description.replace(/\[Default.*\]/, '').trim()} [Default ${preset.type}: ${preset.name}]`
                : `[Default ${preset.type}: ${preset.name}]`,
            }
          : c
      ),
      scenes: prev.scenes.map((scene) =>
        scene.id === activeScene.id
          ? {
              ...scene,
              characterIds: scene.characterIds.includes(selectedChar.id)
                ? scene.characterIds
                : [...scene.characterIds, selectedChar.id],
              timeline: {
                ...scene.timeline,
                characterActions: [
                  ...scene.timeline.characterActions,
                  {
                    actionId,
                    name: preset.actionName,
                    startTime,
                    duration,
                    parameters: {
                      characterId: selectedChar.id,
                      characterName: selectedChar.name,
                      presetType: preset.type,
                      presetName: preset.name,
                      ...preset.params,
                    },
                  },
                ],
              },
            }
          : scene
      ),
    }));
    setSelectedSceneId(activeScene.id);
    setSelection({ kind: 'action', sceneId: activeScene.id, actionId });
    navigate('studio');
  };

  return (
    <section className="page-container" aria-labelledby={headingId}>
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CharactersIcon size={18} />
          <h2 id={headingId}>Character Studio</h2>
          <span className="badge badge-neutral">{characters.length} characters</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            aria-label="Import Character JSON file"
            className="sr-only"
            onChange={(ev) => void handleImportCharacterChange(ev)}
          />
          <button type="button" onClick={() => importInputRef.current?.click()}>
            Import Character JSON
          </button>
          <button type="button" onClick={handleAddCharacter}>
            <PlusIcon size={13} />
            <span style={{ marginLeft: 4 }}>Add Character</span>
          </button>
          {isDirty ? (
            <button type="button" className="btn-ghost" onClick={discardDraft} disabled={busy.saving}>
              Discard
            </button>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            onClick={() => void saveDraft(`Saved characters for "${draftProject.name}".`)}
            disabled={busy.saving || !isDirty}
          >
            <SaveIcon size={13} />
            <span style={{ marginLeft: 5 }}>{busy.saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {importError ? (
        <div
          role="alert"
          className="field-error"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          <span>{importError}</span>
          <button type="button" className="btn-ghost" onClick={() => setImportError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="field-hint" role="note">
        Drag rig pivots directly on the schematic or edit coordinates/hierarchy in Rig Parts. Characters
        export/import as Character JSON and route to GiveMotion or StretchyStudio (`.stretch`) engines
        when rendering.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(200px, 240px) minmax(0, 1.1fr) minmax(260px, 340px)',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {/* Left Column: Cast Roster with Search */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Cast Roster</h3>
            <span className="field-hint">{draftProject.name}</span>
          </div>

          <div className="field" style={{ marginBottom: 2 }}>
            <input
              type="text"
              aria-label="Search cast"
              placeholder="Search cast..."
              value={searchQuery}
              onChange={(ev) => setSearchQuery(ev.target.value)}
              style={{ width: '100%', fontSize: 'var(--text-xs)' }}
            />
          </div>

          {filteredCharacters.length === 0 ? (
            <p className="field-hint">
              {searchQuery ? (
                <>
                  No matches for &ldquo;{searchQuery}&rdquo;.{' '}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setSearchQuery('')}
                    style={{ padding: '0 2px', textDecoration: 'underline' }}
                  >
                    Clear
                  </button>
                </>
              ) : (
                'No characters defined yet. Click Add Character to start rigging.'
              )}
            </p>
          ) : (
            <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0 }}>
              {filteredCharacters.map((char) => {
                const isSelected = char.id === selectedChar?.id;
                return (
                  <li key={char.id} style={{ listStyle: 'none' }}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedCharId(char.id);
                        setSelectedPartId(char.parts[0]?.id ?? null);
                        setSelection({ kind: 'character', id: char.id });
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        textAlign: 'left',
                        borderColor: isSelected ? 'var(--accent-amber)' : 'var(--border-subtle)',
                        background: isSelected
                          ? 'var(--accent-amber-soft)'
                          : 'var(--bg-surface-elevated)',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {char.name || 'Unnamed Character'}
                      </span>
                      <span className="mono field-hint">{char.parts.length}p</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Center: Metadata + SVG Rig Schematic + Expressions & Poses + Scene Assignment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {!selectedChar ? (
            <div className="panel">
              <p className="field-hint">Select or add a character to edit its rig and palette.</p>
            </div>
          ) : (
            <>
              {/* Profile Card */}
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Character Profile</h3>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleExportCharacterJson(selectedChar)}
                    >
                      Export Character JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateCharacter(selectedChar)}
                    >
                      Duplicate Character
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => setCharToDelete(selectedChar)}
                    >
                      Remove Character
                    </button>
                  </div>
                </div>

                <div className="dialog-two-col">
                  <div className="field">
                    <label htmlFor={charNameId}>Character Name</label>
                    <input
                      id={charNameId}
                      type="text"
                      value={selectedChar.name}
                      onChange={(ev) =>
                        updateCharacter(selectedChar.id, (c) => ({ ...c, name: ev.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={charRigId}>Default Rig ID</label>
                    <input
                      id={charRigId}
                      type="text"
                      value={selectedChar.defaultRigId ?? ''}
                      placeholder="e.g. biped-hero-v1"
                      onChange={(ev) =>
                        updateCharacter(selectedChar.id, (c) => ({
                          ...c,
                          defaultRigId: ev.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor={charDescId}>Description</label>
                  <textarea
                    id={charDescId}
                    value={selectedChar.description}
                    placeholder="Silhouette, wardrobe, personality, or motion style..."
                    onChange={(ev) =>
                      updateCharacter(selectedChar.id, (c) => ({
                        ...c,
                        description: ev.target.value,
                      }))
                    }
                  />
                </div>

                <div className="field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      Color Palette Swatches
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateCharacter(selectedChar.id, (c) => ({
                          ...c,
                          colorPalette: [...c.colorPalette, '#fbbf24'],
                        }))
                      }
                    >
                      + Add Color
                    </button>
                  </div>

                  {selectedChar.colorPalette.length === 0 ? (
                    <p className="field-hint">No swatches yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {selectedChar.colorPalette.map((color, idx) => (
                        <div
                          key={`${selectedChar.id}-swatch-${idx}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 6px',
                            background: 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <input
                            type="color"
                            aria-label={`Palette color ${idx + 1}`}
                            value={toSafeColorInput(color)}
                            onChange={(ev) =>
                              updateCharacter(selectedChar.id, (c) => ({
                                ...c,
                                colorPalette: c.colorPalette.map((item, i) =>
                                  i === idx ? ev.target.value : item
                                ),
                              }))
                            }
                            style={{
                              width: 24,
                              height: 24,
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                            }}
                          />
                          <input
                            type="text"
                            aria-label={`Palette hex ${idx + 1}`}
                            className="mono"
                            value={color}
                            style={{ width: 82 }}
                            onChange={(ev) =>
                              updateCharacter(selectedChar.id, (c) => ({
                                ...c,
                                colorPalette: c.colorPalette.map((item, i) =>
                                  i === idx ? ev.target.value : item
                                ),
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="btn-ghost"
                            aria-label={`Remove swatch ${idx + 1}`}
                            onClick={() =>
                              updateCharacter(selectedChar.id, (c) => ({
                                ...c,
                                colorPalette: c.colorPalette.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Interactive SVG Rig Schematic */}
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LayersIcon size={15} />
                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Rig Schematic</h3>
                  </div>
                  <span className="mono field-hint">{selectedChar.parts.length} rig parts</span>
                </div>

                <div
                  style={{
                    background: 'var(--bg-stage-matte)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    padding: 8,
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    ref={svgRef}
                    viewBox="0 0 240 240"
                    width="100%"
                    height="240"
                    role="img"
                    aria-label={`Rig schematic for ${selectedChar.name}`}
                    style={{ maxWidth: 320, display: 'block', touchAction: 'none' }}
                  >
                    <defs>
                      <pattern id="rig-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                        <path
                          d="M 24 0 L 0 0 0 24"
                          fill="none"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="1"
                        />
                      </pattern>
                    </defs>
                    <rect width="240" height="240" fill="url(#rig-grid)" rx="4" />

                    {(() => {
                      const normalized = selectedChar.parts.every(
                        (p) => p.pivot.x >= 0 && p.pivot.x <= 1.05 && p.pivot.y >= 0 && p.pivot.y <= 1.05
                      );
                      const resolvePivot = (part: CharacterPart) =>
                        dragPivot &&
                        dragPivot.charId === selectedChar.id &&
                        dragPivot.partId === part.id
                          ? { x: dragPivot.x, y: dragPivot.y }
                          : part.pivot;

                      return (
                        <>
                          {/* Bone hierarchy lines */}
                          {sortedParts.map((part) => {
                            if (!part.parentPartId) return null;
                            const parent = selectedChar.parts.find((p) => p.id === part.parentPartId);
                            if (!parent) return null;
                            const p1 = resolvePivot(parent);
                            const p2 = resolvePivot(part);
                            return (
                              <line
                                key={`bone-${part.id}`}
                                x1={toSvgCoord(p1.x, normalized)}
                                y1={toSvgCoord(p1.y, normalized)}
                                x2={toSvgCoord(p2.x, normalized)}
                                y2={toSvgCoord(p2.y, normalized)}
                                stroke="rgba(245, 158, 11, 0.55)"
                                strokeWidth="2"
                                strokeDasharray="3 2"
                              />
                            );
                          })}

                          {/* Pivot nodes */}
                          {sortedParts.map((part, idx) => {
                            const activePivot = resolvePivot(part);
                            const cx = toSvgCoord(activePivot.x, normalized);
                            const cy = toSvgCoord(activePivot.y, normalized);
                            const isPartSelected = part.id === selectedPart?.id;
                            const accent = selectedChar.colorPalette[0]
                              ? toSafeColorInput(selectedChar.colorPalette[0])
                              : '#f59e0b';
                            return (
                              <g
                                key={part.id}
                                role="button"
                                tabIndex={0}
                                aria-label={`Select part ${part.name} at ${activePivot.x}, ${activePivot.y}`}
                                style={{ cursor: 'grab' }}
                                onClick={() => {
                                  setSelectedPartId(part.id);
                                  setSelection({
                                    kind: 'part',
                                    characterId: selectedChar.id,
                                    partId: part.id,
                                  });
                                }}
                                onPointerDown={(ev) => {
                                  ev.preventDefault();
                                  setSelectedPartId(part.id);
                                  setSelection({
                                    kind: 'part',
                                    characterId: selectedChar.id,
                                    partId: part.id,
                                  });

                                  dragCleanupRef.current?.();
                                  const rect = svgRef.current?.getBoundingClientRect();
                                  const minDim = rect ? Math.min(rect.width, rect.height) : 0;
                                  const scale = minDim > 0 ? 240 / minDim : 1;
                                  const startClientX = ev.clientX;
                                  const startClientY = ev.clientY;
                                  const startSvgX = cx;
                                  const startSvgY = cy;
                                  const targetCharId = selectedChar.id;
                                  let latestPivot = { x: part.pivot.x, y: part.pivot.y };
                                  let moved = false;

                                  const onMove = (moveEv: PointerEvent) => {
                                    if (!Number.isFinite(moveEv.clientX) || !Number.isFinite(moveEv.clientY)) {
                                      return;
                                    }
                                    const nextSvgX = startSvgX + (moveEv.clientX - startClientX) * scale;
                                    const nextSvgY = startSvgY + (moveEv.clientY - startClientY) * scale;
                                    const nx = fromSvgCoord(nextSvgX, normalized);
                                    const ny = fromSvgCoord(nextSvgY, normalized);
                                    latestPivot = { x: nx, y: ny };
                                    moved = moved || nx !== part.pivot.x || ny !== part.pivot.y;
                                    setDragPivot({
                                      charId: targetCharId,
                                      partId: part.id,
                                      x: nx,
                                      y: ny,
                                    });
                                  };

                                  const cleanupDrag = () => {
                                    window.removeEventListener('pointermove', onMove);
                                    window.removeEventListener('pointerup', onUp);
                                    window.removeEventListener('pointercancel', onCancel);
                                    dragCleanupRef.current = null;
                                  };

                                  const onCancel = () => {
                                    cleanupDrag();
                                    setDragPivot(null);
                                  };

                                  const onUp = () => {
                                    cleanupDrag();
                                    setDragPivot(null);
                                    if (moved) {
                                      updateCharacter(targetCharId, (c) => ({
                                        ...c,
                                        parts: c.parts.map((p) =>
                                          p.id === part.id ? { ...p, pivot: latestPivot } : p
                                        ),
                                      }));
                                    }
                                  };

                                  dragCleanupRef.current = cleanupDrag;
                                  window.addEventListener('pointermove', onMove);
                                  window.addEventListener('pointerup', onUp);
                                  window.addEventListener('pointercancel', onCancel);
                                }}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter' || ev.key === ' ') {
                                    ev.preventDefault();
                                    setSelectedPartId(part.id);
                                    setSelection({
                                      kind: 'part',
                                      characterId: selectedChar.id,
                                      partId: part.id,
                                    });
                                    return;
                                  }
                                  const delta = normalized ? (ev.shiftKey ? 0.1 : 0.02) : ev.shiftKey ? 10 : 2;
                                  let dx = 0;
                                  let dy = 0;
                                  if (ev.key === 'ArrowLeft') dx = -delta;
                                  else if (ev.key === 'ArrowRight') dx = delta;
                                  else if (ev.key === 'ArrowUp') dy = -delta;
                                  else if (ev.key === 'ArrowDown') dy = delta;
                                  if (dx !== 0 || dy !== 0) {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    const nx = normalized
                                      ? Number(clamp(part.pivot.x + dx, 0, 1).toFixed(2))
                                      : Math.round(clamp(part.pivot.x + dx, 12, 228));
                                    const ny = normalized
                                      ? Number(clamp(part.pivot.y + dy, 0, 1).toFixed(2))
                                      : Math.round(clamp(part.pivot.y + dy, 12, 228));
                                    updatePart(part.id, { pivot: { x: nx, y: ny } });
                                  }
                                }}
                              >
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isPartSelected ? 11 : 8}
                                  fill={isPartSelected ? '#f59e0b' : accent}
                                  fillOpacity={isPartSelected ? 0.95 : 0.65}
                                  stroke={isPartSelected ? '#ffffff' : '#181b21'}
                                  strokeWidth={isPartSelected ? 2 : 1.5}
                                />
                                <text
                                  x={cx + 12}
                                  y={cy + (idx % 2 === 0 ? -4 : 9)}
                                  fill="#f2f0ec"
                                  fontSize="9"
                                  fontFamily="var(--font-mono)"
                                >
                                  {part.name} (z:{part.zIndex})
                                </text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>

              {/* Expressions & Poses Presets Card */}
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PlayIcon size={14} />
                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
                      Expressions &amp; Poses Presets
                    </h3>
                  </div>

                  {scenes.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <label htmlFor={sceneTargetId} className="field-hint">
                        Target Scene
                      </label>
                      <select
                        id={sceneTargetId}
                        value={activeScene?.id ?? ''}
                        style={{ width: 'auto', minWidth: 160 }}
                        onChange={(ev) => setSelectedSceneId(ev.target.value)}
                      >
                        {scenes.map((sc, i) => (
                          <option key={sc.id} value={sc.id}>
                            Scene {i + 1}: {sc.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <span className="field-hint" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Expressions
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {EXPRESSION_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          title={`Apply ${preset.name} expression to timeline`}
                        >
                          + {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="field-hint" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Poses &amp; Actions
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {POSE_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          title={`Apply ${preset.name} pose action to timeline`}
                        >
                          + {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Character Scene Assignment Card */}
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Scene Appearances</h3>
                  <span className="mono field-hint">
                    {scenes.filter((sc) => sc.characterIds.includes(selectedChar.id)).length} of {scenes.length} scenes
                  </span>
                </div>

                {scenes.length === 0 ? (
                  <p className="field-hint">
                    No scenes created in this project yet. Add scenes in{' '}
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => navigate('story')}
                      style={{ padding: '0 4px', textDecoration: 'underline' }}
                    >
                      Story &amp; Scenes
                    </button>.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {scenes.map((scene, idx) => {
                      const appears = scene.characterIds.includes(selectedChar.id);
                      return (
                        <label
                          key={scene.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '6px 10px',
                            background: appears ? 'var(--accent-amber-soft)' : 'var(--bg-surface-elevated)',
                            border: `1px solid ${appears ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontSize: 'var(--text-sm)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              aria-label={`Toggle ${selectedChar.name} in Scene ${idx + 1}`}
                              checked={appears}
                              onChange={(ev) => {
                                const isChecked = ev.target.checked;
                                updateDraft((prev) => ({
                                  ...prev,
                                  scenes: prev.scenes.map((sc) => {
                                    if (sc.id !== scene.id) return sc;
                                    const nextIds = isChecked
                                      ? (sc.characterIds.includes(selectedChar.id)
                                          ? sc.characterIds
                                          : [...sc.characterIds, selectedChar.id])
                                      : sc.characterIds.filter((id) => id !== selectedChar.id);
                                    return { ...sc, characterIds: nextIds };
                                  }),
                                }));
                              }}
                            />
                            <strong>Scene {idx + 1}: {scene.title}</strong>
                          </div>
                          <span className="mono field-hint">{scene.duration}s</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: Editable Part List */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Rig Parts</h3>
            <button type="button" onClick={handleAddPart} disabled={!selectedChar}>
              <PlusIcon size={12} />
              <span style={{ marginLeft: 4 }}>Add Part</span>
            </button>
          </div>

          {!selectedChar ? (
            <p className="field-hint">Select a character to edit parts.</p>
          ) : selectedChar.parts.length === 0 ? (
            <p className="field-hint">No rig parts yet. Click Add Part.</p>
          ) : (
            <>
              <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0 }}>
                {sortedParts.map((part) => {
                  const active = part.id === selectedPart?.id;
                  return (
                    <li key={part.id} style={{ listStyle: 'none' }}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedPartId(part.id);
                          setSelection({
                            kind: 'part',
                            characterId: selectedChar.id,
                            partId: part.id,
                          });
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          textAlign: 'left',
                          borderColor: active ? 'var(--accent-amber)' : 'var(--border-subtle)',
                          background: active
                            ? 'var(--accent-amber-soft)'
                            : 'var(--bg-surface-elevated)',
                        }}
                      >
                        <span>{part.name}</span>
                        <span className="mono field-hint">
                          {part.layerName} · z{part.zIndex}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {selectedPart ? (
                <div
                  style={{
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 'var(--text-sm)' }}>Edit Selected Part</strong>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => handleRemovePart(selectedPart.id)}
                    >
                      Delete Part
                    </button>
                  </div>

                  <div className="field">
                    <label htmlFor={`part-name-${selectedPart.id}`}>Part Name</label>
                    <input
                      id={`part-name-${selectedPart.id}`}
                      type="text"
                      value={selectedPart.name}
                      onChange={(ev) => updatePart(selectedPart.id, { name: ev.target.value })}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor={`part-layer-${selectedPart.id}`}>Layer Name</label>
                    <input
                      id={`part-layer-${selectedPart.id}`}
                      type="text"
                      className="mono"
                      value={selectedPart.layerName}
                      onChange={(ev) => updatePart(selectedPart.id, { layerName: ev.target.value })}
                    />
                  </div>

                  <div className="dialog-two-col">
                    <div className="field">
                      <label htmlFor={`part-px-${selectedPart.id}`}>Pivot X</label>
                      <input
                        id={`part-px-${selectedPart.id}`}
                        type="number"
                        value={selectedPart.pivot.x}
                        onChange={(ev) =>
                          updatePart(selectedPart.id, {
                            pivot: { ...selectedPart.pivot, x: Number(ev.target.value) || 0 },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`part-py-${selectedPart.id}`}>Pivot Y</label>
                      <input
                        id={`part-py-${selectedPart.id}`}
                        type="number"
                        value={selectedPart.pivot.y}
                        onChange={(ev) =>
                          updatePart(selectedPart.id, {
                            pivot: { ...selectedPart.pivot, y: Number(ev.target.value) || 0 },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="dialog-two-col">
                    <div className="field">
                      <label htmlFor={`part-z-${selectedPart.id}`}>Z-Index</label>
                      <input
                        id={`part-z-${selectedPart.id}`}
                        type="number"
                        value={selectedPart.zIndex}
                        onChange={(ev) =>
                          updatePart(selectedPart.id, { zIndex: Number(ev.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`part-parent-${selectedPart.id}`}>Parent Part</label>
                      <select
                        id={`part-parent-${selectedPart.id}`}
                        value={selectedPart.parentPartId ?? ''}
                        onChange={(ev) =>
                          updatePart(selectedPart.id, {
                            parentPartId: ev.target.value || undefined,
                          })
                        }
                      >
                        <option value="">None (Root)</option>
                        {selectedChar.parts
                          .filter((p) => p.id !== selectedPart.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <StudioDialog
        open={Boolean(charToDelete)}
        title={`Delete ${charToDelete?.name ?? 'Character'}`}
        onClose={() => setCharToDelete(null)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p>
            Are you sure you want to delete character <strong>&ldquo;{charToDelete?.name}&rdquo;</strong>?
            This will remove the character from the cast roster and unassign them from all scenes.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={() => setCharToDelete(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                if (charToDelete) {
                  handleDeleteCharacter(charToDelete.id);
                  setCharToDelete(null);
                }
              }}
            >
              Confirm Delete
            </button>
          </div>
        </div>
      </StudioDialog>
    </section>
  );
}
