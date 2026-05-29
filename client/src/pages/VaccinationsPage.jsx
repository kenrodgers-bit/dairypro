import React, { useEffect, useState } from 'react';
import { api } from '../api';
import ConfirmModal from '../components/ConfirmModal';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';
import VaccinationForm from '../components/VaccinationForm';

const getError = (error) => error.response?.data?.message || error.response?.data?.error || error.message || 'Something went wrong';

export default function VaccinationsPage() {
  const [records, setRecords] = useState([]);
  const [filterCow, setFilterCow] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/vaccinations', { params: filterCow ? { cowId: filterCow } : {} });
      setRecords(response.data || []);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [filterCow]);

  async function save(form) {
    try {
      if (editing) {
        await api.put(`/vaccinations/${editing._id}`, form);
      } else {
        await api.post('/vaccinations', form);
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.delete(`/vaccinations/${deleting._id}`);
      setDeleting(null);
      load();
    } catch {
      setToast('Delete failed, please try again');
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black">Vaccinations</h1>
          <p className="text-slate-500">Track vaccines, withdrawal periods, batches, and next due dates.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          Add vaccination
        </button>
      </div>
      <div className="card mb-4">
        <label className="label">Filter by Cow ID</label>
        <input className="input mt-1" value={filterCow} onChange={(event) => setFilterCow(event.target.value)} placeholder="Optional Cow ID" />
      </div>
      {(showForm || editing) && (
        <VaccinationForm
          initialValue={editing || {}}
          onSubmit={save}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
      {error && <div className="card text-red-700">{error}</div>}
      {loading ? (
        <div className="card animate-pulse text-slate-500">Loading vaccinations...</div>
      ) : records.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="p-3">Cow</th>
                <th className="p-3">Vaccine</th>
                <th className="p-3">Date given</th>
                <th className="p-3">Next due</th>
                <th className="p-3">Batch</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record._id} className="border-t">
                  <td className="p-3">{record.cowId?.name || record.cowId}</td>
                  <td className="p-3">{record.vaccineType}</td>
                  <td className="p-3">{record.dateGiven ? new Date(record.dateGiven).toLocaleDateString() : ''}</td>
                  <td className="p-3">{record.nextDueDate ? new Date(record.nextDueDate).toLocaleDateString() : ''}</td>
                  <td className="p-3">{record.batchNumber}</td>
                  <td className="p-3 text-right">
                    <button className="mr-3 font-semibold text-emerald-700" onClick={() => setEditing(record)}>
                      Edit
                    </button>
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
        <EmptyState
          icon=""
          title="No vaccination records yet"
          description="Add vaccines and next due dates to keep the herd protected."
          actionLabel="Add vaccination"
          onAction={() => setShowForm(true)}
        />
      )}
      <ConfirmModal
        isOpen={Boolean(deleting)}
        title="Delete vaccination record"
        message="This record will be archived and hidden from normal vaccination lists."
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
