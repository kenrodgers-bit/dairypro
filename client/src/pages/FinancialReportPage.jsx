import React, { useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, money } from '../api';
import DatePicker from '../components/DatePicker';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';

const getError = (error) => error.response?.data?.message || error.response?.data?.error || error.message || 'Something went wrong';

export default function FinancialReportPage() {
  const thisYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState('');
  const reportRef = useRef(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/reports/pnl', { params: { from, to } });
      setReport(response.data);
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [from, to]);

  async function exportPdf() {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(reportRef.current, { backgroundColor: '#f8fafc', scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const width = pdf.internal.pageSize.getWidth();
      const height = (canvas.height * width) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, width, height);
      pdf.save('dairytrack-financial-report.pdf');
    } catch {
      setToast('Export failed, please try again');
    } finally {
      setExporting(false);
    }
  }

  const cards = report
    ? [
        ['Revenue', report.totalMilkSalesRevenue],
        ['Total Costs', report.totalFeedCosts + report.totalHealthVetCosts + report.totalOtherExpenses],
        ['Gross Profit', report.grossProfit],
        ['Net Profit', report.netProfit],
        ['Margin', `${Number(report.profitMargin || 0).toFixed(1)}%`],
      ]
    : [];

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black">Financial P&L</h1>
          <p className="text-slate-500">Revenue, costs, and profit margin over a selected date range.</p>
        </div>
        <button className="btn-primary" disabled={exporting || !report} onClick={exportPdf}>
          {exporting ? 'Exporting...' : 'Export PDF'}
        </button>
      </div>
      <div className="card mb-5 flex flex-col gap-3 md:flex-row">
        <label className="flex-1">
          <span className="label">From</span>
          <DatePicker value={from} onChange={setFrom} />
        </label>
        <label className="flex-1">
          <span className="label">To</span>
          <DatePicker value={to} onChange={setTo} />
        </label>
      </div>
      {error && <div className="card text-red-700">{error}</div>}
      {loading ? (
        <div className="card animate-pulse text-slate-500">Loading financial report...</div>
      ) : report?.monthlyBreakdown?.length ? (
        <div ref={reportRef}>
          <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {cards.map(([label, value]) => (
              <div key={label} className="card">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-black">{typeof value === 'number' ? money(value) : value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="card">
              <h2 className="mb-4 font-black">Monthly Revenue vs Costs</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report.monthlyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => money(value)} />
                  <Bar dataKey="revenue" fill="#16a34a" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="costs" fill="#dc2626" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h2 className="mb-4 font-black">Cumulative Profit</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={report.monthlyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => money(value)} />
                  <Line type="monotone" dataKey="cumulativeProfit" stroke="#2563eb" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState icon="" title="No financial data for this range" description="Add milk sales and expenses to generate a P&L report." />
      )}
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
