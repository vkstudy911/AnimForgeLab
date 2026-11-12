import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  CancelRenderResult,
  CreateProjectResult,
  GiveMotionPreviewResult,
  ProjectDetail,
  ProjectSummary,
  RenderProgressPayload,
  RenderProjectResult,
  StudioBusyState,
} from '../types';

const RENDER_PROGRESS_EVENT = 'animforge://render-progress';

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const INITIAL_BUSY: StudioBusyState = {
  loadingList: true,
  loadingProject: false,
  creating: false,
  saving: false,
  previewing: false,
  rendering: false,
  cancelling: false,
};

export function useStudio() {
  const [previewBaseUrl, setPreviewBaseUrl] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectDetail | null>(null);
  const [renderingProjectId, setRenderingProjectId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<GiveMotionPreviewResult | null>(null);
  const [previewRev, setPreviewRev] = useState(0);
  const [videoRev, setVideoRev] = useState(0);
  const [renderProgress, setRenderProgress] = useState<RenderProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<StudioBusyState>(INITIAL_BUSY);

  const unmountedRef = useRef(false);
  const projectSeqRef = useRef(0);
  const activeProjectRef = useRef<ProjectDetail | null>(null);
  activeProjectRef.current = activeProject;
  const renderingProjectIdRef = useRef<string | null>(null);
  renderingProjectIdRef.current = renderingProjectId;

  const opTokensRef = useRef<Record<keyof StudioBusyState, number>>({
    loadingList: 0,
    loadingProject: 0,
    creating: 0,
    saving: 0,
    previewing: 0,
    rendering: 0,
    cancelling: 0,
  });

  const beginBusy = useCallback((key: keyof StudioBusyState): number => {
    const token = ++opTokensRef.current[key];
    setBusy((prev) => ({ ...prev, [key]: true }));
    return token;
  }, []);

  const endBusy = useCallback((key: keyof StudioBusyState, token: number) => {
    if (!unmountedRef.current && opTokensRef.current[key] === token) {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    const listToken = ++opTokensRef.current.loadingList;
    const loadInitial = async () => {
      try {
        const [baseUrl, list] = await Promise.all([
          invoke<string>('get_preview_base_url'),
          invoke<ProjectSummary[]>('project_list'),
        ]);
        if (cancelled || unmountedRef.current) return;
        setPreviewBaseUrl(baseUrl);
        if (projectSeqRef.current === 0) {
          setProjects(list);
        }
      } catch (err: unknown) {
        if (cancelled || unmountedRef.current) return;
        setError(toErrorMessage(err));
      } finally {
        if (!cancelled) {
          endBusy('loadingList', listToken);
        }
      }
    };

    void loadInitial();

    void listen<RenderProgressPayload>(RENDER_PROGRESS_EVENT, (ev) => {
      if (cancelled || unmountedRef.current) return;
      const payload = ev.payload;
      if (
        !payload ||
        payload.projectId !== activeProjectRef.current?.id ||
        (renderingProjectIdRef.current !== null &&
          payload.projectId !== renderingProjectIdRef.current)
      ) {
        return;
      }
      setRenderProgress(payload);
    })
      .then((fn) => {
        if (cancelled || unmountedRef.current) {
          fn();
        } else {
          unlistenFn = fn;
        }
      })
      .catch(() => {
        // Ignore listener setup failures in non-Tauri environments
      });

    return () => {
      cancelled = true;
      unmountedRef.current = true;
      unlistenFn?.();
    };
  }, [endBusy]);

  const selectProject = useCallback(
    async (projectId: string): Promise<ProjectDetail | null> => {
      const seq = ++projectSeqRef.current;
      const token = beginBusy('loadingProject');
      setError(null);
      try {
        const loaded = await invoke<ProjectDetail>('project_load', { projectId });
        if (unmountedRef.current || seq !== projectSeqRef.current) return null;
        setActiveProject(loaded);
        setPreviewResult(null);
        setPreviewRev(0);
        setVideoRev(0);
        setRenderProgress(null);
        setStatusMessage(`Loaded project "${loaded.name}".`);
        return loaded;
      } catch (err: unknown) {
        if (!unmountedRef.current && seq === projectSeqRef.current) {
          setError(toErrorMessage(err));
        }
        return null;
      } finally {
        endBusy('loadingProject', token);
      }
    },
    [beginBusy, endBusy]
  );

  const createProject = useCallback(
    async (name: string, prompt: string): Promise<ProjectDetail | null> => {
      const trimmedName = name.trim();
      const trimmedPrompt = prompt.trim();
      if (!trimmedName || !trimmedPrompt) {
        setError('Project name and prompt are required.');
        return null;
      }

      const seq = ++projectSeqRef.current;
      const token = beginBusy('creating');
      setError(null);
      try {
        const created = await invoke<CreateProjectResult>('project_create_from_prompt', {
          input: { name: trimmedName, prompt: trimmedPrompt },
        });
        if (unmountedRef.current || seq !== projectSeqRef.current) return null;

        setActiveProject(created.project);
        setPreviewResult(null);
        setPreviewRev(0);
        setVideoRev(0);
        setRenderProgress(null);
        setStatusMessage(`Created project "${created.project.name}".`);

        try {
          const refreshed = await invoke<ProjectSummary[]>('project_list');
          if (!unmountedRef.current && seq === projectSeqRef.current) {
            setProjects(refreshed);
          }
        } catch (refreshErr: unknown) {
          if (!unmountedRef.current && seq === projectSeqRef.current) {
            setError(toErrorMessage(refreshErr));
          }
        }

        return created.project;
      } catch (err: unknown) {
        if (!unmountedRef.current && seq === projectSeqRef.current) {
          setError(toErrorMessage(err));
        }
        return null;
      } finally {
        endBusy('creating', token);
      }
    },
    [beginBusy, endBusy]
  );

  const saveSceneTitle = useCallback(
    async (sceneId: string, title: string): Promise<ProjectDetail | null> => {
      const current = activeProjectRef.current;
      if (!current) {
        setError('Select or create a project before saving a scene.');
        return null;
      }
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setError('Scene title must not be empty.');
        return null;
      }

      const targetProjectId = current.id;
      const targetSeq = projectSeqRef.current;
      const updatedProject: ProjectDetail = {
        ...current,
        scenes: current.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, title: trimmedTitle } : scene
        ),
      };

      const token = beginBusy('saving');
      setError(null);
      try {
        const saved = await invoke<ProjectDetail>('project_save', { project: updatedProject });
        if (unmountedRef.current) return null;
        setProjects((prev) =>
          prev.map((item) =>
            item.id === saved.id
              ? { ...item, name: saved.name, status: saved.status, updatedAt: saved.updatedAt }
              : item
          )
        );
        if (projectSeqRef.current !== targetSeq || activeProjectRef.current?.id !== targetProjectId) {
          return null;
        }
        setActiveProject(saved);
        setStatusMessage(`Saved scene "${trimmedTitle}".`);
        return saved;
      } catch (err: unknown) {
        if (
          !unmountedRef.current &&
          projectSeqRef.current === targetSeq &&
          activeProjectRef.current?.id === targetProjectId
        ) {
          setError(toErrorMessage(err));
        }
        return null;
      } finally {
        endBusy('saving', token);
      }
    },
    [beginBusy, endBusy]
  );

  const previewProject = useCallback(
    async (sceneId?: string): Promise<GiveMotionPreviewResult | null> => {
      const current = activeProjectRef.current;
      if (!current) {
        setError('Select or create a project before generating a preview.');
        return null;
      }

      const targetProjectId = current.id;
      const targetSeq = projectSeqRef.current;
      const token = beginBusy('previewing');
      setError(null);
      try {
        const params =
          sceneId !== undefined ? { projectId: targetProjectId, sceneId } : { projectId: targetProjectId };
        const result = await invoke<GiveMotionPreviewResult>('project_preview', params);
        if (
          unmountedRef.current ||
          projectSeqRef.current !== targetSeq ||
          activeProjectRef.current?.id !== targetProjectId
        ) {
          return null;
        }
        setPreviewResult(result);
        setPreviewRev((rev) => rev + 1);
        setStatusMessage(
          result.ok
            ? 'Preview bundle ready.'
            : `Preview generated with ${result.errors} error(s).`
        );
        return result;
      } catch (err: unknown) {
        if (
          !unmountedRef.current &&
          projectSeqRef.current === targetSeq &&
          activeProjectRef.current?.id === targetProjectId
        ) {
          setError(toErrorMessage(err));
        }
        return null;
      } finally {
        endBusy('previewing', token);
      }
    },
    [beginBusy, endBusy]
  );

  const renderProject = useCallback(async (): Promise<boolean> => {
    const current = activeProjectRef.current;
    if (!current) {
      setError('Select or create a project before rendering.');
      return false;
    }

    const targetProjectId = current.id;
    const targetSeq = projectSeqRef.current;
    const token = beginBusy('rendering');
    opTokensRef.current.cancelling += 1;
    setBusy((prev) => ({ ...prev, cancelling: false }));
    renderingProjectIdRef.current = targetProjectId;
    setRenderingProjectId(targetProjectId);
    setRenderProgress(null);
    setError(null);
    try {
      const result = await invoke<RenderProjectResult>('project_render', {
        projectId: targetProjectId,
      });
      if (unmountedRef.current) return false;
      setProjects((prev) =>
        prev.map((item) =>
          item.id === targetProjectId ? { ...item, status: 'rendered' } : item
        )
      );
      if (
        projectSeqRef.current === targetSeq &&
        activeProjectRef.current?.id === targetProjectId
      ) {
        setVideoRev((rev) => rev + 1);
        setActiveProject((prev) =>
          prev && prev.id === targetProjectId ? { ...prev, status: 'rendered' } : prev
        );
        setRenderProgress(null);
        setStatusMessage(
          result.renderJob.status === 'completed' ? 'MP4 render completed.' : 'Render finished.'
        );
      }
      return true;
    } catch (err: unknown) {
      if (
        !unmountedRef.current &&
        projectSeqRef.current === targetSeq &&
        activeProjectRef.current?.id === targetProjectId
      ) {
        const message = toErrorMessage(err);
        setRenderProgress(null);
        if (/RENDER_CANCELLED|cancelled/i.test(message)) {
          setStatusMessage('Render cancelled.');
        } else {
          setError(message);
        }
      }
      return false;
    } finally {
      if (!unmountedRef.current && opTokensRef.current.rendering === token) {
        renderingProjectIdRef.current = null;
        setRenderingProjectId(null);
        setBusy((prev) => ({ ...prev, rendering: false, cancelling: false }));
      }
    }
  }, [beginBusy]);

  const cancelRender = useCallback(async (): Promise<boolean> => {
    const targetProjectId = renderingProjectIdRef.current ?? activeProjectRef.current?.id;
    if (!targetProjectId) return false;

    const token = beginBusy('cancelling');
    try {
      const result = await invoke<CancelRenderResult>('project_cancel_render', {
        projectId: targetProjectId,
      });
      if (
        !unmountedRef.current &&
        activeProjectRef.current?.id === targetProjectId &&
        result.cancelled
      ) {
        setStatusMessage('Cancelling active render...');
      }
      return result.cancelled;
    } catch (err: unknown) {
      if (!unmountedRef.current && activeProjectRef.current?.id === targetProjectId) {
        setError(toErrorMessage(err));
      }
      return false;
    } finally {
      endBusy('cancelling', token);
    }
  }, [beginBusy, endBusy]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const bundleUrl =
    previewBaseUrl && activeProject && previewRev > 0
      ? `${previewBaseUrl}/projects/${activeProject.id}/bundle/index.html?v=${previewRev}`
      : null;

  const playerScriptUrl =
    previewBaseUrl && activeProject && previewRev > 0
      ? `${previewBaseUrl}/projects/${activeProject.id}/bundle/gm-player.js`
      : null;

  const videoUrl =
    previewBaseUrl && activeProject && videoRev > 0
      ? `${previewBaseUrl}/projects/${activeProject.id}/output.mp4?v=${videoRev}`
      : null;

  return {
    previewBaseUrl,
    projects,
    activeProject,
    renderingProjectId,
    previewResult,
    previewRev,
    videoRev,
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
  };
}
