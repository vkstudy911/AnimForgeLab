import type React from 'react';
import { cloneElement, useEffect, useId, useState } from 'react';

export interface StudioTooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function StudioTooltip({
  content,
  children,
  position = 'top',
}: StudioTooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVisible(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    setVisible(true);
    children.props.onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    setVisible(false);
    children.props.onMouseLeave?.(e);
  };

  const handleFocus = (e: React.FocusEvent) => {
    setVisible(true);
    children.props.onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent) => {
    setVisible(false);
    children.props.onBlur?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setVisible(false);
    }
    children.props.onKeyDown?.(e);
  };

  const existingDescribedBy = children.props['aria-describedby'];
  const ariaDescribedBy = visible
    ? [existingDescribedBy, id].filter(Boolean).join(' ')
    : existingDescribedBy;

  const trigger = cloneElement(children, {
    'aria-describedby': ariaDescribedBy || undefined,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  });

  return (
    <span className="studio-tooltip-wrapper" style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger}
      {visible && (
        <span
          id={id}
          role="tooltip"
          className="studio-tooltip"
          data-position={position}
        >
          {content}
        </span>
      )}
    </span>
  );
}
