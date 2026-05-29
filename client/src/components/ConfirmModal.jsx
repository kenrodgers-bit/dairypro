import React, { useEffect, useRef } from 'react';

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    confirmRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll(focusableSelector) || []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="card w-full max-w-md"
      >
        <h2 id="confirm-modal-title" className="text-xl font-black">
          {title}
        </h2>
        <p className="mt-3 text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-soft" onClick={onCancel}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" className="btn-primary bg-red-600 hover:bg-red-700" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
