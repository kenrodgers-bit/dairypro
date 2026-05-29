import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import DatePicker from '../components/DatePicker';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';
import { offlinePrefix } from '../components/OfflineDraftSync';

const getError = (error) => error.response?.data?.error || error.response?.data?.message || error.message || 'Something went wrong';

export default function FillFormPage() {
  const { templateId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const manualMode = searchParams.get('mode') === 'manual';
  const [template, setTemplate] = useState(null);
  const [user, setUser] = useState(null);
  const [farmData, setFarmData] = useState({});
  const [workerNotes, setWorkerNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [restoreAvailable, setRestoreAvailable] = useState(false);
  const [manualChecks, setManualChecks] = useState([false, false, false, false]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [offlineBanner, setOfflineBanner] = useState('');

  const draftKey = useMemo(() => `draft_${templateId}_${user?._id || 'local'}`, [templateId, user?._id]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [templateResponse, meResponse] = await Promise.all([api.get(`/form-templates/${templateId}`), api.get('/auth/me')]);
      setTemplate(templateResponse.data);
      setUser(meResponse.data);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [templateId]);

  useEffect(() => {
    if (localStorage.getItem(draftKey)) setRestoreAvailable(true);
  }, [draftKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Object.keys(farmData).length) {
        localStorage.setItem(draftKey, JSON.stringify({ farmData, workerNotes, manualChecks }));
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [draftKey, farmData, manualChecks, workerNotes]);

  function restoreDraft() {
    const saved = JSON.parse(localStorage.getItem(draftKey) || '{}');
    setFarmData(saved.farmData || {});
    setWorkerNotes(saved.workerNotes || '');
    setManualChecks(saved.manualChecks || [false, false, false, false]);
    setRestoreAvailable(false);
  }

  function updateField(fieldId, value) {
    setFarmData((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => ({ ...current, [fieldId]: '' }));
  }

  function validate() {
    const nextErrors = {};
    for (const field of template.fields || []) {
      const value = farmData[field.fieldId];
      const missing = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      if (field.required && missing) nextErrors[field.fieldId] = 'Required';
    }

    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !first;
  }

  function saveOffline(payload) {
    localStorage.setItem(`${offlinePrefix}${Date.now()}`, JSON.stringify({ ...payload, isOfflineDraft: true, deviceInfo: navigator.userAgent }));
    localStorage.setItem(draftKey, JSON.stringify({ farmData, workerNotes, manualChecks }));
    setOfflineBanner('Saved locally - will sync when you are back online');
  }

  async function submit(status) {
    if (status === 'submitted' && !validate()) return;
    if (manualMode && status === 'submitted' && !manualChecks.every(Boolean)) return;

    const payload = {
      templateId,
      farmData,
      workerNotes,
      status,
      isManualEntry: manualMode,
      isOfflineDraft: false,
      deviceInfo: navigator.userAgent,
    };

    if (!navigator.onLine) {
      saveOffline(payload);
      return;
    }

    try {
      await api.post('/form-submissions', payload);
      localStorage.removeItem(draftKey);
      setToast(status === 'submitted' ? 'Submitted for review' : 'Draft saved');
      window.setTimeout(() => navigate('/forms'), 700);
    } catch (requestError) {
      if (!requestError.response) {
        saveOffline(payload);
      } else {
        setToast(getError(requestError));
      }
    }
  }

  if (loading) return <div className="card animate-pulse text-slate-500">Loading form...</div>;
  if (error) return <div className="card text-red-700">{error}</div>;
  if (!template) return <EmptyState title="Template not found" description="Try opening the form again from Field forms." />;

  return (
    <>
      <div className="mb-5">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">{template.category}</span>
        <h1 className="mt-3 text-3xl font-black">{template.name}</h1>
        {template.description && <p className="mt-1 text-slate-500">{template.description}</p>}
      </div>

      {manualMode && (
        <div className="mb-5 rounded-xl bg-amber-50 p-4 font-semibold text-amber-800 ring-1 ring-amber-200">
          Manual data entry mode - you are entering data from a paper form. Check each value carefully before submitting.
        </div>
      )}
      {offlineBanner && <div className="mb-5 rounded-xl bg-blue-50 p-4 font-semibold text-blue-800 ring-1 ring-blue-200">{offlineBanner}</div>}
      {restoreAvailable && (
        <div className="card mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="font-semibold">A local draft exists for this form.</p>
          <button className="btn-primary" onClick={restoreDraft}>Restore draft</button>
        </div>
      )}

      <div className="card">
        {manualMode && (
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <label>
              <span className="label">Paper form reference number</span>
              <input className="input" value={farmData._paperRef || ''} onChange={(event) => updateField('_paperRef', event.target.value)} />
            </label>
            <label>
              <span className="label">Completed by</span>
              <input className="input" value={farmData._paperWorkerName || ''} onChange={(event) => updateField('_paperWorkerName', event.target.value)} />
            </label>
            <label>
              <span className="label">Paper form date</span>
              <DatePicker value={farmData._paperFormDate || ''} onChange={(value) => updateField('_paperFormDate', value)} />
            </label>
          </div>
        )}

        <div className="space-y-4">
          {(template.fields || []).map((field) => (
            <FieldInput key={field.fieldId} field={field} value={farmData[field.fieldId]} error={errors[field.fieldId]} onChange={(value) => updateField(field.fieldId, value)} />
          ))}
        </div>

        <label className="mt-5 block">
          <span className="label">Worker notes</span>
          <textarea className="input min-h-24" value={workerNotes} onChange={(event) => setWorkerNotes(event.target.value)} />
        </label>

        {manualMode && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <h2 className="font-black">Confident review checklist</h2>
            {[
              'I have checked the cow tag number matches a real cow',
              'All numbers are within expected ranges',
              'The date on the paper form matches what I entered',
              'I have the paper form and will file it',
            ].map((label, index) => (
              <label key={label} className="mt-3 flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={manualChecks[index]}
                  onChange={(event) => setManualChecks((current) => current.map((checked, i) => (i === index ? event.target.checked : checked)))}
                />
                {label}
              </label>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button className="btn-soft" onClick={() => submit('draft')}>Save as draft</button>
          <button className="btn-primary" disabled={manualMode && !manualChecks.every(Boolean)} onClick={() => submit('submitted')}>
            Submit for review
          </button>
        </div>
      </div>
      <Toast message={toast} type={toast.includes('Submitted') || toast.includes('saved') ? 'success' : 'error'} onClose={() => setToast('')} />
    </>
  );
}

function FieldInput({ field, value, error, onChange }) {
  const label = (
    <span className="label">
      {field.label}
      {field.required && <span className="text-red-600"> *</span>}
    </span>
  );

  async function handlePhoto(file) {
    if (!file) return onChange('');
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <div id={`field-${field.fieldId}`} className={`rounded-xl border p-4 ${error ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}>
      {label}
      {field.helpText && <p className="mt-1 text-xs italic text-slate-500">{field.helpText}</p>}
      <div className="mt-2">
        {field.type === 'textarea' && <textarea className="input min-h-28" placeholder={field.placeholder} value={value || ''} onChange={(event) => onChange(event.target.value)} />}
        {field.type === 'text' && <input className="input" placeholder={field.placeholder} value={value || ''} onChange={(event) => onChange(event.target.value)} />}
        {field.type === 'number' && (
          <div className="flex items-center gap-2">
            <input className="input" type="number" min={field.min ?? undefined} max={field.max ?? undefined} placeholder={field.placeholder} value={value || ''} onChange={(event) => onChange(event.target.value)} />
            {field.unit && <span className="text-sm font-bold text-slate-500">{field.unit}</span>}
          </div>
        )}
        {field.type === 'date' && <DatePicker value={value || ''} onChange={onChange} />}
        {field.type === 'time' && <input className="input" type="time" value={value || ''} onChange={(event) => onChange(event.target.value)} />}
        {field.type === 'select' && (
          <select className="input" value={value || ''} onChange={(event) => onChange(event.target.value)}>
            <option value="">Choose one</option>
            {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        )}
        {field.type === 'multiselect' && (
          <div className="grid gap-2 md:grid-cols-2">
            {(field.options || []).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={Array.isArray(value) && value.includes(option)}
                  onChange={(event) => {
                    const next = new Set(Array.isArray(value) ? value : []);
                    if (event.target.checked) next.add(option);
                    else next.delete(option);
                    onChange(Array.from(next));
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        )}
        {field.type === 'boolean' && (
          <label className="inline-flex items-center gap-3 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold">
            <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
            {value ? 'Yes' : 'No'}
          </label>
        )}
        {field.type === 'photo' && (
          <div>
            <input className="input" type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} />
            <p className="mt-1 text-xs text-slate-500">Photos are for reference only and are not transferred to core records.</p>
            {value && <img src={value} alt="Field preview" className="mt-3 max-h-40 rounded-xl border object-cover" />}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
