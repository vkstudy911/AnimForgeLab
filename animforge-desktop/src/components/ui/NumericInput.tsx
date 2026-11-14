import { useEffect, useState } from 'react';

export interface NumericInputProps {
  id?: string;
  'aria-label'?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  strictPositive?: boolean;
  disabled?: boolean;
  onCommit: (val: number) => void;
}

export function NumericInput({
  id,
  'aria-label': ariaLabel,
  value,
  min,
  max,
  step,
  integer = false,
  strictPositive = false,
  disabled = false,
  onCommit,
}: NumericInputProps) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setRaw(String(value));
    }
  }, [value, focused]);

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={raw}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const parsed = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(parsed)) {
          let next = integer ? Math.round(parsed) : parsed;
          if (min !== undefined && next < min) next = min;
          if (max !== undefined && next > max) next = max;
          if (!strictPositive || next > 0) {
            if (next !== value) onCommit(next);
            setRaw(String(next));
            return;
          }
        }
        setRaw(String(value));
      }}
      onChange={(ev) => {
        const nextRaw = ev.target.value;
        setRaw(nextRaw);
        if (nextRaw.trim() === '') return;
        const parsed = Number(nextRaw);
        if (!Number.isFinite(parsed)) return;
        const next = integer ? Math.round(parsed) : parsed;
        if (strictPositive && next <= 0) return;
        if (min !== undefined && next < min) return;
        if (max !== undefined && next > max) return;
        onCommit(next);
      }}
    />
  );
}
