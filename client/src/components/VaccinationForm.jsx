import React, { useState } from 'react';
import DatePicker from './DatePicker';

export default function VaccinationForm({ initialValue = {}, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    cowId: initialValue.cowId?._id || initialValue.cowId || '',
    vaccineType: initialValue.vaccineType || '',
    dateGiven: initialValue.dateGiven?.slice?.(0, 10) || '',
    nextDueDate: initialValue.nextDueDate?.slice?.(0, 10) || '',
    administeredBy: initialValue.administeredBy || '',
    batchNumber: initialValue.batchNumber || '',
    withdrawalPeriodDays: initialValue.withdrawalPeriodDays || 0,
    notes: initialValue.notes || '',
  });

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <form
      className="card mb-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="grid md:grid-cols-2 gap-3">
        <label>
          <span className="label">Cow ID</span>
          <input className="input" value={form.cowId} onChange={(event) => update('cowId', event.target.value)} required />
        </label>
        <label>
          <span className="label">Vaccine type</span>
          <input className="input" value={form.vaccineType} onChange={(event) => update('vaccineType', event.target.value)} required />
        </label>
        <label>
          <span className="label">Date given</span>
          <DatePicker value={form.dateGiven} onChange={(value) => update('dateGiven', value)} />
        </label>
        <label>
          <span className="label">Next due date</span>
          <DatePicker value={form.nextDueDate} onChange={(value) => update('nextDueDate', value)} />
        </label>
        <label>
          <span className="label">Administered by</span>
          <input className="input" value={form.administeredBy} onChange={(event) => update('administeredBy', event.target.value)} />
        </label>
        <label>
          <span className="label">Batch number</span>
          <input className="input" value={form.batchNumber} onChange={(event) => update('batchNumber', event.target.value)} />
        </label>
        <label>
          <span className="label">Withdrawal days</span>
          <input
            className="input"
            type="number"
            min="0"
            value={form.withdrawalPeriodDays}
            onChange={(event) => update('withdrawalPeriodDays', Number(event.target.value))}
          />
        </label>
        <label>
          <span className="label">Notes</span>
          <input className="input" value={form.notes} onChange={(event) => update('notes', event.target.value)} />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-soft" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn-primary">Save vaccination</button>
      </div>
    </form>
  );
}
