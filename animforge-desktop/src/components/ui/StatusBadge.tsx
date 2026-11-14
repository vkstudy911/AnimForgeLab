import type React from 'react';

export type BadgeTone = 'pass' | 'warn' | 'fail' | 'neutral' | 'planned';

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
