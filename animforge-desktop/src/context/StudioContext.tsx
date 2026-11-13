import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStudio } from '../hooks/useStudio';
import { useThemePreference } from '../hooks/useThemePreference';
import type {
  AgentRunResult,
  AssetType,
  DeterministicAgentKind,
  DoctorReport,
  GiveMotionPreviewResult,
  ImportAssetResult,
  PreviewServerProbeResult,
  ProjectCreateOptions,
  ProjectDetail,
  ProjectSummary,
  RenderHistoryEntry,
  RenderJobRecord,
  RenderProgressPayload,
  RenderProjectResult,
  ResolvedTheme,
  StageControlsApi,
  StudioBusyState,
  StudioDiskConfig,
  StudioSelection,
  StudioSettingsPrefs,
  ThemePreference,
  WorkspaceAssetsResult,
  WorkspaceId,
  WorkspaceLayoutPrefs,
} from '../types';

const LAYOUT_STORAGE_KEY = 'animforge:layout';
const SETTINGS_STORAGE_KEY = 'animforge:settings';

const DEFAULT_LAYOUT: WorkspaceLayoutPrefs = {
  leftPanelWidth: 268,
  rightPanelWidth: 296,
  timelineHeight: 216,
  leftCollapsed: false,
  rightCollapsed: false,
  timelineCollapsed: false,
};

const DEFAULT_SETTINGS: StudioSettingsPrefs = {
  density: 'comfortable',
  reducedEffects: false,
  defaultWidth: 1920,
  defaultHeight: 1080,
  defaultFps: 30,
  defaultEngine: 'givemotion',
  showSafeZonesByDefault: true,
};

const VALID_WORKSPACES: WorkspaceId[] = [
  'home',
  'projects',
  'story',
  'studio',
  'characters',
  'assets',
  'render',
  'diagnostics',
  'settings',
  'agents',
];

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

function readHashWorkspace(): WorkspaceId {
  if (typeof window === 'undefined') return 'home';
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return VALID_WORKSPACES.includes(raw as WorkspaceId) ? (raw as WorkspaceId) : 'home';
}

function normalizeRenderJobEntry(
  job: RenderJobRecord,
  projects: ProjectSummary[],
  activeProject: ProjectDetail | null
): RenderHistoryEntry {
  const summary = projects.find((p) => p.id === job.projectId);
  const isActive = activeProject?.id === job.projectId;
  return {
    jobId: job.id,
    projectId: job.projectId,
    projectName: isActive ? activeProject.name : (summary?.name ?? job.projectId),
    engine: job.engine,
    status: job.status,
    videoPath: job.outputFilePath ?? '',
    finishedAt: job.finishedAt ?? job.startedAt,
    width: (isActive ? activeProject.width : summary?.width) ?? 1920,
    height: (isActive ? activeProject.height : summary?.height) ?? 1080,
    fps: (isActive ? activeProject.fps : summary?.fps) ?? 30,
    ...(job.error ? { error: job.error } : {}),
  };
}

function toDiskConfig(prefs: StudioSettingsPrefs): StudioDiskConfig {
  return {
    defaultWidth: prefs.defaultWidth,
    defaultHeight: prefs.defaultHeight,
    defaultFps: prefs.defaultFps,
    defaultEngine: prefs.defaultEngine,
    density: prefs.density,
    reducedEffects: prefs.reducedEffects,
    showSafeZonesByDefault: prefs.showSafeZonesByDefault,
  };
}

export interface StudioContextValue {
  activeWorkspace: WorkspaceId;
  navigate: (workspace: WorkspaceId) => void;

  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (pref: ThemePreference) => void;
  cycleThemePreference: () => void;

  doctorReport: DoctorReport | null;
  doctorLoading: boolean;
  doctorError: string | null;
  refreshDoctor: () => Promise<void>;

  previewBaseUrl: string | null;
  projects: ProjectSummary[];
  activeProject: ProjectDetail | null;
  draftProject: ProjectDetail | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  updateDraft: (updater: (prev: ProjectDetail) => ProjectDetail) => void;
  saveDraft: (customMessage?: string, projectOverride?: ProjectDetail) => Promise<ProjectDetail | null>;
  discardDraft: () => void;
  applyRenamedProject: (saved: ProjectDetail) => void;

  selectedSceneId: string | null;
  setSelectedSceneId: (sceneId: string | null) => void;
  selection: StudioSelection | null;
  setSelection: (sel: StudioSelection | null) => void;

  playheadTime: number;
  setPlayheadTime: (t: number) => void;
  timelineZoom: number;
  setTimelineZoom: React.Dispatch<React.SetStateAction<number>>;
  trackVisibility: {
    scene: boolean;
    actions: boolean;
    camera: boolean;
    audio: boolean;
  };
  toggleTrackVisibility: (track: 'scene' | 'actions' | 'camera' | 'audio') => void;

  renderingProjectId: string | null;
  previewResult: GiveMotionPreviewResult | null;
  previewRev: number;
  videoRev: number;
  bundleUrl: string | null;
  playerScriptUrl: string | null;
  videoUrl: string | null;
  renderProgress: RenderProgressPayload | null;
  lastRenderResult: RenderProjectResult | null;
  renderHistory: RenderHistoryEntry[];
  refreshRenderHistory: () => Promise<void>;

  error: string | null;
  clearError: () => void;
  statusMessage: string | null;
  announcement: string;
  scheduleBlurAnnouncement: (label: string, message: string) => void;
  clearBlurAnnouncement: () => void;

  busy: StudioBusyState;
  refreshProjects: () => Promise<ProjectSummary[] | null>;
  openProject: (
    projectId: string,
    navigateTo?: WorkspaceId,
    options?: { forceReload?: boolean }
  ) => Promise<void>;
  createAndOpenProject: (
    name: string,
    prompt: string,
    options?: ProjectCreateOptions,
    navigateTo?: WorkspaceId
  ) => Promise<ProjectDetail | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
  duplicateProject: (projectId: string, newName?: string) => Promise<ProjectDetail | null>;
  importProject: (projectJson: unknown) => Promise<ProjectDetail | null>;
  saveSceneTitle: (sceneId: string, title: string) => Promise<ProjectDetail | null>;
  previewProject: (sceneId?: string) => Promise<GiveMotionPreviewResult | null>;
  renderProject: () => Promise<boolean>;
  cancelRender: () => Promise<boolean>;

  listWorkspaceAssets: (projectId?: string) => Promise<WorkspaceAssetsResult | null>;
  importAssetFromWorkspace: (
    projectId: string,
    sourcePath: string,
    options?: { name?: string; assetType?: AssetType; confirmOverwrite?: boolean }
  ) => Promise<ImportAssetResult | null>;
  importAssetFile: (
    projectId: string,
    file: File,
    options?: { name?: string; assetType?: AssetType; confirmOverwrite?: boolean }
  ) => Promise<ImportAssetResult | null>;
  runDeterministicAgent: (
    projectId: string,
    agent: DeterministicAgentKind
  ) => Promise<AgentRunResult | null>;
  probePreviewServer: () => Promise<PreviewServerProbeResult | null>;
  revealInWorkspace: (path: string) => Promise<string | null>;

  registerStageControls: (api: StageControlsApi | null) => void;
  triggerStagePlayPause: () => void;
  triggerStageStepFrame: (deltaFrames: number) => void;

  newProjectDialogOpen: boolean;
  setNewProjectDialogOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  pendingSwitchProjectId: string | null;
  confirmPendingSwitch: (mode: 'save' | 'discard' | 'cancel') => Promise<void>;

  layoutPrefs: WorkspaceLayoutPrefs;
  updateLayoutPrefs: (patch: Partial<WorkspaceLayoutPrefs>) => void;
  settingsPrefs: StudioSettingsPrefs;
  updateSettingsPrefs: (patch: Partial<StudioSettingsPrefs>) => void;
  resetSettingsDefaults: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const studio = useStudio();
  const theme = useThemePreference();

  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(readHashWorkspace);
  const [historyState, setHistoryState] = useState<{
    draft: ProjectDetail | null;
    past: ProjectDetail[];
    future: ProjectDetail[];
  }>({ draft: null, past: [], future: [] });
  const draftProject = historyState.draft;
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selection, setSelection] = useState<StudioSelection | null>(null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [trackVisibility, setTrackVisibility] = useState({
    scene: true,
    actions: true,
    camera: true,
    audio: true,
  });

  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(true);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const doctorSeqRef = useRef(0);

  const [renderHistory, setRenderHistory] = useState<RenderHistoryEntry[]>([]);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [pendingSwitchProjectId, setPendingSwitchProjectId] = useState<string | null>(null);
  const pendingTargetWorkspaceRef = useRef<WorkspaceId | undefined>(undefined);

  const [layoutPrefs, setLayoutPrefs] = useState<WorkspaceLayoutPrefs>(() =>
    readJsonStorage(LAYOUT_STORAGE_KEY, DEFAULT_LAYOUT)
  );
  const [settingsPrefs, setSettingsPrefs] = useState<StudioSettingsPrefs>(() =>
    readJsonStorage(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)
  );

  const [announcementObj, setAnnouncementObj] = useState<{
    source: 'status' | 'blur';
    text: string;
  } | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedActiveRef = useRef<ProjectDetail | null>(null);
  const recordedJobsRef = useRef<Set<string>>(new Set());
  const stageControlsRef = useRef<StageControlsApi | null>(null);
  const draftRef = useRef<ProjectDetail | null>(null);
  draftRef.current = draftProject;
  const isDirtyRef = useRef(false);
  const projectsRef = useRef(studio.projects);
  projectsRef.current = studio.projects;
  const activeProjectRef = useRef(studio.activeProject);
  activeProjectRef.current = studio.activeProject;
  const settingsPrefsRef = useRef(settingsPrefs);
  settingsPrefsRef.current = settingsPrefs;

  const clearBlurAnnouncement = useCallback(() => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setAnnouncementObj((prev) => (prev?.source === 'blur' ? null : prev));
  }, []);

  const scheduleBlurAnnouncement = useCallback((label: string, message: string) => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
    }
    setAnnouncementObj(null);
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      setAnnouncementObj({ source: 'blur', text: `${label}: ${message}` });
    }, 450);
  }, []);

  useEffect(() => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setAnnouncementObj(studio.statusMessage ? { source: 'status', text: studio.statusMessage } : null);
  }, [studio.statusMessage]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const refreshDoctor = useCallback(async () => {
    const seq = ++doctorSeqRef.current;
    setDoctorLoading(true);
    setDoctorError(null);
    try {
      const report = await invoke<DoctorReport>('run_doctor');
      if (seq !== doctorSeqRef.current) return;
      setDoctorReport(report);
    } catch (err: unknown) {
      if (seq !== doctorSeqRef.current) return;
      setDoctorError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === doctorSeqRef.current) {
        setDoctorLoading(false);
      }
    }
  }, []);

  const {
    listRenderJobs,
    getDiskConfig,
    saveDiskConfig,
    deleteProject: studioDeleteProject,
    saveProjectDraft: studioSaveProjectDraft,
    previewProject: studioPreviewProject,
    renderProject: studioRenderProject,
    selectProject: studioSelectProject,
    createProject: studioCreateProject,
    importAssetFromWorkspace: studioImportAssetFromWorkspace,
    importAssetFile: studioImportAssetFile,
    runDeterministicAgentAction: studioRunDeterministicAgent,
    applyExternalProjectSave: studioApplyExternalProjectSave,
  } = studio;

  const refreshRenderHistory = useCallback(async () => {
    const jobs = await listRenderJobs();
    if (!Array.isArray(jobs)) return;
    setRenderHistory((prev) => {
      const existingById = new Map(prev.map((item) => [item.jobId, item]));
      const next: RenderHistoryEntry[] = [];
      recordedJobsRef.current.clear();
      for (const job of jobs) {
        recordedJobsRef.current.add(job.id);
        const existing = existingById.get(job.id);
        const normalized = normalizeRenderJobEntry(
          job,
          projectsRef.current,
          activeProjectRef.current
        );
        next.push(
          existing
            ? {
                ...normalized,
                ...(existing.ffprobe !== undefined ? { ffprobe: existing.ffprobe } : {}),
                ...(existing.artifactKind !== undefined
                  ? { artifactKind: existing.artifactKind }
                  : {}),
              }
            : normalized
        );
      }
      return next;
    });
  }, [listRenderJobs]);

  useEffect(() => {
    void refreshDoctor();
    void refreshRenderHistory();
    void getDiskConfig().then((res) => {
      if (!res?.exists || !res.config) return;
      try {
        if (localStorage.getItem(SETTINGS_STORAGE_KEY) !== null) return;
      } catch {
        // Ignore storage restrictions
      }
      const fpsNum = res.config.defaultFps;
      const safeFps: 24 | 30 | 60 = fpsNum === 24 || fpsNum === 60 ? fpsNum : 30;
      setSettingsPrefs({
        density: res.config.density === 'compact' ? 'compact' : 'comfortable',
        reducedEffects: Boolean(res.config.reducedEffects),
        defaultWidth: res.config.defaultWidth,
        defaultHeight: res.config.defaultHeight,
        defaultFps: safeFps,
        defaultEngine: res.config.defaultEngine,
        showSafeZonesByDefault: Boolean(res.config.showSafeZonesByDefault),
      });
    });
    return () => {
      doctorSeqRef.current += 1;
    };
  }, [refreshDoctor, refreshRenderHistory, getDiskConfig]);

  // Keep draft synced cleanly without clobbering in-progress edits on render status updates
  useEffect(() => {
    const active = studio.activeProject;
    if (!active) {
      lastSyncedActiveRef.current = null;
      setHistoryState({ draft: null, past: [], future: [] });
      setSelectedSceneId(null);
      setSelection(null);
      return;
    }

    const prevActive = lastSyncedActiveRef.current;
    const isSameProject = prevActive !== null && prevActive.id === active.id;
    const isStatusOnlyUpdate =
      isSameProject &&
      prevActive.updatedAt === active.updatedAt &&
      prevActive.assets === active.assets &&
      prevActive.scenes === active.scenes &&
      prevActive.characters === active.characters &&
      prevActive.storyboard === active.storyboard &&
      prevActive.name === active.name &&
      prevActive.width === active.width &&
      prevActive.height === active.height &&
      prevActive.fps === active.fps &&
      prevActive.preferredEngine === active.preferredEngine;

    lastSyncedActiveRef.current = active;
    if (isStatusOnlyUpdate) {
      // Example: renderProject finished and only updated status -> preserve local draft edits!
      setHistoryState((curr) => ({
        ...curr,
        draft: curr.draft ? { ...curr.draft, status: active.status } : active,
      }));
      return;
    }

    if (isSameProject) {
      setHistoryState((curr) => ({ ...curr, draft: active }));
    } else {
      setHistoryState({ draft: active, past: [], future: [] });
      setPlayheadTime(0);
    }
    setSelectedSceneId((curr) =>
      curr && active.scenes.some((s) => s.id === curr) ? curr : (active.scenes[0]?.id ?? null)
    );
  }, [studio.activeProject]);

  // Record real completed renders from this desktop session
  useEffect(() => {
    const res = studio.lastRenderResult;
    if (!res || !res.renderJob?.id) return;
    if (recordedJobsRef.current.has(res.renderJob.id)) {
      setRenderHistory((prev) =>
        prev.map((entry) =>
          entry.jobId === res.renderJob.id
            ? {
                ...entry,
                status: res.renderJob.status,
                videoPath: res.videoPath || entry.videoPath,
                ffprobe: res.ffprobe ?? entry.ffprobe ?? null,
                artifactKind: res.artifactKind ?? entry.artifactKind ?? null,
              }
            : entry
        )
      );
      return;
    }
    recordedJobsRef.current.add(res.renderJob.id);

    const matchingSummary = studio.projects.find((p) => p.id === res.renderJob.projectId);
    setRenderHistory((prev) => [
      {
        jobId: res.renderJob.id,
        projectId: res.renderJob.projectId,
        projectName:
          studio.activeProject?.id === res.renderJob.projectId
            ? studio.activeProject.name
            : (matchingSummary?.name ?? res.renderJob.projectId),
        engine: String(res.renderJob.engine ?? 'givemotion'),
        status: res.renderJob.status,
        videoPath: res.videoPath,
        finishedAt: new Date().toISOString(),
        width: matchingSummary?.width ?? studio.activeProject?.width ?? 1280,
        height: matchingSummary?.height ?? studio.activeProject?.height ?? 720,
        fps: matchingSummary?.fps ?? studio.activeProject?.fps ?? 30,
        ffprobe: res.ffprobe ?? null,
        artifactKind: res.artifactKind ?? null,
      },
      ...prev,
    ]);
  }, [studio.lastRenderResult, studio.projects, studio.activeProject]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.density = settingsPrefs.density;
      document.documentElement.dataset.reducedEffects = String(settingsPrefs.reducedEffects);
    }
  }, [settingsPrefs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      setActiveWorkspace(readHashWorkspace());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((workspace: WorkspaceId) => {
    setActiveWorkspace(workspace);
    if (typeof window !== 'undefined') {
      const nextHash = `#/${workspace}`;
      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
      }
    }
  }, []);

  const isDirty = useMemo(() => {
    if (!studio.activeProject || !draftProject) return false;
    return JSON.stringify(studio.activeProject) !== JSON.stringify(draftProject);
  }, [studio.activeProject, draftProject]);
  isDirtyRef.current = isDirty;

  const updateDraft = useCallback((updater: (prev: ProjectDetail) => ProjectDetail) => {
    setHistoryState((curr) => {
      if (!curr.draft) return curr;
      const next = updater(curr.draft);
      if (next === curr.draft) return curr;
      return {
        draft: next,
        past: [...curr.past.slice(-49), curr.draft],
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistoryState((curr) => {
      if (!curr.draft || curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      return {
        draft: previous,
        past: curr.past.slice(0, -1),
        future: [curr.draft, ...curr.future.slice(0, 49)],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistoryState((curr) => {
      if (!curr.draft || curr.future.length === 0) return curr;
      const next = curr.future[0];
      return {
        draft: next,
        past: [...curr.past.slice(-49), curr.draft],
        future: curr.future.slice(1),
      };
    });
  }, []);

  const saveDraft = useCallback(
    async (customMessage?: string, projectOverride?: ProjectDetail): Promise<ProjectDetail | null> => {
      const target = projectOverride ?? draftRef.current;
      if (!target) return null;
      return studioSaveProjectDraft(target, customMessage);
    },
    [studioSaveProjectDraft]
  );

  const discardDraft = useCallback(() => {
    if (studio.activeProject) {
      setHistoryState({ draft: studio.activeProject, past: [], future: [] });
    }
  }, [studio.activeProject]);

  const applyRenamedProject = useCallback(
    (saved: ProjectDetail) => {
      studioApplyExternalProjectSave(saved);
      setHistoryState((curr) => ({
        draft: curr.draft && curr.draft.id === saved.id ? { ...curr.draft, name: saved.name } : curr.draft,
        past: curr.past.map((snap) =>
          snap.id === saved.id ? { ...snap, name: saved.name } : snap
        ),
        future: curr.future.map((snap) =>
          snap.id === saved.id ? { ...snap, name: saved.name } : snap
        ),
      }));
    },
    [studioApplyExternalProjectSave]
  );

  const previewProject = useCallback(
    async (sceneId?: string): Promise<GiveMotionPreviewResult | null> => {
      if (isDirtyRef.current && draftRef.current) {
        const saved = await studioSaveProjectDraft(
          draftRef.current,
          `Auto-saved "${draftRef.current.name}" before preview.`
        );
        if (!saved) return null;
      }
      return studioPreviewProject(sceneId);
    },
    [studioSaveProjectDraft, studioPreviewProject]
  );

  const renderProject = useCallback(async (): Promise<boolean> => {
    if (isDirtyRef.current && draftRef.current) {
      const saved = await studioSaveProjectDraft(
        draftRef.current,
        `Auto-saved "${draftRef.current.name}" before render.`
      );
      if (!saved) return false;
    }
    return studioRenderProject();
  }, [studioSaveProjectDraft, studioRenderProject]);

  const performOpenProject = useCallback(
    async (projectId: string, navigateTo?: WorkspaceId) => {
      const loaded = await studioSelectProject(projectId);
      if (loaded && navigateTo) {
        navigate(navigateTo);
      }
    },
    [studioSelectProject, navigate]
  );

  const openProject = useCallback(
    async (
      projectId: string,
      navigateTo: WorkspaceId = 'studio',
      options?: { forceReload?: boolean }
    ) => {
      if (activeProjectRef.current?.id === projectId && !options?.forceReload) {
        if (navigateTo) navigate(navigateTo);
        return;
      }
      if (isDirtyRef.current && !options?.forceReload) {
        pendingTargetWorkspaceRef.current = navigateTo;
        setPendingSwitchProjectId(projectId);
        return;
      }
      await performOpenProject(projectId, navigateTo);
    },
    [navigate, performOpenProject]
  );

  const confirmPendingSwitch = useCallback(
    async (mode: 'save' | 'discard' | 'cancel') => {
      const targetId = pendingSwitchProjectId;
      const targetWs = pendingTargetWorkspaceRef.current ?? 'studio';
      setPendingSwitchProjectId(null);
      pendingTargetWorkspaceRef.current = undefined;
      if (!targetId || mode === 'cancel') return;

      if (mode === 'save') {
        const saved = await saveDraft();
        if (!saved) return;
      }
      await performOpenProject(targetId, targetWs);
    },
    [pendingSwitchProjectId, saveDraft, performOpenProject]
  );

  const createAndOpenProject = useCallback(
    async (
      name: string,
      prompt: string,
      options?: ProjectCreateOptions,
      navigateTo: WorkspaceId = 'studio'
    ) => {
      const created = await studioCreateProject(name, prompt, options);
      if (created && navigateTo) {
        navigate(navigateTo);
      }
      return created;
    },
    [studioCreateProject, navigate]
  );

  const importAssetFromWorkspace = useCallback(
    async (
      projectId: string,
      sourcePath: string,
      options?: { name?: string; assetType?: AssetType; confirmOverwrite?: boolean }
    ): Promise<ImportAssetResult | null> => {
      if (
        isDirtyRef.current &&
        draftRef.current &&
        draftRef.current.id === projectId
      ) {
        const saved = await studioSaveProjectDraft(
          draftRef.current,
          `Auto-saved "${draftRef.current.name}" before importing asset.`
        );
        if (!saved) return null;
      }
      const res = await studioImportAssetFromWorkspace(projectId, sourcePath, options);
      if (res) {
        setHistoryState((curr) => ({ ...curr, past: [], future: [] }));
      }
      return res;
    },
    [studioSaveProjectDraft, studioImportAssetFromWorkspace]
  );

  const importAssetFile = useCallback(
    async (
      projectId: string,
      file: File,
      options?: { name?: string; assetType?: AssetType; confirmOverwrite?: boolean }
    ): Promise<ImportAssetResult | null> => {
      if (
        isDirtyRef.current &&
        draftRef.current &&
        draftRef.current.id === projectId
      ) {
        const saved = await studioSaveProjectDraft(
          draftRef.current,
          `Auto-saved "${draftRef.current.name}" before uploading asset.`
        );
        if (!saved) return null;
      }
      const res = await studioImportAssetFile(projectId, file, options);
      if (res) {
        setHistoryState((curr) => ({ ...curr, past: [], future: [] }));
      }
      return res;
    },
    [studioSaveProjectDraft, studioImportAssetFile]
  );

  const runDeterministicAgent = useCallback(
    async (projectId: string, agent: DeterministicAgentKind): Promise<AgentRunResult | null> => {
      if (
        isDirtyRef.current &&
        draftRef.current &&
        draftRef.current.id === projectId
      ) {
        const saved = await studioSaveProjectDraft(
          draftRef.current,
          `Auto-saved "${draftRef.current.name}" before running deterministic helper.`
        );
        if (!saved) return null;
      }
      const res = await studioRunDeterministicAgent(projectId, agent);
      if (res) {
        setHistoryState((curr) => ({ ...curr, past: [], future: [] }));
      }
      return res;
    },
    [studioSaveProjectDraft, studioRunDeterministicAgent]
  );

  const toggleTrackVisibility = useCallback((track: 'scene' | 'actions' | 'camera' | 'audio') => {
    setTrackVisibility((prev) => ({ ...prev, [track]: !prev[track] }));
  }, []);

  const updateLayoutPrefs = useCallback((patch: Partial<WorkspaceLayoutPrefs>) => {
    setLayoutPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const deleteProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      const ok = await studioDeleteProject(projectId);
      if (ok) {
        setRenderHistory((prev) => prev.filter((item) => item.projectId !== projectId));
      }
      return ok;
    },
    [studioDeleteProject]
  );

  const updateSettingsPrefs = useCallback(
    (patch: Partial<StudioSettingsPrefs>) => {
      const next = { ...settingsPrefsRef.current, ...patch };
      settingsPrefsRef.current = next;
      setSettingsPrefs(next);
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      void saveDiskConfig(toDiskConfig(next));
    },
    [saveDiskConfig]
  );

  const resetSettingsDefaults = useCallback(() => {
    settingsPrefsRef.current = DEFAULT_SETTINGS;
    setSettingsPrefs(DEFAULT_SETTINGS);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    } catch {
      // Ignore storage errors
    }
    void saveDiskConfig(toDiskConfig(DEFAULT_SETTINGS));
  }, [saveDiskConfig]);

  const registerStageControls = useCallback((api: StageControlsApi | null) => {
    stageControlsRef.current = api;
  }, []);

  const triggerStagePlayPause = useCallback(() => {
    stageControlsRef.current?.togglePlayPause();
  }, []);

  const triggerStageStepFrame = useCallback(
    (deltaFrames: number) => {
      if (stageControlsRef.current) {
        stageControlsRef.current.stepFrame(deltaFrames);
        return;
      }
      const rawFps = draftRef.current?.fps;
      const fps = typeof rawFps === 'number' && Number.isFinite(rawFps) && rawFps > 0 ? rawFps : 30;
      const totalDur = Math.max(
        1,
        (draftRef.current?.scenes ?? []).reduce((sum, s) => sum + s.duration, 0)
      );
      setPlayheadTime((prev) => Math.max(0, Math.min(totalDur, Number((prev + deltaFrames / fps).toFixed(3)))));
    },
    []
  );

  // Global desktop keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const inEditable =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const dialogOpen = document.querySelector('dialog[open], [role="dialog"]') !== null;
      const mod = ev.metaKey || ev.ctrlKey;
      if (mod && ev.key.toLowerCase() === 'k') {
        if (!dialogOpen || commandPaletteOpen) {
          ev.preventDefault();
          setCommandPaletteOpen((open) => !open);
        }
        return;
      }
      if (!dialogOpen && mod && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        if (isDirty) {
          void saveDraft();
        }
        return;
      }
      if (!dialogOpen && mod && ev.key.toLowerCase() === 'n') {
        ev.preventDefault();
        setNewProjectDialogOpen(true);
        return;
      }
      if (inEditable) return;

      if (!dialogOpen && mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (!dialogOpen && mod && !ev.shiftKey && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
        return;
      }

      if (!dialogOpen && ev.altKey && !mod) {
        const indexMap: Record<string, WorkspaceId> = {
          '1': 'home',
          '2': 'projects',
          '3': 'story',
          '4': 'studio',
          '5': 'characters',
          '6': 'assets',
          '7': 'render',
          '8': 'diagnostics',
          '9': 'settings',
          '0': 'agents',
        };
        const targetWs = indexMap[ev.key];
        if (targetWs) {
          ev.preventDefault();
          navigate(targetWs);
          return;
        }
      }

      if (!dialogOpen && !mod && !ev.altKey && (ev.code === 'Space' || ev.key === ' ')) {
        const interactiveTarget = target?.closest(
          'button, a, summary, video, gm-player, [role="button"], [role="slider"], [role="separator"], [data-timeline-clip]'
        );
        if (!interactiveTarget && stageControlsRef.current) {
          ev.preventDefault();
          stageControlsRef.current.togglePlayPause();
          return;
        }
      }

      if (!dialogOpen && !mod && !ev.altKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
        const interactiveTarget = target?.closest(
          '[role="slider"], [role="separator"], [role="button"], [data-timeline-clip], button, a, summary, video, gm-player'
        );
        if (!interactiveTarget) {
          ev.preventDefault();
          triggerStageStepFrame(ev.key === 'ArrowRight' ? 1 : -1);
          return;
        }
      }

      if (!dialogOpen && !mod && !ev.altKey && ev.key === '[') {
        updateLayoutPrefs({ leftCollapsed: !layoutPrefs.leftCollapsed });
      } else if (!dialogOpen && !mod && !ev.altKey && ev.key === ']') {
        updateLayoutPrefs({ rightCollapsed: !layoutPrefs.rightCollapsed });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isDirty,
    saveDraft,
    navigate,
    undo,
    redo,
    triggerStageStepFrame,
    layoutPrefs.leftCollapsed,
    layoutPrefs.rightCollapsed,
    updateLayoutPrefs,
    commandPaletteOpen,
  ]);

  const value: StudioContextValue = {
    activeWorkspace,
    navigate,
    themePreference: theme.preference,
    resolvedTheme: theme.resolvedTheme,
    setThemePreference: theme.setPreference,
    cycleThemePreference: theme.cyclePreference,
    doctorReport,
    doctorLoading,
    doctorError,
    refreshDoctor,
    previewBaseUrl: studio.previewBaseUrl,
    projects: studio.projects,
    activeProject: studio.activeProject,
    draftProject,
    isDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    updateDraft,
    saveDraft,
    discardDraft,
    applyRenamedProject,
    selectedSceneId,
    setSelectedSceneId,
    selection,
    setSelection,
    playheadTime,
    setPlayheadTime,
    timelineZoom,
    setTimelineZoom,
    trackVisibility,
    toggleTrackVisibility,
    renderingProjectId: studio.renderingProjectId,
    previewResult: studio.previewResult,
    previewRev: studio.previewRev,
    videoRev: studio.videoRev,
    bundleUrl: studio.bundleUrl,
    playerScriptUrl: studio.playerScriptUrl,
    videoUrl: studio.videoUrl,
    renderProgress: studio.renderProgress,
    lastRenderResult: studio.lastRenderResult,
    renderHistory,
    refreshRenderHistory,
    error: studio.error,
    clearError: studio.clearError,
    statusMessage: studio.statusMessage,
    announcement: announcementObj?.text ?? '',
    scheduleBlurAnnouncement,
    clearBlurAnnouncement,
    busy: studio.busy,
    refreshProjects: studio.refreshProjects,
    openProject,
    createAndOpenProject,
    deleteProject,
    duplicateProject: studio.duplicateProject,
    importProject: studio.importProject,
    saveSceneTitle: studio.saveSceneTitle,
    previewProject,
    renderProject,
    cancelRender: studio.cancelRender,
    listWorkspaceAssets: studio.listWorkspaceAssets,
    importAssetFromWorkspace,
    importAssetFile,
    runDeterministicAgent,
    probePreviewServer: studio.probePreviewServer,
    revealInWorkspace: studio.revealInWorkspace,
    registerStageControls,
    triggerStagePlayPause,
    triggerStageStepFrame,
    newProjectDialogOpen,
    setNewProjectDialogOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    pendingSwitchProjectId,
    confirmPendingSwitch,
    layoutPrefs,
    updateLayoutPrefs,
    settingsPrefs,
    updateSettingsPrefs,
    resetSettingsDefaults,
  };

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudioContext(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudioContext must be used inside StudioProvider');
  }
  return ctx;
}
