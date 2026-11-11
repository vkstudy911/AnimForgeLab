import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Robot } from '../characters/Robot';
import { ParticleField } from '../effects/ParticleField';

export const Scene4MountainClimb: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 240 (8s)

  // Mountain climb progress along an upward slope: from (x: 180, y: 1350) to (x: 580, y: 920)
  const climbProgress = interpolate(frame, [0, 240], [0, 1]);
  const posX = interpolate(climbProgress, [0, 1], [160, 560]);
  const posY = interpolate(climbProgress, [0, 1], [1380, 880]);

  // Gust of wind struggle around frames 100 to 150
  const isGust = frame >= 100 && frame <= 150;
  const gustT = isGust ? (frame - 100) / 50 : 0;
  const wobbleAngle = isGust ? Math.sin(gustT * Math.PI) * -18 : 0;
  const cameraShakeX = isGust ? Math.sin(frame * 0.6) * 12 : Math.sin(frame * 0.2) * 2;
  const cameraShakeY = isGust ? Math.cos(frame * 0.7) * 8 : Math.cos(frame * 0.2) * 2;

  // Strained climbing walk cycle
  const walkPhase = frame * 0.18;
  const legL = Math.sin(walkPhase) * 32;
  const legR = -legL;
  const bodyBob = Math.abs(Math.cos(walkPhase)) * -8;

  // Forward leaning posture against the fierce wind
  const forwardLean = 14 + (isGust ? 8 : 0);

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
      {/* ---------------- DRAMATIC MOUNTAIN SKY ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #020617 0%, #0f172a 40%, #1e293b 80%, #0c1a2e 100%)',
        }}
      />

      {/* Moon obscured by fast wind clouds */}
      <div
        style={{
          position: 'absolute',
          top: 220,
          right: 180,
          width: 100,
          height: 100,
          borderRadius: '50%',
          backgroundColor: '#fef08a',
          boxShadow: '0 0 60px rgba(254, 240, 138, 0.35)',
          opacity: 0.8,
        }}
      />

      {/* Cloud Wisps Passing Fast */}
      <div
        style={{
          position: 'absolute',
          top: 200,
          left: -((frame * 12) % 1800),
          width: 3600,
          height: 160,
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, transparent 70%)',
          filter: 'blur(25px)',
        }}
      />

      {/* ---------------- CAMERA SHAKE CONTAINER ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${cameraShakeX}px, ${cameraShakeY}px)`,
        }}
      >
        {/* Distant Mountain Peak Layer */}
        <svg
          style={{
            position: 'absolute',
            bottom: 400,
            left: 0,
            width: 1080,
            height: 1100,
            opacity: 0.3,
          }}
        >
          <polygon points="100,1100 450,400 850,1100" fill="#0f172a" />
          <polygon points="500,1100 850,280 1080,1100" fill="#1e293b" />
        </svg>

        {/* Steep Climbing Incline Slope */}
        <svg
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 1080,
            height: 1600,
          }}
        >
          {/* Main Cliff Slope: angled from (0, 1600) to (1080, 550) */}
          <polygon points="0,1600 0,1500 1080,550 1080,1600" fill="#0f172a" />
          {/* Jagged Rock Strata */}
          <polygon points="0,1500 350,1150 500,1220 1080,550 1080,680 0,1600" fill="#1e293b" opacity="0.6" />
          <path d="M 120 1380 L 160 1370 L 190 1410 Z" fill="#334155" />
          <path d="M 420 1080 L 460 1050 L 510 1100 Z" fill="#334155" />
          <path d="M 720 780 L 770 750 L 820 800 Z" fill="#334155" />
        </svg>

        {/* ---------------- WIND AND DUST PARTICLES ---------------- */}
        <ParticleField type="wind" count={50} frame={frame} />

        {/* ---------------- ROBOT CLIMBING AND PROTECTING STAR ---------------- */}
        <div
          style={{
            position: 'absolute',
            left: posX,
            top: posY,
            zIndex: 60,
            transform: `rotate(${forwardLean + wobbleAngle}deg)`,
            transformOrigin: '170px 320px',
          }}
        >
          <Robot
            scale={1.2}
            bodyBob={bodyBob}
            legLeftAngle={legL}
            legRightAngle={legR}
            // Both arms wrapped tightly in front holding the star
            armLeftAngle={-55}
            armRightAngle={-70}
            headAngle={-15}
            eyeState={isGust ? 'concerned' : 'normal'}
            mouthState="concerned"
            holdingStar={true}
            starBrightness={0.85 + 0.15 * Math.sin(frame * 0.3)}
            chestGlow={1.0}
          />
        </div>
      </div>
    </div>
  );
};
