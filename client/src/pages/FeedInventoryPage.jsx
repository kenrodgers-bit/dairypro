import React, { useEffect, useState } from 'react';
import { api, money } from '../api';
import ConfirmModal from '../components/ConfirmModal';
import DatePicker from '../components/DatePicker';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';

const getError = (error) => error.response?.data?.message || error.response?.data?.error || error.message || 'Something went wrong';

export default function FeedInventoryPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ feedType: '', stockKg: '', costPerKg: '', supplier: '', lowStockThresholdKg: 50, lastRestocked: '' });
  const [restock, setRestock] = useState({ feedId: '', quantityKg: '', lastRestocked: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [deleting, setDeleting] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/feed-inventory');
      setItems(response.data || []);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save(event) {
    event.preventDefault();
    try {
      await api.post('/feed-inventory', {
        ...form,
        stockKg: Number(form.stockKg || 0),
        costPerKg: Number(form.costPerKg || 0),
        lowStockThresholdKg: Number(form.lowStockThresholdKg || 0),
      });
      setForm({ feedType: '', stockKg: '', costPerKg: '', supplier: '', lowStockThresholdKg: 50, lastRestocked: '' });
      load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function saveRestock(event) {
    event.preventDefault();
    const item = items.find((candidate) => candidate._id === restock.feedId);
    if (!item) return setToast('Choose a feed item to restock');

    try {
      await api.put(`/feed-inventory/${item._id}`, {
        stockKg: Number(item.stockKg || 0) + Number(restock.quantityKg || 0),
        lastRestocked: restock.lastRestocked || new Date().toISOString().slice(0, 10),
      });
      setRestock({ feedId: '', quantityKg: '', lastRestocked: '' });
      load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.delete(`/feed-inventory/${deleting._id}`);
      setDeleting(null);
      load();
    } catch {
      setToast('Delete failed, please try again');
    }
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="text-3xl font-black">Feed Inventory</h1>
        <p className="text-slate-500">Monitor feed stock, supplier costs, and low-stock thresholds.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card" onSubmit={save}>
          <h2 className="mb-4 font-black">Add feed stock</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className="label">Feed type</span>
              <input className="input" value={form.feedType} onChange={(event) => update('feedType', event.target.value)} required />
            </label>
            <label>
              <span className="label">Stock kg</span>
              <input className="input" type="number" min="0" value={form.stockKg} onChange={(event) => update('stockKg', event.target.value)} required />
            </label>
            <label>
              <span className="label">Cost per kg</span>
              <input className="input" type="number" min="0" value={form.costPerKg} onChange={(event) => update('costPerKg', event.target.value)} required />
            </label>
            <label>
              <span className="label">Supplier</span>
              <input className="input" value={form.supplier} onChange={(event) => update('supplier', event.target.value)} />
            </label>
            <label>
              <span className="label">Low stock threshold</span>
              <input
                className="input"
                type="number"
                min="0"
                value={form.lowStockThresholdKg}
                onChange={(event) => update('lowStockThresholdKg', event.target.value)}
              />
            </label>
            <label>
              <span className="label">Last restocked</span>
              <DatePicker value={form.lastRestocked} onChange={(value) => update('lastRestocked', value)} />
            </label>
          </div>
          <button className="btn-primary mt-5">Add feed</button>
        </form>
        <form className="card" onSubmit={saveRestock}>
          <h2 className="mb-4 font-black">Restock feed</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className="label">Feed item</span>
              <select className="input" value={restock.feedId} onChange={(event) => setRestock((current) => ({ ...current, feedId: event.target.value }))}>
                <option value="">Choose feed</option>
                {items.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.feedType}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Quantity kg</span>
              <input
                className="input"
                type="number"
                min="0"
                value={restock.quantityKg}
                onChange={(event) => setRestock((current) => ({ ...current, quantityKg: event.target.value }))}
              />
            </label>
            <label>
              <span className="label">Restock date</span>
              <DatePicker value={restock.lastRestocked} onChange={(value) => setRestock((current) => ({ ...current, lastRestocked: value }))} />
            </label>
          </div>
          <button className="btn-primary mt-5">Save restock</button>
        </form>
      </div>
      {error && <div className="card mt-5 text-red-700">{error}</div>}
      {loading ? (
        <div className="card mt-5 animate-pulse text-slate-500">Loading feed inventory...</div>
      ) : items.length ? (
        <div className="card mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="p-3">Feed</th>
                <th className="p-3">Stock</th>
                <th className="p-3">Cost/kg</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-t">
                  <td className="p-3 font-semibold">{item.feedType}</td>
                  <td className="p-3">{item.stockKg} kg</td>
                  <td className="p-3">{money(item.costPerKg)}</td>
                  <td className="p-3">{item.supplier}</td>
                  <td className="p-3">
                    <span className={item.stockKg < item.lowStockThresholdKg ? 'font-bold text-red-700' : 'font-bold text-emerald-700'}>
                      {item.stockKg < item.lowStockThresholdKg ? 'Low stock' : 'OK'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button className="font-semibold text-red-600" onClick={() => setDeleting(item)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState icon="" title="No feed inventory yet" description="Add feed stock to track costs and low-stock alerts." />
        </div>
      )}
      <ConfirmModal
        isOpen={Boolean(deleting)}
        title="Delete feed item"
        message="This inventory item will be removed."
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
