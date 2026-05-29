import React, { useEffect } from 'react';

export default function Toast({ message, type = 'error', onClose }) {
  useEffect(() => {
    if (!message || !onClose) return undefined;
    const timer = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const tone = type === 'success' ? 'bg-emerald-600' : 'bg-red-600';

  return (
    <div className={`fixed bottom-5 right-5 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${tone}`} role="status">
      {message}
    </div>
  );
}
