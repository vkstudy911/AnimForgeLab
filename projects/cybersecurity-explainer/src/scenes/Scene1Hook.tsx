import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CyberGrid } from '../components/CyberGrid';

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 180 (6.0s)
  const { fps } = useVideoConfig();

  // Camera zoom in towards the payment screen
  const cameraZoom = interpolate(frame, [0, 180], [1.0, 1.25], {
    extrapolateRight: 'clamp',
  });

  // Glitch trigger at frame 70
  const isGlitched = frame >= 70;
  const glitchTime = isGlitched ? frame - 70 : 0;
  const glitchShakeX = isGlitched && glitchTime < 45 ? Math.sin(glitchTime * 1.8) * 16 : 0;
  const glitchShakeY = isGlitched && glitchTime < 45 ? Math.cos(glitchTime * 2.1) * 10 : 0;

  // Warning modal entrance spring
  const alertScale = spring({
    frame: Math.max(0, frame - 75),
    fps,
    config: { damping: 10, stiffness: 120 },
  });

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
          transform: `scale(${cameraZoom}) translate(${glitchShakeX}px, ${glitchShakeY}px)`,
          transformOrigin: '540px 960px',
        }}
      >
        {/* Floating 3D Laptop Device */}
        <div
          style={{
            position: 'absolute',
            top: 520,
            left: 140,
            width: 800,
            height: 620,
            perspective: 1000,
          }}
        >
          {/* Laptop Screen Bezel */}
          <div
            style={{
              position: 'relative',
              width: 800,
              height: 520,
              backgroundColor: '#090d16',
              borderRadius: '24px 24px 6px 6px',
              border: '6px solid #1e293b',
              boxShadow: isGlitched
                ? '0 0 80px rgba(239, 68, 68, 0.7), 0 30px 60px rgba(0,0,0,0.9)'
                : '0 0 60px rgba(56, 189, 248, 0.35), 0 30px 60px rgba(0,0,0,0.9)',
              overflow: 'hidden',
            }}
          >
            {/* Screen Content: Online Banking Checkout */}
            {!isGlitched ? (
              <div
                style={{
                  padding: 40,
                  height: '100%',
                  background: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)',
                  color: '#fff',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                {/* Browser bar */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 35 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#ef4444' }} />
                  <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                  <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#10b981' }} />
                  <div
                    style={{
                      marginLeft: 20,
                      flex: 1,
                      backgroundColor: '#1e293b',
                      borderRadius: 8,
                      height: 24,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 12,
                      color: '#94a3b8',
                      fontFamily: 'monospace',
                    }}
                  >
                    🔒 https://pay.secure-gateway.in/checkout
                  </div>
                </div>

                {/* Payment card */}
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    borderRadius: 20,
                    padding: 30,
                    border: '1px solid #334155',
                  }}
                >
                  <div style={{ fontSize: 16, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Transfer To Merchant
                  </div>
                  <div style={{ fontSize: 44, fontWeight: 700, color: '#38bdf8', margin: '10px 0 20px 0' }}>
                    ₹ 14,999.00
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      padding: '8px 16px',
                      borderRadius: 12,
                      color: '#7dd3fc',
                      fontSize: 15,
                    }}
                  >
                    <span>● Instant UPI Authentication</span>
                  </div>
                </div>
              </div>
            ) : (
              /* GLITCH OVERRIDE SCREEN */
              <div
                style={{
                  height: '100%',
                  background: 'linear-gradient(180deg, #450a0a 0%, #1a0505 100%)',
                  padding: 40,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  color: '#f87171',
                  fontFamily: 'monospace',
                }}
              >
                <div style={{ fontSize: 24, letterSpacing: 4, color: '#fca5a5' }}>
                  [CRITICAL EXPLOIT DETECTED]
                </div>
                <div style={{ fontSize: 56, fontWeight: 900, color: '#ef4444', margin: '20px 0', textAlign: 'center' }}>
                  SESSION HIJACKED
                </div>
                <div style={{ fontSize: 18, color: '#f87171', backgroundColor: 'rgba(0,0,0,0.6)', padding: '10px 20px', borderRadius: 8 }}>
                  API_TOKEN_EXFILTRATED // ADAPTIVE BOT RECON
                </div>
              </div>
            )}
          </div>

          {/* Laptop Base Keyboard */}
          <div
            style={{
              position: 'relative',
              width: 920,
              left: -60,
              height: 24,
              backgroundColor: '#1e293b',
              borderRadius: '0 0 20px 20px',
              borderTop: '2px solid #334155',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
          />
        </div>

        {/* ---------------- BIG CINEMATIC TITLE OVERLAY ---------------- */}
        <div
          style={{
            position: 'absolute',
            bottom: 280,
            left: 80,
            right: 80,
            textAlign: 'center',
            zIndex: 100,
          }}
        >
          {isGlitched && (
            <div
              style={{
                transform: `scale(${alertScale})`,
                background: 'rgba(15, 23, 42, 0.92)',
                border: '3px solid #ef4444',
                borderRadius: 24,
                padding: '30px 40px',
                boxShadow: '0 0 50px rgba(239, 68, 68, 0.6), 0 30px 60px rgba(0,0,0,0.9)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div
                style={{
                  color: '#f87171',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 4,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                ⚠️ Threat Report 2026
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 48,
                  fontWeight: 900,
                  color: '#ffffff',
                  letterSpacing: 1.5,
                  textShadow: '0 0 20px rgba(239, 68, 68, 0.8)',
                }}
              >
                AI-POWERED CYBERATTACKS
              </h1>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
