import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Robot } from '../characters/Robot';
import { ParticleField } from '../effects/ParticleField';

export const Scene1Forest: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 150 (5s)

  // Robot horizontal walking position (from x: 120 to x: 500)
  const robotX = interpolate(frame, [0, 150], [120, 520], {
    extrapolateRight: 'clamp',
  });

  // Leg and arm walk cycle
  const walkPhase = frame * 0.22;
  const legL = Math.sin(walkPhase) * 28;
  const legR = -legL;
  const armL = -Math.sin(walkPhase) * 25;
  const armR = -armL;
  const bodyBob = Math.abs(Math.cos(walkPhase)) * -10;

  // Eye blinking around frame 50 and 110
  const isBlinking = (frame > 45 && frame < 52) || (frame > 115 && frame < 122);

  // Parallax camera pan
  const cameraPan = interpolate(frame, [0, 150], [0, -60]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: 1080,
        height: 1920,
        overflow: 'hidden',
        backgroundColor: '#050b14',
      }}
    >
      {/* ---------------- DEEP SKY WITH MOON ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #020617 0%, #0c1a2e 50%, #064e3b 100%)',
        }}
      />

      {/* Crescent Moon */}
      <div
        style={{
          position: 'absolute',
          top: 180,
          left: 720,
          width: 140,
          height: 140,
          borderRadius: '50%',
          boxShadow: 'inset -25px 0px 0 0 #fef08a, 0 0 50px rgba(254, 240, 138, 0.4)',
          transform: `translateY(${cameraPan * 0.2}px)`,
        }}
      />

      {/* ---------------- BACKGROUND PARALLAX TREES ---------------- */}
      <svg
        style={{
          position: 'absolute',
          bottom: 300,
          left: cameraPan * 0.4,
          width: 1300,
          height: 900,
          opacity: 0.35,
        }}
      >
        <path d="M 0 900 L 80 300 L 160 900 L 260 900 L 340 250 L 420 900 L 600 900 L 680 280 L 760 900 L 950 900 L 1040 220 L 1130 900 Z" fill="#064e3b" />
      </svg>

      {/* ---------------- MIDGROUND TREES & ROOTS ---------------- */}
      <svg
        style={{
          position: 'absolute',
          bottom: 200,
          left: cameraPan * 0.8,
          width: 1350,
          height: 1100,
          opacity: 0.75,
        }}
      >
        {/* Massive Trunk Left */}
        <path d="M 40 1100 L 120 0 L 220 0 L 300 1100 Z" fill="#022c22" />
        <ellipse cx="170" cy="500" rx="35" ry="120" fill="#059669" opacity="0.15" />
        {/* Massive Trunk Right */}
        <path d="M 850 1100 L 920 0 L 1020 0 L 1090 1100 Z" fill="#022c22" />
        <ellipse cx="970" cy="450" rx="40" ry="140" fill="#059669" opacity="0.15" />
        {/* Hanging vines */}
        <path d="M 220 100 Q 240 350 200 480" stroke="#047857" strokeWidth="6" fill="none" opacity="0.6" />
        <path d="M 880 80 Q 860 300 890 440" stroke="#047857" strokeWidth="7" fill="none" opacity="0.6" />
      </svg>

      {/* ---------------- FOREST GROUND & MOSS ---------------- */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 380,
          background: 'radial-gradient(ellipse at 50% 0%, #064e3b 0%, #022c22 60%, #011612 100%)',
          boxShadow: '0 -20px 40px rgba(4, 120, 87, 0.25)',
        }}
      >
        {/* Glowing Mushrooms / Moss Specks */}
        <div style={{ position: 'absolute', top: 50, left: 240, width: 14, height: 18, borderRadius: '50% 50% 0 0', backgroundColor: '#38bdf8', boxShadow: '0 0 12px #38bdf8' }} />
        <div style={{ position: 'absolute', top: 70, left: 260, width: 10, height: 12, borderRadius: '50% 50% 0 0', backgroundColor: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
        <div style={{ position: 'absolute', top: 40, left: 860, width: 16, height: 20, borderRadius: '50% 50% 0 0', backgroundColor: '#86efac', boxShadow: '0 0 15px #86efac' }} />
      </div>

      {/* ---------------- FIREFLIES PARTICLE FIELD ---------------- */}
      <ParticleField type="fireflies" count={45} frame={frame} />

      {/* ---------------- ROBOT WALKING IN SCENE ---------------- */}
      <div
        style={{
          position: 'absolute',
          bottom: 230,
          left: robotX,
          zIndex: 50,
        }}
      >
        <Robot
          scale={1.25}
          bodyBob={bodyBob}
          armLeftAngle={armL}
          armRightAngle={armR}
          legLeftAngle={legL}
          legRightAngle={legR}
          eyeState={isBlinking ? 'blink' : 'normal'}
          mouthState="smile"
          headAngle={Math.sin(frame * 0.1) * 4}
          chestGlow={0.8 + 0.2 * Math.sin(frame * 0.15)}
        />
      </div>

      {/* ---------------- VOLUMETRIC FOREGROUND CANOPY ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 40%, transparent 40%, rgba(2, 6, 23, 0.6) 90%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
