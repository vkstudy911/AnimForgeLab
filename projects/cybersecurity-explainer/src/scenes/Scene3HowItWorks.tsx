import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { CyberGrid } from '../components/CyberGrid';

export const Scene3HowItWorks: React.FC = () => {
  const frame = useCurrentFrame(); // 0 to 420 (14s)

  // 4 Steps progress
  const step1Active = frame >= 20;
  const step2Active = frame >= 90;
  const step3Active = frame >= 180;
  const step4Active = frame >= 270;

  // Comparison card reveal at frame 320
  const comparisonReveal = interpolate(frame, [300, 340], [0, 1], {
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
        backgroundColor: '#030712',
      }}
    >
      <CyberGrid frame={frame} />

      {/* ---------------- SCENE HEADER ---------------- */}
      <div
        style={{
          position: 'absolute',
          top: 150,
          left: 60,
          right: 60,
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            color: '#38bdf8',
            fontSize: 20,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          ANATOMY OF AN AI-ASSISTED ATTACK
        </span>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 900,
            color: '#ffffff',
            margin: '12px 0 0 0',
          }}
        >
          How Does It Actually Work?
        </h1>
      </div>

      {/* ---------------- 4-STEP PIPELINE CARDS ---------------- */}
      <div
        style={{
          position: 'absolute',
          top: 300,
          left: 70,
          right: 70,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Step 1: Scan */}
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: step1Active ? '2px solid #38bdf8' : '1px solid #1e293b',
            borderRadius: 18,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            opacity: step1Active ? 1 : 0.35,
            transform: `translateX(${step1Active ? 0 : -30}px)`,
            boxShadow: step1Active ? '0 0 25px rgba(56, 189, 248, 0.3)' : 'none',
          }}
        >
          <div style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: '#0284c7', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 24, color: '#fff' }}>
            🔍
          </div>
          <div>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#38bdf8', letterSpacing: 1 }}>STEP 01 // RECON</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Automated Network Scanning</div>
            <div style={{ fontSize: 14, color: '#94a3b8' }}>AI scans thousands of endpoints per second</div>
          </div>
        </div>

        {/* Step 2: Detect */}
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: step2Active ? '2px solid #f59e0b' : '1px solid #1e293b',
            borderRadius: 18,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            opacity: step2Active ? 1 : 0.35,
            transform: `translateX(${step2Active ? 0 : -30}px)`,
            boxShadow: step2Active ? '0 0 25px rgba(245, 158, 11, 0.3)' : 'none',
          }}
        >
          <div style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: '#d97706', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 24, color: '#fff' }}>
            ⚡
          </div>
          <div>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#f59e0b', letterSpacing: 1 }}>STEP 02 // DISCOVERY</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Weakness Detected</div>
            <div style={{ fontSize: 14, color: '#94a3b8' }}>Unpatched software or misconfigured API located</div>
          </div>
        </div>

        {/* Step 3: Exploit */}
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: step3Active ? '2px solid #ef4444' : '1px solid #1e293b',
            borderRadius: 18,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            opacity: step3Active ? 1 : 0.35,
            transform: `translateX(${step3Active ? 0 : -30}px)`,
            boxShadow: step3Active ? '0 0 25px rgba(239, 68, 68, 0.3)' : 'none',
          }}
        >
          <div style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: '#dc2626', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 24, color: '#fff' }}>
            🎯
          </div>
          <div>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#ef4444', letterSpacing: 1 }}>STEP 03 // EXPLOIT</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Targeted Payload Attempt</div>
            <div style={{ fontSize: 14, color: '#94a3b8' }}>Automated credential stuffing or token injection</div>
          </div>
        </div>

        {/* Step 4: Defense Alert */}
        <div
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: step4Active ? '2px solid #10b981' : '1px solid #1e293b',
            borderRadius: 18,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            opacity: step4Active ? 1 : 0.35,
            transform: `translateX(${step4Active ? 0 : -30}px)`,
            boxShadow: step4Active ? '0 0 25px rgba(16, 185, 129, 0.3)' : 'none',
          }}
        >
          <div style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: '#059669', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 24, color: '#fff' }}>
            🛡️
          </div>
          <div>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#10b981', letterSpacing: 1 }}>STEP 04 // DEFENSE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Security Anomaly Triggered</div>
            <div style={{ fontSize: 14, color: '#94a3b8' }}>Behavioral monitoring detects non-human rate</div>
          </div>
        </div>
      </div>

      {/* ---------------- REALITY CHECK CARD (FACTUAL BALANCE) ---------------- */}
      <div
        style={{
          position: 'absolute',
          bottom: 220,
          left: 70,
          right: 70,
          opacity: comparisonReveal,
          transform: `translateY(${interpolate(comparisonReveal, [0, 1], [30, 0])}px)`,
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '2px solid #38bdf8',
          borderRadius: 24,
          padding: '26px 30px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        }}
      >
        <div style={{ fontSize: 15, fontFamily: 'monospace', color: '#38bdf8', letterSpacing: 2 }}>
          KEY REALITY CHECK
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '8px 0 10px 0' }}>
          Speed vs. "Magic"
        </div>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: '#cbd5e1', fontFamily: 'system-ui, sans-serif' }}>
          AI speeds up information analysis and repetitive tasks. It does <b>NOT</b> mean AI can automatically crack any account without existing vulnerabilities.
        </p>
      </div>
    </div>
  );
};
