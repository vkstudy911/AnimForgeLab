import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { PreviewStage } from '../components/PreviewStage';
import { CueInspector } from '../components/timeline/CueInspector';
import { MultiTrackTimeline } from '../components/timeline/MultiTrackTimeline';
import { SceneOutliner } from '../components/timeline/SceneOutliner';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, ProjectsIcon } from '../components/ui/Icons';
import { useStudioContext } from '../context/StudioContext';

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function AnimationEditor() {
  const {
    draftProject,
    previewResult,
    previewRev,
    bundleUrl,
    playerScriptUrl,
    videoUrl,
    busy,
    renderingProjectId,
    renderProgress,
    previewProject,
    renderProject,
    cancelRender,
    playheadTime,
    setPlayheadTime,
    registerStageControls,
    layoutPrefs,
    updateLayoutPrefs,
    settingsPrefs,
    setNewProjectDialogOpen,
    navigate,
  } = useStudioContext();

  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
    };
  }, []);

  const startDrag = (
    ev: React.PointerEvent<HTMLDivElement>,
    onMove: (dx: number, dy: number) => void
  ) => {
    ev.preventDefault();
    cleanupDragRef.current?.();
    const startX = ev.clientX;
    const startY = ev.clientY;

    const handleMove = (moveEv: PointerEvent) => {
      if (!Number.isFinite(moveEv.clientX) || !Number.isFinite(moveEv.clientY)) return;
      onMove(moveEv.clientX - startX, moveEv.clientY - startY);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      cleanupDragRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    cleanupDragRef.current = handleUp;
  };

  if (!draftProject) {
    return (
      <div className="page-container">
        <section className="panel" style={{ maxWidth: 520, margin: '24px auto', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>No Project Loaded in Studio</h2>
          <p className="field-hint" style={{ marginBottom: 16 }}>
            Open an existing animation project or create a new one from a prompt to start editing
            scenes, character cues, and timeline tracks.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setNewProjectDialogOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <PlusIcon size={14} />
              <span>New Project</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('projects')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ProjectsIcon size={14} />
              <span>Browse Projects</span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  const leftCol = layoutPrefs.leftCollapsed ? '32px' : `${layoutPrefs.leftPanelWidth}px`;
  const rightCol = layoutPrefs.rightCollapsed ? '32px' : `${layoutPrefs.rightPanelWidth}px`;
  const leftColSm = layoutPrefs.leftCollapsed
    ? '32px'
    : `${Math.min(220, layoutPrefs.leftPanelWidth)}px`;
  const rightColSm = layoutPrefs.rightCollapsed
    ? '32px'
    : `${Math.min(250, layoutPrefs.rightPanelWidth)}px`;
  const timelineH = layoutPrefs.timelineCollapsed ? '38px' : `${layoutPrefs.timelineHeight}px`;

  return (
    <div
      className="studio-workbench"
      style={
        {
          '--left-col': leftCol,
          '--right-col': rightCol,
          '--left-col-sm': leftColSm,
          '--right-col-sm': rightColSm,
          '--timeline-h': timelineH,
        } as React.CSSProperties
      }
    >
      <div className="studio-top-row">
        <aside className="studio-pane" aria-label="Scene Outliner Panel" style={{ borderRight: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: layoutPrefs.leftCollapsed ? 'center' : 'space-between',
              padding: '4px 8px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-header)',
            }}
          >
            {!layoutPrefs.leftCollapsed ? (
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Outliner</span>
            ) : null}
            <button
              type="button"
              className="btn-ghost"
              aria-label={layoutPrefs.leftCollapsed ? 'Expand left panel' : 'Collapse left panel'}
              aria-expanded={!layoutPrefs.leftCollapsed}
              onClick={() => updateLayoutPrefs({ leftCollapsed: !layoutPrefs.leftCollapsed })}
              style={{ padding: 2 }}
            >
              {layoutPrefs.leftCollapsed ? <ChevronRightIcon size={14} /> : <ChevronLeftIcon size={14} />}
            </button>
          </div>

          {!layoutPrefs.leftCollapsed ? <SceneOutliner /> : null}
        </aside>

        <div
          className="pane-resizer-v"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize left panel"
          aria-valuenow={layoutPrefs.leftPanelWidth}
          aria-valuemin={180}
          aria-valuemax={440}
          onPointerDown={(ev) => {
            const base = layoutPrefs.leftPanelWidth;
            startDrag(ev, (dx) => {
              updateLayoutPrefs({ leftCollapsed: false, leftPanelWidth: clamp(base + dx, 180, 440) });
            });
          }}
          onKeyDown={(ev) => {
            if (ev.key === 'ArrowRight') {
              ev.preventDefault();
              updateLayoutPrefs({
                leftCollapsed: false,
                leftPanelWidth: clamp(layoutPrefs.leftPanelWidth + 16, 180, 440),
              });
            } else if (ev.key === 'ArrowLeft') {
              ev.preventDefault();
              updateLayoutPrefs({
                leftCollapsed: false,
                leftPanelWidth: clamp(layoutPrefs.leftPanelWidth - 16, 180, 440),
              });
            }
          }}
        />

        <div className="studio-stage-col">
          <PreviewStage
            project={draftProject}
            previewResult={previewResult}
            previewRev={previewRev}
            bundleUrl={bundleUrl}
            playerScriptUrl={playerScriptUrl}
            videoUrl={videoUrl}
            previewing={busy.previewing}
            rendering={busy.rendering && renderingProjectId === draftProject.id}
            cancelling={busy.cancelling}
            renderProgress={renderProgress}
            onPreview={() => void previewProject()}
            onRender={() => void renderProject()}
            onCancelRender={() => void cancelRender()}
            playheadTime={playheadTime}
            onPlayheadChange={setPlayheadTime}
            onRegisterControls={registerStageControls}
            defaultSafeZones={settingsPrefs.showSafeZonesByDefault}
          />
        </div>

        <div
          className="pane-resizer-v"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize right panel"
          aria-valuenow={layoutPrefs.rightPanelWidth}
          aria-valuemin={220}
          aria-valuemax={460}
          onPointerDown={(ev) => {
            const base = layoutPrefs.rightPanelWidth;
            startDrag(ev, (dx) => {
              updateLayoutPrefs({
                rightCollapsed: false,
                rightPanelWidth: clamp(base - dx, 220, 460),
              });
            });
          }}
          onKeyDown={(ev) => {
            if (ev.key === 'ArrowLeft') {
              ev.preventDefault();
              updateLayoutPrefs({
                rightCollapsed: false,
                rightPanelWidth: clamp(layoutPrefs.rightPanelWidth + 16, 220, 460),
              });
            } else if (ev.key === 'ArrowRight') {
              ev.preventDefault();
              updateLayoutPrefs({
                rightCollapsed: false,
                rightPanelWidth: clamp(layoutPrefs.rightPanelWidth - 16, 220, 460),
              });
            }
          }}
        />

        <aside className="studio-pane" aria-label="Cue Inspector Panel" style={{ borderLeft: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: layoutPrefs.rightCollapsed ? 'center' : 'space-between',
              padding: '4px 8px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-header)',
            }}
          >
            <button
              type="button"
              className="btn-ghost"
              aria-label={layoutPrefs.rightCollapsed ? 'Expand right panel' : 'Collapse right panel'}
              aria-expanded={!layoutPrefs.rightCollapsed}
              onClick={() => updateLayoutPrefs({ rightCollapsed: !layoutPrefs.rightCollapsed })}
              style={{ padding: 2 }}
            >
              {layoutPrefs.rightCollapsed ? <ChevronLeftIcon size={14} /> : <ChevronRightIcon size={14} />}
            </button>
            {!layoutPrefs.rightCollapsed ? (
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Inspector</span>
            ) : null}
          </div>

          {!layoutPrefs.rightCollapsed ? (
            <CueInspector
              selectedKeyframeId={selectedKeyframeId}
              onSelectKeyframe={setSelectedKeyframeId}
            />
          ) : null}
        </aside>
      </div>

      <div
        className="pane-resizer-h"
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Resize timeline panel"
        aria-valuenow={layoutPrefs.timelineHeight}
        aria-valuemin={120}
        aria-valuemax={420}
        onPointerDown={(ev) => {
          const base = layoutPrefs.timelineHeight;
          startDrag(ev, (_dx, dy) => {
            updateLayoutPrefs({
              timelineCollapsed: false,
              timelineHeight: clamp(base - dy, 120, 420),
            });
          });
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            updateLayoutPrefs({
              timelineCollapsed: false,
              timelineHeight: clamp(layoutPrefs.timelineHeight + 16, 120, 420),
            });
          } else if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            updateLayoutPrefs({
              timelineCollapsed: false,
              timelineHeight: clamp(layoutPrefs.timelineHeight - 16, 120, 420),
            });
          }
        }}
      />

      <MultiTrackTimeline
        collapsed={layoutPrefs.timelineCollapsed}
        onToggleCollapse={() =>
          updateLayoutPrefs({ timelineCollapsed: !layoutPrefs.timelineCollapsed })
        }
        selectedKeyframeId={selectedKeyframeId}
        onSelectKeyframe={setSelectedKeyframeId}
      />
    </div>
  );
}
