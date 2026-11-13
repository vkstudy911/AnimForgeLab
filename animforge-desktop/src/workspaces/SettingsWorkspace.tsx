import { useEffect, useId, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MoonIcon, SettingsIcon, SunIcon } from '../components/ui/Icons';
import { StatusBadge } from '../components/ui/StatusBadge';
import { StudioButton } from '../components/ui/StudioButton';
import { StudioNotification } from '../components/ui/StudioNotification';
import { useStudioContext } from '../context/StudioContext';
import type { ConfigResult, EngineId, StudioDiskConfig, ThemePreference } from '../types';

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  {
    value: 'dark',
    label: 'Dark (Charcoal + Amber)',
    description: 'Studio dark matte surfaces with amber focus highlights.',
  },
  {
    value: 'light',
    label: 'Light (Warm Paper)',
    description: 'High-contrast warm paper palette for bright rooms.',
  },
  {
    value: 'system',
    label: 'System (Follow OS)',
    description: 'Automatically matches your macOS or Linux appearance.',
  },
];

const ASPECT_PRESETS: Array<{
  id: string;
  label: string;
  width: number;
  height: number;
}> = [
  { id: '16:9', label: '16:9 (1920×1080)', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16 (1080×1920)', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1 (1080×1080)', width: 1080, height: 1080 },
  { id: '4:3', label: '4:3 (1440×1080)', width: 1440, height: 1080 },
];

const FPS_OPTIONS: Array<24 | 30 | 60> = [24, 30, 60];

const ENGINE_OPTIONS: Array<{
  id: EngineId;
  label: string;
  status: 'active' | 'preview' | 'unavailable';
  detail: string;
}> = [
  {
    id: 'givemotion',
    label: 'GiveMotion',
    status: 'active',
    detail: 'Primary local HTML5/WebGL bundle + headless Chrome + FFmpeg MP4 pipeline.',
  },
  {
    id: 'remotion',
    label: 'Remotion',
    status: 'preview',
    detail: 'External React composition CLI adapter (requires Remotion workspace setup).',
  },
  {
    id: 'stretchystudio',
    label: 'StretchyStudio',
    status: 'preview',
    detail: 'Exports `.stretch` rig data as `.spine.json` for external player runtimes.',
  },
  {
    id: 'composite',
    label: 'Composite',
    status: 'unavailable',
    detail: 'Multi-engine scene compositor (not yet implemented in worker).',
  },
];

export interface ExportDefaultsPrefs {
  outputFormat: 'mp4' | 'webm' | 'gif' | 'png_sequence';
  quality: 'high' | 'medium' | 'draft';
  exportFolder: string;
}

const DEFAULT_EXPORT_PREFS: ExportDefaultsPrefs = {
  outputFormat: 'mp4',
  quality: 'high',
  exportFolder: 'exports',
};

const EXPORT_STORAGE_KEY = 'animforge:export_defaults';

function readExportPrefs(): ExportDefaultsPrefs {
  try {
    const raw = localStorage.getItem(EXPORT_STORAGE_KEY);
    if (!raw) return DEFAULT_EXPORT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ExportDefaultsPrefs>;
    return {
      outputFormat: parsed.outputFormat ?? DEFAULT_EXPORT_PREFS.outputFormat,
      quality: parsed.quality ?? DEFAULT_EXPORT_PREFS.quality,
      exportFolder: parsed.exportFolder ?? DEFAULT_EXPORT_PREFS.exportFolder,
    };
  } catch {
    return DEFAULT_EXPORT_PREFS;
  }
}

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'Space', action: 'Play / Pause stage preview (when outside text inputs)' },
  { keys: 'ArrowLeft / ArrowRight', action: 'Step playhead backward or forward by 1 frame' },
  { keys: 'Cmd/Ctrl + S', action: 'Save active project draft' },
  { keys: 'Cmd/Ctrl + Z', action: 'Undo last draft edit' },
  { keys: 'Cmd/Ctrl + Shift + Z', action: 'Redo draft edit' },
  { keys: 'Cmd/Ctrl + K', action: 'Open quick command palette' },
  { keys: 'Cmd/Ctrl + N', action: 'Create new project dialog' },
  { keys: 'Alt + 1..0', action: 'Switch between studio workspaces' },
  { keys: '[', action: 'Collapse or expand left studio panel' },
  { keys: ']', action: 'Collapse or expand right inspector panel' },
];

export function SettingsWorkspace() {
  const {
    themePreference,
    resolvedTheme,
    setThemePreference,
    settingsPrefs,
    updateSettingsPrefs,
    resetSettingsDefaults,
  } = useStudioContext();

  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const [exportPrefs, setExportPrefs] = useState<ExportDefaultsPrefs>(readExportPrefs);
  const [diskConfig, setDiskConfig] = useState<ConfigResult | null>(null);
  const [diskSaving, setDiskSaving] = useState(false);

  const headingId = useId();
  const reducedMotionId = useId();
  const safeZonesId = useId();
  const exportFolderId = useId();

  // Load disk config status on mount
  useEffect(() => {
    let cancelled = false;
    async function loadDiskConfig() {
      try {
        const res = await invoke<ConfigResult>('config_get');
        if (!cancelled && res && typeof res === 'object') {
          setDiskConfig(res);
        }
      } catch {
        // Fallback when config_get is not mocked or unavailable
      }
    }
    void loadDiskConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdateExportPrefs = (patch: Partial<ExportDefaultsPrefs>) => {
    const next = { ...exportPrefs, ...patch };
    setExportPrefs(next);
    try {
      localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore local storage error
    }
    setNotification({
      type: 'success',
      title: 'Settings Saved',
      message: 'Export defaults updated successfully.',
    });
  };

  const handleSaveToDisk = async () => {
    setDiskSaving(true);
    try {
      const configPayload: StudioDiskConfig = {
        defaultWidth: settingsPrefs.defaultWidth,
        defaultHeight: settingsPrefs.defaultHeight,
        defaultFps: settingsPrefs.defaultFps,
        defaultEngine: settingsPrefs.defaultEngine,
        density: settingsPrefs.density,
        reducedEffects: settingsPrefs.reducedEffects,
        showSafeZonesByDefault: settingsPrefs.showSafeZonesByDefault,
      };
      const res = await invoke<ConfigResult>('config_save', { config: configPayload });
      if (res) {
        setDiskConfig(res);
      }
      setNotification({
        type: 'success',
        title: 'Settings Saved',
        message: `Studio configuration persisted to ${res?.configPath ?? 'animforge.config.json'}.`,
      });
    } catch (err: unknown) {
      setNotification({
        type: 'error',
        title: 'Save Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDiskSaving(false);
    }
  };

  const handleResetDefaults = () => {
    resetSettingsDefaults();
    setExportPrefs(DEFAULT_EXPORT_PREFS);
    try {
      localStorage.removeItem(EXPORT_STORAGE_KEY);
    } catch {
      // Ignore
    }
    setNotification({
      type: 'info',
      title: 'Settings Saved',
      message: 'Configuration reset to studio factory defaults.',
    });
  };

  return (
    <section className="page-container" aria-labelledby={headingId}>
      {/* Notification Banner */}
      {notification ? (
        <div style={{ marginBottom: 12 }}>
          <StudioNotification
            type={notification.type}
            title={notification.title}
            message={notification.message}
            onDismiss={() => setNotification(null)}
          />
        </div>
      ) : null}

      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SettingsIcon size={18} />
          <h2 id={headingId}>Settings</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="field-hint">
            Settings persist in <code className="mono">animforge.config.json</code> and{' '}
            <code>localStorage</code>.
          </span>
          <StudioButton
            variant="secondary"
            size="sm"
            onClick={handleSaveToDisk}
            loading={diskSaving}
          >
            Save to Disk
          </StudioButton>
          <StudioButton variant="secondary" size="sm" onClick={handleResetDefaults}>
            Reset to Defaults
          </StudioButton>
        </div>
      </div>

      <div className="grid-2">
        {/* Appearance */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Appearance</h3>
            <span className="badge badge-neutral" style={{ display: 'inline-flex', gap: 4 }}>
              {resolvedTheme === 'dark' ? <MoonIcon size={12} /> : <SunIcon size={12} />}
              Resolved: {resolvedTheme}
            </span>
          </div>

          <div
            role="group"
            aria-label="Theme Preference"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {THEME_OPTIONS.map((opt) => {
              const selected = themePreference === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setThemePreference(opt.value);
                    setNotification({
                      type: 'success',
                      title: 'Settings Saved',
                      message: `Appearance set to ${opt.label}.`,
                    });
                  }}
                  style={{
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: '9px 12px',
                    borderColor: selected ? 'var(--accent-amber)' : 'var(--border-subtle)',
                    background: selected ? 'var(--accent-amber-soft)' : 'var(--bg-surface-elevated)',
                  }}
                >
                  <strong style={{ fontSize: 'var(--text-sm)' }}>{opt.label}</strong>
                  <span className="field-hint">{opt.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Workspace Preferences & Density */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Workspace Preferences</h3>

          <div className="field">
            <span>Interface Density</span>
            <div className="segmented-row" role="group" aria-label="Interface Density">
              <button
                type="button"
                aria-pressed={settingsPrefs.density === 'comfortable'}
                onClick={() => {
                  updateSettingsPrefs({ density: 'comfortable' });
                  setNotification({
                    type: 'success',
                    title: 'Settings Saved',
                    message: 'Interface density set to Comfortable.',
                  });
                }}
              >
                Comfortable
              </button>
              <button
                type="button"
                aria-pressed={settingsPrefs.density === 'compact'}
                onClick={() => {
                  updateSettingsPrefs({ density: 'compact' });
                  setNotification({
                    type: 'success',
                    title: 'Settings Saved',
                    message: 'Interface density set to Compact.',
                  });
                }}
              >
                Compact
              </button>
            </div>
          </div>

          <label
            htmlFor={reducedMotionId}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '8px 10px',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            <span>
              <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                Reduced Motion &amp; Effects
              </strong>
              <span className="field-hint">Disables UI transitions and decorative animations.</span>
            </span>
            <input
              id={reducedMotionId}
              type="checkbox"
              checked={settingsPrefs.reducedEffects}
              onChange={(ev) => {
                updateSettingsPrefs({ reducedEffects: ev.target.checked });
                setNotification({
                  type: 'success',
                  title: 'Settings Saved',
                  message: `Reduced effects ${ev.target.checked ? 'enabled' : 'disabled'}.`,
                });
              }}
            />
          </label>

          <label
            htmlFor={safeZonesId}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '8px 10px',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            <span>
              <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                Show Stage Safe-Zones by Default
              </strong>
              <span className="field-hint">
                Displays title-safe guide overlays on the Animation Studio preview canvas.
              </span>
            </span>
            <input
              id={safeZonesId}
              type="checkbox"
              checked={settingsPrefs.showSafeZonesByDefault}
              onChange={(ev) => {
                updateSettingsPrefs({ showSafeZonesByDefault: ev.target.checked });
                setNotification({
                  type: 'success',
                  title: 'Settings Saved',
                  message: `Safe-zone guides ${ev.target.checked ? 'enabled' : 'disabled'}.`,
                });
              }}
            />
          </label>
        </section>

        {/* Animation Defaults */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Animation Defaults</h3>

          <div className="field">
            <span>Default Aspect Ratio</span>
            <div className="segmented-row" role="group" aria-label="Default Aspect Ratio">
              {ASPECT_PRESETS.map((preset) => {
                const selected =
                  settingsPrefs.defaultWidth === preset.width &&
                  settingsPrefs.defaultHeight === preset.height;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      updateSettingsPrefs({
                        defaultWidth: preset.width,
                        defaultHeight: preset.height,
                      });
                      setNotification({
                        type: 'success',
                        title: 'Settings Saved',
                        message: `Default resolution set to ${preset.id} (${preset.width}×${preset.height}).`,
                      });
                    }}
                  >
                    {preset.id}
                  </button>
                );
              })}
            </div>
            <span className="mono field-hint">
              Active resolution: {settingsPrefs.defaultWidth} × {settingsPrefs.defaultHeight}
            </span>
          </div>

          <div className="field">
            <span>Default Frame Rate (FPS)</span>
            <div className="segmented-row" role="group" aria-label="Default FPS">
              {FPS_OPTIONS.map((fps) => (
                <button
                  key={fps}
                  type="button"
                  aria-pressed={settingsPrefs.defaultFps === fps}
                  onClick={() => {
                    updateSettingsPrefs({ defaultFps: fps });
                    setNotification({
                      type: 'success',
                      title: 'Settings Saved',
                      message: `Default frame rate set to ${fps} fps.`,
                    });
                  }}
                >
                  {fps} fps
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Preferred Render Engine</span>
            <div
              role="group"
              aria-label="Preferred Engine"
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {ENGINE_OPTIONS.map((eng) => {
                const selected = settingsPrefs.defaultEngine === eng.id;
                return (
                  <button
                    key={eng.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      updateSettingsPrefs({ defaultEngine: eng.id });
                      setNotification({
                        type: 'success',
                        title: 'Settings Saved',
                        message: `Preferred engine set to ${eng.label}.`,
                      });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderColor: selected ? 'var(--accent-amber)' : 'var(--border-subtle)',
                      background: selected
                        ? 'var(--accent-amber-soft)'
                        : 'var(--bg-surface-elevated)',
                    }}
                  >
                    <span>
                      <strong style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                        {eng.label}
                      </strong>
                      <span className="field-hint">{eng.detail}</span>
                    </span>
                    <StatusBadge
                      tone={
                        eng.status === 'active'
                          ? 'pass'
                          : eng.status === 'unavailable'
                            ? 'neutral'
                            : 'planned'
                      }
                    >
                      {eng.status === 'active'
                        ? 'Active'
                        : eng.status === 'unavailable'
                          ? 'Unavailable'
                          : 'Preview'}
                    </StatusBadge>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Export Defaults */}
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Export Defaults</h3>

          <div className="field">
            <span>Default Output Format</span>
            <div className="segmented-row" role="group" aria-label="Default Output Format">
              {(['mp4', 'webm', 'gif', 'png_sequence'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  aria-pressed={exportPrefs.outputFormat === fmt}
                  onClick={() => handleUpdateExportPrefs({ outputFormat: fmt })}
                >
                  {fmt === 'png_sequence' ? 'PNG Seq' : fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Render Quality</span>
            <div className="segmented-row" role="group" aria-label="Render Quality">
              {(['high', 'medium', 'draft'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={exportPrefs.quality === q}
                  onClick={() => handleUpdateExportPrefs({ quality: q })}
                >
                  {q === 'high' ? 'High (CRF 18)' : q === 'medium' ? 'Medium (CRF 23)' : 'Draft (CRF 28)'}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor={exportFolderId}>Export Destination Subfolder</label>
            <input
              id={exportFolderId}
              type="text"
              value={exportPrefs.exportFolder}
              onChange={(ev) => handleUpdateExportPrefs({ exportFolder: ev.target.value })}
              placeholder="exports"
            />
            <span className="field-hint">Relative folder inside project directory for final render outputs.</span>
          </div>

          {/* Storage & Disk Persistence Card */}
          <div
            style={{
              padding: 10,
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Disk Persistence</span>
              <StatusBadge tone={diskConfig?.exists !== false ? 'pass' : 'warn'}>
                {diskConfig?.exists !== false ? 'Config Active' : 'Unsaved Draft'}
              </StatusBadge>
            </div>
            <div className="mono field-hint" style={{ fontSize: 'var(--text-xs)' }}>
              Path: {diskConfig?.configPath ?? 'animforge.config.json'}
            </div>
          </div>
        </section>

        {/* Keyboard Shortcuts + App Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Keyboard Shortcuts</h3>
            <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SHORTCUTS.map((item) => (
                <li
                  key={item.keys}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <span className="field-hint" style={{ color: 'var(--text-primary)' }}>
                    {item.action}
                  </span>
                  <kbd
                    className="mono"
                    style={{
                      padding: '2px 6px',
                      fontSize: 'var(--text-xs)',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-strong)',
                      background: 'var(--bg-surface)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Application Info</h3>
            <div className="project-info-row">
              <span>Version</span>
              <span className="mono">AnimForge Studio v0.1.0</span>
            </div>
            <div className="project-info-row">
              <span>Desktop Runtime</span>
              <span className="mono">Tauri 2 + React 18</span>
            </div>
            <div className="project-info-row">
              <span>Storage Scope</span>
              <span className="mono">animforge.config.json + localStorage</span>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
