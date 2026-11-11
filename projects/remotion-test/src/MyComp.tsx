import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const MyComp: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: {
      damping: 12,
    },
  });

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: '#0a0f1d',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          opacity,
          backgroundColor: '#3b82f6',
          width: 140,
          height: 140,
          borderRadius: 24,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0 20px 40px rgba(59, 130, 246, 0.4)',
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            backgroundColor: '#ffffff',
            borderRadius: 12,
          }}
        />
      </div>
      <h1
        style={{
          color: '#ffffff',
          fontSize: 48,
          marginTop: 32,
          opacity,
        }}
      >
        Remotion Engine Active
      </h1>
      <p
        style={{
          color: '#94a3b8',
          fontSize: 24,
          margin: 0,
          opacity,
        }}
      >
        AnimForge AI Integration Test
      </p>
    </div>
  );
};
