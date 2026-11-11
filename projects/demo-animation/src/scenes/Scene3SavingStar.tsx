import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Robot } from '../characters/Robot';
import { StarAsset } from '../effects/StarAsset';

export const Scene3SavingStar: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 180 (6s)

  // Camera zoom in for emotional close-up
  const cameraZoom = interpolate(frame, [0, 180], [1.0, 1.35], {
    extrapolateRight: 'clamp',
  });
  const cameraPanY = interpolate(frame, [0, 180], [0, 80], {
    extrapolateRight: 'clamp',
  });

  // Robot kneeling and picking up star (0 to 80 frames: bends down, 80 to 180: holds star up)
  const kneelY = interpolate(frame, [10, 60], [0, 35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const armBendL = interpolate(frame, [20, 80], [-10, -55], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const armBendR = interpolate(frame, [20, 80], [-10, -65], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const headTilt = interpolate(frame, [0, 50, 120, 180], [10, 25, 0, -25], {
    extrapolateRight: 'clamp',
  });

  // Star weakly pulsing, then revitalizing slightly when robot holds it
  const starPulse = Math.sin(frame * 0.15) * 0.3 + 0.7;
  const isHeld = frame >= 80;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: 1080,
        height: 1920,
        overflow: 'hidden',
        backgroundColor: '#030712',
      }}
    >
      {/* ---------------- ZOOMING CAMERA RIG ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${cameraZoom}) translateY(${cameraPanY}px)`,
          transformOrigin: '540px 1400px',
        }}
      >
        {/* Background Mood Gradient */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 75%, #064e3b 0%, #031e17 50%, #020617 100%)',
          }}
        />

        {/* Mossy Ground */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 550,
            background: 'radial-gradient(ellipse at 50% 0%, #064e3b 0%, #022c22 80%)',
          }}
        />

        {/* ---------------- FALLEN STAR ON GROUND (BEFORE PICKUP) ---------------- */}
        {!isHeld && (
          <StarAsset
            x={430}
            y={1450}
            size={55}
            brightness={0.65 + 0.35 * starPulse}
            pulse={starPulse}
          />
        )}

        {/* ---------------- ROBOT KNEELING & HOLDING STAR ---------------- */}
        <div
          style={{
            position: 'absolute',
            bottom: 220 - kneelY,
            left: 370,
            zIndex: 50,
          }}
        >
          <Robot
            scale={1.5}
            headAngle={headTilt}
            armLeftAngle={armBendL}
            armRightAngle={armBendR}
            legLeftAngle={15}
            legRightAngle={-15}
            eyeState="concerned"
            mouthState="concerned"
            holdingStar={isHeld}
            starBrightness={0.7 + 0.3 * starPulse}
            chestGlow={0.85}
          />
        </div>

        {/* Warm Golden Illumination on Ground & Surroundings */}
        <div
          style={{
            position: 'absolute',
            left: 540,
            top: 1400,
            width: 480,
            height: 300,
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(254, 240, 138, 0.25) 0%, transparent 70%)',
            filter: 'blur(35px)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Cinematic Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, transparent 60%, rgba(2, 6, 23, 0.7) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
