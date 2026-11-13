import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useStudioContext } from '../../context/StudioContext';
import type { EngineId } from '../../types';
import { StudioDialog } from '../ui/StudioDialog';

const ASPECT_PRESETS = [
  { label: '16:9', width: 1920, height: 1080 },
  { label: '9:16', width: 1080, height: 1920 },
  { label: '1:1', width: 1080, height: 1080 },
  { label: '4:3', width: 1440, height: 1080 },
] as const;

export function NewProjectDialog() {
  const {
    newProjectDialogOpen,
    setNewProjectDialogOpen,
    createAndOpenProject,
    settingsPrefs,
    busy,
    scheduleBlurAnnouncement,
    clearBlurAnnouncement,
  } = useStudioContext();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspectIndex, setAspectIndex] = useState(0);
  const [fps, setFps] = useState<24 | 30 | 60>(settingsPrefs.defaultFps);
  const [engine, setEngine] = useState<EngineId>(settingsPrefs.defaultEngine);
  const [nameTouched, setNameTouched] = useState(false);
  const [promptTouched, setPromptTouched] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  const nameId = useId();
  const nameErrId = useId();
  const promptId = useId();
  const promptErrId = useId();
  const aspectLabelId = useId();
  const fpsLabelId = useId();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!newProjectDialogOpen) return;
    const matchedAspect = ASPECT_PRESETS.findIndex(
      (p) => p.width === settingsPrefs.defaultWidth && p.height === settingsPrefs.defaultHeight
    );
    setAspectIndex(matchedAspect >= 0 ? matchedAspect : 0);
    setFps(settingsPrefs.defaultFps);
    setEngine(settingsPrefs.defaultEngine);
  }, [
    newProjectDialogOpen,
    settingsPrefs.defaultWidth,
    settingsPrefs.defaultHeight,
    settingsPrefs.defaultFps,
    settingsPrefs.defaultEngine,
  ]);

  const closeAndReset = () => {
    setNewProjectDialogOpen(false);
    setName('');
    setPrompt('');
    setNameTouched(false);
    setPromptTouched(false);
    setNameError(null);
    setPromptError(null);
  };

  const handleSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
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
        preferredEngine: engine,
      },
      'studio'
    );
    if (created) {
      setName('');
      setPrompt('');
      setNameTouched(false);
      setPromptTouched(false);
      closeAndReset();
    }
  };

  return (
    <StudioDialog
      open={newProjectDialogOpen}
      title="New Project"
      onClose={closeAndReset}
      preventEscapeWhenDirty={Boolean(name.trim() || prompt.trim())}
    >
      <form noValidate className="dialog-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor={nameId}>
            Project Name <span className="required-mark">*</span>
          </label>
          <input
            ref={nameRef}
            id={nameId}
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
            Animation Prompt <span className="required-mark">*</span>
          </label>
          <textarea
            ref={promptRef}
            id={promptId}
            placeholder="A curious squirrel gazing at a streaking golden comet over dusk rooftops..."
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
                scheduleBlurAnnouncement('Animation Prompt', msg);
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
          <span id={aspectLabelId}>Aspect Ratio</span>
          <div className="segmented-row" role="group" aria-labelledby={aspectLabelId}>
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

        <div className="dialog-two-col">
          <div className="field">
            <span id={fpsLabelId}>FPS</span>
            <div className="segmented-row" role="group" aria-labelledby={fpsLabelId}>
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
            <label htmlFor="modal-engine-select">Preferred Engine</label>
            <select
              id="modal-engine-select"
              value={engine}
              onChange={(ev) => setEngine(ev.target.value as EngineId)}
            >
              <option value="givemotion">GiveMotion (Native Ready)</option>
              <option value="remotion">Remotion</option>
              <option value="stretchystudio">StretchyStudio</option>
              <option value="composite">Composite</option>
            </select>
          </div>
        </div>

        <div className="dialog-footer-actions">
          <button type="button" onClick={closeAndReset}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy.creating || busy.rendering}
          >
            {busy.creating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </StudioDialog>
  );
}
