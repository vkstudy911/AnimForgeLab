import { useId } from 'react';

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function SceneThumb({
  title,
  palette,
  badge,
}: {
  title: string;
  palette?: string[];
  badge?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const seed = hashSeed(title || 'scene');
  const skyTop = palette?.[0] && /^#[0-9a-fA-F]{3,8}$/.test(palette[0]) ? palette[0] : '#1c2438';
  const accent = palette?.[1] && /^#[0-9a-fA-F]{3,8}$/.test(palette[1]) ? palette[1] : '#f59e0b';
  const hill = '#151923';
  const starX = 24 + (seed % 96);
  const starY = 14 + ((seed >> 3) % 28);
  const orbX = 88 + ((seed >> 5) % 44);

  return (
    <div className="scene-thumb-card" aria-hidden="true">
      <svg viewBox="0 0 160 90" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} stopOpacity="0.92" />
            <stop offset="100%" stopColor="#0f131b" />
          </linearGradient>
        </defs>
        <rect width="160" height="90" fill={`url(#bg-${uid})`} />
        <circle cx={orbX} cy="24" r="10" fill={accent} fillOpacity="0.28" />
        <circle cx={orbX} cy="24" r="5" fill={accent} />
        <circle cx={starX} cy={starY} r="1.4" fill="#f3f1ed" fillOpacity="0.85" />
        <path d="M0 74 Q42 54 88 68 T160 62 L160 90 L0 90 Z" fill={hill} />
        <circle cx="52" cy="58" r="7" fill={accent} fillOpacity="0.9" />
        <rect x="47" y="65" width="10" height="14" rx="4" fill="#2b3344" />
        {badge ? (
          <text
            x="8"
            y="15"
            fill="#f3f1ed"
            fontSize="9"
            fontFamily="ui-monospace, monospace"
            opacity="0.82"
          >
            {badge}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
