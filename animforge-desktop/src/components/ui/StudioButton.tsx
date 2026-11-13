import React from 'react';

export interface StudioButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  loading?: boolean;
}

const variantClassMap: Record<NonNullable<StudioButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export const StudioButton = React.forwardRef<HTMLButtonElement, StudioButtonProps>(
  function StudioButton(
    {
      variant = 'secondary',
      size = 'md',
      icon,
      loading = false,
      disabled = false,
      children,
      className,
      style,
      type = 'button',
      ...props
    },
    ref
  ) {
    const isSm = size === 'sm';
    const variantClass = variant ? variantClassMap[variant] : '';
    const combinedClassName = [variantClass, className].filter(Boolean).join(' ');

    const combinedStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: isSm ? '4px' : '6px',
      ...(isSm ? { padding: '3px 8px', fontSize: 'var(--text-xs)' } : {}),
      ...style,
    };

    return (
      <button
        ref={ref}
        type={type}
        className={combinedClassName || undefined}
        disabled={disabled || loading}
        aria-busy={loading ? 'true' : undefined}
        style={combinedStyle}
        {...props}
      >
        {icon && (
          <span className="studio-button-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {children}
      </button>
    );
  }
);
