import type React from 'react';

export interface StudioNotificationProps {
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string | React.ReactNode;
  onDismiss?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function StudioNotification({
  type,
  title,
  message,
  onDismiss,
  action,
  className,
}: StudioNotificationProps) {
  const role = type === 'error' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={`studio-notification studio-notification-${type} ${className || ''}`.trim()}
    >
      <div className="studio-notification-content">
        {title && <strong className="studio-notification-title">{title}</strong>}
        <span className="studio-notification-message">{message}</span>
      </div>
      {(action || onDismiss) && (
        <div className="studio-notification-actions">
          {action && (
            <button
              type="button"
              className="studio-notification-action"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              className="studio-notification-dismiss btn-ghost"
              onClick={onDismiss}
              aria-label="Dismiss"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
