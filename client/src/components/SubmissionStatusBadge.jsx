import React from 'react';
import { CheckCircle2, Clock3, Database, Pencil, XCircle } from 'lucide-react';

const styles = {
  draft: ['bg-slate-100 text-slate-700', Pencil, 'Draft'],
  submitted: ['bg-blue-50 text-blue-700', Clock3, 'Awaiting review'],
  approved: ['bg-emerald-50 text-emerald-700', CheckCircle2, 'Approved'],
  rejected: ['bg-red-50 text-red-700', XCircle, 'Rejected'],
  transferred: ['bg-purple-50 text-purple-700', Database, 'Transferred'],
};

export default function SubmissionStatusBadge({ status }) {
  const [className, Icon, label] = styles[status] || styles.draft;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${className}`}>
      <Icon size={14} />
      {label}
    </span>
  );
}
