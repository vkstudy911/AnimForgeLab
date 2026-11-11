import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Robot } from '../characters/Robot';
import { StarAsset } from '../effects/StarAsset';

export const Scene5ReturningStar: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 210 (7s)

  // Throw keyframes:
  // 0 - 60: Anticipation crouch
  // 60 - 85: Thrust release
  // 85 - 210: Star flies upward, camera tracks

  const isAnticipation = frame < 65;
  const isReleased = frame >= 75;

  // Crouch and spring
  const crouchY = interpolate(frame, [20, 60, 75, 100], [0, 30, -15, 0], {
    extrapolateRight: 'clamp',
  });

  const armAngle = interpolate(frame, [0, 40, 75, 120], [-55, -20, -155, -120], {
    extrapolateRight: 'clamp',
  });

  const headAngle = interpolate(frame, [0, 60, 85, 150], [0, 20, -45, -55], {
    extrapolateRight: 'clamp',
  });

  // Star trajectory upward: released at (x: 540, y: 1100), reaches (x: 540, y: 150)
  const starFlightProgress = interpolate(frame, [75, 200], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const starY = interpolate(starFlightProgress, [0, 1], [1150, 180]);
  const starScale = interpolate(starFlightProgress, [0, 1], [65, 30]);

  // Camera upward pan tracking star
  const cameraTiltY = interpolate(frame, [75, 200], [0, 280], {
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
        backgroundColor: '#020617',
      }}
    >
      {/* ---------------- DEEP TWILIGHT SKY ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #020617 0%, #0c1a30 45%, #1e1b4b 80%, #0f172a 100%)',
          transform: `translateY(${cameraTiltY * 0.4}px)`,
        }}
      />

      {/* Sea of Clouds Below Summit */}
      <div
        style={{
          position: 'absolute',
          bottom: 150 - cameraTiltY * 0.5,
          left: -200,
          right: -200,
          height: 350,
          background: 'radial-gradient(ellipse at 50% 100%, rgba(148, 163, 184, 0.25) 0%, transparent 70%)',
          filter: 'blur(35px)',
        }}
      />

      {/* Rocky Mountain Summit Peak */}
      <svg
        style={{
          position: 'absolute',
          bottom: -cameraTiltY * 0.8,
          left: 0,
          width: 1080,
          height: 750,
        }}
      >
        <polygon points="120,750 480,380 620,380 960,750" fill="#0f172a" />
        <polygon points="480,380 540,360 620,380 570,420" fill="#1e293b" />
        <line x1="280" y1="750" x2="520" y2="390" stroke="#334155" strokeWidth="4" />
      </svg>

      {/* ---------------- ROBOT ON SUMMIT ---------------- */}
      <div
        style={{
          position: 'absolute',
          bottom: 330 - cameraTiltY * 0.8 + crouchY,
          left: 380,
          zIndex: 50,
        }}
      >
        <Robot
          scale={1.3}
          headAngle={headAngle}
          armLeftAngle={armAngle}
          armRightAngle={armAngle}
          eyeState={isReleased ? 'wide' : 'normal'}
          mouthState={isReleased ? 'o' : 'neutral'}
          holdingStar={!isReleased}
          starBrightness={1.0}
          chestGlow={1.0}
        />
      </div>

      {/* ---------------- FLYING STAR TRAJECTORY ---------------- */}
      {isReleased && (
        <StarAsset
          x={545}
          y={starY - cameraTiltY * 0.8}
          size={starScale}
          brightness={1.0}
          showTrail={true}
          trailLength={220}
          rotation={frame * 8}
        />
      )}
    </div>
  );
};
