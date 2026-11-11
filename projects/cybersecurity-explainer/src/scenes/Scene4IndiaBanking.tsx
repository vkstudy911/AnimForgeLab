import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { CyberGrid } from '../components/CyberGrid';

export const Scene4IndiaBanking: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 300 (10s)

  // Camera slow cinematic rise
  const camY = interpolate(frame, [0, 300], [0, -60]);

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

      {/* ---------------- 3D FINANCIAL ECOSYSTEM ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateY(${camY}px)`,
        }}
      >
        {/* Glowing Server Towers in Background */}
        <div
          style={{
            position: 'absolute',
            top: 380,
            left: 80,
            right: 80,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 20,
          }}
        >
          {/* Server Rack 1 */}
          <div style={{ flex: 1, height: 480, backgroundColor: '#090d16', border: '2px solid #1e293b', borderRadius: 16, padding: 16, boxShadow: '0 0 30px rgba(56, 189, 248, 0.2)' }}>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#38bdf8', marginBottom: 12 }}>RACK_01 // FINTECH_CORE</div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 38, marginBottom: 12, backgroundColor: '#1e293b', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: (i + frame) % 4 === 0 ? '#10b981' : '#0284c7' }} />
                <div style={{ height: 4, width: '60%', backgroundColor: '#334155', borderRadius: 2 }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#38bdf8' }} />
              </div>
            ))}
          </div>

          {/* Server Rack 2 (With Alert) */}
          <div style={{ flex: 1, height: 480, backgroundColor: '#090d16', border: '2px solid #ef4444', borderRadius: 16, padding: 16, boxShadow: '0 0 30px rgba(239, 68, 68, 0.35)' }}>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#ef4444', marginBottom: 12 }}>RACK_02 // PAYMENT_API</div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 38, marginBottom: 12, backgroundColor: '#1e293b', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: i === 3 ? '#ef4444' : '#10b981' }} />
                <div style={{ height: 4, width: '60%', backgroundColor: '#334155', borderRadius: 2 }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: i === 3 ? '#ef4444' : '#38bdf8' }} />
              </div>
            ))}
          </div>
        </div>

        {/* ---------------- UPI & INDIAN FINANCIAL EMBLEN ---------------- */}
        <div
          style={{
            position: 'absolute',
            top: 920,
            left: 120,
            right: 120,
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
            border: '2px solid #f59e0b',
            borderRadius: 24,
            padding: 30,
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 28 }}>🇮🇳</span>
            <span style={{ fontSize: 18, fontFamily: 'monospace', color: '#f59e0b', fontWeight: 700, letterSpacing: 2 }}>
              FINANCIAL SECTOR WARNING
            </span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#ffffff', lineHeight: 1.3 }}>
            Banks & Fintech Under Alert
          </div>
          <p style={{ margin: '12px 0 0 0', fontSize: 16, color: '#94a3b8', lineHeight: 1.5 }}>
            CSIRT-Fin & CERT-In flagged threat actor <b>Crafty Falcon</b> targeting payment APIs with automated tools like <b>ARTEX</b> and <b>PentAGI</b>.
          </p>
        </div>

        {/* ---------------- OFFICIAL ALERT BADGE ---------------- */}
        <div
          style={{
            position: 'absolute',
            bottom: 240,
            left: 80,
            right: 80,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '2px solid #ef4444',
            borderRadius: 20,
            padding: '24px 30px',
            textAlign: 'center',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 0 40px rgba(239, 68, 68, 0.3)',
          }}
        >
          <div style={{ color: '#f87171', fontSize: 16, fontFamily: 'monospace', letterSpacing: 3, textTransform: 'uppercase' }}>
            OFFICIAL ADVISORY
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: '#ffffff', margin: '8px 0 0 0' }}>
            INDIA: CYBERSECURITY ALERT
          </h2>
        </div>
      </div>
    </div>
  );
};
