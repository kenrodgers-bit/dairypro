import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Cloud, FileText, Printer } from 'lucide-react';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import SubmissionStatusBadge from '../components/SubmissionStatusBadge';
import Toast from '../components/Toast';

const getError = (error) => error.response?.data?.error || error.response?.data?.message || error.message || 'Something went wrong';
const managerRoles = ['owner', 'manager'];
const categoryTone = {
  milk: 'bg-blue-50 text-blue-700',
  health: 'bg-red-50 text-red-700',
  feed: 'bg-amber-50 text-amber-700',
  expense: 'bg-emerald-50 text-emerald-700',
  calving: 'bg-purple-50 text-purple-700',
  vaccination: 'bg-sky-50 text-sky-700',
  general: 'bg-slate-100 text-slate-700',
};

function CategoryBadge({ category }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${categoryTone[category] || categoryTone.general}`}>{category}</span>;
}

function TemplateActions({ template, onHistory }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-soft" onClick={() => window.open(`/forms/print/${template._id}`, '_blank', 'noopener,noreferrer')}>
        <Printer size={16} />
        Print blank
      </button>
      <button className="btn-soft" onClick={() => window.location.assign(`/forms/fill/${template._id}?mode=manual`)}>
        <FileText size={16} />
        Data entry
      </button>
      <button className="btn-soft" onClick={() => onHistory(template)}>
        Print history
      </button>
    </div>
  );
}

export default function FormsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState({ draft: 0, submitted: 0, approved: 0, rejected: 0, transferred: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const activeTab = searchParams.get('tab') || 'pending';
  const canManage = managerRoles.includes(user?.role);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [meResponse, templateResponse, submissionResponse] = await Promise.all([
        api.get('/auth/me'),
        api.get('/form-templates'),
        api.get('/form-submissions', { params: { limit: 100 } }),
      ]);
      setUser(meResponse.data);
      setTemplates(templateResponse.data || []);
      setSubmissions(submissionResponse.data || []);

      if (managerRoles.includes(meResponse.data?.role)) {
        const statsResponse = await api.get('/form-submissions/stats');
        setStats(statsResponse.data || {});
      }
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visibleSubmissions = useMemo(() => {
    if (!statusFilter) return submissions;
    return submissions.filter((submission) => submission.status === statusFilter);
  }, [statusFilter, submissions]);
  const pending = submissions.filter((submission) => submission.status === 'submitted');
  const approved = submissions.filter((submission) => submission.status === 'approved');
  const drafts = submissions.filter((submission) => submission.status === 'draft');

  async function openHistory(template) {
    setHistoryFor(template);
    try {
      const response = await api.get(`/form-templates/${template._id}/print-history`);
      setHistory(response.data || []);
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  if (loading) return <div className="card animate-pulse text-slate-500">Loading field forms...</div>;
  if (error) return <div className="card text-red-700">{error}</div>;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black">Field forms</h1>
          <p className="text-slate-500">Workers submit structured forms for review before records enter the main system.</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => navigate('/forms/templates')}>
            Manage templates
          </button>
        )}
      </div>

      {canManage ? (
        <>
          <div className="mb-5 grid gap-3 md:grid-cols-5">
            {['submitted', 'approved', 'rejected', 'transferred', 'draft'].map((status) => (
              <button key={status} className="card text-left" onClick={() => setSearchParams({ tab: status === 'approved' ? 'approved' : 'all' })}>
                <p className="text-sm font-semibold capitalize text-slate-500">{status}</p>
                <p className="mt-2 text-3xl font-black">{stats[status] || 0}</p>
              </button>
            ))}
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            {[
              ['pending', 'Pending review'],
              ['approved', 'Approved'],
              ['all', 'All submissions'],
              ['templates', 'Templates'],
            ].map(([tab, label]) => (
              <button key={tab} className={activeTab === tab ? 'btn-primary' : 'btn-soft'} onClick={() => setSearchParams({ tab })}>
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'pending' && <SubmissionTable rows={pending} actionLabel="Review" onAction={(row) => navigate(`/forms/review/${row._id}`)} emptyTitle="No submissions waiting for review" />}
          {activeTab === 'approved' && <SubmissionTable rows={approved} actionLabel="Transfer to system" onAction={(row) => navigate(`/forms/review/${row._id}`)} emptyTitle="No approved submissions waiting for transfer" />}
          {activeTab === 'all' && (
            <>
              <div className="card mb-4">
                <label className="label">Status filter</label>
                <select className="input mt-1 max-w-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {['draft', 'submitted', 'approved', 'rejected', 'transferred'].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <SubmissionTable rows={visibleSubmissions} actionLabel="View" onAction={(row) => navigate(`/forms/review/${row._id}`)} emptyTitle="No form submissions yet" />
            </>
          )}
          {activeTab === 'templates' && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="p-3">Template</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Fields</th>
                    <th className="p-3">Active</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template._id} className="border-t align-top">
                      <td className="p-3 font-semibold">{template.name}</td>
                      <td className="p-3"><CategoryBadge category={template.category} /></td>
                      <td className="p-3">{template.fields?.length || 0}</td>
                      <td className="p-3">{template.isActive ? 'Yes' : 'No'}</td>
                      <td className="p-3"><TemplateActions template={template} onHistory={openHistory} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!templates.length && <EmptyState title="No form templates yet" description="Create templates to collect structured field data." />}
            </div>
          )}
        </>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-4 text-xl font-black">Fill a form</h2>
            {templates.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => (
                  <div key={template._id} className="card">
                    <div className="mb-3 flex items-center justify-between">
                      <ClipboardList className="text-emerald-600" />
                      <CategoryBadge category={template.category} />
                    </div>
                    <h3 className="text-xl font-black">{template.name}</h3>
                    <p className="mt-2 min-h-12 text-sm text-slate-500">{template.description}</p>
                    <button className="btn-primary mt-5" onClick={() => navigate(`/forms/fill/${template._id}`)}>
                      Fill in
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No active forms" description="Your manager has not activated any field forms yet." />
            )}
          </section>
          <section>
            <h2 className="mb-4 text-xl font-black">My submissions</h2>
            <SubmissionTable rows={submissions} actionLabel="View" onAction={(row) => navigate(`/forms/review/${row._id}`)} emptyTitle="No submissions yet" workerView />
          </section>
        </>
      )}

      {historyFor && (
        <div className="card mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-black">Print history - {historyFor.name}</h2>
            <button className="btn-soft" onClick={() => setHistoryFor(null)}>Close</button>
          </div>
          {history.length ? (
            <div className="space-y-2">
              {history.map((row, index) => (
                <div key={`${row.printedAt}-${index}`} className="rounded-xl bg-slate-50 p-3 text-sm">
                  Printed {row.copies} copies by {row.printedBy?.name || 'User'} on {new Date(row.printedAt).toLocaleString()}
                  {row.notes && <span className="text-slate-500"> - {row.notes}</span>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No print history" description="Print events will appear here." />
          )}
        </div>
      )}
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}

function SubmissionTable({ rows, actionLabel, onAction, emptyTitle, workerView }) {
  if (!rows.length) return <EmptyState title={emptyTitle} description="Forms will appear here as soon as they are submitted." />;

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="p-3">{workerView ? 'Form' : 'Worker'}</th>
            <th className="p-3">Template</th>
            <th className="p-3">Submitted</th>
            <th className="p-3">Status</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id} className="border-t">
              <td className="p-3">
                {workerView ? row.category : row.submittedBy?.name || 'Worker'}
                {row.isOfflineDraft && <Cloud className="ml-2 inline text-slate-400" size={15} />}
                {row.isManualEntry && <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Paper</span>}
              </td>
              <td className="p-3 font-semibold">{row.templateName}</td>
              <td className="p-3">{row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}</td>
              <td className="p-3">
                <SubmissionStatusBadge status={row.status} />
                {row.status === 'rejected' && row.reviewNotes && <p className="mt-2 text-xs text-red-700">{row.reviewNotes}</p>}
              </td>
              <td className="p-3 text-right">
                <button className="font-semibold text-emerald-700" onClick={() => onAction(row)}>{actionLabel}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
