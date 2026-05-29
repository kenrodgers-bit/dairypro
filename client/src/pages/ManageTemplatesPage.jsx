import React, { useEffect, useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical, Plus, Printer } from 'lucide-react';
import { api } from '../api';
import ConfirmModal from '../components/ConfirmModal';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';

const categories = ['milk', 'health', 'feed', 'expense', 'calving', 'vaccination', 'general'];
const fieldTypes = ['text', 'number', 'date', 'time', 'select', 'multiselect', 'boolean', 'photo', 'textarea'];
const getError = (error) => error.response?.data?.error || error.response?.data?.message || error.message || 'Something went wrong';

const blankTemplate = { name: '', description: '', category: 'general', fields: [], isActive: true };
const blankField = { fieldId: '', label: '', type: 'text', required: false, options: [], unit: '', min: '', max: '', placeholder: '', helpText: '' };

export default function ManageTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [submissionCounts, setSubmissionCounts] = useState({});
  const [builder, setBuilder] = useState(null);
  const [fieldEditor, setFieldEditor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [templateResponse, submissionResponse] = await Promise.all([
        api.get('/form-templates'),
        api.get('/form-submissions', { params: { limit: 100 } }),
      ]);
      setTemplates(templateResponse.data || []);
      const counts = {};
      (submissionResponse.data || []).forEach((submission) => {
        const id = submission.templateId?._id || submission.templateId;
        counts[id] = (counts[id] || 0) + 1;
      });
      setSubmissionCounts(counts);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveTemplate() {
    try {
      const payload = {
        ...builder,
        fields: (builder.fields || []).map((field, index) => ({
          ...field,
          order: index + 1,
          min: field.min === '' ? undefined : Number(field.min),
          max: field.max === '' ? undefined : Number(field.max),
        })),
      };
      if (builder._id) await api.put(`/form-templates/${builder._id}`, payload);
      else await api.post('/form-templates', payload);
      setBuilder(null);
      load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function toggleActive(template) {
    try {
      await api.patch(`/form-templates/${template._id}/toggle-active`);
      load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function confirmDelete() {
    try {
      await api.delete(`/form-templates/${deleting._id}`);
      setDeleting(null);
      load();
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  async function openHistory(template) {
    setHistoryFor(template);
    try {
      const response = await api.get(`/form-templates/${template._id}/print-history`);
      setHistory(response.data || []);
    } catch (requestError) {
      setToast(getError(requestError));
    }
  }

  function saveField(field, index) {
    const normalized = {
      ...field,
      fieldId: field.fieldId || field.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      options: Array.isArray(field.options) ? field.options : String(field.options || '').split(',').map((item) => item.trim()).filter(Boolean),
    };
    setBuilder((current) => {
      const fields = [...(current.fields || [])];
      if (index === undefined || index === null) fields.push(normalized);
      else fields[index] = normalized;
      return { ...current, fields };
    });
    setFieldEditor(null);
  }

  function reorderFields(activeId, overId) {
    if (!overId || activeId === overId) return;
    setBuilder((current) => {
      const fields = [...(current.fields || [])];
      const from = fields.findIndex((field) => field.fieldId === activeId);
      const to = fields.findIndex((field) => field.fieldId === overId);
      if (from < 0 || to < 0) return current;
      const [moved] = fields.splice(from, 1);
      fields.splice(to, 0, moved);
      return { ...current, fields };
    });
  }

  if (loading) return <div className="card animate-pulse text-slate-500">Loading templates...</div>;
  if (error) return <div className="card text-red-700">{error}</div>;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black">Form templates</h1>
          <p className="text-slate-500">Build paper-style and digital forms for farm field data collection.</p>
        </div>
        <button className="btn-primary" onClick={() => setBuilder({ ...blankTemplate, fields: [] })}>
          <Plus size={18} />
          New template
        </button>
      </div>

      {builder && (
        <div className="card mb-5">
          <div className="grid gap-3 md:grid-cols-3">
            <label>
              <span className="label">Template name</span>
              <input className="input" value={builder.name} onChange={(event) => setBuilder({ ...builder, name: event.target.value })} />
            </label>
            <label>
              <span className="label">Category</span>
              <select className="input" value={builder.category} onChange={(event) => setBuilder({ ...builder, category: event.target.value })}>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Active</span>
              <select className="input" value={builder.isActive ? 'yes' : 'no'} onChange={(event) => setBuilder({ ...builder, isActive: event.target.value === 'yes' })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label className="md:col-span-3">
              <span className="label">Description</span>
              <input className="input" value={builder.description || ''} onChange={(event) => setBuilder({ ...builder, description: event.target.value })} />
            </label>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <h2 className="font-black">Fields</h2>
            <button className="btn-soft" onClick={() => setFieldEditor({ field: { ...blankField }, index: null })}>Add field</button>
          </div>
          <DndContext onDragEnd={(event) => reorderFields(event.active?.id, event.over?.id)}>
            <div className="mt-3 space-y-2">
              {(builder.fields || []).map((field, index) => (
                <TemplateFieldRow
                  key={field.fieldId || `${field.label}-${index}`}
                  field={field}
                  index={index}
                  onEdit={() => setFieldEditor({ field, index })}
                  onRemove={() => setBuilder((current) => ({ ...current, fields: current.fields.filter((_, i) => i !== index) }))}
                />
              ))}
            </div>
          </DndContext>
          {!builder.fields?.length && <EmptyState title="No fields yet" description="Add fields to define what workers should fill in." />}
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-soft" onClick={() => setBuilder(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveTemplate}>Save template</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-3">Name</th>
              <th className="p-3">Category</th>
              <th className="p-3">Fields</th>
              <th className="p-3">Active</th>
              <th className="p-3">Submissions</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template._id} className="border-t align-top">
                <td className="p-3 font-semibold">{template.name}</td>
                <td className="p-3 capitalize">{template.category}</td>
                <td className="p-3">{template.fields?.length || 0}</td>
                <td className="p-3">
                  <button className={template.isActive ? 'font-bold text-emerald-700' : 'font-bold text-slate-500'} onClick={() => toggleActive(template)}>
                    {template.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="p-3">{submissionCounts[template._id] || 0}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="font-semibold text-emerald-700" onClick={() => setBuilder(template)}>Edit</button>
                    <button className="font-semibold text-red-600" onClick={() => setDeleting(template)}>Delete</button>
                    <button className="font-semibold text-slate-700" onClick={() => window.open(`/forms/print/${template._id}`, '_blank', 'noopener,noreferrer')}>
                      <Printer className="inline" size={15} /> Print blank
                    </button>
                    <button className="font-semibold text-slate-700" onClick={() => window.location.assign(`/forms/fill/${template._id}?mode=manual`)}>Data entry</button>
                    <button className="font-semibold text-slate-700" onClick={() => openHistory(template)}>Print history</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!templates.length && <EmptyState title="No form templates yet" description="Create your first field form template." />}
      </div>

      {historyFor && (
        <div className="card mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-black">Print history - {historyFor.name}</h2>
            <button className="btn-soft" onClick={() => setHistoryFor(null)}>Close</button>
          </div>
          {history.length ? history.map((row, index) => (
            <div className="mb-2 rounded-xl bg-slate-50 p-3 text-sm" key={`${row.printedAt}-${index}`}>
              Printed {row.copies} copies by {row.printedBy?.name || 'User'} on {new Date(row.printedAt).toLocaleString()}
              {row.notes && <span className="text-slate-500"> - {row.notes}</span>}
            </div>
          )) : <EmptyState title="No print history" description="Printed paper batches will appear here." />}
        </div>
      )}

      {fieldEditor && <FieldEditorModal {...fieldEditor} onCancel={() => setFieldEditor(null)} onSave={saveField} />}
      <ConfirmModal
        isOpen={Boolean(deleting)}
        title="Delete form template"
        message={`Delete "${deleting?.name}"? Templates with existing submissions cannot be deleted.`}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}

function TemplateFieldRow({ field, index, onEdit, onRemove }) {
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({ id: field.fieldId });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: field.fieldId });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div ref={setDropRef} className={isOver ? 'rounded-xl ring-2 ring-emerald-300' : ''}>
      <div ref={setDragRef} style={style} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="flex items-center gap-3">
          <button className="text-slate-400" {...listeners} {...attributes}><GripVertical size={18} /></button>
          <div>
            <p className="font-bold">{index + 1}. {field.label || field.fieldId}</p>
            <p className="text-xs text-slate-500">{field.fieldId} - {field.type}{field.required ? ' - required' : ''}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="font-semibold text-emerald-700" onClick={onEdit}>Edit</button>
          <button className="font-semibold text-red-600" onClick={onRemove}>Remove</button>
        </div>
      </div>
    </div>
  );
}

function FieldEditorModal({ field, index, onCancel, onSave }) {
  const [form, setForm] = useState({ ...field, options: Array.isArray(field.options) ? field.options.join(', ') : field.options || '' });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <div className="card w-full max-w-2xl">
        <h2 className="mb-4 text-xl font-black">Field editor</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="label">Field label</span>
            <input className="input" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
          </label>
          <label>
            <span className="label">Field key</span>
            <input className="input" value={form.fieldId} onChange={(event) => setForm({ ...form, fieldId: event.target.value })} />
          </label>
          <label>
            <span className="label">Type</span>
            <select className="input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {fieldTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Required</span>
            <select className="input" value={form.required ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, required: event.target.value === 'yes' })}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <label>
            <span className="label">Help text</span>
            <input className="input" value={form.helpText || ''} onChange={(event) => setForm({ ...form, helpText: event.target.value })} />
          </label>
          <label>
            <span className="label">Placeholder</span>
            <input className="input" value={form.placeholder || ''} onChange={(event) => setForm({ ...form, placeholder: event.target.value })} />
          </label>
          <label>
            <span className="label">Unit</span>
            <input className="input" value={form.unit || ''} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
          </label>
          <label>
            <span className="label">Options</span>
            <input className="input" placeholder="One, Two, Three" value={form.options || ''} onChange={(event) => setForm({ ...form, options: event.target.value })} />
          </label>
          <label>
            <span className="label">Min</span>
            <input className="input" type="number" value={form.min ?? ''} onChange={(event) => setForm({ ...form, min: event.target.value })} />
          </label>
          <label>
            <span className="label">Max</span>
            <input className="input" type="number" value={form.max ?? ''} onChange={(event) => setForm({ ...form, max: event.target.value })} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-soft" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(form, index)}>Save field</button>
        </div>
      </div>
    </div>
  );
}
