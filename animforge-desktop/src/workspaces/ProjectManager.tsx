import type React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStudioContext } from '../context/StudioContext';
import type { EngineId, ProjectDetail, ProjectSummary } from '../types';
import { CopyIcon, EditIcon, ExportIcon, RefreshIcon, SearchIcon, TrashIcon } from '../components/ui/Icons';
import { NumericInput } from '../components/ui/NumericInput';
import { SceneThumb } from '../components/ui/SceneThumb';
import { StatusBadge, type BadgeTone } from '../components/ui/StatusBadge';
import { StudioButton } from '../components/ui/StudioButton';
import { StudioTooltip } from '../components/ui/StudioTooltip';

const ASPECT_PRESETS = [
  { label: '16:9', width: 1920, height: 1080 },
  { label: '9:16', width: 1080, height: 1920 },
  { label: '1:1', width: 1080, height: 1080 },
  { label: '4:3', width: 1440, height: 1080 },
] as const;

export type ProjectSortKey = 'default' | 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc';

async function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

function statusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s === 'rendered' || s === 'completed') return 'pass';
  if (s === 'rendering' || s === 'scenes_planned') return 'warn';
  if (s === 'failed' || s === 'error') return 'fail';
  return 'neutral';
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ProjectManager() {
  const {
    projects,
    activeProject,
    draftProject,
    isDirty,
    updateDraft,
    saveDraft,
    discardDraft,
    applyRenamedProject,
    openProject,
    createAndOpenProject,
    duplicateProject,
    deleteProject,
    importProject,
    revealInWorkspace,
    refreshProjects,
    settingsPrefs,
    busy,
    scheduleBlurAnnouncement,
    clearBlurAnnouncement,
  } = useStudioContext();

  const [sidebarMode, setSidebarMode] = useState<'new' | 'edit'>('new');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<ProjectSortKey>('default');
  const [actionError, setActionError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingBusy, setRenamingBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Auto-refresh projects on mount
  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  // Embedded New Project form state
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspectIndex, setAspectIndex] = useState(0);
  const [fps, setFps] = useState<24 | 30 | 60>(settingsPrefs.defaultFps);
  const [preferredEngine, setPreferredEngine] = useState<EngineId>(settingsPrefs.defaultEngine);
  const [nameTouched, setNameTouched] = useState(false);
  const [promptTouched, setPromptTouched] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  const newHeadingId = useId();
  const editHeadingId = useId();
  const editNameId = useId();
  const editPromptId = useId();
  const activeSettingsHeadingId = useId();
  const nameId = useId();
  const nameErrId = useId();
  const promptId = useId();
  const promptErrId = useId();
  const statusSelectId = useId();
  const sortSelectId = useId();
  const engineSelectId = useId();
  const activeWidthId = useId();
  const activeHeightId = useId();
  const activeFpsId = useId();
  const activeEngineId = useId();

  const nameRef = useRef<HTMLInputElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const statuses = useMemo(() => {
    const set = new Set(projects.map((p) => p.status).filter(Boolean));
    return Array.from(set).sort();
  }, [projects]);

  const filteredAndSortedProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.prompt.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q)
      );
    });

    if (sortKey === 'default') {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'date_asc':
          return a.updatedAt.localeCompare(b.updatedAt);
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'name_desc':
          return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
        case 'date_desc':
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [projects, query, statusFilter, sortKey]);

  const handleRenameSubmit = async (ev: React.FormEvent, project: ProjectSummary) => {
    ev.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setActionError('Project name cannot be empty.');
      return;
    }
    setRenamingBusy(true);
    setActionError(null);
    try {
      const loaded = await invoke<ProjectDetail>('project_load', { projectId: project.id });
      const saved = await invoke<ProjectDetail>('project_save', {
        project: { ...loaded, name: trimmed },
      });
      await refreshProjects();
      if (activeProject?.id === project.id) {
        if (isDirty) {
          applyRenamedProject(saved);
        } else {
          await openProject(project.id, 'projects', { forceReload: true });
        }
      }
      setRenamingId(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenamingBusy(false);
    }
  };

  const handleExportJson = async (project: ProjectSummary) => {
    setExportingId(project.id);
    setActionError(null);
    try {
      const loaded = await invoke<ProjectDetail>('project_load', { projectId: project.id });
      const blob = new Blob([JSON.stringify(loaded, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = loaded.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || loaded.id;
      a.href = url;
      a.download = `${slug}.animforge.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportingId(null);
    }
  };

  const handleCreateSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    clearBlurAnnouncement();
    const nextNameErr = name.trim() ? null : 'Enter a project name.';
    const nextPromptErr = prompt.trim() ? null : 'Describe the animation prompt.';
    setNameError(nextNameErr);
    setPromptError(nextPromptErr);

    if (nextNameErr) {
      nameRef.current?.focus();
      return;
    }
    if (nextPromptErr) {
      promptRef.current?.focus();
      return;
    }

    const preset = ASPECT_PRESETS[aspectIndex] ?? ASPECT_PRESETS[0];
    const created = await createAndOpenProject(
      name,
      prompt,
      {
        width: preset.width,
        height: preset.height,
        fps,
        preferredEngine,
      },
      'studio'
    );
    if (created) {
      setName('');
      setPrompt('');
      setNameTouched(false);
      setPromptTouched(false);
      setNameError(null);
      setPromptError(null);
    }
  };

  const handleImportFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setActionError(null);
    try {
      const rawText = await readTextFile(file);
      const parsed: unknown = JSON.parse(rawText);
      await importProject(parsed);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? `Invalid project JSON: ${err.message}` : `Invalid project JSON: ${String(err)}`
      );
    }
  };

  return (
    <div className="page-container">
      <div className="split-layout">
        <section className="panel" aria-labelledby="projects-list-heading">
          <div className="page-header-row" style={{ marginBottom: 12 }}>
            <h2 id="projects-list-heading">Projects ({filteredAndSortedProjects.length})</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Search input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 180 }}>
                <SearchIcon size={14} className="field-hint" />
                <input
                  type="search"
                  aria-label="Search projects"
                  placeholder="Search projects..."
                  value={query}
                  onChange={(ev) => setQuery(ev.target.value)}
                />
              </div>

              {/* Status filter dropdown */}
              <label htmlFor={statusSelectId} className="sr-only">
                Filter by status
              </label>
              <select
                id={statusSelectId}
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(ev) => setStatusFilter(ev.target.value)}
                style={{ width: 'auto', minWidth: 120 }}
              >
                <option value="all">All Statuses</option>
                <option value="scenes_planned">scenes_planned</option>
                <option value="rendered">rendered</option>
                <option value="failed">failed</option>
                {statuses
                  .filter((st) => !['all', 'scenes_planned', 'rendered', 'failed'].includes(st))
                  .map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
              </select>

              {/* Sort dropdown */}
              <label htmlFor={sortSelectId} className="sr-only">
                Sort projects
              </label>
              <select
                id={sortSelectId}
                aria-label="Sort projects"
                value={sortKey}
                onChange={(ev) => setSortKey(ev.target.value as ProjectSortKey)}
                style={{ width: 'auto', minWidth: 150 }}
              >
                <option value="default">Default Order</option>
                <option value="date_desc">Modification Date: Newest first</option>
                <option value="date_asc">Modification Date: Oldest first</option>
                <option value="name_asc">Name: A-Z</option>
                <option value="name_desc">Name: Z-A</option>
              </select>

              <input
                ref={importInputRef}
                type="file"
                accept=".json,.animforge.json,application/json"
                aria-label="Import Project JSON file"
                className="sr-only"
                onChange={(ev) => void handleImportFileChange(ev)}
              />
              <StudioButton
                variant="secondary"
                size="sm"
                onClick={() => void refreshProjects()}
                disabled={busy.loadingList}
                loading={busy.loadingList}
                icon={<RefreshIcon size={13} />}
              >
                {busy.loadingList ? 'Refreshing...' : 'Refresh'}
              </StudioButton>
              <StudioButton
                variant="secondary"
                size="sm"
                onClick={() => importInputRef.current?.click()}
                disabled={busy.creating || busy.rendering}
                icon={<ExportIcon size={13} />}
              >
                Import JSON
              </StudioButton>
            </div>
          </div>

          {actionError ? (
            <div role="alert" className="studio-alert" style={{ margin: '0 0 12px 0' }}>
              <span>{actionError}</span>
              <button type="button" onClick={() => setActionError(null)}>
                Dismiss
              </button>
            </div>
          ) : null}

          {busy.loadingList ? (
            <p className="field-hint">Loading workspace projects...</p>
          ) : filteredAndSortedProjects.length === 0 ? (
            <p className="field-hint">
              {projects.length === 0
                ? 'No projects yet. Create one using the New Project panel.'
                : 'No projects match your current search or filter.'}
            </p>
          ) : (
            <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredAndSortedProjects.map((p) => {
                const isActive = activeProject?.id === p.id;
                const isRenaming = renamingId === p.id;
                return (
                  <li
                    key={p.id}
                    className="panel"
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      padding: 10,
                      borderColor: isActive ? 'var(--accent-amber)' : undefined,
                      display: 'grid',
                      gridTemplateColumns: '128px minmax(0, 1fr)',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <SceneThumb title={p.name} badge={`${p.width}x${p.height}`} />

                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <StudioTooltip content={p.name}>
                            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </strong>
                          </StudioTooltip>
                          {isActive ? <StatusBadge tone="pass">Active</StatusBadge> : null}
                        </div>
                        <StatusBadge tone={statusTone(p.status)}>{p.status}</StatusBadge>
                      </div>

                      <p
                        className="field-hint"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.prompt}
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 8,
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        <span className="mono field-hint">
                          {p.width}x{p.height} · {p.fps} FPS
                        </span>
                        {p.preferredEngine ? (
                          <span className="badge badge-neutral" style={{ fontSize: 'var(--text-xs)' }}>
                            {p.preferredEngine}
                          </span>
                        ) : null}
                        <span className="mono field-hint">· Updated {formatUpdatedAt(p.updatedAt)}</span>
                      </div>

                      {isRenaming ? (
                        <form
                          onSubmit={(ev) => void handleRenameSubmit(ev, p)}
                          style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}
                        >
                          <input
                            type="text"
                            autoFocus
                            aria-label={`New name for ${p.name}`}
                            value={renameValue}
                            onChange={(ev) => setRenameValue(ev.target.value)}
                            disabled={renamingBusy}
                          />
                          <button type="submit" className="btn-primary" disabled={renamingBusy}>
                            {renamingBusy ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            disabled={renamingBusy}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                          <StudioButton
                            variant="primary"
                            size="sm"
                            onClick={() => void openProject(p.id, 'studio')}
                            disabled={busy.loadingProject}
                          >
                            Open
                          </StudioButton>
                          <StudioButton
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSidebarMode('edit');
                              if (activeProject?.id !== p.id) {
                                void openProject(p.id, 'projects', { forceReload: true });
                              }
                            }}
                            icon={<EditIcon size={13} />}
                          >
                            Edit
                          </StudioButton>
                          <StudioButton
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setRenamingId(p.id);
                              setRenameValue(p.name);
                              setActionError(null);
                            }}
                          >
                            Rename
                          </StudioButton>
                          <StudioButton
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleExportJson(p)}
                            disabled={exportingId === p.id}
                            icon={<ExportIcon size={13} />}
                          >
                            {exportingId === p.id ? 'Exporting...' : 'Export JSON'}
                          </StudioButton>
                          <StudioButton
                            variant="secondary"
                            size="sm"
                            onClick={() => void revealInWorkspace(`projects/${p.id}`)}
                          >
                            Reveal Folder
                          </StudioButton>
                          <StudioButton
                            variant="secondary"
                            size="sm"
                            disabled={busy.creating || busy.rendering}
                            onClick={() => {
                              setActionError(null);
                              void duplicateProject(p.id);
                            }}
                            icon={<CopyIcon size={13} />}
                          >
                            Duplicate
                          </StudioButton>
                          {confirmDeleteId === p.id ? (
                            <>
                              <StudioButton
                                variant="danger"
                                size="sm"
                                disabled={busy.rendering}
                                onClick={async () => {
                                  setConfirmDeleteId(null);
                                  await deleteProject(p.id);
                                }}
                              >
                                Confirm Delete
                              </StudioButton>
                              <StudioButton variant="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>
                                Cancel
                              </StudioButton>
                            </>
                          ) : (
                            <StudioButton
                              variant="secondary"
                              size="sm"
                              disabled={busy.rendering}
                              onClick={() => {
                                setActionError(null);
                                setConfirmDeleteId(p.id);
                              }}
                              icon={<TrashIcon size={13} />}
                            >
                              Delete
                            </StudioButton>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Right sidebar: New Project or Edit Details */}
        <section className="panel" aria-labelledby={sidebarMode === 'new' ? newHeadingId : editHeadingId}>
          <div className="segmented-row" role="group" aria-label="Sidebar Mode" style={{ marginBottom: 14 }}>
            <button
              type="button"
              aria-pressed={sidebarMode === 'new'}
              onClick={() => setSidebarMode('new')}
            >
              + New Project
            </button>
            <button
              type="button"
              aria-pressed={sidebarMode === 'edit'}
              onClick={() => setSidebarMode('edit')}
            >
              Edit Details {draftProject ? `(${draftProject.name})` : ''}
            </button>
          </div>

          {sidebarMode === 'new' ? (
            <>
              <h2 id={newHeadingId} style={{ marginBottom: 4 }}>
                New Project
              </h2>
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Fields marked * are required.
              </p>

              <form noValidate className="dialog-form" onSubmit={handleCreateSubmit}>
                <div className="field">
                  <label htmlFor={nameId}>
                    Project Name <span className="required-mark">*</span>
                  </label>
                  <input
                    ref={nameRef}
                    id={nameId}
                    name="projectName"
                    type="text"
                    placeholder="Untitled Project"
                    required
                    aria-invalid={nameError ? 'true' : 'false'}
                    aria-describedby={nameError ? nameErrId : undefined}
                    value={name}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setNameTouched(true);
                      setName(v);
                      if (nameError && v.trim()) {
                        setNameError(null);
                        clearBlurAnnouncement();
                      }
                    }}
                    onBlur={() => {
                      if (nameTouched && !name.trim()) {
                        const msg = 'Enter a project name.';
                        setNameError(msg);
                        scheduleBlurAnnouncement('Project Name', msg);
                      }
                    }}
                  />
                  {nameError ? (
                    <span id={nameErrId} className="field-error">
                      {nameError}
                    </span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor={promptId}>
                    Prompt <span className="required-mark">*</span>
                  </label>
                  <textarea
                    ref={promptRef}
                    id={promptId}
                    name="projectPrompt"
                    placeholder="Describe characters, action, mood, and setting..."
                    required
                    aria-invalid={promptError ? 'true' : 'false'}
                    aria-describedby={promptError ? promptErrId : undefined}
                    value={prompt}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setPromptTouched(true);
                      setPrompt(v);
                      if (promptError && v.trim()) {
                        setPromptError(null);
                        clearBlurAnnouncement();
                      }
                    }}
                    onBlur={() => {
                      if (promptTouched && !prompt.trim()) {
                        const msg = 'Describe the animation prompt.';
                        setPromptError(msg);
                        scheduleBlurAnnouncement('Prompt', msg);
                      }
                    }}
                  />
                  {promptError ? (
                    <span id={promptErrId} className="field-error">
                      {promptError}
                    </span>
                  ) : null}
                </div>

                <div className="field">
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    Aspect Ratio
                  </span>
                  <div className="segmented-row" role="group" aria-label="Aspect Ratio">
                    {ASPECT_PRESETS.map((preset, idx) => (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={aspectIndex === idx}
                        onClick={() => setAspectIndex(idx)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    FPS
                  </span>
                  <div className="segmented-row" role="group" aria-label="FPS">
                    {([24, 30, 60] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        aria-pressed={fps === rate}
                        onClick={() => setFps(rate)}
                      >
                        {rate}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor={engineSelectId}>Preferred Engine</label>
                  <select
                    id={engineSelectId}
                    value={preferredEngine}
                    onChange={(ev) => setPreferredEngine(ev.target.value as EngineId)}
                  >
                    <option value="givemotion">GiveMotion (Native Ready)</option>
                    <option value="remotion">Remotion</option>
                    <option value="stretchystudio">StretchyStudio</option>
                    <option value="composite">Composite</option>
                  </select>
                </div>

                <StudioButton
                  type="submit"
                  variant="primary"
                  disabled={busy.creating || busy.rendering}
                  loading={busy.creating}
                >
                  Create Project
                </StudioButton>
              </form>

              {/* Active Project Settings */}
              {draftProject ? (
                <section
                  aria-labelledby={activeSettingsHeadingId}
                  style={{
                    marginTop: 18,
                    paddingTop: 14,
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <h3 id={activeSettingsHeadingId}>Active Project Settings</h3>
                  <p className="field-hint">
                    Editing open project <strong>{draftProject.name}</strong>
                  </p>
                  <div className="dialog-two-col">
                    <div className="field">
                      <label htmlFor={activeWidthId}>Width (px)</label>
                      <NumericInput
                        id={activeWidthId}
                        min={160}
                        max={7680}
                        step={2}
                        integer
                        value={draftProject.width}
                        onCommit={(val) => updateDraft((prev) => ({ ...prev, width: val }))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={activeHeightId}>Height (px)</label>
                      <NumericInput
                        id={activeHeightId}
                        min={160}
                        max={4320}
                        step={2}
                        integer
                        value={draftProject.height}
                        onCommit={(val) => updateDraft((prev) => ({ ...prev, height: val }))}
                      />
                    </div>
                  </div>
                  <div className="dialog-two-col">
                    <div className="field">
                      <label htmlFor={activeFpsId}>FPS</label>
                      <select
                        id={activeFpsId}
                        value={String(draftProject.fps)}
                        onChange={(ev) => {
                          const val = Number(ev.target.value);
                          if (Number.isFinite(val) && val > 0) {
                            updateDraft((prev) => ({ ...prev, fps: val }));
                          }
                        }}
                      >
                        <option value="24">24 FPS</option>
                        <option value="30">30 FPS</option>
                        <option value="60">60 FPS</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={activeEngineId}>Engine</label>
                      <select
                        id={activeEngineId}
                        value={draftProject.preferredEngine}
                        onChange={(ev) =>
                          updateDraft((prev) => ({ ...prev, preferredEngine: ev.target.value as EngineId }))
                        }
                      >
                        <option value="givemotion">GiveMotion</option>
                        <option value="remotion">Remotion</option>
                        <option value="stretchystudio">StretchyStudio</option>
                        <option value="composite">Composite</option>
                      </select>
                    </div>
                  </div>
                  <StudioButton
                    type="button"
                    variant="secondary"
                    disabled={busy.saving || busy.rendering}
                    loading={busy.saving}
                    onClick={() => void saveDraft('Saved project settings.')}
                  >
                    Save Project Settings
                  </StudioButton>
                </section>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 id={editHeadingId} style={{ margin: 0 }}>
                  Edit Project Details
                </h2>
                {draftProject ? (
                  <StatusBadge tone={statusTone(draftProject.status)}>{draftProject.status}</StatusBadge>
                ) : null}
              </div>

              {!draftProject ? (
                <div style={{ padding: '24px 8px', textAlign: 'center' }}>
                  <p className="field-hint" style={{ marginBottom: 12 }}>
                    No project selected for editing.
                  </p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    Click <strong>Edit</strong> on any project card in the list to load and edit its details.
                  </p>
                </div>
              ) : (
                <form
                  noValidate
                  className="dialog-form"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void saveDraft('Saved project details.');
                  }}
                >
                  <div className="field">
                    <label htmlFor={editNameId}>
                      Project Name <span className="required-mark">*</span>
                    </label>
                    <input
                      id={editNameId}
                      name="editProjectName"
                      type="text"
                      required
                      value={draftProject.name}
                      onChange={(ev) => {
                        const val = ev.target.value;
                        updateDraft((prev) => ({ ...prev, name: val }));
                      }}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor={editPromptId}>
                      Prompt / Logline <span className="required-mark">*</span>
                    </label>
                    <textarea
                      id={editPromptId}
                      name="editProjectPrompt"
                      rows={3}
                      required
                      value={draftProject.prompt}
                      onChange={(ev) => {
                        const val = ev.target.value;
                        updateDraft((prev) => ({ ...prev, prompt: val }));
                      }}
                    />
                  </div>

                  <div className="field">
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      Aspect Ratio Presets
                    </span>
                    <div className="segmented-row" role="group" aria-label="Edit Aspect Ratio">
                      {ASPECT_PRESETS.map((preset) => {
                        const isMatch = draftProject.width === preset.width && draftProject.height === preset.height;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            aria-pressed={isMatch}
                            onClick={() =>
                              updateDraft((prev) => ({
                                ...prev,
                                width: preset.width,
                                height: preset.height,
                              }))
                            }
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="dialog-two-col">
                    <div className="field">
                      <label htmlFor={activeWidthId}>Width (px)</label>
                      <NumericInput
                        id={activeWidthId}
                        min={160}
                        max={7680}
                        step={2}
                        integer
                        value={draftProject.width}
                        onCommit={(val) => updateDraft((prev) => ({ ...prev, width: val }))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={activeHeightId}>Height (px)</label>
                      <NumericInput
                        id={activeHeightId}
                        min={160}
                        max={4320}
                        step={2}
                        integer
                        value={draftProject.height}
                        onCommit={(val) => updateDraft((prev) => ({ ...prev, height: val }))}
                      />
                    </div>
                  </div>

                  <div className="dialog-two-col">
                    <div className="field">
                      <label htmlFor={activeFpsId}>FPS</label>
                      <select
                        id={activeFpsId}
                        value={String(draftProject.fps)}
                        onChange={(ev) => {
                          const val = Number(ev.target.value);
                          if (Number.isFinite(val) && val > 0) {
                            updateDraft((prev) => ({ ...prev, fps: val }));
                          }
                        }}
                      >
                        <option value="24">24 FPS</option>
                        <option value="30">30 FPS</option>
                        <option value="60">60 FPS</option>
                      </select>
                    </div>

                    <div className="field">
                      <label htmlFor={activeEngineId}>Engine</label>
                      <select
                        id={activeEngineId}
                        value={draftProject.preferredEngine}
                        onChange={(ev) =>
                          updateDraft((prev) => ({ ...prev, preferredEngine: ev.target.value as EngineId }))
                        }
                      >
                        <option value="givemotion">GiveMotion (Native Ready)</option>
                        <option value="remotion">Remotion</option>
                        <option value="stretchystudio">StretchyStudio</option>
                        <option value="composite">Composite</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <StudioButton
                        type="submit"
                        variant="primary"
                        style={{ flex: 1 }}
                        disabled={!isDirty || busy.saving || busy.rendering}
                        loading={busy.saving}
                      >
                        {isDirty ? 'Save Changes' : 'Saved'}
                      </StudioButton>
                      <StudioButton
                        type="button"
                        variant="secondary"
                        disabled={!isDirty || busy.saving}
                        onClick={discardDraft}
                      >
                        Discard
                      </StudioButton>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <StudioButton
                        type="button"
                        variant="secondary"
                        style={{ flex: 1 }}
                        onClick={() => void openProject(draftProject.id, 'studio')}
                      >
                        Open in Studio
                      </StudioButton>
                      <StudioButton
                        type="button"
                        variant="ghost"
                        onClick={() => setSidebarMode('new')}
                      >
                        Close
                      </StudioButton>
                    </div>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
