import React from 'react';

export interface RobotProps {
  headAngle?: number;          // Degrees rotation around neck pivot
  armLeftAngle?: number;       // Degrees rotation around left shoulder
  armRightAngle?: number;      // Degrees rotation around right shoulder
  legLeftAngle?: number;       // Degrees rotation around left hip
  legRightAngle?: number;      // Degrees rotation around right hip
  eyeState?: 'normal' | 'blink' | 'wide' | 'concerned' | 'happy';
  mouthState?: 'neutral' | 'o' | 'concerned' | 'smile' | 'happy_beam';
  chestGlow?: number;          // 0 to 1
  bodyBob?: number;            // Vertical bob in pixels
  holdingStar?: boolean;
  starBrightness?: number;     // 0 to 1
  facing?: 'right' | 'left' | 'front' | 'back';
  scale?: number;
  flipX?: boolean;
}

export const Robot: React.FC<RobotProps> = ({
  headAngle = 0,
  armLeftAngle = 0,
  armRightAngle = 0,
  legLeftAngle = 0,
  legRightAngle = 0,
  eyeState = 'normal',
  mouthState = 'neutral',
  chestGlow = 0.8,
  bodyBob = 0,
  holdingStar = false,
  starBrightness = 1.0,
  facing = 'right',
  scale = 1.0,
  flipX = false,
}) => {
  // Eye rendering based on state
  const renderEyes = () => {
    if (eyeState === 'blink') {
      return (
        <g>
          <path d="M 115 110 Q 135 112 155 110" stroke="#042f2e" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M 185 110 Q 205 112 225 110" stroke="#042f2e" strokeWidth="4" strokeLinecap="round" fill="none" />
        </g>
      );
    }
    if (eyeState === 'happy') {
      return (
        <g>
          <path d="M 115 115 Q 135 95 155 115" stroke="#38bdf8" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M 185 115 Q 205 95 225 115" stroke="#38bdf8" strokeWidth="6" strokeLinecap="round" fill="none" />
        </g>
      );
    }
    if (eyeState === 'concerned') {
      return (
        <g>
          {/* Left Eye */}
          <ellipse cx="135" cy="110" rx="18" ry="18" fill="#38bdf8" filter="url(#eyeGlow)" />
          <ellipse cx="135" cy="110" rx="14" ry="14" fill="#0284c7" />
          <circle cx="140" cy="106" r="5" fill="#ffffff" />
          {/* Eyebrow slant */}
          <path d="M 115 90 L 155 96" stroke="#134e4a" strokeWidth="4" strokeLinecap="round" />

          {/* Right Eye */}
          <ellipse cx="205" cy="110" rx="18" ry="18" fill="#38bdf8" filter="url(#eyeGlow)" />
          <ellipse cx="205" cy="110" rx="14" ry="14" fill="#0284c7" />
          <circle cx="210" cy="106" r="5" fill="#ffffff" />
          <path d="M 225 90 L 185 96" stroke="#134e4a" strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    }
    if (eyeState === 'wide') {
      return (
        <g>
          <ellipse cx="135" cy="110" rx="22" ry="22" fill="#38bdf8" filter="url(#eyeGlow)" />
          <ellipse cx="135" cy="110" rx="18" ry="18" fill="#0284c7" />
          <circle cx="139" cy="104" r="7" fill="#ffffff" />
          <circle cx="130" cy="118" r="3" fill="#ffffff" />

          <ellipse cx="205" cy="110" rx="22" ry="22" fill="#38bdf8" filter="url(#eyeGlow)" />
          <ellipse cx="205" cy="110" rx="18" ry="18" fill="#0284c7" />
          <circle cx="209" cy="104" r="7" fill="#ffffff" />
          <circle cx="200" cy="118" r="3" fill="#ffffff" />
        </g>
      );
    }
    // Normal friendly eyes
    return (
      <g>
        <ellipse cx="135" cy="110" rx="18" ry="20" fill="#38bdf8" filter="url(#eyeGlow)" />
        <ellipse cx="135" cy="110" rx="13" ry="15" fill="#0369a1" />
        <circle cx="140" cy="105" r="5" fill="#ffffff" />
        <circle cx="131" cy="115" r="2.5" fill="#ffffff" />

        <ellipse cx="205" cy="110" rx="18" ry="20" fill="#38bdf8" filter="url(#eyeGlow)" />
        <ellipse cx="205" cy="110" rx="13" ry="15" fill="#0369a1" />
        <circle cx="210" cy="105" r="5" fill="#ffffff" />
        <circle cx="201" cy="115" r="2.5" fill="#ffffff" />
      </g>
    );
  };

  // Mouth rendering based on state
  const renderMouth = () => {
    if (mouthState === 'smile') {
      return <path d="M 150 142 Q 170 160 190 142" stroke="#042f2e" strokeWidth="4.5" strokeLinecap="round" fill="none" />;
    }
    if (mouthState === 'happy_beam') {
      return (
        <path
          d="M 145 138 Q 170 166 195 138 Z"
          fill="#065f46"
          stroke="#042f2e"
          strokeWidth="4"
        />
      );
    }
    if (mouthState === 'o') {
      return <ellipse cx="170" cy="144" rx="8" ry="10" fill="#042f2e" />;
    }
    if (mouthState === 'concerned') {
      return <path d="M 152 146 Q 170 138 188 146" stroke="#042f2e" strokeWidth="4" strokeLinecap="round" fill="none" />;
    }
    // Neutral
    return <path d="M 156 142 Q 170 145 184 142" stroke="#042f2e" strokeWidth="3.5" strokeLinecap="round" fill="none" />;
  };

  const transformStyle = {
    transform: `scale(${scale}) ${flipX ? 'scaleX(-1)' : ''}`,
    transformOrigin: '170px 240px',
    filter: 'drop-shadow(0 15px 30px rgba(0, 0, 0, 0.45))',
  };

  return (
    <div style={transformStyle}>
      <svg
        width="340"
        height="400"
        viewBox="0 0 340 400"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Metallic Green Material Gradients */}
          <linearGradient id="metalGreenMain" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="45%" stopColor="#22c55e" />
            <stop offset="85%" stopColor="#15803d" />
            <stop offset="100%" stopColor="#14532d" />
          </linearGradient>

          <linearGradient id="metalGreenDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#0f3d24" />
          </linearGradient>

          <radialGradient id="metalHighlight" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#86efac" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#22c55e" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="chestCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="40%" stopColor="#38bdf8" />
            <stop offset="80%" stopColor="#0284c7" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="starGlowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#fef08a" />
            <stop offset="70%" stopColor="#eab308" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ca8a04" stopOpacity="0" />
          </radialGradient>

          {/* Eye Glow Filter */}
          <filter id="eyeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
        </defs>

        {/* ---------------- GROUND SHADOW ---------------- */}
        <ellipse cx="170" cy="370" rx="65" ry="14" fill="rgba(0,0,0,0.4)" filter="blur(6px)" />

        {/* ---------------- ROOT BODY CONTAINER (WITH BOB) ---------------- */}
        <g transform={`translate(0, ${bodyBob})`}>

          {/* ---------------- LEFT LEG (BACK) ---------------- */}
          {/* Hip pivot at (130, 290) */}
          <g transform={`translate(130, 290) rotate(${legLeftAngle}) translate(-130, -290)`}>
            {/* Hip joint */}
            <circle cx="130" cy="290" r="12" fill="#0f3d24" />
            {/* Leg limb */}
            <rect x="120" y="290" width="20" height="55" rx="10" fill="url(#metalGreenDark)" />
            {/* Magnetic Foot Boot */}
            <path
              d="M 112 345 L 148 345 Q 155 358 148 365 L 110 365 Q 106 355 112 345 Z"
              fill="#064e3b"
            />
            <rect x="114" y="360" width="32" height="4" rx="2" fill="#38bdf8" opacity="0.8" />
          </g>

          {/* ---------------- RIGHT LEG (FRONT) ---------------- */}
          {/* Hip pivot at (210, 290) */}
          <g transform={`translate(210, 290) rotate(${legRightAngle}) translate(-210, -290)`}>
            <circle cx="210" cy="290" r="12" fill="#0f3d24" />
            <rect x="200" y="290" width="20" height="55" rx="10" fill="url(#metalGreenMain)" />
            <path
              d="M 192 345 L 228 345 Q 235 358 228 365 L 190 365 Q 186 355 192 345 Z"
              fill="#042f2e"
            />
            <rect x="194" y="360" width="32" height="4" rx="2" fill="#38bdf8" opacity="0.8" />
          </g>

          {/* ---------------- LEFT ARM (BACK) ---------------- */}
          {/* Shoulder pivot at (100, 215) */}
          <g transform={`translate(100, 215) rotate(${armLeftAngle}) translate(-100, -215)`}>
            <circle cx="100" cy="215" r="13" fill="#0f3d24" />
            <rect x="88" y="215" width="22" height="60" rx="11" fill="url(#metalGreenDark)" />
            {/* Rounded hand clamp */}
            <circle cx="99" cy="282" r="14" fill="#064e3b" />
            <path d="M 91 280 Q 99 292 107 280" stroke="#86efac" strokeWidth="3" fill="none" />
          </g>

          {/* ---------------- TORSO BODY ---------------- */}
          <g id="torso">
            {/* Main Rounded Chassis */}
            <rect
              x="105"
              y="180"
              width="130"
              height="115"
              rx="45"
              fill="url(#metalGreenMain)"
            />
            {/* 3D Curved Light Reflection */}
            <rect
              x="105"
              y="180"
              width="130"
              height="115"
              rx="45"
              fill="url(#metalHighlight)"
            />
            {/* Belly Inset Plate */}
            <rect
              x="122"
              y="198"
              width="96"
              height="80"
              rx="30"
              fill="#064e3b"
              stroke="#15803d"
              strokeWidth="2.5"
            />

            {/* Glowing Chest Core */}
            <circle cx="170" cy="238" r="24" fill="url(#chestCoreGlow)" opacity={chestGlow} />
            <circle cx="170" cy="238" r="14" fill="#fef08a" opacity={chestGlow * 0.9} />
            <circle cx="170" cy="238" r="7" fill="#ffffff" />
            {/* Energy ring rivets */}
            <circle cx="170" cy="220" r="2" fill="#38bdf8" />
            <circle cx="170" cy="256" r="2" fill="#38bdf8" />
            <circle cx="152" cy="238" r="2" fill="#38bdf8" />
            <circle cx="188" cy="238" r="2" fill="#38bdf8" />
          </g>

          {/* ---------------- HEAD WITH NECK PIVOT ---------------- */}
          {/* Neck pivot at (170, 180) */}
          <g transform={`translate(170, 180) rotate(${headAngle}) translate(-170, -180)`}>
            {/* Neck bolt */}
            <rect x="156" y="165" width="28" height="20" rx="4" fill="#0f3d24" />

            {/* Antenna with bouncy tip */}
            <path
              d="M 170 65 L 170 30 Q 170 15 185 10"
              stroke="#0f3d24"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="187" cy="10" r="11" fill="#fde047" filter="drop-shadow(0 0 8px #fde047)" />
            <circle cx="188" cy="8" r="4" fill="#ffffff" />

            {/* Helmet Outer Shell */}
            <rect
              x="85"
              y="55"
              width="170"
              height="120"
              rx="55"
              fill="url(#metalGreenMain)"
            />
            {/* Specular highlight */}
            <rect
              x="85"
              y="55"
              width="170"
              height="120"
              rx="55"
              fill="url(#metalHighlight)"
            />

            {/* Ear bolts */}
            <rect x="74" y="95" width="14" height="35" rx="6" fill="#0f3d24" />
            <rect x="252" y="95" width="14" height="35" rx="6" fill="#0f3d24" />
            <circle cx="81" cy="112" r="4" fill="#38bdf8" />
            <circle cx="259" cy="112" r="4" fill="#38bdf8" />

            {/* Glass Visor Face Screen */}
            <rect
              x="102"
              y="72"
              width="136"
              height="86"
              rx="38"
              fill="#062e26"
              stroke="#15803d"
              strokeWidth="3"
            />

            {/* Dynamic Eyes and Mouth */}
            {facing !== 'back' && (
              <>
                {renderEyes()}
                {renderMouth()}
              </>
            )}
          </g>

          {/* ---------------- RIGHT ARM (FRONT) ---------------- */}
          {/* Shoulder pivot at (240, 215) */}
          <g transform={`translate(240, 215) rotate(${armRightAngle}) translate(-240, -215)`}>
            <circle cx="240" cy="215" r="14" fill="#0f3d24" />
            <rect x="228" y="215" width="24" height="62" rx="12" fill="url(#metalGreenMain)" />
            {/* Hand Clamp */}
            <circle cx="240" cy="285" r="15" fill="#042f2e" />
            <path d="M 232 284 Q 240 296 248 284" stroke="#86efac" strokeWidth="3" fill="none" />
          </g>

          {/* ---------------- HELD STAR ASSET (IF ACTIVE) ---------------- */}
          {holdingStar && (
            <g transform="translate(170, 240)">
              {/* Star volumetric halo */}
              <circle cx="0" cy="0" r="55" fill="url(#starGlowGrad)" opacity={starBrightness * 0.8} />
              <circle cx="0" cy="0" r="28" fill="#fef08a" opacity={starBrightness} />
              {/* Star five points */}
              <polygon
                points="0,-26 7,-9 25,-8 11,4 16,22 0,11 -16,22 -11,4 -25,-8 -7,-9"
                fill="#ffffff"
                filter="drop-shadow(0 0 10px #fde047)"
              />
              <circle cx="0" cy="0" r="8" fill="#ffffff" />
            </g>
          )}

        </g>
      </svg>
    </div>
  );
};
