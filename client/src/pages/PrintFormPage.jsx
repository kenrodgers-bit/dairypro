import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';
import '../styles/print-form.css';

const getError = (error) => error.response?.data?.error || error.response?.data?.message || error.message || 'Something went wrong';
const today = new Date().toLocaleDateString();

export default function PrintFormPage() {
  const { templateId } = useParams();
  const [searchParams] = useSearchParams();
  const [template, setTemplate] = useState(null);
  const [copies, setCopies] = useState(Math.max(1, Math.min(50, Number(searchParams.get('copies') || 1))));
  const [startNumber, setStartNumber] = useState(1);
  const [includeReference, setIncludeReference] = useState(false);
  const [printNotes, setPrintNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const formRef = useMemo(() => String(template?._id || templateId).slice(0, 8).toUpperCase(), [template?._id, templateId]);
  const copyIndexes = Array.from({ length: copies }, (_, index) => index);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/form-templates/${templateId}`);
      setTemplate(response.data);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [templateId]);

  async function print() {
    try {
      await api.post(`/form-templates/${templateId}/log-print`, { copies, notes: printNotes });
    } catch (requestError) {
      setToast(getError(requestError));
    } finally {
      window.print();
    }
  }

  if (loading) return <div className="print-loading">Loading printable form...</div>;
  if (error) {
    return (
      <div className="print-error">
        <EmptyState title="Could not load printable form" description={error} actionLabel="Try again" onAction={load} />
      </div>
    );
  }

  return (
    <div className="print-root">
      <div className="screen-only print-toolbar">
        <label>
          Copies to print
          <input type="number" min="1" max="50" value={copies} onChange={(event) => setCopies(Math.max(1, Math.min(50, Number(event.target.value || 1))))} />
        </label>
        <label>
          Starting form number
          <input type="number" min="1" value={startNumber} onChange={(event) => setStartNumber(Math.max(1, Number(event.target.value || 1)))} />
        </label>
        <label>
          Print notes
          <input value={printNotes} onChange={(event) => setPrintNotes(event.target.value)} placeholder="For morning team" />
        </label>
        <label className="print-toolbar-check">
          <input type="checkbox" checked={includeReference} onChange={(event) => setIncludeReference(event.target.checked)} />
          Include data entry reference sheet
        </label>
        <button onClick={print}>Print</button>
        <button onClick={print} title="Choose Save as PDF in the print dialog">Download PDF</button>
      </div>

      {copyIndexes.map((copyIndex) => (
        <React.Fragment key={copyIndex}>
          <PrintableCopy
            template={template}
            formRef={formRef}
            serial={startNumber + copyIndex}
            total={copies}
            isLast={!includeReference && copyIndex === copies - 1}
          />
          {copyIndex < copies - 1 && <p className="screen-only page-break-label">Page break after this copy</p>}
        </React.Fragment>
      ))}

      {includeReference && <ReferenceSheet template={template} />}
      <div className="screen-only">
        <Toast message={toast} onClose={() => setToast('')} />
      </div>
    </div>
  );
}

function PrintableCopy({ template, formRef, serial, total, isLast }) {
  return (
    <article className={`printable-form ${isLast ? 'last-copy' : ''}`}>
      <header className="paper-header">
        <div className="paper-header-row">
          <div>
            <h1>{template.farmName || 'My Farm'}</h1>
            <p>DairyTrack Pro</p>
          </div>
          <div className="paper-category">{String(template.category || '').toUpperCase()} RECORD</div>
        </div>
        <div className="paper-header-body">
          <p><b>Form:</b> {template.name}</p>
          <p><b>Date printed:</b> {today} <span><b>Form ref:</b> {formRef}</span></p>
          <p><b>Form:</b> {String(serial).padStart(3, '0')} of {String(total).padStart(3, '0')}</p>
          <p><b>Filled by:</b> ________________________ <span><b>Date:</b> ___/___/______</span></p>
          <p><b>Checked by:</b> _______________________ <span><b>Time:</b> ____ : ____</span></p>
        </div>
      </header>

      <main className="paper-fields">
        {(template.fields || []).map((field) => <PaperField key={field.fieldId} field={field} />)}
      </main>

      <footer className="paper-footer">
        <p><b>Notes / remarks:</b></p>
        <p>____________________________________________________________</p>
        <p>____________________________________________________________</p>
        <div className="paper-signatures">
          <p>Worker signature: ____________________ Date: ___/___/___</p>
          <p>Supervisor signature: _______________ Date: ___/___/___</p>
        </div>
        <p><span className="paper-checkbox" /> Data entered into system by: ______________ Date: _______</p>
        <p className="paper-footer-small">Form ref: {formRef} Printed: {today}</p>
        <p className="paper-footer-small">DairyTrack Pro - For farm use only</p>
      </footer>
    </article>
  );
}

function PaperField({ field }) {
  const required = field.required ? ' *' : '';
  const label = `${field.label}${required}`;

  return (
    <section className={`paper-field paper-field-${field.type}`}>
      <div className="paper-field-label">
        <b>{label}</b>
        {field.unit && <span>{field.unit}</span>}
      </div>
      {field.helpText && <p className="paper-help">{field.helpText}</p>}
      {['text', 'textarea'].includes(field.type) && <PaperLines count={field.type === 'textarea' ? 3 : 1} />}
      {field.type === 'number' && (
        <>
          <p>______________________</p>
          {(field.min !== undefined || field.max !== undefined) && <p className="paper-help">min: {field.min ?? '-'} max: {field.max ?? '-'}</p>}
        </>
      )}
      {field.type === 'date' && <p>DD / MM / YYYY&nbsp;&nbsp;&nbsp; __ / __ / ______</p>}
      {field.type === 'time' && <p>HH : MM&nbsp;&nbsp;&nbsp; __ : __</p>}
      {field.type === 'select' && <OptionGrid options={field.options || []} marker="radio" />}
      {field.type === 'multiselect' && <OptionGrid options={field.options || []} marker="checkbox" suffix=" (tick all that apply)" />}
      {field.type === 'boolean' && (
        <p><span className="paper-radio" /> Yes&nbsp;&nbsp;&nbsp;&nbsp;<span className="paper-radio" /> No</p>
      )}
      {field.type === 'photo' && (
        <div>
          <p className="paper-help">Photo - attach printout or sketch below</p>
          <div className="paper-photo-box">space for sketch / photo</div>
        </div>
      )}
    </section>
  );
}

function PaperLines({ count }) {
  return Array.from({ length: count }, (_, index) => <p key={index}>___________________________________________________</p>);
}

function OptionGrid({ options, marker, suffix = '' }) {
  return (
    <div>
      {suffix && <p className="paper-help">{suffix}</p>}
      <div className="paper-option-grid">
        {options.map((option) => (
          <span key={option}>
            <span className={marker === 'radio' ? 'paper-radio' : 'paper-checkbox'} /> {option}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReferenceSheet({ template }) {
  return (
    <article className="printable-form reference-sheet last-copy">
      <header className="paper-header">
        <h1>DATA ENTRY REFERENCE - {template.name}</h1>
        <p>For use when keying paper forms into DairyTrack Pro</p>
      </header>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Required</th>
            <th>Accepted values</th>
          </tr>
        </thead>
        <tbody>
          {(template.fields || []).map((field) => (
            <tr key={field.fieldId}>
              <td>{field.label}</td>
              <td>{field.type}</td>
              <td>{field.required ? 'Yes' : 'No'}</td>
              <td>{acceptedValues(field)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="reference-instructions">
        To enter this form: Log in - Field forms - Click Manual data entry - Select {template.name} - Fill in fields - Submit for review.
      </p>
    </article>
  );
}

function acceptedValues(field) {
  if (field.type === 'select' || field.type === 'multiselect') return (field.options || []).join(' / ');
  if (field.type === 'date') return 'DD/MM/YYYY';
  if (field.type === 'time') return 'HH:MM';
  if (field.type === 'boolean') return 'Yes or No';
  if (field.type === 'number') return `${field.min ?? '-'} to ${field.max ?? '-'} ${field.unit || ''}`.trim();
  return 'Any text';
}
