import React from 'react';

export interface StarAssetProps {
  x: number;
  y: number;
  size?: number;
  brightness?: number;      // 0 to 1
  pulse?: number;           // Sine oscillation
  rotation?: number;
  showTrail?: boolean;
  trailLength?: number;
}

export const StarAsset: React.FC<StarAssetProps> = ({
  x,
  y,
  size = 60,
  brightness = 1.0,
  pulse = 1.0,
  rotation = 0,
  showTrail = false,
  trailLength = 120,
}) => {
  const currentSize = size * (0.9 + 0.2 * pulse);
  const opacity = Math.max(0, Math.min(1, brightness));

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        pointerEvents: 'none',
        opacity,
      }}
    >
      <svg
        width={currentSize * 3}
        height={currentSize * 3}
        viewBox="-90 -90 180 180"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="starCoreHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="25%" stopColor="#fef08a" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Trail if moving */}
        {showTrail && (
          <path
            d={`M 0 0 L ${-trailLength * 0.8} ${-trailLength} L ${-trailLength * 0.4} ${-trailLength * 1.3} Z`}
            fill="url(#starCoreHalo)"
            opacity={0.6 * opacity}
            filter="blur(8px)"
          />
        )}

        {/* Outer Volumetric Corona */}
        <circle cx="0" cy="0" r={currentSize * 1.2} fill="url(#starCoreHalo)" opacity={0.7} />
        <circle cx="0" cy="0" r={currentSize * 0.7} fill="#fef08a" opacity={0.6} />

        {/* Core 5-pointed star */}
        <polygon
          points="0,-35 9,-11 34,-10 15,6 22,30 0,16 -22,30 -15,6 -34,-10 -9,-11"
          fill="#ffffff"
          filter="drop-shadow(0 0 16px #fef08a)"
        />

        {/* Bright Core Pinpoint */}
        <circle cx="0" cy="0" r="10" fill="#ffffff" />
      </svg>
    </div>
  );
};
