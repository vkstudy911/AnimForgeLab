import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { CyberGrid } from '../components/CyberGrid';

export const Scene6Ending: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 240 (8s)

  // Camera slow pull-back zoom out
  const cameraZoom = interpolate(frame, [0, 180], [1.15, 0.9], {
    extrapolateRight: 'clamp',
  });

  // Shield dome expansion
  const domeScale = interpolate(frame, [0, 80], [0.4, 1.0], {
    extrapolateRight: 'clamp',
  });

  // Final text reveal at frame 50
  const textOpacity = interpolate(frame, [50, 90], [0, 1], {
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
      <CyberGrid frame={frame} />

      {/* ---------------- CAMERA RIG ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${cameraZoom})`,
          transformOrigin: '540px 1000px',
        }}
      >
        {/* Futuristic Glowing City Skyline Silhouette */}
        <svg
          style={{
            position: 'absolute',
            bottom: 350,
            left: 0,
            width: 1080,
            height: 700,
          }}
        >
          {/* Back Towers */}
          <rect x="100" y="280" width="90" height="420" fill="#0f172a" />
          <rect x="230" y="200" width="110" height="500" fill="#1e293b" />
          <rect x="380" y="140" width="140" height="560" fill="#0f172a" />
          <polygon points="450,40 380,140 520,140" fill="#0284c7" />
          <rect x="560" y="220" width="120" height="480" fill="#1e293b" />
          <rect x="720" y="160" width="100" height="540" fill="#0f172a" />
          <polygon points="770,80 720,160 820,160" fill="#38bdf8" />
          <rect x="860" y="260" width="120" height="440" fill="#1e293b" />

          {/* Glowing Windows */}
          {Array.from({ length: 40 }).map((_, i) => (
            <rect
              key={i}
              x={120 + (i % 8) * 110}
              y={250 + Math.floor(i / 8) * 60}
              width={14}
              height={14}
              fill={(i + frame) % 5 === 0 ? '#38bdf8' : '#0369a1'}
              opacity={0.7}
            />
          ))}
        </svg>

        {/* ---------------- EXPANDING DIGITAL DOME SHIELD ---------------- */}
        <div
          style={{
            position: 'absolute',
            bottom: 300,
            left: 540,
            transform: `translate(-50%, 0) scale(${domeScale})`,
            width: 980,
            height: 600,
            borderRadius: '490px 490px 0 0',
            border: '4px solid #38bdf8',
            borderBottom: 'none',
            background: 'radial-gradient(ellipse at 50% 100%, rgba(56, 189, 248, 0.25) 0%, rgba(14, 165, 233, 0.05) 60%, transparent 100%)',
            boxShadow: '0 0 80px rgba(56, 189, 248, 0.4)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ---------------- FINAL POWERFUL QUOTE CARD ---------------- */}
      <div
        style={{
          position: 'absolute',
          bottom: 240,
          left: 70,
          right: 70,
          textAlign: 'center',
          opacity: textOpacity,
          transform: `translateY(${interpolate(textOpacity, [0, 1], [30, 0])}px)`,
          zIndex: 100,
        }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '2px solid rgba(56, 189, 248, 0.5)',
            borderRadius: 24,
            padding: '36px 40px',
            boxShadow: '0 0 60px rgba(2, 132, 199, 0.5), 0 30px 60px rgba(0,0,0,0.9)',
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 16,
              color: '#38bdf8',
              letterSpacing: 3,
              textTransform: 'uppercase',
              marginBottom: 14,
            }}
          >
            THE VERDICT
          </div>
          <h2
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 38,
              fontWeight: 900,
              color: '#ffffff',
              margin: '0 0 16px 0',
              lineHeight: 1.35,
              letterSpacing: 0.5,
            }}
          >
            THE FUTURE OF CYBERSECURITY IS AI VS AI
          </h2>
          <p
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 18,
              color: '#94a3b8',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            “AI khud na hero hai, na villain. Asli difference is baat se padega ki hum iska use kaise karte hain.”
          </p>
        </div>
      </div>
    </div>
  );
};
