import React from 'react';

export interface CyberGridProps {
  frame: number;
  glowColor?: string;
}

export const CyberGrid: React.FC<CyberGridProps> = ({
  frame,
  glowColor = '#0284c7',
}) => {
  const offsetY = (frame * 1.5) % 80;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        backgroundColor: '#030712',
      }}
    >
      {/* Deep Space Radial Glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 30%, #0c1a30 0%, #020617 70%, #000000 100%)',
        }}
      />

      {/* Perspective 3D Grid Plane */}
      <div
        style={{
          position: 'absolute',
          bottom: -200,
          left: -400,
          right: -400,
          height: 1200,
          transform: 'perspective(600px) rotateX(65deg)',
          backgroundImage: `
            linear-gradient(to right, rgba(56, 189, 248, 0.12) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.12) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
          backgroundPosition: `0px ${offsetY}px`,
          maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 95%)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 95%)',
        }}
      />

      {/* Digital HUD Coordinates & Top Header */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 60,
          right: 60,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'monospace',
          fontSize: 20,
          letterSpacing: 2,
          color: 'rgba(56, 189, 248, 0.7)',
          zIndex: 10,
        }}
      >
        <span>SEC_SYS // v2.6.4</span>
        <span style={{ color: '#ef4444' }}>● LIVE_MONITOR</span>
        <span>LAT: 28.6139° N</span>
      </div>

      {/* Ambient Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, transparent 60%, rgba(0,0,0,0.85) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
