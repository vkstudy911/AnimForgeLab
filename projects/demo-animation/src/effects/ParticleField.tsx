import React from 'react';

export interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
}

export interface ParticleFieldProps {
  type: 'fireflies' | 'wind' | 'galaxy';
  count?: number;
  frame: number;
  width?: number;
  height?: number;
}

export const ParticleField: React.FC<ParticleFieldProps> = ({
  type,
  count = 35,
  frame,
  width = 1080,
  height = 1920,
}) => {
  // Generate deterministic particle field based on seed
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    const seed = (i * 9301 + 49297) % 233280;
    const baseNorm = seed / 233280.0;
    const speed = 0.5 + (i % 5) * 0.4;

    if (type === 'fireflies') {
      const x = ((baseNorm * width + Math.sin((frame * 0.03 + i) * speed) * 80) % width + width) % width;
      const y = ((baseNorm * height * 0.8 + Math.cos((frame * 0.02 + i) * speed) * 60) % height + height) % height;
      const glow = 0.4 + 0.6 * Math.abs(Math.sin(frame * 0.08 + i));
      particles.push({
        x,
        y: y + height * 0.1,
        size: 4 + (i % 4) * 2,
        color: i % 3 === 0 ? '#fef08a' : '#86efac',
        opacity: glow,
      });
    } else if (type === 'wind') {
      // Wind blowing fast horizontally with slight downward slant
      const x = ((baseNorm * width - frame * (8 + speed * 6)) % width + width) % width;
      const y = ((baseNorm * height + Math.sin(frame * 0.1 + i) * 30 + frame * 1.5) % height + height) % height;
      particles.push({
        x,
        y,
        size: 3 + (i % 3) * 3,
        color: i % 2 === 0 ? '#e2e8f0' : '#94a3b8',
        opacity: 0.3 + 0.5 * Math.sin(frame * 0.05 + i),
      });
    } else if (type === 'galaxy') {
      // Expanding radiant galaxy stars
      const angle = (i / count) * Math.PI * 2 + frame * 0.005;
      const radius = ((baseNorm * 800 + frame * (1.5 + speed)) % 900);
      const cx = width / 2;
      const cy = height * 0.38;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * (radius * 0.7);
      const twinkle = 0.5 + 0.5 * Math.sin(frame * 0.12 + i * 2);
      particles.push({
        x,
        y,
        size: 2 + (i % 4) * 2.5,
        color: i % 4 === 0 ? '#38bdf8' : i % 4 === 1 ? '#fde047' : i % 4 === 2 ? '#c084fc' : '#ffffff',
        opacity: twinkle * Math.min(1, radius / 200),
      });
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {particles.map((p, idx) => (
        <div
          key={idx}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 2.5}px ${p.color}`,
            opacity: p.opacity,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
};
