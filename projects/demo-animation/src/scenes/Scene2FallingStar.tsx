import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Robot } from '../characters/Robot';
import { StarAsset } from '../effects/StarAsset';
import { ParticleField } from '../effects/ParticleField';

export const Scene2FallingStar: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 150 (5s)
  const { fps } = useVideoConfig();

  // Falling star path: starts at frame 15, lands at frame 85
  const starProgress = interpolate(frame, [15, 85], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const starX = interpolate(starProgress, [0, 1], [980, 420]);
  const starY = interpolate(starProgress, [0, 1], [150, 1530]);

  // Impact flash and ground ring
  const impactProgress = interpolate(frame, [85, 120], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const impactScale = impactProgress * 3.5;
  const impactOpacity = (1 - impactProgress) * 0.9;

  // Robot surprise reaction
  const isSurprised = frame > 40;
  const headSurpriseAngle = interpolate(frame, [35, 75], [0, -32], {
    extrapolateRight: 'clamp',
  });

  const armLSurprise = interpolate(frame, [45, 80], [0, -35], {
    extrapolateRight: 'clamp',
  });
  const armRSurprise = interpolate(frame, [45, 80], [0, -45], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: 1080,
        height: 1920,
        overflow: 'hidden',
        backgroundColor: '#040914',
      }}
    >
      {/* ---------------- SKY WITH STAR TRAILS ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #020617 0%, #0b1528 55%, #064e3b 100%)',
        }}
      />

      {/* Forest Silhouette Background */}
      <svg
        style={{
          position: 'absolute',
          bottom: 250,
          left: 0,
          width: 1080,
          height: 1200,
          opacity: 0.5,
        }}
      >
        <path d="M 0 1200 L 120 400 L 250 1200 L 400 1200 L 520 300 L 650 1200 L 850 1200 L 980 350 L 1080 1200 Z" fill="#022c22" />
      </svg>

      {/* Ground */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 380,
          background: 'radial-gradient(ellipse at 50% 0%, #064e3b 0%, #022c22 70%, #011612 100%)',
        }}
      />

      {/* ---------------- FALLING STAR TRAJECTORY ---------------- */}
      {frame >= 15 && (
        <StarAsset
          x={starX}
          y={starY}
          size={frame > 85 ? 50 : 65}
          showTrail={frame <= 85}
          trailLength={180}
          rotation={-35 + frame * 4}
          brightness={frame > 85 ? 0.75 + 0.25 * Math.sin(frame * 0.3) : 1.0}
        />
      )}

      {/* ---------------- IMPACT RING ON MOSS ---------------- */}
      {frame >= 85 && (
        <div
          style={{
            position: 'absolute',
            left: 420,
            top: 1530,
            width: 120,
            height: 40,
            transform: `translate(-50%, -50%) scale(${impactScale})`,
            borderRadius: '50%',
            border: '4px solid #fde047',
            boxShadow: '0 0 35px #fde047',
            opacity: impactOpacity,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ---------------- ROBOT REACTING IN SURPRISE ---------------- */}
      <div
        style={{
          position: 'absolute',
          bottom: 240,
          left: 620,
          zIndex: 50,
        }}
      >
        <Robot
          scale={1.25}
          flipX={true} // Facing left toward the fallen star
          armLeftAngle={armLSurprise}
          armRightAngle={armRSurprise}
          headAngle={headSurpriseAngle}
          eyeState={isSurprised ? 'wide' : 'normal'}
          mouthState={isSurprised ? 'o' : 'neutral'}
          chestGlow={0.9}
        />
      </div>

      <ParticleField type="fireflies" count={30} frame={frame} />
    </div>
  );
};
