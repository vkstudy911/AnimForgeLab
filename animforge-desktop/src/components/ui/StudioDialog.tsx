import type React from 'react';
import { useEffect, useId, useRef } from 'react';

export interface StudioDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  preventEscapeWhenDirty?: boolean;
  children: React.ReactNode;
}

export function StudioDialog({
  open,
  title,
  onClose,
  preventEscapeWhenDirty = false,
  children,
}: StudioDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        previousFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected && document.activeElement !== prev) {
        prev.focus();
      }
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="studio-dialog"
      aria-labelledby={titleId}
      onCancel={(ev) => {
        if (preventEscapeWhenDirty) {
          ev.preventDefault();
          return;
        }
        onClose();
      }}
      onClick={(ev) => {
        if (ev.target === dialogRef.current && !preventEscapeWhenDirty) {
          onClose();
        }
      }}
    >
      {open ? (
        <div className="studio-dialog-inner">
          <header className="studio-dialog-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close dialog">
              Close
            </button>
          </header>
          <div className="studio-dialog-body">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
