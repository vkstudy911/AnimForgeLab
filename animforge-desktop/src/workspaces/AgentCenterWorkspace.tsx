import { useEffect, useId, useRef, useState } from 'react';
import { AgentsIcon } from '../components/ui/Icons';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useStudioContext } from '../context/StudioContext';

interface McpToolInfo {
  name: string;
  scope: string;
  description: string;
  params: string;
}

const MCP_TOOLS: McpToolInfo[] = [
  {
    name: 'animforge_doctor',
    scope: 'read-only',
    description: 'Check AnimForge Studio engine, Chrome, FFmpeg, and workspace readiness.',
    params: 'none',
  },
  {
    name: 'animforge_list_projects',
    scope: 'read-only',
    description: 'List existing animation projects stored in the AnimForge workspace.',
    params: 'limit?: number',
  },
  {
    name: 'animforge_create_project',
    scope: 'workspace write',
    description: 'Create a new AnimForge animation project from a prompt.',
    params: 'projectId: string, name: string, prompt: string, width?: number, height?: number, fps?: number, preferredEngine?: string, confirmOverwrite?: boolean',
  },
  {
    name: 'animforge_get_project',
    scope: 'read-only',
    description: 'Retrieve full canonical metadata, scenes, characters, and assets for a project.',
    params: 'projectId: string',
  },
  {
    name: 'animforge_get_project_status',
    scope: 'read-only',
    description: 'Get workflow status, scene/asset counts, active render state, and output.mp4 status.',
    params: 'projectId: string',
  },
  {
    name: 'animforge_list_scenes',
    scope: 'read-only',
    description: 'List scenes ordered by sequenceIndex in an AnimForge project.',
    params: 'projectId: string',
  },
  {
    name: 'animforge_create_scene',
    scope: 'workspace write',
    description: 'Create a scene and append to project scenes.',
    params: 'projectId: string, sceneId: string, title: string, description?: string, durationSeconds?: number, backgroundAssetId?: string, characterIds?: string[], confirmOverwrite?: boolean',
  },
  {
    name: 'animforge_update_scene',
    scope: 'confirmOverwrite',
    description: 'Patch an existing scene in an AnimForge project.',
    params: 'projectId: string, sceneId: string, patch: object, confirmOverwrite?: boolean',
  },
  {
    name: 'animforge_list_assets',
    scope: 'read-only',
    description: 'List registered assets or filter by asset type in a project.',
    params: 'projectId: string, type?: string',
  },
  {
    name: 'animforge_import_asset',
    scope: 'approved dirs',
    description: 'Import an approved workspace asset into project assets manifest.',
    params: 'projectId: string, assetId: string, sourcePath: string, name?: string, assetType?: string, confirmOverwrite?: boolean',
  },
  {
    name: 'animforge_create_animation',
    scope: 'workspace write',
    description: 'Set animation timeline tracks (characterActions, cameraMoves, audioTracks) for a scene.',
    params: 'projectId: string, sceneId: string, characterActions?: array, cameraMoves?: array, audioTracks?: array, confirmOverwrite?: boolean',
  },
  {
    name: 'animforge_update_keyframes',
    scope: 'confirmOverwrite',
    description: 'Update keyframes array for a characterAction in a scene.',
    params: 'projectId: string, sceneId: string, actionId: string, keyframes: array, confirmOverwrite?: boolean',
  },
  {
    name: 'animforge_generate_preview',
    scope: 'bundle + QA',
    description: 'Bundle active engine HTML/JS assets and run QA check on preview loopback.',
    params: 'projectId: string, sceneId?: string',
  },
  {
    name: 'animforge_get_render_status',
    scope: 'read-only',
    description: 'Check active render progress, current frame, fps, and ETA.',
    params: 'projectId: string',
  },
  {
    name: 'animforge_cancel_render',
    scope: 'render control',
    description: 'Cancel an active rendering job gracefully.',
    params: 'projectId: string',
  },
  {
    name: 'animforge_export_video',
    scope: 'confirm: true',
    description: 'Trigger full project headless render to output.mp4.',
    params: 'projectId: string, outputFormat?: "mp4" | "webm", quality?: string, confirm: boolean',
  },
];

export function AgentCenterWorkspace() {
  const {
    draftProject,
    doctorReport,
    runDeterministicAgent,
    busy,
    navigate,
    setNewProjectDialogOpen,
  } = useStudioContext();
  const headingId = useId();
  const mcpPanelId = useId();
  const streamPanelId = useId();
  const helpersPanelId = useId();
  const artifactsPanelId = useId();
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [lastAgentNote, setLastAgentNote] = useState<string | null>(null);
  const [confirmScenePlanner, setConfirmScenePlanner] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<
    Array<{ id: string; agent: string; timestamp: string; status: 'completed' | 'failed'; summary: string }>
  >([]);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setLastAgentNote(null);
    setConfirmScenePlanner(false);
  }, [draftProject?.id]);

  const workspaceRoot = doctorReport?.workspaceRoot ?? '<workspace-root>';
  const stdioCommand = `node animforge-core/dist/mcp/index.js "${workspaceRoot}"`;
  const beatsCount = draftProject?.storyboard?.beats.length ?? 0;
  const logline = draftProject?.storyboard?.logline ?? null;
  const charactersCount = draftProject?.characters.length ?? 0;
  const scenesCount = draftProject?.scenes.length ?? 0;

  const handleCopyCommand = async () => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(stdioCommand);
      if (!mountedRef.current) return;
      setCopiedCmd(true);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        if (mountedRef.current) {
          setCopiedCmd(false);
        }
      }, 1800);
    } catch {
      // Ignore clipboard restrictions
    }
  };

  const handleRunDeterministic = async (
    agent: 'story_director' | 'character_manager' | 'scene_planner'
  ) => {
    if (!draftProject) return;
    setConfirmScenePlanner(false);
    const agentLabel =
      agent === 'story_director'
        ? 'StoryDirector'
        : agent === 'character_manager'
          ? 'CharacterManager'
          : 'ScenePlanner';
    const res = await runDeterministicAgent(draftProject.id, agent);
    const now = new Date().toLocaleTimeString();
    if (res) {
      if (mountedRef.current && res.summary) {
        setLastAgentNote(res.summary);
      }
      setExecutionLogs((prev) => [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          agent: agentLabel,
          timestamp: now,
          status: 'completed',
          summary: res.summary || `Ran ${agentLabel} successfully.`,
        },
        ...prev,
      ]);
    } else {
      setExecutionLogs((prev) => [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          agent: agentLabel,
          timestamp: now,
          status: 'failed',
          summary: `Failed to execute ${agentLabel}.`,
        },
        ...prev,
      ]);
    }
  };

  return (
    <section className="page-container" aria-labelledby={headingId}>
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AgentsIcon size={18} />
          <h2 id={headingId}>Agent Center &amp; OpenCode MCP</h2>
        </div>
        <span className="badge badge-neutral">Zero fabricated agent sessions</span>
      </div>

      <div className="grid-2">
        {/* OpenCode MCP Server Integration Panel */}
        <section className="panel" aria-labelledby={mcpPanelId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h3 id={mcpPanelId} style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
              OpenCode MCP Server Integration
            </h3>
            <StatusBadge tone="pass">16 validated tools</StatusBadge>
          </div>

          <div style={{ display: 'grid', gap: 6, fontSize: 'var(--text-sm)' }}>
            <div className="project-info-row">
              <span>Entrypoint</span>
              <code className="mono">animforge-core/src/mcp/index.ts</code>
            </div>
            <div className="project-info-row">
              <span>Transport</span>
              <code className="mono">stdio (StdioServerTransport)</code>
            </div>
            <div className="project-info-row">
              <span>Preview Server Exposure</span>
              <code className="mono">previewServerExposed: false</code>
            </div>
            <div className="project-info-row">
              <span>Workspace Root</span>
              <code className="mono" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {workspaceRoot}
              </code>
            </div>
          </div>

          <div
            style={{
              padding: 10,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="field-hint">MCP Client Stdio Command</span>
              <button type="button" onClick={() => void handleCopyCommand()}>
                {copiedCmd ? 'Copied' : 'Copy Command'}
              </button>
            </div>
            <pre
              className="mono"
              style={{ margin: 0, fontSize: 'var(--text-xs)', overflowX: 'auto' }}
            >
              {stdioCommand}
            </pre>
          </div>

          <div>
            <span className="field-hint" style={{ display: 'block', marginBottom: 6 }}>
              Registered MCP Tools ({MCP_TOOLS.length}) — Click tool for parameter schema
            </span>
            <ul
              role="list"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: 6,
              }}
            >
              {MCP_TOOLS.map((tool) => {
                const isSelected = selectedToolName === tool.name;
                return (
                  <li
                    key={tool.name}
                    onClick={() => setSelectedToolName(isSelected ? null : tool.name)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-xs)',
                      background: isSelected ? 'var(--bg-input)' : 'var(--bg-surface-elevated)',
                      border: `1px solid ${isSelected ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <code className="mono" style={{ fontWeight: isSelected ? 700 : 400 }}>{tool.name}</code>
                      <span className="field-hint">{tool.scope}</span>
                    </div>
                    <span className="field-hint" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {tool.params.length > 34 ? `${tool.params.slice(0, 34)}…` : tool.params}
                    </span>
                  </li>
                );
              })}
            </ul>

            {selectedToolName ? (() => {
              const tool = MCP_TOOLS.find((t) => t.name === selectedToolName);
              if (!tool) return null;
              return (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--accent-amber)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <code className="mono" style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                      {tool.name}
                    </code>
                    <StatusBadge tone="neutral">{tool.scope}</StatusBadge>
                  </div>
                  <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {tool.description}
                  </p>
                  <div style={{ fontSize: 'var(--text-xs)' }}>
                    <strong style={{ display: 'block', marginBottom: 2 }}>Parameters Schema:</strong>
                    <code className="mono" style={{ fontSize: '11px', color: 'var(--accent-amber)' }}>
                      {tool.params}
                    </code>
                  </div>
                </div>
              );
            })() : null}
          </div>
        </section>

        {/* Planned Telemetry + Deterministic Project Helpers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="panel" aria-labelledby={streamPanelId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 id={streamPanelId} style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Live MCP Tool Stream</h3>
              <StatusBadge tone="planned">Planned</StatusBadge>
            </div>
            <div className="planned-callout" role="note">
              <span>
                Real-time MCP invocation telemetry over <code>animforge://mcp-log</code> is
                planned and requires Tauri/worker event bridge exposure. External OpenCode MCP runs
                operate over stdio independently of the desktop UI process.
              </span>
              <StatusBadge tone="planned">Planned</StatusBadge>
            </div>
          </section>

          <section className="panel" aria-labelledby={helpersPanelId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 id={helpersPanelId} style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
                Deterministic Project Helpers
              </h3>
              <StatusBadge tone="pass">Rule-Based</StatusBadge>
            </div>
            <p className="field-hint">
              Run local deterministic template helpers (no external LLM) to regenerate story beats,
              populate character rigs, or build scene timelines on the open project.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={!draftProject || busy.saving}
                onClick={() => void handleRunDeterministic('story_director')}
              >
                Run StoryDirector
              </button>
              <button
                type="button"
                disabled={!draftProject || busy.saving}
                onClick={() => void handleRunDeterministic('character_manager')}
              >
                Run CharacterManager
              </button>
              <button
                type="button"
                disabled={!draftProject || busy.saving}
                onClick={() => setConfirmScenePlanner(true)}
              >
                Run ScenePlanner
              </button>
            </div>
            {confirmScenePlanner ? (
              <div role="region" aria-label="Confirm scene replacement" className="planned-callout">
                <span>
                  Deterministic ScenePlanner replaces custom scene edits from the storyboard beats.
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={!draftProject || busy.saving}
                    onClick={() => void handleRunDeterministic('scene_planner')}
                  >
                    Confirm Replace Scenes
                  </button>
                  <button type="button" onClick={() => setConfirmScenePlanner(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {lastAgentNote ? <p className="field-hint">{lastAgentNote}</p> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => navigate('story')}>
                Open Story &amp; Scenes
              </button>
              <button type="button" onClick={() => navigate('studio')}>
                Open Animation Studio
              </button>
            </div>
          </section>

          <section
            className="panel"
            aria-labelledby="agent-history-heading"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h3 id="agent-history-heading" style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
                Agent Execution History ({executionLogs.length})
              </h3>
              {executionLogs.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setExecutionLogs([])}
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            {executionLogs.length === 0 ? (
              <p className="field-hint">
                No deterministic agent runs recorded in this session. Run a helper above to log execution.
              </p>
            ) : (
              <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0 }}>
                {executionLogs.map((log) => (
                  <li
                    key={log.id}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-xs)',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontWeight: 600 }}>{log.agent}</strong>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="mono field-hint">{log.timestamp}</span>
                        <StatusBadge tone={log.status === 'completed' ? 'pass' : 'fail'}>
                          {log.status}
                        </StatusBadge>
                      </div>
                    </div>
                    <span className="field-hint">{log.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Real Planning Artifacts on Active Draft Project */}
      <section className="panel" aria-labelledby={artifactsPanelId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 id={artifactsPanelId} style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
            Active Project Planning Artifacts
          </h3>
          {draftProject ? (
            <span className="badge badge-pass">{draftProject.name}</span>
          ) : (
            <span className="badge badge-neutral">No active project</span>
          )}
        </div>

        {!draftProject ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            <p className="field-hint">
              Open or create a project to inspect real Storyboard beats, Characters, and Planned
              Scenes &amp; Keyframes JSON.
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
        ) : (
          <>
            <div className="grid-3">
              <div
                style={{
                  padding: 10,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span className="field-hint">Storyboard Beats</span>
                <strong className="mono" style={{ fontSize: 'var(--text-lg)' }}>
                  {beatsCount}
                </strong>
                <span className="field-hint">
                  {draftProject.storyboard?.artStyle
                    ? `Style: ${draftProject.storyboard.artStyle}`
                    : 'No art style metadata'}
                </span>
              </div>

              <div
                style={{
                  padding: 10,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span className="field-hint">Characters</span>
                <strong className="mono" style={{ fontSize: 'var(--text-lg)' }}>
                  {charactersCount}
                </strong>
                <span className="field-hint">
                  {charactersCount > 0
                    ? draftProject.characters.map((c) => c.name).join(', ')
                    : 'No characters defined'}
                </span>
              </div>

              <div
                style={{
                  padding: 10,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span className="field-hint">Planned Scenes</span>
                <strong className="mono" style={{ fontSize: 'var(--text-lg)' }}>
                  {scenesCount}
                </strong>
                <span className="field-hint">
                  {draftProject.width}×{draftProject.height} · {draftProject.fps}fps
                </span>
              </div>
            </div>

            <div
              style={{
                padding: 10,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <strong style={{ display: 'block', fontSize: 'var(--text-sm)', marginBottom: 4 }}>
                Storyboard Logline
              </strong>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {logline ?? 'No storyboard logline stored on this project yet.'}
              </p>
            </div>

            {beatsCount > 0 && draftProject.storyboard?.beats ? (
              <details>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                  Storyboard Beats ({beatsCount} beats)
                </summary>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {draftProject.storyboard.beats.map((b) => (
                    <div
                      key={b.beatNumber}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <strong>
                          Beat {b.beatNumber}: {b.sceneTitle}
                        </strong>
                        <span className="mono field-hint">{b.targetDurationSeconds}s</span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{b.visualSummary}</p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {charactersCount > 0 ? (
              <details>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                  Cast Characters ({charactersCount} characters)
                </summary>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {draftProject.characters.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <strong>{c.name}</strong>
                        <span className="field-hint">{c.parts.length} rig parts</span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{c.description}</p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                Planned Scenes &amp; Keyframes JSON ({scenesCount} scenes)
              </summary>
              <pre
                className="mono"
                style={{
                  marginTop: 8,
                  padding: 10,
                  maxHeight: 280,
                  overflow: 'auto',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {JSON.stringify(draftProject.scenes, null, 2)}
              </pre>
            </details>
          </>
        )}
      </section>
    </section>
  );
}
