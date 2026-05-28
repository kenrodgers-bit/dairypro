import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  BarChart3,
  Beef,
  Bell,
  ClipboardList,
  DollarSign,
  Download,
  FileDown,
  HeartPulse,
  LogOut,
  Milk,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Sprout,
  WifiOff,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, litres, money } from './api';
import './index.css';

const nav = [
  ['/', 'Dashboard', BarChart3],
  ['/cows', 'Cows', Beef],
  ['/milk', 'Milk', Milk],
  ['/health', 'Health', HeartPulse],
  ['/pregnancy', 'Pregnancy', Sprout],
  ['/feed', 'Feed', Package],
  ['/expenses', 'Expenses', DollarSign],
  ['/sales', 'Sales', ClipboardList],
  ['/reports', 'Reports', FileDown],
];

function getApiError(error) {
  if (!error.response) return 'Cannot reach the API. Start the local server and MongoDB, or check VITE_API_URL.';
  return error.response?.data?.message || error.message || 'Something went wrong';
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('DairyTrack Pro service worker registration failed:', error);
    });
  });
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

function OfflineNotice() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
      <WifiOff size={18} />
      Offline mode: the app shell is available, but records need the local API/database.
    </div>
  );
}

function BrandIcon({ className = '' }) {
  return <img src="/icon-192.png" alt="" className={`object-cover ${className}`} />;
}

function InstallAppButton({ className = '' }) {
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    const handlePrompt = (event) => {
      event.preventDefault();
      setPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);

    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  if (!prompt) return null;

  async function install() {
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }

  return (
    <button type="button" onClick={install} className={`btn-soft ${className}`}>
      <Download size={17} />
      Install app
    </button>
  );
}

function useData(path) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');

    return api
      .get(path)
      .then((response) => setData(response.data || []))
      .catch((requestError) => setError(getApiError(requestError)))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, setData, loading, error, load };
}

function Layout({ children }) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('dt_token');
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-72 bg-slate-950 text-white p-5 hidden lg:block">
        <div className="flex items-center gap-3 mb-8">
          <BrandIcon className="h-11 w-11 rounded-2xl shadow-sm ring-1 ring-white/10" />
          <div>
            <b>DairyTrack Pro</b>
            <p className="text-xs text-slate-400">Farm Management System</p>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 ${
                  isActive ? 'bg-emerald-500 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="mt-8 flex gap-2 text-slate-400 hover:text-white">
          <LogOut size={18} />
          Logout
        </button>
      </aside>
      <main className="flex-1">
        <header className="bg-white border-b px-5 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-3">
              <BrandIcon className="h-9 w-9 rounded-xl ring-1 ring-slate-200" />
              <h1 className="font-black text-xl">DairyTrack Pro</h1>
            </div>
            <p className="text-sm text-slate-500">Installable farm records system for desktop and web</p>
          </div>
          <div className="flex items-center gap-3">
            <InstallAppButton className="hidden sm:inline-flex" />
            <ShieldCheck className="text-emerald-600" />
          </div>
        </header>
        <OfflineNotice />
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

function Protected({ children }) {
  const [ok, setOk] = useState(null);

  useEffect(() => {
    let active = true;

    api
      .get('/auth/me')
      .then((response) => active && setOk(Boolean(response.data?._id)))
      .catch((error) => {
        const hasToken = Boolean(localStorage.getItem('dt_token'));
        const offline = !navigator.onLine || error.response?.status === 503;

        if (active) setOk(offline && hasToken);
      });

    return () => {
      active = false;
    };
  }, []);

  if (ok === null) return <div className="p-10">Loading...</div>;

  return ok ? <Layout>{children}</Layout> : <Login />;
}

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('owner@dairytrack.com');
  const [password, setPassword] = useState('password123');
  const [err, setErr] = useState('');

  async function login(event) {
    event.preventDefault();
    setErr('');

    try {
      const response = await api.post('/auth/login', { email, password });
      if (!response.data?.token) throw new Error('Login did not return an auth token. Check the API URL.');
      localStorage.setItem('dt_token', response.data.token);
      navigate('/');
    } catch (error) {
      setErr(getApiError(error));
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="bg-slate-950 text-white p-10 flex flex-col justify-center">
        <div className="max-w-lg">
          <img
            src="/brand-wordmark.png"
            alt="DairyTrack Pro"
            className="mb-8 w-full max-w-lg rounded-xl border border-white/10 shadow-2xl shadow-emerald-950/40 brightness-125 contrast-125 saturate-125"
          />
          <h1 className="text-5xl font-black leading-tight">Dairy farm records that prove cow value.</h1>
          <p className="text-slate-300 mt-4 text-lg">
            Track milk, health, pregnancy, feed, expenses and Cow Value Score with a system ready for farms,
            investors, and local computer use.
          </p>
        </div>
      </div>
      <form onSubmit={login} className="p-8 flex items-center justify-center">
        <div className="card w-full max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Sign in</h2>
              <p className="text-slate-500 mb-6">Use seeded demo credentials after running server seed.</p>
            </div>
            <InstallAppButton className="shrink-0" />
          </div>
          <OfflineNotice />
          {err && <p className="bg-red-50 text-red-700 p-3 rounded-xl mb-3">{err}</p>}
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" className="input mb-3" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input mb-5"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="btn-primary w-full">Login</button>
        </div>
      </form>
    </div>
  );
}

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    api
      .get('/dashboard/summary')
      .then((response) => active && setSummary(response.data))
      .catch((requestError) => active && setError(getApiError(requestError)));

    return () => {
      active = false;
    };
  }, []);

  if (error) return <div className="card text-red-700">{error}</div>;
  if (!summary) return <div>Loading dashboard...</div>;

  const s = summary.stats;
  const cards = [
    ['Active Cows', s.totalCows, Beef],
    ['Today Milk', litres(s.todayMilk), Milk],
    ['Month Milk', litres(s.monthMilk), BarChart3],
    ['Milk Income', money(s.milkIncome), DollarSign],
    ['Expenses', money(s.monthExpenses), ClipboardList],
    ['Profit', money(s.profit), ShieldCheck],
    ['Pregnant', s.pregnant, Sprout],
    ['Low Feed', s.lowFeed, Bell],
  ];

  return (
    <>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map(([title, value, Icon]) => (
          <div className="card" key={title}>
            <div className="flex justify-between">
              <p className="text-slate-500 font-semibold">{title}</p>
              <Icon className="text-emerald-600" />
            </div>
            <p className="text-3xl font-black mt-3">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid xl:grid-cols-3 gap-4">
        <div className="card xl:col-span-2">
          <h3 className="font-black mb-4">Top producing cows this month</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summary.topCows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="litres" fill="#16a34a" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="font-black mb-4">Alerts</h3>
          {summary.lowFeed.map((feed) => (
            <div key={feed._id} className="p-3 rounded-xl bg-amber-50 text-amber-800 mb-2">
              Low stock: {feed.name} ({feed.currentStock} {feed.unit})
            </div>
          ))}
          {summary.reminders.map((reminder) => (
            <div key={reminder._id} className="p-3 rounded-xl bg-slate-50 mb-2">
              {reminder.title}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function FormModal({ title, fields, onSave, onClose }) {
  const [form, setForm] = useState({});

  function updateField(field, rawValue) {
    const value = field.type === 'number' ? (rawValue === '' ? '' : Number(rawValue)) : rawValue;
    setForm({ ...form, [field.name]: value });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center p-4">
      <div className="card w-full max-w-2xl">
        <h2 className="text-xl font-black mb-4">{title}</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {fields.map((field) => (
            <label key={field.name}>
              <span className="label">{field.label}</span>
              <input className="input" type={field.type || 'text'} onChange={(event) => updateField(field, event.target.value)} />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn-soft" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => onSave(form)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ListPage({ path, title, cols, fields }) {
  const { data, loading, error, load } = useData(path);
  const [show, setShow] = useState(false);
  const [q, setQ] = useState('');

  const filtered = data.filter((item) => JSON.stringify(item).toLowerCase().includes(q.toLowerCase()));

  async function save(form) {
    await api.post(path, form);
    setShow(false);
    load();
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-3xl font-black">{title}</h1>
          <p className="text-slate-500">Manage {title.toLowerCase()} with live farm records.</p>
        </div>
        <button onClick={() => setShow(true)} className="btn-primary">
          <Plus size={18} />
          Add
        </button>
      </div>
      <div className="card mb-4 flex gap-2">
        <Search className="text-slate-400" />
        <input className="outline-none flex-1" placeholder="Search..." value={q} onChange={(event) => setQ(event.target.value)} />
      </div>
      {error && <div className="card text-red-700">{error}</div>}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                {cols.map((col) => (
                  <th className="p-3" key={col[0]}>
                    {col[1]}
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row._id} className="border-t">
                  {cols.map((col) => (
                    <td className="p-3" key={col[0]}>
                      {col[2] ? col[2](row) : String(row[col[0]] ?? '')}
                    </td>
                  ))}
                  <td className="p-3">
                    <button onClick={() => api.delete(`${path}/${row._id}`).then(load)} className="text-red-600">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="text-center py-10 text-slate-500">No records yet.</p>}
        </div>
      )}
      {show && <FormModal title={`Add ${title}`} fields={fields} onClose={() => setShow(false)} onSave={save} />}
    </>
  );
}

function Cows() {
  const { data, load } = useData('/cows');
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  async function save(form) {
    await api.post('/cows', form);
    setShow(false);
    load();
  }

  return (
    <>
      <div className="flex justify-between items-center mb-5">
        <div>
          <h1 className="text-3xl font-black">Cows</h1>
          <p className="text-slate-500">Cow profiles with sale status and value scoring.</p>
        </div>
        <button className="btn-primary" onClick={() => setShow(true)}>
          <Plus />
          Add Cow
        </button>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.map((cow) => (
          <div className="card cursor-pointer hover:shadow-md" onClick={() => navigate(`/cows/${cow._id}`)} key={cow._id}>
            <div className="flex justify-between">
              <div>
                <h3 className="text-xl font-black">{cow.name}</h3>
                <p className="text-slate-500">
                  {cow.tagNumber} &bull; {cow.breed}
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 h-fit text-xs font-bold">{cow.status}</span>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {cow.notes || 'Open profile to view milk, health, pregnancy and Cow Value Score.'}
            </p>
          </div>
        ))}
      </div>
      {show && (
        <FormModal
          title="Add Cow"
          fields={[
            { name: 'name', label: 'Cow name' },
            { name: 'tagNumber', label: 'Tag number' },
            { name: 'breed', label: 'Breed' },
            { name: 'status', label: 'Status' },
            { name: 'purchasePrice', label: 'Purchase price', type: 'number' },
          ]}
          onClose={() => setShow(false)}
          onSave={save}
        />
      )}
    </>
  );
}

function CowProfile() {
  const { id } = useParams();
  const [cow, setCow] = useState(null);
  const [score, setScore] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([api.get(`/cows/${id}`), api.get(`/cows/${id}/value-score`)])
      .then(([cowResponse, scoreResponse]) => {
        if (!active) return;
        setCow(cowResponse.data);
        setScore(scoreResponse.data);
      })
      .catch((requestError) => active && setError(getApiError(requestError)));

    return () => {
      active = false;
    };
  }, [id]);

  if (error) return <div className="card text-red-700">{error}</div>;
  if (!cow) return <div>Loading...</div>;

  return (
    <>
      <div className="card mb-5">
        <div className="flex justify-between">
          <div>
            <h1 className="text-4xl font-black">{cow.name}</h1>
            <p className="text-slate-500">
              {cow.tagNumber} &bull; {cow.breed} &bull; {cow.status}
            </p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-black text-emerald-600">{score?.score ?? '--'}</p>
            <p className="font-bold">{score?.category}</p>
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <h2 className="font-black text-xl mb-3">Cow Value Score Breakdown</h2>
          {score &&
            Object.entries(score.breakdown).map(([key, value]) => (
              <div key={key} className="mb-3">
                <div className="flex justify-between text-sm font-bold">
                  <span className="capitalize">{key}</span>
                  <span>{typeof value === 'object' ? `${value.score ?? value}/${value.max ?? ''}` : value}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full">
                  <div
                    className="h-2 bg-emerald-500 rounded-full"
                    style={{ width: `${typeof value === 'object' && value.max ? (value.score / value.max) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
        </div>
        <div className="card">
          <h2 className="font-black mb-3">Recommendation</h2>
          <p className="text-emerald-700 font-bold">{score?.recommendedAction}</p>
          <h3 className="font-black mt-5">Strengths</h3>
          {score?.strengths?.map((strength) => (
            <p className="text-sm text-green-700" key={strength}>
              &bull; {strength}
            </p>
          ))}
          <h3 className="font-black mt-5">Risks</h3>
          {score?.risks?.map((risk) => (
            <p className="text-sm text-red-700" key={risk}>
              &bull; {risk}
            </p>
          ))}
        </div>
      </div>
    </>
  );
}

function Reports() {
  async function downloadCsv() {
    const response = await api.get('/reports/export/cows', { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = 'dairytrack-cows.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <h1 className="text-3xl font-black">Reports</h1>
      <p className="text-slate-500 mb-5">Export farm records as CSV, and use browser print for investor PDF previews.</p>
      <button className="btn-primary" onClick={downloadCsv}>
        <FileDown />
        Export Cows CSV
      </button>
      <button className="btn-soft ml-2" onClick={() => window.print()}>
        Print Report View
      </button>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/cows"
          element={
            <Protected>
              <Cows />
            </Protected>
          }
        />
        <Route
          path="/cows/:id"
          element={
            <Protected>
              <CowProfile />
            </Protected>
          }
        />
        <Route
          path="/milk"
          element={
            <Protected>
              <ListPage
                path="/milk"
                title="Milk Records"
                cols={[
                  ['cow', 'Cow', (row) => row.cow?.name],
                  ['date', 'Date', (row) => new Date(row.date).toLocaleDateString()],
                  ['morningLitres', 'Morning'],
                  ['eveningLitres', 'Evening'],
                  ['milkSold', 'Sold'],
                ]}
                fields={[
                  { name: 'cow', label: 'Cow ID' },
                  { name: 'date', label: 'Date', type: 'date' },
                  { name: 'morningLitres', label: 'Morning L', type: 'number' },
                  { name: 'eveningLitres', label: 'Evening L', type: 'number' },
                  { name: 'milkSold', label: 'Sold L', type: 'number' },
                ]}
              />
            </Protected>
          }
        />
        <Route
          path="/health"
          element={
            <Protected>
              <ListPage
                path="/health"
                title="Health Records"
                cols={[
                  ['cow', 'Cow', (row) => row.cow?.name],
                  ['recordType', 'Type'],
                  ['diagnosis', 'Diagnosis'],
                  ['treatmentCost', 'Cost', (row) => money(row.treatmentCost)],
                ]}
                fields={[
                  { name: 'cow', label: 'Cow ID' },
                  { name: 'recordType', label: 'Type' },
                  { name: 'diagnosis', label: 'Diagnosis' },
                  { name: 'treatmentCost', label: 'Cost', type: 'number' },
                ]}
              />
            </Protected>
          }
        />
        <Route
          path="/pregnancy"
          element={
            <Protected>
              <ListPage
                path="/pregnancy"
                title="Pregnancy Records"
                cols={[
                  ['cow', 'Cow', (row) => row.cow?.name],
                  ['pregnancyStatus', 'Status'],
                  [
                    'expectedDeliveryDate',
                    'Expected',
                    (row) => (row.expectedDeliveryDate ? new Date(row.expectedDeliveryDate).toLocaleDateString() : ''),
                  ],
                ]}
                fields={[
                  { name: 'cow', label: 'Cow ID' },
                  { name: 'inseminationDate', label: 'Insemination Date', type: 'date' },
                  { name: 'pregnancyStatus', label: 'Status' },
                ]}
              />
            </Protected>
          }
        />
        <Route
          path="/feed"
          element={
            <Protected>
              <ListPage
                path="/feed"
                title="Feed Stock"
                cols={[
                  ['name', 'Name'],
                  ['category', 'Category'],
                  ['currentStock', 'Stock'],
                  ['unit', 'Unit'],
                ]}
                fields={[
                  { name: 'name', label: 'Feed name' },
                  { name: 'category', label: 'Category' },
                  { name: 'currentStock', label: 'Current stock', type: 'number' },
                  { name: 'unit', label: 'Unit' },
                ]}
              />
            </Protected>
          }
        />
        <Route
          path="/expenses"
          element={
            <Protected>
              <ListPage
                path="/expenses"
                title="Expenses"
                cols={[
                  ['date', 'Date', (row) => new Date(row.date).toLocaleDateString()],
                  ['category', 'Category'],
                  ['amount', 'Amount', (row) => money(row.amount)],
                  ['description', 'Description'],
                ]}
                fields={[
                  { name: 'date', label: 'Date', type: 'date' },
                  { name: 'category', label: 'Category' },
                  { name: 'amount', label: 'Amount', type: 'number' },
                  { name: 'description', label: 'Description' },
                ]}
              />
            </Protected>
          }
        />
        <Route
          path="/sales"
          element={
            <Protected>
              <ListPage
                path="/sales"
                title="Sales"
                cols={[
                  ['cow', 'Cow', (row) => row.cow?.name],
                  ['buyerName', 'Buyer'],
                  ['salePrice', 'Price', (row) => money(row.salePrice)],
                  ['paymentStatus', 'Status'],
                ]}
                fields={[
                  { name: 'cow', label: 'Cow ID' },
                  { name: 'buyerName', label: 'Buyer name' },
                  { name: 'salePrice', label: 'Sale price', type: 'number' },
                  { name: 'paymentStatus', label: 'Payment status' },
                ]}
              />
            </Protected>
          }
        />
        <Route
          path="/reports"
          element={
            <Protected>
              <Reports />
            </Protected>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

const rootElement = document.getElementById('root');
const root = globalThis.__dairyTrackRoot || createRoot(rootElement);
globalThis.__dairyTrackRoot = root;
root.render(<App />);
registerServiceWorker();
