import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import SubmissionStatusBadge from '../components/SubmissionStatusBadge';
import Toast from '../components/Toast';

const managerRoles = ['owner', 'manager'];
const getError = (error) => error.response?.data?.error || error.response?.data?.message || error.message || 'Something went wrong';
const recordLinks = {
  MilkRecord: '/milk',
  HealthRecord: '/health',
  FeedConsumption: '/feed-inventory',
  Expense: '/expenses',
  PregnancyRecord: '/pregnancy',
  DailyReport: '/forms',
};

function shouldHighlight(field, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return false;
  if (field.min !== undefined && numeric < field.min) return true;
  if (field.max !== undefined && numeric > field.max) return true;
  if (field.fieldId === 'yieldLitres' && numeric > 150) return true;
  if (field.fieldId === 'temperature' && numeric > 41) return true;
  return false;
}

export default function ReviewSubmissionPage() {
  const { submissionId } = useParams();
  const [submission, setSubmission] = useState(null);
  const [user, setUser] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const canReview = managerRoles.includes(user?.role);
  const template = submission?.templateId;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [meResponse, submissionResponse] = await Promise.all([api.get('/auth/me'), api.get(`/form-submissions/${submissionId}`)]);
      setUser(meResponse.data);
      setSubmission(submissionResponse.data);
      setReviewNotes(submissionResponse.data.reviewNotes || '');
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [submissionId]);

  async function review(action) {
    try {
      const response = await api.patch(`/form-submissions/${submissionId}/review`, { action, reviewNotes });
      setSubmission(response.data);
      setToast(action === 'approve' ? 'Submission approved' : action === 'reject' ? 'Submission rejected' : 'Submission re-opened');
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function transfer() {
    try {
      const response = await api.post(`/form-submissions/${submissionId}/transfer`);
      setSubmission(response.data);
      setToast('Transferred to system records');
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  if (loading) return <div className="card animate-pulse text-slate-500">Loading submission...</div>;
  if (error) return <div className="card text-red-700">{error}</div>;
  if (!submission) return <EmptyState title="Submission not found" description="Try opening it again from Field forms." />;

  const fields = template?.fields || [];
  const farmData = submission.farmData || {};

  return (
    <>
      <div className="mb-5">
        <h1 className="text-3xl font-black">Review submission</h1>
        <p className="text-slate-500">{submission.templateName}</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-5">
        <section className="card xl:col-span-3">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SubmissionStatusBadge status={submission.status} />
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">{submission.category}</span>
            {submission.isManualEntry && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                Entered from paper form{farmData._paperRef ? ` - ${farmData._paperRef}` : ''}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {fields.map((field) => {
              const value = farmData[field.fieldId];
              const flagged = shouldHighlight(field, value);
              return (
                <div key={field.fieldId} className={`rounded-xl border p-4 ${flagged ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-sm font-bold text-slate-500">
                    {field.label}
                    {field.unit && <span> ({field.unit})</span>}
                  </p>
                  <p className="mt-1 font-semibold">{Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value || '-'}</p>
                  {flagged && <p className="mt-2 text-xs font-bold text-red-700">Out of expected range - review before approval</p>}
                </div>
              );
            })}
          </div>
          {submission.workerNotes && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">Worker notes</p>
              <p className="mt-1">{submission.workerNotes}</p>
            </div>
          )}
        </section>
        <aside className="card xl:col-span-2">
          <h2 className="text-xl font-black">Review panel</h2>
          <div className="mt-4 space-y-2 text-sm">
            <p><b>Submitted by:</b> {submission.submittedBy?.name || 'Worker'}</p>
            <p><b>Submitted:</b> {submission.createdAt ? new Date(submission.createdAt).toLocaleString() : ''}</p>
            <p><b>Cow tag:</b> {farmData.cowTagNumber || farmData.motherTagNumber || '-'}</p>
            <p><b>Category:</b> {submission.category}</p>
          </div>

          {canReview ? (
            <>
              <label className="mt-5 block">
                <span className="label">Feedback for worker</span>
                <textarea className="input min-h-28" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} />
              </label>

              {submission.status === 'submitted' && (
                <div className="mt-5 flex gap-2">
                  <button className="btn-primary" onClick={() => review('approve')}>Approve</button>
                  <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={() => review('reject')}>Reject</button>
                </div>
              )}

              {submission.status === 'approved' && (
                <button className="btn-primary mt-5 w-full" onClick={transfer}>Transfer to system</button>
              )}

              {submission.status === 'rejected' && (
                <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">
                  <p className="font-bold">Rejected</p>
                  <p className="mt-1 text-sm">{submission.reviewNotes || 'No rejection reason provided.'}</p>
                  <button className="btn-soft mt-4" onClick={() => review('reopen')}>Re-open for worker</button>
                </div>
              )}

              {submission.status === 'transferred' && (
                <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-800">
                  <p className="font-bold">Transferred successfully</p>
                  <p className="mt-1 text-sm">Record ID: {submission.transferredRecordId}</p>
                  <Link className="mt-4 inline-flex font-bold text-emerald-700" to={recordLinks[submission.transferredCollection] || '/forms'}>
                    View record
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This is a read-only view. Managers and owners review and transfer submissions.</div>
          )}
        </aside>
      </div>
      <Toast message={toast} type={toast.includes('approved') || toast.includes('Transferred') ? 'success' : 'error'} onClose={() => setToast('')} />
    </>
  );
}
