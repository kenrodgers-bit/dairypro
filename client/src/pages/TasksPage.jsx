import React, { useEffect, useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { api } from '../api';
import DatePicker from '../components/DatePicker';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';

const statuses = ['pending', 'in-progress', 'complete'];
const getError = (error) => error.response?.data?.message || error.response?.data?.error || error.message || 'Something went wrong';

function TaskCard({ task }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task._id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="mb-3 cursor-grab rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-black">{task.title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{task.priority}</span>
      </div>
      {task.description && <p className="mt-2 text-sm text-slate-500">{task.description}</p>}
      <p className="mt-3 text-xs font-semibold text-slate-500">
        Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'not set'}
      </p>
      {task.assignedTo?.name && <p className="mt-1 text-xs text-slate-500">Assigned to {task.assignedTo.name}</p>}
    </div>
  );
}

function Column({ status, tasks }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section ref={setNodeRef} className={`min-h-80 rounded-xl border border-slate-200 bg-slate-50 p-3 ${isOver ? 'ring-2 ring-emerald-400' : ''}`}>
      <h2 className="mb-3 font-black capitalize">{status.replace('-', ' ')}</h2>
      {tasks.map((task) => (
        <TaskCard key={task._id} task={task} />
      ))}
      {!tasks.length && <p className="py-8 text-center text-sm text-slate-400">No tasks</p>}
    </section>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [filterUser, setFilterUser] = useState('');
  const [form, setForm] = useState({ title: '', description: '', assignedTo: '', dueDate: '', priority: 'medium', relatedCowId: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const canManage = ['owner', 'manager'].includes(user?.role);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [meResponse, tasksResponse] = await Promise.all([api.get('/auth/me'), api.get('/tasks')]);
      setUser(meResponse.data);
      setTasks(tasksResponse.data || []);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const users = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      if (task.assignedTo?._id) map.set(task.assignedTo._id, task.assignedTo);
    });
    return Array.from(map.values());
  }, [tasks]);

  const visibleTasks = filterUser ? tasks.filter((task) => task.assignedTo?._id === filterUser) : tasks;
  const byStatus = statuses.reduce((acc, status) => {
    acc[status] = visibleTasks.filter((task) => (status === 'pending' ? ['pending', 'overdue'].includes(task.status) : task.status === status));
    return acc;
  }, {});

  async function createTask(event) {
    event.preventDefault();
    try {
      await api.post('/tasks', form);
      setForm({ title: '', description: '', assignedTo: '', dueDate: '', priority: 'medium', relatedCowId: '' });
      load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || !statuses.includes(over.id)) return;
    const task = tasks.find((candidate) => candidate._id === active.id);
    if (!task || task.status === over.id) return;

    try {
      await api.put(`/tasks/${task._id}`, { status: over.id });
      setTasks((current) => current.map((candidate) => (candidate._id === task._id ? { ...candidate, status: over.id } : candidate)));
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black">Tasks</h1>
          <p className="text-slate-500">Drag tasks between pending, in-progress, and complete.</p>
        </div>
        {canManage && (
          <select className="input max-w-xs" value={filterUser} onChange={(event) => setFilterUser(event.target.value)}>
            <option value="">All workers</option>
            {users.map((worker) => (
              <option key={worker._id} value={worker._id}>
                {worker.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {canManage && (
        <form className="card mb-5" onSubmit={createTask}>
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              <span className="label">Title</span>
              <input className="input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
            </label>
            <label>
              <span className="label">Assigned user ID</span>
              <input className="input" value={form.assignedTo} onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.value }))} required />
            </label>
            <label>
              <span className="label">Due date</span>
              <DatePicker value={form.dueDate} onChange={(value) => setForm((current) => ({ ...current, dueDate: value }))} />
            </label>
            <label>
              <span className="label">Priority</span>
              <select className="input" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="label">Description</span>
              <input className="input" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
          </div>
          <button className="btn-primary mt-5">Create task</button>
        </form>
      )}
      {error && <div className="card text-red-700">{error}</div>}
      {loading ? (
        <div className="card animate-pulse text-slate-500">Loading tasks...</div>
      ) : visibleTasks.length ? (
        <DndContext onDragEnd={handleDragEnd}>
          <div className="grid gap-4 xl:grid-cols-3">
            {statuses.map((status) => (
              <Column key={status} status={status} tasks={byStatus[status]} />
            ))}
          </div>
        </DndContext>
      ) : (
        <EmptyState icon="" title="No tasks yet" description="Assigned work will appear here." />
      )}
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
