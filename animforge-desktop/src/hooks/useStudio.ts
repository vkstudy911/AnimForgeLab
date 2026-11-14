import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  AgentRunResult,
  AssetType,
  CancelRenderResult,
  ConfigResult,
  CreateProjectResult,
  DeleteProjectResult,
  DeterministicAgentKind,
  GiveMotionPreviewResult,
  ImportAssetResult,
  PreviewServerProbeResult,
  ProjectCreateOptions,
  ProjectDetail,
  ProjectSummary,
  RenderJobRecord,
  RenderProgressPayload,
  RenderProjectResult,
  StudioBusyState,
  StudioDiskConfig,
  WorkspaceAssetsResult,
} from '../types';

const RENDER_PROGRESS_EVENT = 'animforge://render-progress';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function projectToSummary(saved: ProjectDetail): ProjectSummary {
  return {
    id: saved.id,
    name: saved.name,
    prompt: saved.prompt,
    status: saved.status,
    preferredEngine: saved.preferredEngine,
    width: saved.width,
    height: saved.height,
    fps: saved.fps,
    updatedAt: saved.updatedAt,
  };
}

async function fileToBase64(file: File): Promise<string> {
  const buf =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result instanceof ArrayBuffer) {
              resolve(reader.result);
            } else {
              reject(new Error(`Failed to read bytes for "${file.name}".`));
            }
          };
          reader.onerror = () => reject(reader.error ?? new Error(`Failed to read "${file.name}".`));
          reader.readAsArrayBuffer(file);
        });
  if (buf.byteLength === 0 || buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File "${file.name}" must be between 1 byte and ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`
    );
  }
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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
  const [lastRenderResult, setLastRenderResult] = useState<RenderProjectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<StudioBusyState>(INITIAL_BUSY);

  const unmountedRef = useRef(false);
  const projectSeqRef = useRef(0);
  const previewBaseUrlRef = useRef<string | null>(null);
  previewBaseUrlRef.current = previewBaseUrl;
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

  const refreshProjects = useCallback(async (): Promise<ProjectSummary[] | null> => {
    const seqSnapshot = projectSeqRef.current;
    const token = beginBusy('loadingList');
    try {
      const list = await invoke<ProjectSummary[]>('project_list');
      if (unmountedRef.current || projectSeqRef.current !== seqSnapshot) return null;
      setProjects(list);
      return list;
    } catch (err: unknown) {
      if (!unmountedRef.current) {
        setError(toErrorMessage(err));
      }
      return null;
    } finally {
      endBusy('loadingList', token);
    }
  }, [beginBusy, endBusy]);

  const selectProject = useCallback(
    async (projectId: string): Promise<ProjectDetail | null> => {
      const seq = ++projectSeqRef.current;
      const token = beginBusy('loadingProject');
      setError(null);
      try {
        const loaded = await invoke<ProjectDetail>('project_load', { projectId });
        let hasBundle = Boolean(loaded.hasBundle);
        let hasVideo = Boolean(loaded.hasVideo);
        const currentBaseUrl = previewBaseUrlRef.current;
        if (currentBaseUrl && (!hasBundle || !hasVideo)) {
          try {
            const [bRes, vRes] = await Promise.all([
              fetch(`${currentBaseUrl}/projects/${loaded.id}/bundle/index.html`, { method: 'HEAD' }).catch(() => null),
              fetch(`${currentBaseUrl}/projects/${loaded.id}/output.mp4`, { method: 'HEAD' }).catch(() => null),
            ]);
            if (bRes && bRes.ok) hasBundle = true;
            if (vRes && vRes.ok) hasVideo = true;
          } catch {
            // Ignore probe errors and fallback to loaded properties
          }
        }
        if (unmountedRef.current || seq !== projectSeqRef.current) return null;
        setActiveProject({ ...loaded, hasBundle, hasVideo });
        setPreviewResult(null);
        setPreviewRev(hasBundle ? 1 : 0);
        setVideoRev(hasVideo ? 1 : 0);
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
    async (
      name: string,
      prompt: string,
      options?: ProjectCreateOptions
    ): Promise<ProjectDetail | null> => {
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
        const input: Record<string, unknown> = {
          name: trimmedName,
          prompt: trimmedPrompt,
        };
        if (options?.width !== undefined) input.width = options.width;
        if (options?.height !== undefined) input.height = options.height;
        if (options?.fps !== undefined) input.fps = options.fps;
        if (options?.preferredEngine !== undefined) input.preferredEngine = options.preferredEngine;

        const created = await invoke<CreateProjectResult>('project_create_from_prompt', {
          input,
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

  const saveProjectDraft = useCallback(
    async (updatedProject: ProjectDetail, customStatusMessage?: string): Promise<ProjectDetail | null> => {
      const targetProjectId = updatedProject.id;
      const targetSeq = projectSeqRef.current;

      const token = beginBusy('saving');
      setError(null);
      try {
        const saved = await invoke<ProjectDetail>('project_save', { project: updatedProject });
        if (unmountedRef.current) return null;
        setProjects((prev) =>
          prev.map((item) =>
            item.id === saved.id
              ? {
                  ...item,
                  name: saved.name,
                  prompt: saved.prompt,
                  status: saved.status,
                  preferredEngine: saved.preferredEngine,
                  width: saved.width,
                  height: saved.height,
                  fps: saved.fps,
                  updatedAt: saved.updatedAt,
                }
              : item
          )
        );
        if (
          activeProjectRef.current?.id === targetProjectId &&
          projectSeqRef.current === targetSeq
        ) {
          setActiveProject(saved);
          if (saved.hasBundle) {
            setPreviewRev((rev) => (rev > 0 ? rev + 1 : 0));
          }
          setStatusMessage(customStatusMessage ?? `Saved project "${saved.name}".`);
        }
        return saved;
      } catch (err: unknown) {
        if (
          !unmountedRef.current &&
          projectSeqRef.current === targetSeq &&
          (!activeProjectRef.current || activeProjectRef.current.id === targetProjectId)
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

      const updatedProject: ProjectDetail = {
        ...current,
        scenes: current.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, title: trimmedTitle } : scene
        ),
      };

      return saveProjectDraft(updatedProject, `Saved scene "${trimmedTitle}".`);
    },
    [saveProjectDraft]
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
        const hasBundle = Boolean(result.bundleIndexHtml && result.playerHtml);
        if (hasBundle) {
          setPreviewRev((rev) => rev + 1);
          setStatusMessage(
            result.ok
              ? 'Preview bundle ready.'
              : `Preview generated with ${result.errors} error(s).`
          );
        } else {
          setPreviewRev(0);
          setStatusMessage(
            result.issues?.[0]?.message ??
              (result.ok
                ? 'Engine preview check completed.'
                : `Preview failed with ${result.errors} error(s).`)
          );
        }
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
    if (renderingProjectIdRef.current !== null) return false;

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
      setLastRenderResult(result);
      setProjects((prev) =>
        prev.map((item) =>
          item.id === targetProjectId ? { ...item, status: 'rendered' } : item
        )
      );
      if (
        projectSeqRef.current === targetSeq &&
        activeProjectRef.current?.id === targetProjectId
      ) {
        const isSpineJson = result.artifactKind === 'spine_json';
        if (isSpineJson) {
          setVideoRev(0);
        } else {
          setVideoRev((rev) => rev + 1);
        }
        setActiveProject((prev) =>
          prev && prev.id === targetProjectId ? { ...prev, status: 'rendered' } : prev
        );
        setRenderProgress(null);
        const outputName = result.videoPath?.split(/[\\/]/).pop() || 'character-rig.spine.json';
        setStatusMessage(
          isSpineJson
            ? `Exported Spine rig JSON (${outputName}).`
            : result.renderJob.status === 'completed'
              ? 'MP4 render completed.'
              : 'Render finished.'
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

  const deleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await invoke<DeleteProjectResult>('project_delete', { projectId });
      if (unmountedRef.current || !res?.deleted) return false;
      setProjects((prev) => prev.filter((item) => item.id !== projectId));
      if (activeProjectRef.current?.id === projectId) {
        projectSeqRef.current += 1;
        setActiveProject(null);
        setPreviewResult(null);
        setPreviewRev(0);
        setVideoRev(0);
        setRenderProgress(null);
      }
      setStatusMessage(`Deleted project "${projectId}".`);
      return true;
    } catch (err: unknown) {
      if (!unmountedRef.current) setError(toErrorMessage(err));
      return false;
    }
  }, []);

  const duplicateProject = useCallback(
    async (projectId: string, newName?: string): Promise<ProjectDetail | null> => {
      const seq = ++projectSeqRef.current;
      const token = beginBusy('creating');
      setError(null);
      try {
        const res = await invoke<CreateProjectResult>('project_duplicate', {
          projectId,
          ...(newName ? { newName } : {}),
        });
        if (unmountedRef.current || seq !== projectSeqRef.current) return null;
        setActiveProject(res.project);
        setPreviewResult(null);
        setPreviewRev(0);
        setVideoRev(0);
        setRenderProgress(null);
        setProjects((prev) => [
          projectToSummary(res.project),
          ...prev.filter((item) => item.id !== res.project.id),
        ]);
        setStatusMessage(`Duplicated project "${res.project.name}".`);
        return res.project;
      } catch (err: unknown) {
        if (!unmountedRef.current && seq === projectSeqRef.current) setError(toErrorMessage(err));
        return null;
      } finally {
        endBusy('creating', token);
      }
    },
    [beginBusy, endBusy]
  );

  const importProject = useCallback(
    async (projectJson: unknown): Promise<ProjectDetail | null> => {
      const seq = ++projectSeqRef.current;
      const token = beginBusy('creating');
      setError(null);
      try {
        const res = await invoke<CreateProjectResult>('project_import', { project: projectJson });
        if (unmountedRef.current || seq !== projectSeqRef.current) return null;
        setActiveProject(res.project);
        setPreviewResult(null);
        setPreviewRev(0);
        setVideoRev(0);
        setRenderProgress(null);
        setProjects((prev) => [
          projectToSummary(res.project),
          ...prev.filter((item) => item.id !== res.project.id),
        ]);
        setStatusMessage(`Imported project "${res.project.name}".`);
        return res.project;
      } catch (err: unknown) {
        if (!unmountedRef.current && seq === projectSeqRef.current) setError(toErrorMessage(err));
        return null;
      } finally {
        endBusy('creating', token);
      }
    },
    [beginBusy, endBusy]
  );

  const listRenderJobs = useCallback(async (projectId?: string): Promise<RenderJobRecord[]> => {
    try {
      const res = await invoke<RenderJobRecord[]>(
        'project_list_render_jobs',
        projectId ? { projectId } : {}
      );
      return Array.isArray(res) ? res : [];
    } catch (err: unknown) {
      if (!unmountedRef.current) setError(toErrorMessage(err));
      return [];
    }
  }, []);

  const listWorkspaceAssets = useCallback(
    async (projectId?: string): Promise<WorkspaceAssetsResult | null> => {
      setError(null);
      try {
        const res = await invoke<WorkspaceAssetsResult>(
          'project_assets_list',
          projectId ? { projectId } : {}
        );
        return res ?? null;
      } catch (err: unknown) {
        if (!unmountedRef.current) setError(toErrorMessage(err));
        return null;
      }
    },
    []
  );

  const importAssetFromWorkspace = useCallback(
    async (
      projectId: string,
      sourcePath: string,
      options?: { name?: string; assetType?: AssetType; confirmOverwrite?: boolean }
    ): Promise<ImportAssetResult | null> => {
      const targetSeq = projectSeqRef.current;
      const token = beginBusy('saving');
      setError(null);
      try {
        const res = await invoke<ImportAssetResult>('project_import_asset', {
          projectId,
          sourcePath,
          ...(options?.name ? { name: options.name } : {}),
          ...(options?.assetType ? { assetType: options.assetType } : {}),
          ...(options?.confirmOverwrite !== undefined
            ? { confirmOverwrite: options.confirmOverwrite }
            : {}),
        });
        if (!unmountedRef.current && res?.project) {
          setProjects((prev) =>
            prev.map((item) => (item.id === res.project.id ? projectToSummary(res.project) : item))
          );
          if (
            activeProjectRef.current?.id === res.project.id &&
            projectSeqRef.current === targetSeq
          ) {
            setActiveProject(res.project);
          }
          setStatusMessage(`Imported asset "${res.asset.name}".`);
        }
        return res ?? null;
      } catch (err: unknown) {
        if (!unmountedRef.current) setError(toErrorMessage(err));
        return null;
      } finally {
        endBusy('saving', token);
      }
    },
    [beginBusy, endBusy]
  );

  const importAssetFile = useCallback(
    async (
      projectId: string,
      file: File,
      options?: { name?: string; assetType?: AssetType; confirmOverwrite?: boolean }
    ): Promise<ImportAssetResult | null> => {
      const targetSeq = projectSeqRef.current;
      const token = beginBusy('saving');
      setError(null);
      try {
        const dataBase64 = await fileToBase64(file);
        const res = await invoke<ImportAssetResult>('project_import_asset_bytes', {
          projectId,
          fileName: file.name,
          dataBase64,
          ...(options?.name ? { name: options.name } : {}),
          ...(options?.assetType ? { assetType: options.assetType } : {}),
          ...(options?.confirmOverwrite !== undefined
            ? { confirmOverwrite: options.confirmOverwrite }
            : {}),
        });
        if (!unmountedRef.current && res?.project) {
          setProjects((prev) =>
            prev.map((item) => (item.id === res.project.id ? projectToSummary(res.project) : item))
          );
          if (
            activeProjectRef.current?.id === res.project.id &&
            projectSeqRef.current === targetSeq
          ) {
            setActiveProject(res.project);
          }
          setStatusMessage(`Imported asset "${res.asset.name}".`);
        }
        return res ?? null;
      } catch (err: unknown) {
        if (!unmountedRef.current) setError(toErrorMessage(err));
        return null;
      } finally {
        endBusy('saving', token);
      }
    },
    [beginBusy, endBusy]
  );

  const runDeterministicAgentAction = useCallback(
    async (projectId: string, agent: DeterministicAgentKind): Promise<AgentRunResult | null> => {
      const targetSeq = projectSeqRef.current;
      const token = beginBusy('saving');
      setError(null);
      try {
        const res = await invoke<AgentRunResult>('run_deterministic_agent', { projectId, agent });
        if (!unmountedRef.current && res?.project) {
          setProjects((prev) =>
            prev.map((item) => (item.id === res.project.id ? projectToSummary(res.project) : item))
          );
          if (
            activeProjectRef.current?.id === res.project.id &&
            projectSeqRef.current === targetSeq
          ) {
            setActiveProject(res.project);
          }
          setStatusMessage(res.summary);
        }
        return res ?? null;
      } catch (err: unknown) {
        if (!unmountedRef.current) setError(toErrorMessage(err));
        return null;
      } finally {
        endBusy('saving', token);
      }
    },
    [beginBusy, endBusy]
  );

  const getDiskConfig = useCallback(async (): Promise<ConfigResult | null> => {
    try {
      const res = await invoke<ConfigResult>('config_get');
      return res && typeof res === 'object' && res.config ? res : null;
    } catch {
      return null;
    }
  }, []);

  const saveDiskConfig = useCallback(
    async (config: StudioDiskConfig): Promise<ConfigResult | null> => {
      try {
        const res = await invoke<ConfigResult>('config_save', { config });
        if (!unmountedRef.current && res) {
          setStatusMessage('Saved studio configuration to disk.');
        }
        return res ?? null;
      } catch (err: unknown) {
        if (!unmountedRef.current) setError(toErrorMessage(err));
        return null;
      }
    },
    []
  );

  const probePreviewServer = useCallback(async (): Promise<PreviewServerProbeResult | null> => {
    try {
      const res = await invoke<PreviewServerProbeResult>('probe_preview_server');
      return res ?? null;
    } catch (err: unknown) {
      if (!unmountedRef.current) setError(toErrorMessage(err));
      return null;
    }
  }, []);

  const revealInWorkspace = useCallback(async (path: string): Promise<string | null> => {
    setError(null);
    try {
      const resolved = await invoke<string>('reveal_in_workspace', { path });
      if (!unmountedRef.current) {
        setStatusMessage(`Revealed ${path}.`);
      }
      return resolved ?? null;
    } catch (err: unknown) {
      if (!unmountedRef.current) setError(toErrorMessage(err));
      return null;
    }
  }, []);

  const applyExternalProjectSave = useCallback((saved: ProjectDetail) => {
    setProjects((prev) =>
      prev.map((item) =>
        item.id === saved.id
          ? {
              ...item,
              name: saved.name,
              prompt: saved.prompt,
              status: saved.status,
              width: saved.width,
              height: saved.height,
              fps: saved.fps,
              updatedAt: saved.updatedAt,
            }
          : item
      )
    );
    setActiveProject((curr) => (curr && curr.id === saved.id ? saved : curr));
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
    lastRenderResult,
    error,
    statusMessage,
    busy,
    refreshProjects,
    selectProject,
    createProject,
    saveProjectDraft,
    saveSceneTitle,
    previewProject,
    renderProject,
    cancelRender,
    deleteProject,
    duplicateProject,
    importProject,
    listRenderJobs,
    listWorkspaceAssets,
    importAssetFromWorkspace,
    importAssetFile,
    runDeterministicAgentAction,
    getDiskConfig,
    saveDiskConfig,
    probePreviewServer,
    revealInWorkspace,
    applyExternalProjectSave,
    clearError,
  };
}
