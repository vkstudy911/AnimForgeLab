import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Robot } from '../characters/Robot';
import { StarAsset } from '../effects/StarAsset';
import { ParticleField } from '../effects/ParticleField';

export const Scene6MagicalEnding: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 210 (7s)

  // Star locking into place at frame 25, followed by galaxy explosion
  const galaxyBurst = interpolate(frame, [25, 75], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Pull back camera zoom reveal
  const cameraZoom = interpolate(frame, [0, 150], [1.15, 0.95], {
    extrapolateRight: 'clamp',
  });

  // Final text opacity (fades in at frame 90, holds completely stable until 210)
  const textOpacity = interpolate(frame, [90, 130], [0, 1], {
    extrapolateLeft: 'clamp',
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
      {/* ---------------- CAMERA RIG ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${cameraZoom})`,
          transformOrigin: '540px 1100px',
        }}
      >
        {/* Deep Cosmic Night Sky */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 25%, #1e1b4b 0%, #0c152e 50%, #020617 100%)',
          }}
        />

        {/* Swirling Aurora Borealis Ribbons */}
        <div
          style={{
            position: 'absolute',
            top: 100,
            left: -200,
            right: -200,
            height: 800,
            background: `radial-gradient(circle at ${50 + Math.sin(frame * 0.04) * 15}% 30%, rgba(56, 189, 248, ${0.4 * galaxyBurst}) 0%, rgba(168, 85, 247, ${0.3 * galaxyBurst}) 40%, transparent 70%)`,
            filter: 'blur(50px)',
            opacity: galaxyBurst,
          }}
        />

        {/* ---------------- SWIRLING GALAXY PARTICLES ---------------- */}
        {galaxyBurst > 0 && (
          <ParticleField type="galaxy" count={90} frame={frame} />
        )}

        {/* ---------------- THE RETURNED HERO STAR ---------------- */}
        <StarAsset
          x={540}
          y={340}
          size={85}
          brightness={1.0}
          pulse={Math.sin(frame * 0.15)}
          rotation={frame * 1.5}
        />

        {/* Constellation Connection Rays */}
        <svg
          style={{
            position: 'absolute',
            top: 150,
            left: 100,
            width: 880,
            height: 500,
            opacity: galaxyBurst * 0.7,
            pointerEvents: 'none',
          }}
        >
          <line x1="440" y1="190" x2="250" y2="120" stroke="#fef08a" strokeWidth="2" strokeDasharray="6 6" />
          <line x1="440" y1="190" x2="630" y2="110" stroke="#fef08a" strokeWidth="2" strokeDasharray="6 6" />
          <line x1="440" y1="190" x2="490" y2="340" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 6" />
          <line x1="440" y1="190" x2="380" y2="350" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 6" />
        </svg>

        {/* Mountain Silhouette with Warm Stardust Rim Light */}
        <svg
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 1080,
            height: 950,
          }}
        >
          <polygon points="120,950 480,580 600,580 960,950" fill="#090d16" />
          {/* Starlight Rim Light on Edge */}
          <polyline
            points="120,950 480,580 600,580 960,950"
            stroke="rgba(254, 240, 138, 0.4)"
            strokeWidth="6"
            fill="none"
          />
        </svg>

        {/* ---------------- ROBOT GAZING UPWARD AND SMILING ---------------- */}
        <div
          style={{
            position: 'absolute',
            bottom: 330,
            left: 380,
            zIndex: 50,
          }}
        >
          <Robot
            scale={1.25}
            headAngle={-38} // Looking up into the heavens
            armLeftAngle={-15}
            armRightAngle={-15}
            eyeState="happy"
            mouthState="happy_beam"
            chestGlow={1.0}
          />
        </div>
      </div>

      {/* ---------------- FINAL CINEMATIC MESSAGE CARD ---------------- */}
      <div
        style={{
          position: 'absolute',
          bottom: 220,
          left: 80,
          right: 80,
          textAlign: 'center',
          opacity: textOpacity,
          transform: `translateY(${interpolate(textOpacity, [0, 1], [30, 0])}px)`,
          zIndex: 100,
        }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(16px)',
            border: '2px solid rgba(254, 240, 138, 0.3)',
            borderRadius: 24,
            padding: '36px 40px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)',
          }}
        >
          <p
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 40,
              fontWeight: 600,
              lineHeight: 1.45,
              color: '#ffffff',
              margin: 0,
              letterSpacing: 0.5,
              textShadow: '0 4px 15px rgba(0, 0, 0, 0.6)',
            }}
          >
            “Sometimes, even the smallest hands can bring back the biggest light.”
          </p>
          <span
            style={{
              display: 'inline-block',
              marginTop: 18,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: '#38bdf8',
            }}
          >
            The Little Robot & The Lost Star
          </span>
        </div>
      </div>
    </div>
  );
};
