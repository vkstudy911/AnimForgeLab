import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AssetsIcon,
  MusicIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
} from '../components/ui/Icons';
import { StatusBadge } from '../components/ui/StatusBadge';
import { StudioDialog } from '../components/ui/StudioDialog';
import { StudioTabs, type StudioTabItem } from '../components/ui/StudioTabs';
import { useStudioContext } from '../context/StudioContext';
import type { AssetItem, AssetType, ProjectDetail, WorkspaceAssetsResult } from '../types';

type CategoryFilter = 'all' | 'video' | AssetType;

interface PendingOverwrite {
  kind: 'file' | 'workspace';
  file?: File;
  sourcePath?: string;
  name?: string;
  assetType: AssetType;
}

const CATEGORY_OPTIONS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'background', label: 'Background' },
  { id: 'character', label: 'Character' },
  { id: 'prop', label: 'Prop' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'font', label: 'Font' },
  { id: 'reference', label: 'Reference' },
];

const ASSET_TYPES: AssetType[] = [
  'background',
  'character',
  'prop',
  'audio',
  'font',
  'model',
  'reference',
];

function isSafePreviewUri(uri: string): boolean {
  return /^(assets|projects)\//.test(uri) && !uri.includes('..');
}

function buildPreviewUrl(previewBaseUrl: string | null, uri: string): string | null {
  if (!previewBaseUrl || !isSafePreviewUri(uri)) return null;
  return `${previewBaseUrl.replace(/\/+$/, '')}/${uri}`;
}

function isAudioAsset(asset: AssetItem): boolean {
  return (
    asset.type === 'audio' ||
    Boolean(asset.mimeType?.startsWith('audio/')) ||
    /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(asset.uri)
  );
}

function isVideoAsset(asset: AssetItem): boolean {
  return (
    (asset.type as string) === 'video' ||
    Boolean(asset.mimeType?.startsWith('video/')) ||
    /\.(mp4|webm|mov|mkv)$/i.test(asset.uri)
  );
}

function isImageAsset(asset: AssetItem): boolean {
  if (isAudioAsset(asset) || isVideoAsset(asset)) return false;
  return (
    Boolean(asset.mimeType?.startsWith('image/')) ||
    /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(asset.uri) ||
    asset.type === 'background' ||
    asset.type === 'character' ||
    asset.type === 'prop' ||
    asset.type === 'reference'
  );
}

export function AssetLibrary() {
  const {
    draftProject,
    previewBaseUrl,
    isDirty,
    updateDraft,
    saveDraft,
    discardDraft,
    listWorkspaceAssets,
    importAssetFromWorkspace,
    importAssetFile,
    revealInWorkspace,
    error,
    clearError,
    busy,
    selectedSceneId,
    setSelectedSceneId,
    setSelection,
    navigate,
    setNewProjectDialogOpen,
  } = useStudioContext();

  const headingId = useId();
  const searchId = useId();
  const sceneSelectId = useId();
  const nameId = useId();
  const nameErrId = useId();
  const typeId = useId();
  const uriId = useId();
  const uriErrId = useId();

  const [category, setCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('background');
  const [assetUri, setAssetUri] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [uriError, setUriError] = useState<string | null>(null);
  const [diskScan, setDiskScan] = useState<WorkspaceAssetsResult | null>(null);
  const [scanningDisk, setScanningDisk] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null);
  const [importedPathMap, setImportedPathMap] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [previewingVideoAsset, setPreviewingVideoAsset] = useState<AssetItem | null>(null);
  const discoveredHeadingId = useId();

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const scanSeqRef = useRef(0);

  const projectId = draftProject?.id ?? null;

  const refreshDiskScan = useCallback(async () => {
    if (!projectId) return;
    const seq = ++scanSeqRef.current;
    setScanningDisk(true);
    try {
      const res = await listWorkspaceAssets(projectId);
      if (seq === scanSeqRef.current && res) {
        setDiskScan(res);
      }
    } finally {
      if (seq === scanSeqRef.current) {
        setScanningDisk(false);
      }
    }
  }, [projectId, listWorkspaceAssets]);

  useEffect(() => {
    setDiskScan(null);
    setPendingOverwrite(null);
    setEditingAssetId(null);
    setImportedPathMap({});
    if (projectId) {
      void refreshDiskScan();
    }
    return () => {
      scanSeqRef.current += 1;
    };
  }, [projectId, refreshDiskScan]);

  const diskExistsMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const item of diskScan?.projectAssets ?? []) {
      map.set(item.id, item.existsOnDisk);
    }
    return map;
  }, [diskScan]);

  const projectAssetFilesSet = useMemo(
    () => new Set(diskScan?.projectAssetFiles ?? []),
    [diskScan?.projectAssetFiles]
  );

  const assetWorkspacePathMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of diskScan?.projectAssets ?? []) {
      if (item.workspaceRelativePath) {
        map.set(item.id, item.workspaceRelativePath);
      }
    }
    for (const [id, wsPath] of Object.entries(importedPathMap)) {
      map.set(id, wsPath);
    }
    return map;
  }, [diskScan, importedPathMap]);

  const resolveAssetWorkspacePath = useCallback(
    (asset: AssetItem): string => {
      const mapped = assetWorkspacePathMap.get(asset.id);
      if (mapped) return mapped;
      if (projectId && asset.uri.startsWith('assets/')) {
        const candidate = `projects/${projectId}/${asset.uri}`;
        if (projectAssetFilesSet.has(candidate)) {
          return candidate;
        }
      }
      return asset.uri;
    },
    [assetWorkspacePathMap, projectId, projectAssetFilesSet]
  );

  const unregisteredDiskFiles = useMemo(() => {
    const knownUris = new Set((draftProject?.assets ?? []).map((a) => a.uri));
    const knownWorkspacePaths = new Set(
      (draftProject?.assets ?? []).map((a) => resolveAssetWorkspacePath(a))
    );
    const projectPrefix = projectId ? `projects/${projectId}/` : '';
    const combined = [
      ...(diskScan?.projectAssetFiles ?? []),
      ...(diskScan?.workspaceLibraryFiles ?? []),
    ];
    return Array.from(new Set(combined)).filter((filePath) => {
      if (knownUris.has(filePath) || knownWorkspacePaths.has(filePath)) return false;
      if (projectPrefix && filePath.startsWith(projectPrefix)) {
        const rel = filePath.slice(projectPrefix.length);
        if (knownUris.has(rel)) return false;
      }
      return true;
    });
  }, [diskScan, draftProject?.assets, projectId, resolveAssetWorkspacePath]);

  const assets = draftProject?.assets ?? [];
  const scenes = draftProject?.scenes ?? [];
  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assets.filter((asset) => {
      if (category === 'video') {
        if (!isVideoAsset(asset)) return false;
      } else if (category === 'audio') {
        if (!isAudioAsset(asset)) return false;
      } else if (category !== 'all' && asset.type !== category) {
        return false;
      }
      if (!q) return true;
      return (
        asset.name.toLowerCase().includes(q) ||
        asset.uri.toLowerCase().includes(q) ||
        asset.type.toLowerCase().includes(q)
      );
    });
  }, [assets, category, searchQuery]);

  if (!draftProject) {
    return (
      <section className="page-container" aria-labelledby={headingId}>
        <div className="page-header-row">
          <h2 id={headingId}>Asset Library</h2>
        </div>
        <div
          className="panel"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}
        >
          <p className="field-hint">
            Open or create a project to browse project assets, preview media, and assign scene
            backgrounds or audio tracks.
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

  const categoryTabs: StudioTabItem[] = CATEGORY_OPTIONS.map((opt) => {
    let count = 0;
    if (opt.id === 'all') {
      count = assets.length;
    } else if (opt.id === 'video') {
      count = assets.filter((a) => isVideoAsset(a)).length;
    } else if (opt.id === 'audio') {
      count = assets.filter((a) => isAudioAsset(a)).length;
    } else {
      count = assets.filter((a) => a.type === opt.id).length;
    }
    return {
      id: opt.id,
      label: `${opt.label} (${count})`,
      content: null,
    };
  });

  const handleRegisterAsset = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const trimmedName = assetName.trim();
    const trimmedUri = assetUri.trim();
    const nextNameErr = trimmedName ? null : 'Enter an asset name.';
    const nextUriErr = trimmedUri ? null : 'Enter a workspace asset URI (e.g. assets/bg.png).';
    setNameError(nextNameErr);
    setUriError(nextUriErr);
    if (nextNameErr || nextUriErr) return;

    const newAsset: AssetItem = {
      id: `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmedName,
      type: assetType,
      uri: trimmedUri,
      metadata: {},
      createdAt: new Date().toISOString(),
    };

    updateDraft((prev) => ({
      ...prev,
      assets: [...prev.assets, newAsset],
    }));
    setSelection({ kind: 'asset', id: newAsset.id });
    setAssetName('');
    setAssetUri('');
    setNameError(null);
    setUriError(null);
  };

  const handleAssignBackground = (asset: AssetItem) => {
    if (!activeScene || !draftProject) return;
    const nextSnapshot: ProjectDetail = {
      ...draftProject,
      scenes: draftProject.scenes.map((scene) =>
        scene.id === activeScene.id ? { ...scene, backgroundAssetId: asset.id } : scene
      ),
    };
    updateDraft(() => nextSnapshot);
    void saveDraft(
      `Assigned "${asset.name}" as background for "${activeScene.title}".`,
      nextSnapshot
    );
  };

  const handleAddAudioTrack = (asset: AssetItem) => {
    if (!activeScene || !draftProject) return;
    const nextSnapshot: ProjectDetail = {
      ...draftProject,
      scenes: draftProject.scenes.map((scene) =>
        scene.id === activeScene.id
          ? {
              ...scene,
              timeline: {
                ...scene.timeline,
                audioTracks: [
                  ...scene.timeline.audioTracks,
                  {
                    assetId: asset.id,
                    startTime: 0,
                    volume: 1,
                    loop: false,
                  },
                ],
              },
            }
          : scene
      ),
    };
    updateDraft(() => nextSnapshot);
    void saveDraft(`Added audio "${asset.name}" to "${activeScene.title}".`, nextSnapshot);
  };

  const handleRemoveAsset = (assetId: string) => {
    if (editingAssetId === assetId) setEditingAssetId(null);
    updateDraft((prev) => ({
      ...prev,
      assets: prev.assets.filter((a) => a.id !== assetId),
      scenes: prev.scenes.map((scene) => {
        const nextAudio = scene.timeline.audioTracks.filter((track) => track.assetId !== assetId);
        if (scene.backgroundAssetId === assetId) {
          const { backgroundAssetId: _removed, ...restScene } = scene;
          return {
            ...restScene,
            timeline: { ...scene.timeline, audioTracks: nextAudio },
          };
        }
        return {
          ...scene,
          timeline: { ...scene.timeline, audioTracks: nextAudio },
        };
      }),
    }));
  };

  const handleUpdateAssetField = (
    assetId: string,
    patch: Partial<Pick<AssetItem, 'name' | 'type'>>
  ) => {
    updateDraft((prev) => ({
      ...prev,
      assets: prev.assets.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset)),
    }));
  };

  const handleUploadFile = async (file: File) => {
    if (!draftProject) return;
    let targetType = assetType;
    if (assetType === 'background') {
      if (/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)) {
        targetType = 'audio';
      } else if (/\.(mp4|webm|mov)$/i.test(file.name)) {
        targetType = 'reference';
      }
    }
    const nextName = assetName.trim() || undefined;
    const pending: PendingOverwrite = {
      kind: 'file',
      file,
      ...(nextName ? { name: nextName } : {}),
      assetType: targetType,
    };
    setPendingOverwrite(pending);
    const res = await importAssetFile(draftProject.id, file, {
      ...(nextName ? { name: nextName } : {}),
      assetType: targetType,
    });
    if (res) {
      if (res.workspaceRelativePath) {
        setImportedPathMap((prev) => ({ ...prev, [res.asset.id]: res.workspaceRelativePath }));
      }
      setPendingOverwrite(null);
      setAssetName('');
      void refreshDiskScan();
    }
  };

  const handleUploadFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    await handleUploadFile(file);
  };

  const handleImportWorkspaceFile = async (sourcePath: string) => {
    if (!draftProject) return;
    const pending: PendingOverwrite = {
      kind: 'workspace',
      sourcePath,
      assetType,
    };
    setPendingOverwrite(pending);
    const res = await importAssetFromWorkspace(draftProject.id, sourcePath, {
      assetType,
    });
    if (res) {
      if (res.workspaceRelativePath) {
        setImportedPathMap((prev) => ({ ...prev, [res.asset.id]: res.workspaceRelativePath }));
      }
      setPendingOverwrite(null);
      void refreshDiskScan();
    }
  };

  const handleConfirmOverwrite = async () => {
    if (!draftProject || !pendingOverwrite) return;
    clearError();
    const res =
      pendingOverwrite.kind === 'file' && pendingOverwrite.file
        ? await importAssetFile(draftProject.id, pendingOverwrite.file, {
            ...(pendingOverwrite.name ? { name: pendingOverwrite.name } : {}),
            assetType: pendingOverwrite.assetType,
            confirmOverwrite: true,
          })
        : pendingOverwrite.kind === 'workspace' && pendingOverwrite.sourcePath
          ? await importAssetFromWorkspace(draftProject.id, pendingOverwrite.sourcePath, {
              assetType: pendingOverwrite.assetType,
              confirmOverwrite: true,
            })
          : null;
    if (res) {
      if (res.workspaceRelativePath) {
        setImportedPathMap((prev) => ({ ...prev, [res.asset.id]: res.workspaceRelativePath }));
      }
      setPendingOverwrite(null);
      setAssetName('');
      void refreshDiskScan();
    }
  };

  const showOverwriteBanner = Boolean(
    pendingOverwrite && error && /(already exists|CONFLICT|confirmOverwrite)/i.test(error)
  );

  return (
    <section className="page-container" aria-labelledby={headingId}>
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AssetsIcon size={18} />
          <h2 id={headingId}>Asset Library</h2>
          <span className="badge badge-neutral">{assets.length} registered</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg,.webp,.mp3,.wav,.ogg,.flac,.mp4,.webm,image/*,audio/*,video/*"
            aria-label="Upload Asset File"
            className="sr-only"
            onChange={(ev) => void handleUploadFileChange(ev)}
          />
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={busy.saving}
          >
            Upload File
          </button>
          <button
            type="button"
            onClick={() => void refreshDiskScan()}
            disabled={scanningDisk || busy.saving}
          >
            {scanningDisk ? 'Scanning...' : 'Scan Workspace'}
          </button>
          {scenes.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor={sceneSelectId} className="field-hint">
                Target Scene
              </label>
              <select
                id={sceneSelectId}
                value={activeScene?.id ?? ''}
                style={{ width: 'auto', minWidth: 170 }}
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

          {isDirty ? (
            <button type="button" className="btn-ghost" onClick={discardDraft} disabled={busy.saving}>
              Discard
            </button>
          ) : null}

          <button
            type="button"
            className="btn-primary"
            onClick={() => void saveDraft(`Saved assets for "${draftProject.name}".`)}
            disabled={busy.saving || !isDirty}
          >
            <SaveIcon size={13} />
            <span style={{ marginLeft: 5 }}>{busy.saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {showOverwriteBanner ? (
        <div
          role="alert"
          className="panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderColor: 'var(--status-warn)',
          }}
        >
          <span>Asset already exists in project disk folder. Overwrite existing file?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-danger" onClick={() => void handleConfirmOverwrite()}>
              Overwrite Existing Asset
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingOverwrite(null);
                clearError();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="split-layout">
        {/* Left: Filter Bar + Asset Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              className="asset-dropzone"
              role="region"
              aria-label="Drag and drop file upload zone"
              onDragOver={(ev) => {
                ev.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(ev) => {
                ev.preventDefault();
                setIsDragging(false);
                const file = ev.dataTransfer.files?.[0];
                if (file) {
                  void handleUploadFile(file);
                }
              }}
              onClick={() => uploadInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragging ? 'var(--bg-surface-elevated)' : 'var(--bg-input)',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                Drag &amp; drop files here (.png, .jpg, .svg, .webp, .mp3, .wav, .mp4, .webm) or{' '}
                <span style={{ color: 'var(--accent-amber)', textDecoration: 'underline' }}>
                  browse to upload
                </span>
              </p>
            </div>

            <StudioTabs
              label="Asset Categories"
              tabs={categoryTabs}
              activeId={category}
              onChange={(id) => setCategory(id as CategoryFilter)}
              renderPanels={false}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SearchIcon size={14} />
              <label htmlFor={searchId} className="sr-only">
                Search assets
              </label>
              <input
                id={searchId}
                type="search"
                placeholder="Filter by asset name or URI..."
                value={searchQuery}
                onChange={(ev) => setSearchQuery(ev.target.value)}
              />
            </div>
          </div>

          {filteredAssets.length === 0 ? (
            <div className="panel">
              <p className="field-hint">
                {assets.length === 0
                  ? 'No assets registered in this project yet. Use the form on the right to register an asset.'
                  : 'No assets match the active category filter or search query.'}
              </p>
            </div>
          ) : (
            <div className="grid-3">
              {filteredAssets.map((asset) => {
                const resolvedPath = resolveAssetWorkspacePath(asset);
                const previewUrl = buildPreviewUrl(previewBaseUrl, resolvedPath);
                const audioMode = isAudioAsset(asset);
                const videoMode = isVideoAsset(asset);
                const imageMode = isImageAsset(asset);
                const isSceneBg = activeScene?.backgroundAssetId === asset.id;
                const isSceneAudio = Boolean(
                  activeScene?.timeline.audioTracks.some((t) => t.assetId === asset.id)
                );
                const diskExists = diskExistsMap.get(asset.id);
                const isEditing = editingAssetId === asset.id;

                return (
                  <article
                    key={asset.id}
                    className="panel"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input
                            type="text"
                            aria-label={`Edit name for ${asset.name}`}
                            value={asset.name}
                            onChange={(ev) =>
                              handleUpdateAssetField(asset.id, { name: ev.target.value })
                            }
                          />
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select
                              aria-label={`Edit category for ${asset.name}`}
                              value={asset.type}
                              onChange={(ev) =>
                                handleUpdateAssetField(asset.id, {
                                  type: ev.target.value as AssetType,
                                })
                              }
                            >
                              {ASSET_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              aria-label={`Done editing ${asset.name}`}
                              onClick={() => setEditingAssetId(null)}
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 6,
                          }}
                        >
                          <strong
                            style={{
                              fontSize: 'var(--text-sm)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {asset.name}
                          </strong>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <StatusBadge tone="neutral">{asset.type}</StatusBadge>
                            {diskExists === false ? (
                              <StatusBadge tone="warn">missing on disk</StatusBadge>
                            ) : diskExists === true ? (
                              <StatusBadge tone="pass">on disk</StatusBadge>
                            ) : null}
                          </div>
                        </div>
                      )}

                      <p
                        className="mono field-hint"
                        style={{ wordBreak: 'break-all' }}
                        title={asset.uri}
                      >
                        {asset.uri}
                      </p>

                      <div
                        className="field-hint mono"
                        style={{
                          fontSize: 'var(--text-xs)',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <span>File: {asset.uri.split('/').pop()}</span>
                        {asset.metadata?.width != null && asset.metadata?.height != null ? (
                          <span>
                            {String(asset.metadata.width)}x{String(asset.metadata.height)}
                          </span>
                        ) : null}
                        {asset.metadata?.duration != null ? (
                          <span>{String(asset.metadata.duration)}s</span>
                        ) : null}
                      </div>

                      {previewUrl && imageMode ? (
                        <div className="scene-thumb-card">
                          <img
                            src={previewUrl}
                            alt={asset.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        </div>
                      ) : previewUrl && videoMode ? (
                        <div className="scene-thumb-card" style={{ position: 'relative' }}>
                          <video
                            src={previewUrl}
                            preload="metadata"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewingVideoAsset(asset)}
                            style={{
                              position: 'absolute',
                              bottom: 6,
                              right: 6,
                              padding: '2px 8px',
                              fontSize: 'var(--text-xs)',
                              background: 'rgba(0,0,0,0.7)',
                              color: '#fff',
                              borderRadius: 'var(--radius-xs)',
                            }}
                          >
                            Preview Video
                          </button>
                        </div>
                      ) : previewUrl && audioMode ? (
                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          <span className="field-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <MusicIcon size={12} /> Audio Preview
                          </span>
                          <audio controls src={previewUrl} preload="metadata" style={{ width: '100%' }} />
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: '10px 8px',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <span className="field-hint">
                            {!previewBaseUrl
                              ? 'PreviewServer unavailable'
                              : !isSafePreviewUri(resolvedPath)
                                ? 'Preview available for assets/ or projects/ URIs'
                                : 'Metadata-only asset'}
                          </span>
                        </div>
                      )}

                      {isSceneBg || isSceneAudio ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {isSceneBg ? <StatusBadge tone="pass">Scene Background</StatusBadge> : null}
                          {isSceneAudio ? <StatusBadge tone="pass">Scene Audio</StatusBadge> : null}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                      {activeScene && asset.type !== 'audio' && asset.type !== 'font' ? (
                        <button
                          type="button"
                          onClick={() => handleAssignBackground(asset)}
                          disabled={busy.saving || isSceneBg}
                        >
                          {isSceneBg ? 'Assigned Background' : 'Set Scene Background'}
                        </button>
                      ) : null}
                      {activeScene && audioMode ? (
                        <button
                          type="button"
                          onClick={() => handleAddAudioTrack(asset)}
                          disabled={busy.saving}
                        >
                          Add to Scene Audio
                        </button>
                      ) : null}
                      {videoMode && previewUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewingVideoAsset(asset)}
                        >
                          Preview Video
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setEditingAssetId(isEditing ? null : asset.id)}
                        aria-label={`Edit asset ${asset.name}`}
                      >
                        Edit
                      </button>
                      {isSafePreviewUri(resolvedPath) ? (
                        <button
                          type="button"
                          onClick={() => void revealInWorkspace(resolvedPath)}
                        >
                          Reveal File
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => handleRemoveAsset(asset.id)}
                        aria-label={`Remove asset ${asset.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {unregisteredDiskFiles.length > 0 ? (
            <section className="panel" aria-labelledby={discoveredHeadingId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3 id={discoveredHeadingId} style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
                Discovered Workspace Files ({unregisteredDiskFiles.length})
              </h3>
              <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {unregisteredDiskFiles.map((filePath) => (
                  <li
                    key={filePath}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span className="mono field-hint" style={{ wordBreak: 'break-all' }}>
                      {filePath}
                    </span>
                    <button
                      type="button"
                      disabled={busy.saving}
                      onClick={() => void handleImportWorkspaceFile(filePath)}
                    >
                      Import to Project
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Right: Register Asset Metadata */}
        <aside className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Register Asset Metadata</h3>
          <p className="field-hint">
            Register an asset path inside <code>assets/</code> or <code>projects/</code> into this
            project&apos;s manifest.
          </p>

          <form noValidate className="dialog-form" onSubmit={handleRegisterAsset}>
            <div className="field">
              <label htmlFor={nameId}>
                Asset Name <span className="required-mark">*</span>
              </label>
              <input
                id={nameId}
                type="text"
                placeholder="e.g. Dusk Skyline"
                value={assetName}
                aria-invalid={nameError ? 'true' : 'false'}
                aria-describedby={nameError ? nameErrId : undefined}
                onChange={(ev) => {
                  setAssetName(ev.target.value);
                  if (nameError && ev.target.value.trim()) setNameError(null);
                }}
              />
              {nameError ? (
                <span id={nameErrId} className="field-error">
                  {nameError}
                </span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor={typeId}>Asset Type</label>
              <select
                id={typeId}
                value={assetType}
                onChange={(ev) => setAssetType(ev.target.value as AssetType)}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor={uriId}>
                Workspace URI <span className="required-mark">*</span>
              </label>
              <input
                id={uriId}
                type="text"
                className="mono"
                placeholder="assets/backgrounds/dusk.png"
                value={assetUri}
                aria-invalid={uriError ? 'true' : 'false'}
                aria-describedby={uriError ? uriErrId : undefined}
                onChange={(ev) => {
                  setAssetUri(ev.target.value);
                  if (uriError && ev.target.value.trim()) setUriError(null);
                }}
              />
              {uriError ? (
                <span id={uriErrId} className="field-error">
                  {uriError}
                </span>
              ) : null}
            </div>

            <button type="submit" className="btn-primary">
              <PlusIcon size={13} />
              <span style={{ marginLeft: 5 }}>Register Asset</span>
            </button>
          </form>
        </aside>
      </div>

      <StudioDialog
        open={Boolean(previewingVideoAsset)}
        title={previewingVideoAsset ? `Video Preview: ${previewingVideoAsset.name}` : 'Video Preview'}
        onClose={() => setPreviewingVideoAsset(null)}
      >
        {previewingVideoAsset ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <video
              controls
              autoPlay
              src={buildPreviewUrl(previewBaseUrl, resolveAssetWorkspacePath(previewingVideoAsset)) ?? undefined}
              style={{ width: '100%', maxHeight: 420, borderRadius: 'var(--radius-sm)', background: '#000' }}
            />
            <div className="mono field-hint" style={{ wordBreak: 'break-all' }}>
              {previewingVideoAsset.uri}
            </div>
          </div>
        ) : null}
      </StudioDialog>
    </section>
  );
}
