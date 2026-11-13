import { useEffect, useId, useRef, useState } from 'react';
import { AgentsIcon } from '../components/ui/Icons';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useStudioContext } from '../context/StudioContext';

const MCP_TOOLS: Array<{ name: string; scope: string }> = [
  { name: 'animforge_doctor', scope: 'read-only' },
  { name: 'animforge_list_projects', scope: 'read-only' },
  { name: 'animforge_create_project', scope: 'workspace write' },
  { name: 'animforge_get_project', scope: 'read-only' },
  { name: 'animforge_get_project_status', scope: 'read-only' },
  { name: 'animforge_list_scenes', scope: 'read-only' },
  { name: 'animforge_create_scene', scope: 'workspace write' },
  { name: 'animforge_update_scene', scope: 'confirmOverwrite' },
  { name: 'animforge_list_assets', scope: 'read-only' },
  { name: 'animforge_import_asset', scope: 'approved dirs' },
  { name: 'animforge_create_animation', scope: 'workspace write' },
  { name: 'animforge_update_keyframes', scope: 'confirmOverwrite' },
  { name: 'animforge_generate_preview', scope: 'bundle + QA' },
  { name: 'animforge_get_render_status', scope: 'read-only' },
  { name: 'animforge_cancel_render', scope: 'render control' },
  { name: 'animforge_export_video', scope: 'confirm: true' },
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
    const res = await runDeterministicAgent(draftProject.id, agent);
    if (mountedRef.current && res?.summary) {
      setLastAgentNote(res.summary);
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
              Registered MCP Tools ({MCP_TOOLS.length})
            </span>
            <ul
              role="list"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: 6,
              }}
            >
              {MCP_TOOLS.map((tool) => (
                <li
                  key={tool.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    padding: '5px 8px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <code className="mono">{tool.name}</code>
                  <span className="field-hint">{tool.scope}</span>
                </li>
              ))}
            </ul>
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
