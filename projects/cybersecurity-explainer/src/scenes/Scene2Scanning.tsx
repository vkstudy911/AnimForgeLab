import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { CyberGrid } from '../components/CyberGrid';

export const Scene2Scanning: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 300 (10s)

  // Radar sweep angle
  const radarAngle = (frame * 3.5) % 360;

  // Nodes position in 2.5D space
  const nodes = [
    { id: 1, x: 260, y: 520, name: 'AUTH_GATEWAY', vuln: false },
    { id: 2, x: 780, y: 560, name: 'DISBURSE_API', vuln: true, vulnFrame: 50, tag: 'API_EXPLOIT' },
    { id: 3, x: 540, y: 840, name: 'CORE_DATABASE', vuln: false },
    { id: 4, x: 300, y: 1140, name: 'UPI_SWITCH', vuln: true, vulnFrame: 110, tag: 'RATE_LIMIT_BYPASS' },
    { id: 5, x: 800, y: 1180, name: 'MULE_ACCOUNT_ROUTER', vuln: true, vulnFrame: 170, tag: 'TOKEN_THEFT' },
    { id: 6, x: 540, y: 1460, name: 'CUSTOMER_PORTAL', vuln: false },
  ];

  // Camera drift
  const camZoom = interpolate(frame, [0, 300], [1.0, 1.12]);

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

      {/* ---------------- CAMERA RIG ---------------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${camZoom})`,
          transformOrigin: '540px 960px',
        }}
      >
        {/* Radar Sweeper Circle */}
        <div
          style={{
            position: 'absolute',
            top: 450,
            left: 90,
            width: 900,
            height: 900,
            borderRadius: '50%',
            border: '2px dashed rgba(56, 189, 248, 0.25)',
            pointerEvents: 'none',
          }}
        >
          {/* Radar Sweep Wedge */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: `conic-gradient(from ${radarAngle}deg, rgba(56, 189, 248, 0.35) 0deg, transparent 65deg)`,
            }}
          />
        </div>

        {/* Network Synapse Connection Lines */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: 1080,
            height: 1920,
            pointerEvents: 'none',
          }}
        >
          {/* Cyan connection lines between nodes */}
          <line x1="260" y1="520" x2="780" y2="560" stroke="#0284c7" strokeWidth="2.5" strokeDasharray="6 6" />
          <line x1="260" y1="520" x2="540" y2="840" stroke="#0284c7" strokeWidth="3" />
          <line x1="780" y1="560" x2="540" y2="840" stroke="#0284c7" strokeWidth="3" />
          <line x1="540" y1="840" x2="300" y2="1140" stroke="#0284c7" strokeWidth="3" />
          <line x1="540" y1="840" x2="800" y2="1180" stroke="#0284c7" strokeWidth="3" />
          <line x1="300" y1="1140" x2="540" y2="1460" stroke="#0284c7" strokeWidth="2.5" />
          <line x1="800" y1="1180" x2="540" y2="1460" stroke="#0284c7" strokeWidth="2.5" />
        </svg>

        {/* Interactive Network Node Devices */}
        {nodes.map((n) => {
          const isBreached = n.vuln && frame >= (n.vulnFrame || 0);
          return (
            <div
              key={n.id}
              style={{
                position: 'absolute',
                left: n.x,
                top: n.y,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {/* Outer Pulse Ring */}
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: '50%',
                  border: isBreached ? '3px solid #ef4444' : '2px solid #38bdf8',
                  backgroundColor: isBreached ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.1)',
                  boxShadow: isBreached ? '0 0 40px #ef4444' : '0 0 25px #0284c7',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  transition: 'all 0.3s ease',
                }}
              >
                <div
                  style={{
                    width: 45,
                    height: 45,
                    borderRadius: 10,
                    backgroundColor: isBreached ? '#ef4444' : '#38bdf8',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 20,
                  }}
                >
                  {isBreached ? '!' : '✓'}
                </div>
              </div>

              {/* Node Name Tag */}
              <div
                style={{
                  marginTop: 12,
                  fontFamily: 'monospace',
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  color: isBreached ? '#fca5a5' : '#7dd3fc',
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: isBreached ? '1px solid #ef4444' : '1px solid #0369a1',
                }}
              >
                {n.name}
              </div>

              {/* Vulnerability alert tag */}
              {isBreached && (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#ffffff',
                    backgroundColor: '#ef4444',
                    padding: '3px 8px',
                    borderRadius: 4,
                    boxShadow: '0 0 15px rgba(239,68,68,0.8)',
                  }}
                >
                  ⚠️ {n.tag}
                </div>
              )}
            </div>
          );
        })}

        {/* ---------------- HUD TELEMETRY OVERLAY ---------------- */}
        <div
          style={{
            position: 'absolute',
            bottom: 220,
            left: 70,
            right: 70,
            background: 'rgba(15, 23, 42, 0.9)',
            border: '2px solid rgba(56, 189, 248, 0.4)',
            borderRadius: 20,
            padding: '24px 32px',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ color: '#38bdf8', fontSize: 16, fontFamily: 'monospace', letterSpacing: 2 }}>
            TARGETED THREAT ACTOR // CRAFTY_FALCON
          </div>
          <div style={{ color: '#ffffff', fontSize: 32, fontWeight: 800, margin: '8px 0 14px 0' }}>
            Automated AI Vulnerability Scanning
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 15, color: '#94a3b8', fontFamily: 'monospace' }}>
            <span>SPEED: <b style={{ color: '#38bdf8' }}>MACHINE SPEED</b></span>
            <span>RECON TOOLS: <b style={{ color: '#f59e0b' }}>ARTEX / PentAGI</b></span>
          </div>
        </div>
      </div>
    </div>
  );
};
