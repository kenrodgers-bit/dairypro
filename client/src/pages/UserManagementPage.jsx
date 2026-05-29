import React, { useEffect, useState } from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';

const roles = ['owner', 'manager', 'worker', 'viewer'];
const getError = (error) => error.response?.data?.error || error.response?.data?.message || error.message || 'Something went wrong';

const emptyForm = { name: '', email: '', role: 'worker', password: '', active: true };

export default function UserManagementPage() {
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const canManage = me?.role === 'owner';

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [meResponse, usersResponse, auditResponse] = await Promise.all([
        api.get('/auth/me'),
        api.get('/users'),
        api.get('/audit-logs?entityType=User&limit=20'),
      ]);
      setMe(meResponse.data);
      setUsers(usersResponse.data || []);
      setAuditLogs(auditResponse.data || []);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openNewUser() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(user) {
    setEditing(user);
    setForm({ name: user.name || '', email: user.email || '', role: user.role || 'worker', password: '', active: user.active !== false });
    setShowForm(true);
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!canManage) return;

    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (editing) {
        await api.put(`/users/${editing._id}`, payload);
        setToast('User updated');
      } else {
        await api.post('/users', payload);
        setToast('User created');
      }
      setEditing(null);
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function toggleUser(user) {
    if (!canManage) return;
    try {
      await api.patch(`/users/${user._id}/toggle-active`);
      setToast(user.active === false ? 'User activated' : 'User deactivated');
      await load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  if (loading) return <div className="card animate-pulse text-slate-500">Loading users...</div>;
  if (error) return <div className="card text-red-700">{error}</div>;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black">User management</h1>
          <p className="text-slate-500">Manage staff access and review account changes for this farm.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-soft" onClick={load}>
            <RefreshCw size={18} />
            Refresh
          </button>
          {canManage && (
            <button className="btn-primary" onClick={openNewUser}>
              <UserPlus size={18} />
              New user
            </button>
          )}
        </div>
      </div>

      {!canManage && (
        <div className="mb-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          Managers can view users and audit history. Only owners can create, edit, or deactivate accounts.
        </div>
      )}

      {canManage && showForm && (
        <form className="card mb-5" onSubmit={saveUser}>
          <h2 className="mb-4 text-xl font-black">{editing ? 'Edit user' : 'Create user'}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className="label">Name</span>
              <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              <span className="label">Email</span>
              <input className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>
            <label>
              <span className="label">Role</span>
              <select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">{editing ? 'New password (optional)' : 'Temporary password'}</span>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required={!editing}
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Active account
          </label>
          <div className="mt-5 flex gap-2">
            <button className="btn-primary" type="submit">
              {editing ? 'Save changes' : 'Create user'}
            </button>
            <button
              className="btn-soft"
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
                setShowForm(false);
              }}
            >
              Clear
            </button>
          </div>
        </form>
      )}

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              {canManage && <th className="p-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className="border-t">
                <td className="p-3 font-semibold">{user.name}</td>
                <td className="p-3">{user.email}</td>
                <td className="p-3 capitalize">{user.role}</td>
                <td className="p-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${user.active === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {user.active === false ? 'Inactive' : 'Active'}
                  </span>
                </td>
                {canManage && (
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-soft py-1 text-xs" onClick={() => openEdit(user)}>
                        Edit
                      </button>
                      <button className="btn-soft py-1 text-xs" onClick={() => toggleUser(user)}>
                        {user.active === false ? 'Activate' : 'Deactivate'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <EmptyState title="No users yet" description="Create staff accounts so each person has the right access level." />}
      </section>

      <section className="card mt-5">
        <h2 className="mb-4 text-xl font-black">Recent user audit trail</h2>
        <div className="space-y-3">
          {auditLogs.map((log) => (
            <div key={log._id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-bold">{log.summary}</p>
              <p className="text-xs text-slate-500">
                {log.actor?.name || 'System'} - {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
              </p>
            </div>
          ))}
          {!auditLogs.length && <p className="text-sm text-slate-500">No user changes have been recorded yet.</p>}
        </div>
      </section>

      <Toast message={toast} type={toast.includes('created') || toast.includes('updated') || toast.includes('activated') ? 'success' : 'error'} onClose={() => setToast('')} />
    </>
  );
}
