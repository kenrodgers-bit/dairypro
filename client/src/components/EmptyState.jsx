import React from 'react';

export default function EmptyState({ icon = '', title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
      <div className="mb-3 text-3xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-lg font-black">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className="btn-primary mt-5" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
