import {
  Asset,
  CameraMovement,
  Character,
  CharacterAction,
  ProjectConfig,
  Scene,
} from '../schemas/index.js';
import { assertSafeId, escapeHtml } from '../utils/paths.js';

export interface CompileProjectInput {
  projectId: string;
  config: ProjectConfig;
  scenes: Scene[];
  characters: Character[];
  assets?: Asset[];
}

const IMAGE_ASSET_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);
const AUDIO_ASSET_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

export function toSafeProjectAssetRelPath(
  uri: string | undefined,
  allowedExts: Set<string>,
  projectId?: string
): string | null {
  if (!uri || typeof uri !== 'string') return null;
  if (uri.includes('\0') || uri.includes('\\') || /%(?:2e|2f|5c|25)/i.test(uri)) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) || uri.startsWith('//')) return null;

  let normalized = uri.split(/[?#]/)[0].trim();
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  if (projectId && normalized.startsWith(`projects/${projectId}/assets/`)) {
    normalized = normalized.slice(`projects/${projectId}/`.length);
  } else if (normalized.startsWith('/')) {
    return null;
  }

  const segments = normalized.split('/');
  if (
    segments.length < 2 ||
    segments[0] !== 'assets' ||
    segments.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))
  ) {
    return null;
  }

  const file = segments[segments.length - 1];
  const dotIdx = file.lastIndexOf('.');
  const ext = dotIdx >= 0 ? file.slice(dotIdx).toLowerCase() : '';
  if (!allowedExts.has(ext)) return null;

  return segments.join('/');
}

const DEFAULT_PALETTE = ['#22c55e', '#16a34a', '#86efac', '#15803d', '#ffffff'] as const;
const SAFE_HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const SAFE_ACTIONS = new Set(['idle', 'walk', 'run', 'wave', 'smile', 'blink', 'look_around']);

function safeColor(candidate: string | undefined, fallback: string): string {
  return candidate && SAFE_HEX_COLOR.test(candidate) ? candidate : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? round2(value) : fallback;
}

function safeNonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? round2(value) : fallback;
}

export function mapCameraAttribute(move: CameraMovement | undefined): string | null {
  if (!move || move.type === 'static') return null;

  switch (move.type) {
    case 'zoom': {
      const start = Number.isFinite(move.startZoom) ? move.startZoom : 1;
      const end = Number.isFinite(move.endZoom) ? move.endZoom : 1;
      if (start > end + 0.01) {
        const pullScale = round2(Math.min(1.35, Math.max(1.02, start)));
        return `pull ${pullScale}`;
      }
      const target = end > 1.01 ? end : 1.15;
      const pushScale = round2(Math.min(1.35, Math.max(1.02, target)));
      return `push ${pushScale}`;
    }
    case 'push':
    case 'dolly': {
      const target = move.endZoom > 1.01 ? move.endZoom : 1.15;
      const scale = round2(Math.min(1.35, Math.max(1.02, target)));
      return `push ${scale}`;
    }
    case 'pull': {
      const start = move.startZoom > 1.01 ? move.startZoom : 1.15;
      const scale = round2(Math.min(1.35, Math.max(1.02, start)));
      return `pull ${scale}`;
    }
    case 'pan': {
      const dx = (Number.isFinite(move.endX) ? move.endX : 0) - (Number.isFinite(move.startX) ? move.startX : 0);
      const dy = (Number.isFinite(move.endY) ? move.endY : 0) - (Number.isFinite(move.startY) ? move.startY : 0);
      const dir =
        Math.abs(dx) >= Math.abs(dy)
          ? dx >= 0
            ? 'move-right'
            : 'move-left'
          : dy >= 0
            ? 'move-down'
            : 'move-up';
      const dist = Math.round(Math.min(220, Math.max(20, Math.max(Math.abs(dx), Math.abs(dy)) || 60)));
      return `${dir} ${dist}`;
    }
    case 'shake':
      return 'shake 12';
    default:
      return null;
  }
}

export function mapTransitionAttribute(transition: Scene['transition'] | undefined): string | null {
  if (!transition || transition.type === 'none') return null;
  const dur = safePositive(transition.duration, 0.5);
  switch (transition.type) {
    case 'fade':
    case 'dissolve':
      return `fade ${dur}`;
    case 'wipe':
      return `wipe-left ${dur}`;
    case 'slide':
      return `slide-left ${dur}`;
    default:
      return null;
  }
}

function buildActionStyles(actions: CharacterAction[]): {
  classes: string[];
  cssVars: string;
} {
  if (actions.length === 0) {
    return { classes: ['af-actor', 'af-actor--idle'], cssVars: '' };
  }

  const uniqueActions = new Set<string>();
  const vars: string[] = [];

  for (const action of actions) {
    if (!SAFE_ACTIONS.has(action.name)) continue;
    uniqueActions.add(`af-actor--${action.name}`);
    const delay = safeNonNegative(action.startTime, 0);
    const dur = safePositive(action.duration, 1);
    vars.push(`--af-${action.name}-delay:${delay}s`, `--af-${action.name}-dur:${dur}s`);

    // Loop cycles are fixed by the animation itself, so the action's duration
    // decides how many cycles play. This is what lets a walk or a wave stop
    // when its timeline entry ends instead of running for the whole scene.
    const cycle = action.name === 'walk' ? 0.55 : action.name === 'run' ? 0.34 : action.name === 'wave' ? 0.75 : action.name === 'blink' ? 2.8 : 0;
    if (cycle > 0) {
      const requested =
        action.name === 'wave' && typeof action.parameters?.cycles === 'number' && action.parameters.cycles > 0
          ? action.parameters.cycles
          : Math.max(1, Math.round(dur / cycle));
      vars.push(`--af-${action.name}-count:${Math.round(requested)}`);
    }

    // `parameters.bend` is an opt-in body bow (used for "bends down to pick it
    // up"): the same editable action carries it, so no fake rig is introduced.
    if (action.parameters && Number(action.parameters.bend) > 0) {
      uniqueActions.add('af-actor--bend');
      const bendDur = safePositive(Number(action.parameters.bendDuration) || 1.6, 1.6);
      vars.push(`--af-bend-delay:${delay}s`, `--af-bend-dur:${bendDur}s`);
    }

    // `parameters.hold` cups both hands in front of the chest (holding the
    // star). It uses the same arm hooks as the built-in actions.
    if (action.parameters && Number(action.parameters.hold) > 0) {
      uniqueActions.add('af-actor--hold');
      const holdDur = safePositive(Number(action.parameters.holdDuration) || 1, 1);
      vars.push(`--af-hold-delay:${delay}s`, `--af-hold-dur:${holdDur}s`);
    }
  }

  if (uniqueActions.size === 0) {
    uniqueActions.add('af-actor--idle');
  }

  return {
    classes: ['af-actor', ...uniqueActions],
    cssVars: vars.join(';'),
  };
}

/** Shifts a #rrggbb colour darker (amt < 0) or lighter (amt > 0) by amt in [0,1]. */
function shadeHex(hex: string, amt: number): string {
  if (!SAFE_HEX_COLOR.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  const f = (v: number) => (amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const r = ch(f((n >> 16) & 0xff));
  const g = ch(f((n >> 8) & 0xff));
  const b = ch(f(n & 0xff));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * 2.5D humanoid puppet renderer, used when a character declares a `hair` part
 * (a layer the blob renderer has no equivalent for). Draws a cartoon kid —
 * hair cap, face, hoodie torso, sleeves with hands, jeans legs with sneakers —
 * parameterised by the same 5-slot colour palette, and wired to the exact same
 * animation class hooks (af-body-root, af-head, af-arm-l/r, af-leg-l/r,
 * af-eye, af-mouth) so every built-in action drives it unchanged.
 */
function buildHumanoidSvg(
  primary: string,
  secondary: string,
  highlight: string,
  shadow: string,
  eyeSclera: string,
  classes: string,
  cssVars: string,
  hasSmile: boolean,
  offsetX: number
): string {
  const hoodieDark = shadeHex(primary, -0.18);
  const hoodieLine = shadeHex(primary, -0.3);
  const jeansLight = shadeHex(secondary, 0.28);
  const skinDark = shadeHex(highlight, -0.22);
  const mouthStroke = shadeHex(shadow, 0.15);
  // scale with the frame (the shared .af-actor rule caps at 360px, which reads
  // tiny at 1080p+); scoped to the humanoid renderer only
  const sizeStyle = `width:min(30vw, 620px)${cssVars ? `;${cssVars}` : ''}`;
  return `<svg class="${classes}" style="${sizeStyle}" viewBox="0 0 360 300" width="360" height="300" role="img" aria-hidden="true">
  <g transform="translate(${offsetX}, 0)">
    <ellipse cx="170" cy="272" rx="52" ry="9" fill="rgba(2, 6, 23, 0.45)"/>
    <g class="af-pose-root">
    <g class="af-body-root">
      <g class="af-part af-leg-l" data-part="leg_left">
        <rect x="134" y="206" width="28" height="46" rx="12" fill="${secondary}"/>
        <rect x="134" y="244" width="28" height="8" rx="3" fill="${jeansLight}"/>
        <rect x="127" y="252" width="38" height="14" rx="7" fill="${primary}"/>
        <rect x="127" y="263" width="38" height="5" rx="2.5" fill="${eyeSclera}"/>
      </g>
      <g class="af-part af-leg-r" data-part="leg_right">
        <rect x="178" y="206" width="28" height="46" rx="12" fill="${secondary}"/>
        <rect x="178" y="244" width="28" height="8" rx="3" fill="${jeansLight}"/>
        <rect x="175" y="252" width="38" height="14" rx="7" fill="${primary}"/>
        <rect x="175" y="263" width="38" height="5" rx="2.5" fill="${eyeSclera}"/>
      </g>
      <g class="af-part af-arm-l" data-part="arm_left">
        <rect x="84" y="148" width="26" height="54" rx="12" fill="${primary}"/>
        <circle cx="97" cy="204" r="9" fill="${highlight}"/>
      </g>
      <g class="af-part af-torso" data-part="torso">
        <rect x="110" y="140" width="120" height="78" rx="28" fill="${primary}"/>
        <path d="M 138 190 Q 170 206 202 190 L 202 202 Q 170 212 138 202 Z" fill="${hoodieDark}"/>
        <line x1="161" y1="146" x2="159" y2="160" stroke="${eyeSclera}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="179" y1="146" x2="181" y2="160" stroke="${eyeSclera}" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="159" cy="162" r="2" fill="${eyeSclera}"/>
        <circle cx="181" cy="162" r="2" fill="${eyeSclera}"/>
        <path d="M 130 142 Q 170 128 210 142" fill="none" stroke="${hoodieLine}" stroke-width="3" stroke-linecap="round"/>
      </g>
      <g class="af-part af-arm-r" data-part="arm_right">
        <rect x="220" y="148" width="26" height="54" rx="12" fill="${primary}"/>
        <circle cx="233" cy="204" r="9" fill="${highlight}"/>
      </g>
      <g class="af-part af-head" data-part="head">
        <rect x="162" y="124" width="16" height="16" rx="5" fill="${highlight}"/>
        <ellipse cx="170" cy="132" rx="40" ry="12" fill="${hoodieDark}"/>
        <circle cx="124" cy="96" r="7" fill="${highlight}"/>
        <circle cx="216" cy="96" r="7" fill="${highlight}"/>
        <ellipse cx="170" cy="94" rx="46" ry="43" fill="${highlight}"/>
        <g class="af-part af-hair" data-part="hair">
          <circle cx="140" cy="66" r="23" fill="${shadow}"/>
          <circle cx="170" cy="56" r="27" fill="${shadow}"/>
          <circle cx="200" cy="66" r="23" fill="${shadow}"/>
          <circle cx="122" cy="80" r="13" fill="${shadow}"/>
          <circle cx="218" cy="80" r="13" fill="${shadow}"/>
          <circle cx="146" cy="70" r="13" fill="${shadow}"/>
          <circle cx="194" cy="70" r="13" fill="${shadow}"/>
        </g>
        <path d="M 137 79 Q 147 73 157 79" fill="none" stroke="${shadow}" stroke-width="4" stroke-linecap="round"/>
        <path d="M 183 79 Q 193 73 203 79" fill="none" stroke="${shadow}" stroke-width="4" stroke-linecap="round"/>
        <g class="af-part af-eye af-eye-l" data-part="eye_left">
          <ellipse cx="148" cy="94" rx="12" ry="14" fill="${eyeSclera}"/>
          <circle cx="149" cy="96" r="6.5" fill="#2b1a10"/>
          <circle cx="151.5" cy="92" r="2.4" fill="#ffffff"/>
        </g>
        <g class="af-part af-eye af-eye-r" data-part="eye_right">
          <ellipse cx="192" cy="94" rx="12" ry="14" fill="${eyeSclera}"/>
          <circle cx="191" cy="96" r="6.5" fill="#2b1a10"/>
          <circle cx="193.5" cy="92" r="2.4" fill="#ffffff"/>
        </g>
        <path d="M 170 102 Q 174 108 169 110" fill="none" stroke="${skinDark}" stroke-width="3" stroke-linecap="round"/>
        <path class="af-part af-mouth" data-part="mouth" d="${hasSmile ? 'M 152 114 Q 170 132 188 114' : 'M 157 116 Q 170 123 183 116'}" fill="none" stroke="${mouthStroke}" stroke-width="4.5" stroke-linecap="round"/>
      </g>
    </g>
    </g>
  </g>
</svg>`;
}

export function buildCharacterSvg(
  character: Character | undefined,
  actions: CharacterAction[] = [],
  hasPortalProp = false,
  gradientSuffix = '0'
): string {
  const palette = character?.colorPalette ?? [];
  const primary = safeColor(palette[0], DEFAULT_PALETTE[0]);
  const secondary = safeColor(palette[1], DEFAULT_PALETTE[1]);
  const highlight = safeColor(palette[2], DEFAULT_PALETTE[2]);
  const shadow = safeColor(palette[3], DEFAULT_PALETTE[3]);
  const eyeSclera = safeColor(palette[4], DEFAULT_PALETTE[4]);

  const { classes, cssVars } = buildActionStyles(actions);
  const classList = classes.join(' ');
  const styleAttr = cssVars ? ` style="${cssVars}"` : '';
  const hasSmile = actions.some((a) => {
    if (a.name === 'smile') return true;
    const expr = a.parameters?.expression;
    return typeof expr === 'string' && expr.toLowerCase() === 'smile';
  });
  const isHumanoid = (character?.parts ?? []).some((p) => p.id === 'hair');
  if (isHumanoid) {
    return buildHumanoidSvg(
      primary,
      secondary,
      highlight,
      shadow,
      eyeSclera,
      classList,
      cssVars,
      hasSmile,
      hasPortalProp ? -36 : 0
    );
  }
  const mouthPath = hasSmile
    ? 'M 152 135 Q 170 154 188 135'
    : 'M 156 138 Q 170 146 184 138';

  const gradId = `af-door-glow-${assertSafeId(gradientSuffix, 'scene')}`;
  const portalMarkup = hasPortalProp
    ? `<g class="af-prop-door" aria-hidden="true">
        <defs>
          <radialGradient id="${gradId}" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stop-color="#fef08a" stop-opacity="0.95"/>
            <stop offset="55%" stop-color="#f59e0b" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <ellipse cx="292" cy="180" rx="68" ry="96" fill="url(#${gradId})"/>
        <rect x="256" y="102" width="72" height="148" rx="36" fill="#fde047" stroke="#f59e0b" stroke-width="5"/>
        <rect x="266" y="114" width="52" height="128" rx="26" fill="#fef9c3"/>
      </g>`
    : '';

  const offsetX = hasPortalProp ? -36 : 0;

  return `<svg class="${classList}"${styleAttr} viewBox="0 0 360 300" width="360" height="300" role="img" aria-hidden="true">
  ${portalMarkup}
  <g transform="translate(${offsetX}, 0)">
    <ellipse cx="170" cy="268" rx="58" ry="12" fill="rgba(2, 6, 23, 0.55)"/>
    <g class="af-body-root">
      <g class="af-part af-leg-l" data-part="leg_left">
        <rect x="136" y="212" width="24" height="50" rx="12" fill="${shadow}"/>
        <ellipse cx="146" cy="260" rx="16" ry="9" fill="${secondary}"/>
      </g>
      <g class="af-part af-leg-r" data-part="leg_right">
        <rect x="180" y="212" width="24" height="50" rx="12" fill="${shadow}"/>
        <ellipse cx="194" cy="260" rx="16" ry="9" fill="${secondary}"/>
      </g>
      <g class="af-part af-arm-l" data-part="arm_left">
        <rect x="92" y="156" width="24" height="58" rx="12" fill="${secondary}"/>
        <circle cx="104" cy="212" r="11" fill="${highlight}"/>
      </g>
      <g class="af-part af-torso" data-part="torso">
        <rect x="118" y="144" width="104" height="82" rx="42" fill="${primary}"/>
        <ellipse cx="170" cy="188" rx="30" ry="26" fill="${highlight}" opacity="0.45"/>
      </g>
      <g class="af-part af-head" data-part="head">
        <line x1="170" y1="62" x2="170" y2="38" stroke="${secondary}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="170" cy="34" r="9" fill="${highlight}"/>
        <ellipse cx="170" cy="112" rx="58" ry="50" fill="${primary}"/>
        <ellipse cx="148" cy="96" rx="18" ry="10" fill="${highlight}" opacity="0.35"/>
        <g class="af-part af-eye af-eye-l" data-part="eye_left">
          <ellipse cx="148" cy="108" rx="13" ry="15" fill="${eyeSclera}"/>
          <circle cx="150" cy="109" r="7" fill="#0f172a"/>
          <circle cx="153" cy="105" r="2.8" fill="#ffffff"/>
        </g>
        <g class="af-part af-eye af-eye-r" data-part="eye_right">
          <ellipse cx="192" cy="108" rx="13" ry="15" fill="${eyeSclera}"/>
          <circle cx="190" cy="109" r="7" fill="#0f172a"/>
          <circle cx="193" cy="105" r="2.8" fill="#ffffff"/>
        </g>
        <path class="af-part af-mouth" data-part="mouth" d="${mouthPath}" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g class="af-part af-arm-r" data-part="arm_right">
        <rect x="224" y="156" width="24" height="58" rx="12" fill="${secondary}"/>
        <circle cx="236" cy="212" r="11" fill="${highlight}"/>
      </g>
    </g>
  </g>
</svg>`;
}

const COMPILER_STYLES = `
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #0b0f17;
    color: #f8fafc;
    font-family: Inter, system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }
  .scene {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: calc(var(--px, 1px) * 96) calc(var(--px, 1px) * 120);
    gap: calc(var(--px, 1px) * 28);
    background: radial-gradient(circle at 50% 45%, #16223b 0%, #0b0f17 75%);
  }
  .scene-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.45;
    pointer-events: none;
    z-index: 0;
  }

  /* Night-garden art direction for storybook projects (magical blue night,
     moonlight, fireflies, a soft grassy foreground). Purely presentational:
     scenes, actions and camera moves stay ordinary editable timeline data. */
  main[data-theme="night"] .scene {
    background:
      radial-gradient(circle at 84% 12%, rgba(224, 242, 254, 0.55) 0 1.8%, rgba(147, 197, 253, 0.22) 5.5%, transparent 15%),
      radial-gradient(circle at 18% 28%, rgba(37, 99, 235, 0.22), transparent 40%),
      radial-gradient(circle at 50% 105%, rgba(16, 185, 129, 0.16), transparent 55%),
      linear-gradient(180deg, #030817 0%, #07152f 40%, #0b2340 68%, #071b2a 100%);
  }
  main[data-theme="night"] .scene::after {
    content: '';
    position: absolute;
    left: -8%;
    right: -8%;
    bottom: -3%;
    height: 28%;
    background:
      radial-gradient(ellipse at 22% 100%, rgba(6, 78, 59, 0.55) 0 28%, transparent 29%),
      radial-gradient(ellipse at 48% 100%, rgba(6, 78, 59, 0.45) 0 32%, transparent 33%),
      radial-gradient(ellipse at 78% 100%, rgba(6, 78, 59, 0.55) 0 26%, transparent 27%),
      linear-gradient(180deg, rgba(7, 27, 42, 0) 0%, rgba(5, 22, 32, 0.9) 70%);
    z-index: 0;
    pointer-events: none;
  }
  .af-moon {
    position: absolute;
    top: 7%;
    right: 11%;
    width: 9vmin;
    height: 9vmin;
    border-radius: 50%;
    background: radial-gradient(circle at 36% 32%, #fffef4 0 34%, #eaf3ff 52%, #c3d8f2 72%, #93b4da 100%);
    box-shadow: 0 0 5vmin 2vmin rgba(191, 219, 254, 0.35), 0 0 12vmin 5vmin rgba(96, 165, 250, 0.16);
    z-index: 0;
    pointer-events: none;
  }
  main[data-theme="night"] .scene-title {
    font-size: calc(var(--px, 1px) * 42);
    font-weight: 600;
    letter-spacing: 0.01em;
    opacity: 0.94;
  }
  main[data-theme="night"] .scene-desc {
    font-size: calc(var(--px, 1px) * 24);
    color: #c7d7ef;
    opacity: 0.9;
  }
  .af-fireflies {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .af-fireflies span {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #fef9c3;
    box-shadow: 0 0 10px 3px rgba(253, 230, 138, 0.75);
    opacity: 0;
    animation: af-firefly 4.8s ease-in-out infinite;
  }
  .af-fireflies span:nth-child(1) { left: 8%;  top: 62%; animation-delay: 0.0s; }
  .af-fireflies span:nth-child(2) { left: 18%; top: 38%; animation-delay: 0.7s; animation-duration: 5.6s; }
  .af-fireflies span:nth-child(3) { left: 27%; top: 74%; animation-delay: 1.4s; }
  .af-fireflies span:nth-child(4) { left: 38%; top: 28%; animation-delay: 2.1s; animation-duration: 4.2s; }
  .af-fireflies span:nth-child(5) { left: 49%; top: 66%; animation-delay: 0.4s; }
  .af-fireflies span:nth-child(6) { left: 58%; top: 34%; animation-delay: 1.9s; animation-duration: 5.2s; }
  .af-fireflies span:nth-child(7) { left: 68%; top: 72%; animation-delay: 1.1s; }
  .af-fireflies span:nth-child(8) { left: 77%; top: 44%; animation-delay: 2.7s; animation-duration: 4.6s; }
  .af-fireflies span:nth-child(9) { left: 88%; top: 64%; animation-delay: 0.9s; }
  .af-fireflies span:nth-child(10) { left: 93%; top: 30%; animation-delay: 2.3s; animation-duration: 5.8s; }

  .af-prop-star {
    position: absolute;
    z-index: 3;
    width: 0;
    height: 0;
    pointer-events: none;
    filter: drop-shadow(0 0 10px rgba(253, 230, 138, 0.55));
  }
  .af-star-halo {
    position: absolute;
    left: -90px;
    top: -90px;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(254, 240, 138, 0.5) 0%, rgba(251, 191, 36, 0.2) 34%, transparent 70%);
    animation: af-star-halo 2.6s ease-in-out infinite;
  }
  .af-star-core {
    position: absolute;
    left: -20px;
    top: -20px;
    width: 40px;
    height: 40px;
    background: radial-gradient(circle at 44% 38%, #fffef0 0 16%, #fef08a 36%, #fbbf24 62%, #f59e0b 82%, #b45309 100%);
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    animation: af-star-pulse 1.9s ease-in-out infinite;
  }
  .af-star-spark {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #fef9c3;
    box-shadow: 0 0 8px 2px rgba(253, 224, 71, 0.9);
    opacity: 0;
    animation: af-sparkle 1.8s ease-in-out infinite;
  }
  .af-star-spark--1 { left: -42px; top: -12px; animation-delay: 0s;   --sx: 10px;  --sy: -16px; }
  .af-star-spark--2 { left: 34px;  top: -22px; animation-delay: 0.3s; --sx: -8px;  --sy: -18px; }
  .af-star-spark--3 { left: -28px; top: 28px;  animation-delay: 0.6s; --sx: 12px;  --sy: 10px; }
  .af-star-spark--4 { left: 30px;  top: 30px;  animation-delay: 0.9s; --sx: -10px; --sy: 12px; }
  .af-star-spark--5 { left: -6px;  top: -44px; animation-delay: 1.2s; --sx: 6px;   --sy: -12px; }
  .af-star-spark--6 { left: 2px;   top: 42px;  animation-delay: 1.5s; --sx: -6px;  --sy: 14px; }
  .af-prop-star--ground { left: 63%; top: 74%; transform: scale(0.72); }
  .af-prop-star--held   { left: 50%; top: 57%; transform: scale(1.08); }
  .af-prop-star--rise   { left: 50%; top: 57%; animation: af-star-rise 4.3s cubic-bezier(0.22, 0.61, 0.36, 1) 1s both; }
  .af-prop-star--rise .af-star-core::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    width: 3px;
    height: 110px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: linear-gradient(180deg, rgba(254, 240, 138, 0.75) 0%, rgba(251, 191, 36, 0.25) 55%, transparent 100%);
    filter: blur(1.5px);
  }

  @keyframes af-firefly {
    0%, 100% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.6); }
    18% { opacity: 0.95; }
    45% { opacity: 0.8; transform: translate3d(14px, -20px, 0) scale(1.1); }
    72% { opacity: 0.35; transform: translate3d(-6px, -34px, 0) scale(0.8); }
  }
  @keyframes af-star-pulse {
    0%, 100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
    50% { transform: scale(1.12) rotate(4deg); filter: brightness(1.25); }
  }
  @keyframes af-star-halo {
    0%, 100% { transform: scale(0.9); opacity: 0.7; }
    50% { transform: scale(1.15); opacity: 1; }
  }
  @keyframes af-sparkle {
    0%, 100% { opacity: 0; transform: translate(0, 0) scale(0.4); }
    35% { opacity: 1; transform: translate(var(--sx, 8px), var(--sy, -12px)) scale(1.1); }
    70% { opacity: 0.15; transform: translate(calc(var(--sx, 8px) * 1.6), calc(var(--sy, -12px) * 1.6)) scale(0.7); }
  }
  @keyframes af-star-rise {
    0% { top: 57%; opacity: 1; transform: scale(1.08); filter: brightness(1); }
    18% { opacity: 1; }
    72% { opacity: 1; filter: brightness(1); }
    86% { top: 10%; opacity: 1; transform: scale(1.35); filter: brightness(1.8); }
    100% { top: 6%; opacity: 0; transform: scale(0.62); filter: brightness(1); }
  }
  .scene-header {
    max-width: calc(var(--px, 1px) * 1280);
    text-align: center;
    z-index: 2;
  }
  .scene-title {
    margin: 0 0 calc(var(--px, 1px) * 14) 0;
    font-size: calc(var(--px, 1px) * 58);
    line-height: 1.15;
    font-weight: 700;
    color: #f8fafc;
    letter-spacing: -0.02em;
  }
  .scene-desc {
    margin: 0;
    font-size: calc(var(--px, 1px) * 32);
    line-height: 1.4;
    color: #cbd5e1;
  }
  .scene-stage {
    flex: 1;
    width: 100%;
    min-height: 0;
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .af-actor {
    width: min(360px, 42vw);
    height: auto;
    overflow: visible;
  }
  .af-body-root, .af-part {
    transform-box: fill-box;
  }
  .af-pose-root { transform-origin: 50% 92%; }
  .af-body-root { transform-origin: 50% 90%; }
  .af-head { transform-origin: 50% 90%; }
  .af-arm-l { transform-origin: 60% 18%; }
  .af-arm-r { transform-origin: 40% 18%; }
  .af-leg-l, .af-leg-r { transform-origin: 50% 15%; }
  .af-eye { transform-origin: 50% 50%; }
  .af-mouth { transform-origin: 50% 50%; }

  .af-actor--idle .af-body-root {
    animation: af-idle 2.4s ease-in-out infinite;
  }
  .af-actor--walk .af-body-root {
    animation: af-walk-bob 0.55s ease-in-out var(--af-walk-delay, 0s) var(--af-walk-count, infinite);
  }
  .af-actor--walk .af-leg-l {
    animation: af-leg-l 0.55s ease-in-out var(--af-walk-delay, 0s) var(--af-walk-count, infinite);
  }
  .af-actor--walk .af-leg-r {
    animation: af-leg-r 0.55s ease-in-out var(--af-walk-delay, 0s) var(--af-walk-count, infinite);
  }
  .af-actor--walk .af-arm-l {
    animation: af-leg-r 0.55s ease-in-out var(--af-walk-delay, 0s) var(--af-walk-count, infinite);
  }
  .af-actor--run .af-body-root {
    animation: af-walk-bob 0.34s ease-in-out var(--af-run-delay, 0s) var(--af-run-count, infinite);
  }
  .af-actor--run .af-leg-l {
    animation: af-leg-l 0.34s ease-in-out var(--af-run-delay, 0s) var(--af-run-count, infinite);
  }
  .af-actor--run .af-leg-r {
    animation: af-leg-r 0.34s ease-in-out var(--af-run-delay, 0s) var(--af-run-count, infinite);
  }
  .af-actor--wave .af-arm-r {
    animation: af-wave 0.75s ease-in-out var(--af-wave-delay, 0.2s) var(--af-wave-count, infinite) alternate;
  }
  .af-actor--blink .af-eye {
    animation: af-blink 2.8s ease-in-out var(--af-blink-delay, 0.6s) var(--af-blink-count, infinite);
  }
  .af-actor--bend .af-pose-root {
    animation: af-bend var(--af-bend-dur, 1.6s) ease-in-out var(--af-bend-delay, 0s) both;
  }
  .af-actor--hold .af-arm-l {
    animation: af-hold-l var(--af-hold-dur, 1s) ease-out var(--af-hold-delay, 0s) both;
  }
  .af-actor--hold .af-arm-r {
    animation: af-hold-r var(--af-hold-dur, 1s) ease-out var(--af-hold-delay, 0s) both;
  }
  .af-actor--look_around .af-head {
    animation: af-look var(--af-look_around-dur, 1.5s) ease-in-out var(--af-look_around-delay, 0.4s) both;
  }
  .af-actor--smile .af-mouth {
    animation: af-smile 0.6s ease-out var(--af-smile-delay, 0.5s) both;
  }

  @keyframes af-idle {
    0%, 100% { transform: translateY(0) scaleY(1); }
    50% { transform: translateY(-5px) scaleY(1.015); }
  }
  @keyframes af-walk-bob {
    0%, 100% { transform: translateY(0) translateX(-4px); }
    50% { transform: translateY(-8px) translateX(4px); }
  }
  @keyframes af-leg-l {
    0%, 100% { transform: rotate(-16deg); }
    50% { transform: rotate(16deg); }
  }
  @keyframes af-leg-r {
    0%, 100% { transform: rotate(16deg); }
    50% { transform: rotate(-16deg); }
  }
  @keyframes af-wave {
    0% { transform: rotate(-115deg); }
    100% { transform: rotate(-155deg); }
  }
  @keyframes af-blink {
    0%, 88%, 100% { transform: scaleY(1); }
    94% { transform: scaleY(0.1); }
  }
  @keyframes af-look {
    0%, 100% { transform: rotate(0deg); }
    30% { transform: rotate(-8deg) translateX(-4px); }
    70% { transform: rotate(8deg) translateX(4px); }
  }
  @keyframes af-smile {
    0% { transform: scale(1); }
    100% { transform: scale(1.18); }
  }
  @keyframes af-bend {
    0%, 100% { transform: rotate(0deg) translateY(0); }
    38%, 58% { transform: rotate(14deg) translateY(7px); }
  }
  @keyframes af-hold-l {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(-62deg); }
  }
  @keyframes af-hold-r {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(62deg); }
  }
`;

function findPrimaryCharacter(scene: Scene, characters: Character[]): Character | undefined {
  for (const id of scene.characterIds) {
    const match = characters.find((c) => c.id === id);
    if (match) return match;
  }
  return characters[0];
}

/**
 * A glowing star prop for storybook scenes. The phase follows the scene text
 * (the same lightweight convention the existing door/portal prop uses):
 *   ground -> lying in the grass, held -> cupped in the character's hands,
 *   rise   -> floating up into the sky and fading out.
 */
function buildStarProp(scene: Scene): string {
  const text = `${scene.title} ${scene.description}`;
  if (!/star/i.test(text)) return '';
  const phase = /sky|return|release|float|rise|wish/i.test(text)
    ? 'rise'
    : /hand|hold|glow|shine/i.test(text)
      ? 'held'
      : 'ground';
  return `<div class="af-prop-star af-prop-star--${phase}" aria-hidden="true">
          <span class="af-star-halo"></span>
          <span class="af-star-core"></span>
          <span class="af-star-spark af-star-spark--1"></span>
          <span class="af-star-spark af-star-spark--2"></span>
          <span class="af-star-spark af-star-spark--3"></span>
          <span class="af-star-spark af-star-spark--4"></span>
          <span class="af-star-spark af-star-spark--5"></span>
          <span class="af-star-spark af-star-spark--6"></span>
        </div>`;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return round2(Math.min(1, Math.max(0, value)));
}

function renderSceneSection(
  scene: Scene,
  index: number,
  characters: Character[],
  assetsById: Map<string, Asset>,
  projectId: string,
  nightTheme: boolean
): string {
  const safeSceneId = assertSafeId(scene.id, 'scene');
  const duration = safePositive(scene.duration, 2);
  const camParts = scene.timeline.cameraMoves
    .map(mapCameraAttribute)
    .filter((v): v is string => v !== null);
  const cameraAttr = camParts.length > 0 ? ` data-camera="${escapeHtml(camParts.join(', '))}"` : '';
  const transitionVal = index > 0 ? mapTransitionAttribute(scene.transition) : null;
  const transitionAttr = transitionVal ? ` data-transition="${escapeHtml(transitionVal)}"` : '';

  const bgAsset = scene.backgroundAssetId ? assetsById.get(scene.backgroundAssetId) : undefined;
  const safeBgUri = toSafeProjectAssetRelPath(bgAsset?.uri, IMAGE_ASSET_EXTS, projectId);
  const bgMarkup = safeBgUri
    ? `\n      <img class="scene-bg" src="${escapeHtml(safeBgUri)}" alt="" aria-hidden="true">`
    : '';

  const nightMarkup = nightTheme
    ? `\n      <div class="af-moon" aria-hidden="true"></div>
      <div class="af-fireflies" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>`
    : '';

  const audioElements = scene.timeline.audioTracks
    .map((track) => {
      if ((track as { muted?: boolean }).muted) return '';
      const audioAsset = assetsById.get(track.assetId);
      const safeAudioUri = toSafeProjectAssetRelPath(audioAsset?.uri, AUDIO_ASSET_EXTS, projectId);
      if (!safeAudioUri) return '';
      const start = safeNonNegative(track.startTime, 0);
      const vol = clampVolume(track.volume);
      const loopAttr = track.loop ? ' loop' : '';
      return `\n      <audio src="${escapeHtml(safeAudioUri)}" data-start="${start}" data-volume="${vol}"${loopAttr} preload="auto"></audio>`;
    })
    .filter(Boolean)
    .join('');

  const character = findPrimaryCharacter(scene, characters);
  const hasPortalProp = /door|portal/i.test(`${scene.title} ${scene.description}`);
  const characterSvg = buildCharacterSvg(
    character,
    scene.timeline.characterActions,
    hasPortalProp,
    safeSceneId
  );
  const starMarkup = buildStarProp(scene);

  return `    <section class="scene" id="${safeSceneId}" data-duration="${duration}"${cameraAttr}${transitionAttr}>${bgMarkup}${nightMarkup}
      <header class="scene-header">
        <h1 class="scene-title" data-enter="rise">${escapeHtml(scene.title)}</h1>
        <p class="scene-desc" data-enter="fade-up 0.6 0.15">${escapeHtml(scene.description)}</p>
      </header>
      <div class="scene-stage">
        ${characterSvg}
        ${starMarkup}
      </div>${audioElements}
    </section>`;
}

export function compileProjectHtml(input: CompileProjectInput): string {
  const safeProjectId = assertSafeId(input.projectId, 'project');

  const width = safePositive(input.config.width, 1280);
  const height = safePositive(input.config.height, 720);
  const fps = safePositive(input.config.fps, 30);
  const assetsById = new Map<string, Asset>((input.assets ?? []).map((a) => [a.id, a]));
  const nightTheme = /night|moon|garden|star|firefl/i.test(`${input.config.name} ${input.config.prompt}`);

  const sectionsHtml =
    input.scenes.length > 0
      ? input.scenes
          .map((scene, index) => renderSceneSection(scene, index, input.characters, assetsById, safeProjectId, nightTheme))
          .join('\n')
      : `    <section class="scene" id="scene_intro" data-duration="3">
      <header class="scene-header">
        <h1 class="scene-title" data-enter="rise">${escapeHtml(input.config.name)}</h1>
        <p class="scene-desc" data-enter="fade-up 0.6 0.15">${escapeHtml(input.config.prompt)}</p>
      </header>
      <div class="scene-stage">
        ${buildCharacterSvg(input.characters[0], [])}
      </div>
    </section>`;

  return `<!doctype html>
<html lang="en" data-width="${width}" data-height="${height}" data-fps="${fps}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.config.name)}</title>
<style>${COMPILER_STYLES}</style>
</head>
<body>
  <main data-sequence${nightTheme ? ' data-theme="night"' : ''}>
${sectionsHtml}
  </main>
</body>
</html>
`;
}
