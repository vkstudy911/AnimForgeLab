import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { CyberGrid } from '../components/CyberGrid';

export const Scene5Defense: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 240 (8s)

  // Hexagon shield expansion
  const shieldScale = interpolate(frame, [0, 45], [0.6, 1.0], {
    extrapolateRight: 'clamp',
  });
  const shieldGlow = 0.7 + 0.3 * Math.sin(frame * 0.15);

  const tips = [
    { icon: '🔑', title: 'Multi-Factor Auth (MFA)', sub: 'Never share OTPs or rely only on SMS' },
    { icon: '🔄', title: 'Continuous Software Updates', sub: 'Patch zero-day bugs before AI scans find them' },
    { icon: '🔔', title: 'Real-Time Transaction Alerts', sub: 'Instant caps & anomaly alerts on accounts' },
    { icon: '🚫', title: 'Suspicious Link Awareness', sub: 'Verify bank URLs & API domains before clicking' },
  ];

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
      <CyberGrid frame={frame} />

      {/* ---------------- BIG DIGITAL SECURITY SHIELD ---------------- */}
      <div
        style={{
          position: 'absolute',
          top: 180,
          left: 540,
          transform: `translate(-50%, 0) scale(${shieldScale})`,
          textAlign: 'center',
        }}
      >
        <svg width="240" height="270" viewBox="0 0 240 270" style={{ overflow: 'visible' }}>
          <defs>
            <radialGradient id="shieldFillGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
              <stop offset="80%" stopColor="#0284c7" stopOpacity="0.1" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          {/* Hexagon Outline */}
          <polygon
            points="120,10 225,65 225,195 120,250 15,195 15,65"
            fill="url(#shieldFillGrad)"
            stroke="#38bdf8"
            strokeWidth="6"
            filter={`drop-shadow(0 0 ${25 * shieldGlow}px #38bdf8)`}
          />
          {/* Inner Lock Icon */}
          <text x="120" y="160" fontSize="70" textAnchor="middle" fill="#fef08a">
            🛡️
          </text>
        </svg>

        <h2 style={{ fontSize: 38, fontWeight: 900, color: '#ffffff', margin: '20px 0 0 0' }}>
          HOW TO STAY SAFE
        </h2>
        <span style={{ fontSize: 16, fontFamily: 'monospace', color: '#38bdf8', letterSpacing: 2 }}>
          HYGIENE DEFEATS 90% OF AUTOMATED ATTACKS
        </span>
      </div>

      {/* ---------------- DEFENSE PILLARS LIST ---------------- */}
      <div
        style={{
          position: 'absolute',
          top: 600,
          left: 80,
          right: 80,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {tips.map((t, idx) => {
          const delay = 30 + idx * 35;
          const isRevealed = frame >= delay;
          const slideX = interpolate(frame, [delay, delay + 25], [40, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const opacity = interpolate(frame, [delay, delay + 25], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          return (
            <div
              key={idx}
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                border: '2px solid #0284c7',
                borderRadius: 20,
                padding: '24px 28px',
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                opacity,
                transform: `translateX(${slideX}px)`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  backgroundColor: '#0369a1',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontSize: 30,
                }}
              >
                {t.icon}
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#ffffff' }}>{t.title}</div>
                <div style={{ fontSize: 15, color: '#94a3b8', marginTop: 4 }}>{t.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
