import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { DoctorBar } from './components/DoctorBar';
import { PreviewStage } from './components/PreviewStage';
import { useStudio } from './hooks/useStudio';

export default function App() {
  const {
    projects,
    activeProject,
    renderingProjectId,
    previewResult,
    previewRev,
    bundleUrl,
    playerScriptUrl,
    videoUrl,
    renderProgress,
    error,
    statusMessage,
    busy,
    selectProject,
    createProject,
    saveSceneTitle,
    previewProject,
    renderProject,
    cancelRender,
    clearError,
  } = useStudio();

  const createHeadingId = useId();
  const projectNameId = useId();
  const projectNameErrId = useId();
  const projectPromptId = useId();
  const projectPromptHintId = useId();
  const projectPromptErrId = useId();

  const sceneHeadingId = useId();
  const sceneTitleId = useId();
  const sceneTitleErrId = useId();

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const sceneTitleInputRef = useRef<HTMLInputElement | null>(null);
  const lastSyncedSceneKeyRef = useRef<string | null>(null);
  const blurAnnounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [projectName, setProjectName] = useState('');
  const [projectPrompt, setProjectPrompt] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [promptTouched, setPromptTouched] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [sceneTitleInput, setSceneTitleInput] = useState('');
  const [sceneTitleTouched, setSceneTitleTouched] = useState(false);
  const [sceneTitleError, setSceneTitleError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<{
    source: 'status' | 'blur';
    text: string;
  } | null>(null);

  const clearBlurAnnouncement = useCallback(() => {
    if (blurAnnounceTimerRef.current !== null) {
      clearTimeout(blurAnnounceTimerRef.current);
      blurAnnounceTimerRef.current = null;
    }
    setAnnouncement((prev) => (prev?.source === 'blur' ? null : prev));
  }, []);

  const scheduleBlurAnnouncement = useCallback((label: string, message: string) => {
    if (blurAnnounceTimerRef.current !== null) {
      clearTimeout(blurAnnounceTimerRef.current);
    }
    setAnnouncement(null);
    blurAnnounceTimerRef.current = setTimeout(() => {
      blurAnnounceTimerRef.current = null;
      setAnnouncement({ source: 'blur', text: `${label}: ${message}` });
    }, 450);
  }, []);

  useEffect(() => {
    if (blurAnnounceTimerRef.current !== null) {
      clearTimeout(blurAnnounceTimerRef.current);
      blurAnnounceTimerRef.current = null;
    }
    setAnnouncement(statusMessage ? { source: 'status', text: statusMessage } : null);
  }, [statusMessage]);

  useEffect(() => {
    return () => {
      if (blurAnnounceTimerRef.current !== null) {
        clearTimeout(blurAnnounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeProject || activeProject.scenes.length === 0) {
      lastSyncedSceneKeyRef.current = null;
      setSelectedSceneId(null);
      setSceneTitleInput('');
      setSceneTitleError(null);
      setSceneTitleTouched(false);
      return;
    }

    const matching = activeProject.scenes.find((s) => s.id === selectedSceneId);
    const chosen = matching ?? activeProject.scenes[0];
    if (chosen.id !== selectedSceneId) {
      setSelectedSceneId(chosen.id);
    }

    const syncKey = `${activeProject.id}:${activeProject.updatedAt}:${chosen.id}`;
    if (lastSyncedSceneKeyRef.current !== syncKey) {
      lastSyncedSceneKeyRef.current = syncKey;
      setSceneTitleInput(chosen.title);
      setSceneTitleError(null);
      setSceneTitleTouched(false);
    }
  }, [activeProject, selectedSceneId]);

  const handleCreateSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    clearBlurAnnouncement();
    const nextNameErr = projectName.trim() ? null : 'Enter a project name.';
    const nextPromptErr = projectPrompt.trim() ? null : 'Describe the animation prompt.';
    setNameError(nextNameErr);
    setPromptError(nextPromptErr);

    if (nextNameErr) {
      nameInputRef.current?.focus();
      return;
    }
    if (nextPromptErr) {
      promptInputRef.current?.focus();
      return;
    }

    const created = await createProject(projectName, projectPrompt);
    if (created) {
      setProjectName('');
      setProjectPrompt('');
      setNameTouched(false);
      setPromptTouched(false);
      setNameError(null);
      setPromptError(null);
    }
  };

  const handleSaveSceneSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    clearBlurAnnouncement();
    if (!selectedSceneId) return;
    const nextTitleErr = sceneTitleInput.trim() ? null : 'Enter a scene title.';
    setSceneTitleError(nextTitleErr);
    if (nextTitleErr) {
      sceneTitleInputRef.current?.focus();
      return;
    }
    await saveSceneTitle(selectedSceneId, sceneTitleInput);
  };

  const activeScene = activeProject?.scenes.find((s) => s.id === selectedSceneId) ?? null;
  const projectActionsBusy =
    busy.loadingProject || busy.creating || busy.saving || busy.previewing || busy.rendering;

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="studio-brand">
          <h1>AnimForge Studio</h1>
          <span className="studio-tag">macOS / Linux Desktop</span>
        </div>
        {activeProject ? (
          <span className="project-meta">
            Active: {activeProject.name} ({activeProject.status})
          </span>
        ) : null}
      </header>

      <main className="studio-main">
        <div className="studio-status" aria-live="polite">
          {announcement?.text ?? ''}
        </div>

        {error ? (
          <div role="alert" className="studio-alert">
            <span>{error}</span>
            <button type="button" onClick={clearError}>
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="studio-workspace">
          <div className="studio-sidebar">
            <section className="panel">
              <h2>Projects</h2>
              {busy.loadingList ? (
                <p className="empty-copy">Loading workspace projects...</p>
              ) : projects.length === 0 ? (
                <p className="empty-copy">No projects yet. Create one below.</p>
              ) : (
                <ul className="project-list" role="list">
                  {projects.map((item) => {
                    const isSelected = item.id === activeProject?.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="project-button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            clearBlurAnnouncement();
                            void selectProject(item.id);
                          }}
                          disabled={projectActionsBusy}
                        >
                          <span>{item.name}</span>
                          <span className="badge badge-pass">{item.status}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="panel">
              <h2 id={createHeadingId}>Create Project</h2>
              <p className="field-hint">Fields marked * are required.</p>
              <form noValidate aria-labelledby={createHeadingId} onSubmit={handleCreateSubmit}>
                <div className="field">
                  <label htmlFor={projectNameId}>
                    Project Name
                    <span className="required-mark" aria-hidden="true">
                      {' '}
                      *
                    </span>
                  </label>
                  <input
                    ref={nameInputRef}
                    id={projectNameId}
                    name="projectName"
                    type="text"
                    required
                    aria-invalid={nameError ? 'true' : 'false'}
                    aria-describedby={nameError ? projectNameErrId : undefined}
                    value={projectName}
                    onChange={(ev) => {
                      const val = ev.target.value;
                      setNameTouched(true);
                      setProjectName(val);
                      if (nameError && val.trim()) {
                        setNameError(null);
                        clearBlurAnnouncement();
                      }
                    }}
                    onBlur={() => {
                      if (nameTouched && !projectName.trim()) {
                        const msg = 'Enter a project name.';
                        setNameError(msg);
                        scheduleBlurAnnouncement('Project Name', msg);
                      }
                    }}
                  />
                  {nameError ? (
                    <span id={projectNameErrId} className="field-error">
                      {nameError}
                    </span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor={projectPromptId}>
                    Animation Prompt
                    <span className="required-mark" aria-hidden="true">
                      {' '}
                      *
                    </span>
                  </label>
                  <span id={projectPromptHintId} className="field-hint">
                    Describe characters, action, and setting.
                  </span>
                  <textarea
                    ref={promptInputRef}
                    id={projectPromptId}
                    name="projectPrompt"
                    required
                    aria-invalid={promptError ? 'true' : 'false'}
                    aria-describedby={
                      promptError
                        ? `${projectPromptHintId} ${projectPromptErrId}`
                        : projectPromptHintId
                    }
                    value={projectPrompt}
                    onChange={(ev) => {
                      const val = ev.target.value;
                      setPromptTouched(true);
                      setProjectPrompt(val);
                      if (promptError && val.trim()) {
                        setPromptError(null);
                        clearBlurAnnouncement();
                      }
                    }}
                    onBlur={() => {
                      if (promptTouched && !projectPrompt.trim()) {
                        const msg = 'Describe the animation prompt.';
                        setPromptError(msg);
                        scheduleBlurAnnouncement('Animation Prompt', msg);
                      }
                    }}
                  />
                  {promptError ? (
                    <span id={projectPromptErrId} className="field-error">
                      {promptError}
                    </span>
                  ) : null}
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy.creating || busy.rendering}
                >
                  {busy.creating ? 'Creating...' : 'Create Project'}
                </button>
              </form>
            </section>

            <section className="panel">
              <h2 id={sceneHeadingId}>Selected Scene</h2>
              {!activeProject ? (
                <p className="empty-copy">Select a project to inspect and edit scenes.</p>
              ) : activeProject.scenes.length === 0 ? (
                <p className="empty-copy">This project has no planned scenes yet.</p>
              ) : (
                <>
                  {activeProject.scenes.length > 1 ? (
                    <ul className="scene-tabs" role="list">
                      {activeProject.scenes.map((scene, idx) => (
                        <li key={scene.id}>
                          <button
                            type="button"
                            className="scene-tab-btn"
                            aria-pressed={scene.id === activeScene?.id}
                            onClick={() => {
                              clearBlurAnnouncement();
                              setSelectedSceneId(scene.id);
                            }}
                          >
                            Scene {idx + 1}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <form noValidate aria-labelledby={sceneHeadingId} onSubmit={handleSaveSceneSubmit}>
                    <div className="field">
                      <label htmlFor={sceneTitleId}>
                        Scene Title
                        <span className="required-mark" aria-hidden="true">
                          {' '}
                          *
                        </span>
                      </label>
                      <input
                        ref={sceneTitleInputRef}
                        id={sceneTitleId}
                        name="sceneTitle"
                        type="text"
                        required
                        aria-invalid={sceneTitleError ? 'true' : 'false'}
                        aria-describedby={sceneTitleError ? sceneTitleErrId : undefined}
                        value={sceneTitleInput}
                        onChange={(ev) => {
                          const val = ev.target.value;
                          setSceneTitleTouched(true);
                          setSceneTitleInput(val);
                          if (sceneTitleError && val.trim()) {
                            setSceneTitleError(null);
                            clearBlurAnnouncement();
                          }
                        }}
                        onBlur={() => {
                          if (sceneTitleTouched && !sceneTitleInput.trim()) {
                            const msg = 'Enter a scene title.';
                            setSceneTitleError(msg);
                            scheduleBlurAnnouncement('Scene Title', msg);
                          }
                        }}
                      />
                      {sceneTitleError ? (
                        <span id={sceneTitleErrId} className="field-error">
                          {sceneTitleError}
                        </span>
                      ) : null}
                    </div>

                    <button type="submit" disabled={busy.saving || busy.rendering}>
                      {busy.saving ? 'Saving...' : 'Save Scene'}
                    </button>
                  </form>
                </>
              )}
            </section>
          </div>

          <div className="studio-stage-col">
            <PreviewStage
              project={activeProject}
              previewResult={previewResult}
              previewRev={previewRev}
              bundleUrl={bundleUrl}
              playerScriptUrl={playerScriptUrl}
              videoUrl={videoUrl}
              previewing={busy.previewing}
              rendering={busy.rendering && renderingProjectId === activeProject?.id}
              cancelling={busy.cancelling}
              renderProgress={renderProgress}
              onPreview={() => void previewProject()}
              onRender={() => void renderProject()}
              onCancelRender={() => void cancelRender()}
            />
          </div>
        </div>

        <DoctorBar />
      </main>
    </div>
  );
}
