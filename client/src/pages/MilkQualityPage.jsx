import React, { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import ConfirmModal from '../components/ConfirmModal';
import DatePicker from '../components/DatePicker';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';

const getError = (error) => error.response?.data?.message || error.response?.data?.error || error.message || 'Something went wrong';

export default function MilkQualityPage() {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState({ cowId: '', testDate: '', scc: '', bacteriaCount: '', bodyConditionScore: '', testedBy: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [deleting, setDeleting] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/milk-quality');
      setRecords(response.data || []);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const chartData = useMemo(
    () =>
      [...records]
        .sort((a, b) => new Date(a.testDate) - new Date(b.testDate))
        .map((record) => ({
          date: record.testDate ? new Date(record.testDate).toLocaleDateString() : '',
          scc: record.scc || 0,
        })),
    [records],
  );

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save(event) {
    event.preventDefault();
    try {
      await api.post('/milk-quality', {
        ...form,
        scc: Number(form.scc || 0),
        bacteriaCount: Number(form.bacteriaCount || 0),
        bodyConditionScore: form.bodyConditionScore ? Number(form.bodyConditionScore) : undefined,
      });
      setForm({ cowId: '', testDate: '', scc: '', bacteriaCount: '', bodyConditionScore: '', testedBy: '', notes: '' });
      load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.delete(`/milk-quality/${deleting._id}`);
      setDeleting(null);
      load();
    } catch {
      setToast('Delete failed, please try again');
    }
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="text-3xl font-black">Milk Quality</h1>
        <p className="text-slate-500">Track somatic cell counts, bacteria counts, body condition, and mastitis flags.</p>
      </div>
      <form className="card mb-5" onSubmit={save}>
        <div className="grid md:grid-cols-3 gap-3">
          <label>
            <span className="label">Cow ID</span>
            <input className="input" value={form.cowId} onChange={(event) => update('cowId', event.target.value)} required />
          </label>
          <label>
            <span className="label">Test date</span>
            <DatePicker value={form.testDate} onChange={(value) => update('testDate', value)} />
          </label>
          <label>
            <span className="label">SCC</span>
            <input className="input" type="number" min="0" value={form.scc} onChange={(event) => update('scc', event.target.value)} />
          </label>
          <label>
            <span className="label">Bacteria count</span>
            <input className="input" type="number" min="0" value={form.bacteriaCount} onChange={(event) => update('bacteriaCount', event.target.value)} />
          </label>
          <label>
            <span className="label">Body condition</span>
            <input
              className="input"
              type="number"
              min="1"
              max="5"
              step="0.1"
              value={form.bodyConditionScore}
              onChange={(event) => update('bodyConditionScore', event.target.value)}
            />
          </label>
          <label>
            <span className="label">Tested by</span>
            <input className="input" value={form.testedBy} onChange={(event) => update('testedBy', event.target.value)} />
          </label>
        </div>
        <button className="btn-primary mt-5">Add quality test</button>
      </form>
      {records.length > 0 && (
        <div className="card mb-5">
          <h2 className="mb-4 font-black">SCC Trend</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="scc" stroke="#16a34a" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {error && <div className="card text-red-700">{error}</div>}
      {loading ? (
        <div className="card animate-pulse text-slate-500">Loading milk quality records...</div>
      ) : records.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="p-3">Cow</th>
                <th className="p-3">Date</th>
                <th className="p-3">SCC</th>
                <th className="p-3">Risk</th>
                <th className="p-3">BCS</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record._id} className="border-t">
                  <td className="p-3">{record.cowId?.name || record.cowId}</td>
                  <td className="p-3">{record.testDate ? new Date(record.testDate).toLocaleDateString() : ''}</td>
                  <td className="p-3">{Number(record.scc || 0).toLocaleString()}</td>
                  <td className="p-3">
                    <span className={record.highRisk ? 'font-bold text-red-700' : 'font-bold text-emerald-700'}>
                      {record.highRisk ? 'High' : 'Normal'}
                    </span>
                  </td>
                  <td className="p-3">{record.bodyConditionScore || ''}</td>
                  <td className="p-3 text-right">
                    <button className="font-semibold text-red-600" onClick={() => setDeleting(record)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="" title="No milk quality tests yet" description="Add SCC and bacteria tests to monitor herd quality." />
      )}
      <ConfirmModal
        isOpen={Boolean(deleting)}
        title="Delete quality record"
        message="This quality test will be removed."
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
