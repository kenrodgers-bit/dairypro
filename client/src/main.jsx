import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useState } from 'react';
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
  Users,
  WifiOff,
} from 'lucide-react';
import { api, litres, money } from './api';
import ConfirmModal from './components/ConfirmModal';
import DatePicker from './components/DatePicker';
import EmptyState from './components/EmptyState';
import Toast from './components/Toast';
import OfflineDraftSync from './components/OfflineDraftSync';
import './index.css';

const FeedInventoryPage = lazy(() => import('./pages/FeedInventoryPage'));
const DashboardMilkChart = lazy(() => import('./components/DashboardMilkChart'));
const FinancialReportPage = lazy(() => import('./pages/FinancialReportPage'));
const FillFormPage = lazy(() => import('./pages/FillFormPage'));
const FormsPage = lazy(() => import('./pages/FormsPage'));
const ManageTemplatesPage = lazy(() => import('./pages/ManageTemplatesPage'));
const MilkQualityPage = lazy(() => import('./pages/MilkQualityPage'));
const PrintFormPage = lazy(() => import('./pages/PrintFormPage'));
const ReviewSubmissionPage = lazy(() => import('./pages/ReviewSubmissionPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const VaccinationsPage = lazy(() => import('./pages/VaccinationsPage'));

const nav = [
  { to: '/', label: 'Dashboard', icon: BarChart3, roles: ['owner', 'manager'] },
  { to: '/cows', label: 'Cows', icon: Beef, roles: ['owner', 'manager'] },
  { to: '/milk', label: 'Milk', icon: Milk, roles: ['owner', 'manager', 'worker'] },
  { to: '/health', label: 'Health', icon: HeartPulse, roles: ['owner', 'manager', 'worker'] },
  { to: '/pregnancy', label: 'Pregnancy', icon: Sprout, roles: ['owner', 'manager'] },
  { to: '/feed', label: 'Feed', icon: Package, roles: ['owner', 'manager'] },
  { to: '/forms', label: 'Field forms', icon: ClipboardList, roles: ['owner', 'manager', 'worker'], badge: 'forms' },
  { to: '/feed-inventory', label: 'Feed Inventory', icon: Package, roles: ['owner', 'manager'] },
  { to: '/vaccinations', label: 'Vaccinations', icon: Bell, roles: ['owner', 'manager'] },
  { to: '/milk-quality', label: 'Milk Quality', icon: HeartPulse, roles: ['owner', 'manager'] },
  { to: '/tasks', label: 'Tasks', icon: ClipboardList, roles: ['owner', 'manager', 'worker'] },
  { to: '/expenses', label: 'Expenses', icon: DollarSign, roles: ['owner', 'manager'] },
  { to: '/sales', label: 'Sales', icon: ClipboardList, roles: ['owner', 'manager'] },
  { to: '/reports', label: 'Reports', icon: FileDown, roles: ['owner', 'manager'] },
  { to: '/reports/financial', label: 'Financial P&L', icon: BarChart3, roles: ['owner', 'manager'] },
  { to: '/users', label: 'Users', icon: Users, roles: ['owner', 'manager'] },
];

const UserContext = createContext(null);
const canUse = (user, roles) => !roles || roles.includes(user?.role);
const useCurrentUser = () => useContext(UserContext);

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

function Layout({ children, user }) {
  const navigate = useNavigate();
  const [pendingForms, setPendingForms] = useState(0);

  const logout = () => {
    localStorage.removeItem('dt_token');
    navigate('/login');
  };

  useEffect(() => {
    if (!canUse(user, ['owner', 'manager'])) return undefined;
    let active = true;
    api
      .get('/form-submissions/stats')
      .then((response) => active && setPendingForms(response.data?.submitted || 0))
      .catch(() => active && setPendingForms(0));
    return () => {
      active = false;
    };
  }, [user?.role]);

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
          {nav.filter((item) => canUse(user, item.roles)).map(({ to, label, icon: Icon, badge }) => (
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
              {badge === 'forms' && pendingForms > 0 && <span className="ml-auto h-2.5 w-2.5 rounded-full bg-red-500" />}
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
            {canUse(user, ['owner', 'manager']) && pendingForms > 0 && (
              <button className="btn-soft" onClick={() => navigate('/forms?tab=pending')}>
                Pending review
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-black text-white">{pendingForms}</span>
              </button>
            )}
            <InstallAppButton className="hidden sm:inline-flex" />
            <ShieldCheck className="text-emerald-600" />
          </div>
        </header>
        <OfflineNotice />
        <OfflineDraftSync />
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

function Protected({ children }) {
  const [user, setUser] = useState(null);
  const [ok, setOk] = useState(null);

  useEffect(() => {
    let active = true;

    api
      .get('/auth/me')
      .then((response) => {
        if (!active) return;
        setUser(response.data);
        setOk(Boolean(response.data?._id));
      })
      .catch((error) => {
        const hasToken = Boolean(localStorage.getItem('dt_token'));
        const offline = !navigator.onLine || error.response?.status === 503;

        if (active) {
          setUser(hasToken && offline ? { role: 'owner' } : null);
          setOk(offline && hasToken);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (ok === null) return <div className="p-10">Loading...</div>;

  return ok ? (
    <UserContext.Provider value={user}>
      <Layout user={user}>{children}</Layout>
    </UserContext.Provider>
  ) : (
    <Login />
  );
}

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const isRegistering = mode === 'register';

  async function submitAuth(event) {
    event.preventDefault();
    setErr('');

    try {
      const payload = isRegistering ? { name, farmName, email, password } : { email, password };
      const response = await api.post(isRegistering ? '/auth/register' : '/auth/login', payload);
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
      <form onSubmit={submitAuth} className="p-8 flex items-center justify-center">
        <div className="card w-full max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">{isRegistering ? 'Create farm account' : 'Sign in'}</h2>
              <p className="text-slate-500 mb-6">
                {isRegistering ? 'Create the first owner account for this farm system.' : 'Use your farm account credentials.'}
              </p>
            </div>
            <InstallAppButton className="shrink-0" />
          </div>
          <OfflineNotice />
          {err && <p className="bg-red-50 text-red-700 p-3 rounded-xl mb-3">{err}</p>}
          {isRegistering && (
            <>
              <label className="label" htmlFor="name">
                Owner name
              </label>
              <input id="name" className="input mb-3" value={name} onChange={(event) => setName(event.target.value)} />
              <label className="label" htmlFor="farmName">
                Farm name
              </label>
              <input
                id="farmName"
                className="input mb-3"
                value={farmName}
                onChange={(event) => setFarmName(event.target.value)}
              />
            </>
          )}
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
          <button className="btn-primary w-full">{isRegistering ? 'Create account' : 'Login'}</button>
          <button
            type="button"
            className="mt-4 w-full text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            onClick={() => {
              setErr('');
              setMode(isRegistering ? 'login' : 'register');
            }}
          >
            {isRegistering ? 'I already have an account' : 'Create the first farm account'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Dashboard() {
  const user = useCurrentUser();
  const navigate = useNavigate();
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
  const formCount = user?.role === 'worker' ? summary.forms?.drafts || 0 : summary.forms?.pendingReview || 0;
  const cards = [
    ['Active Cows', s.totalCows, Beef],
    ['Today Milk', litres(s.todayMilk), Milk],
    ['Month Milk', litres(s.monthMilk), BarChart3],
    ['Milk Income', money(s.milkIncome), DollarSign],
    ['Expenses', money(s.monthExpenses), ClipboardList],
    ['Profit', money(s.profit), ShieldCheck],
    ['Pregnant', s.pregnant, Sprout],
    ['Low Feed', s.lowFeed, Bell],
    [
      user?.role === 'worker' ? 'Fill a form' : 'Review submissions',
      formCount,
      ClipboardList,
      () => navigate(user?.role === 'worker' ? '/forms' : '/forms?tab=pending'),
    ],
  ];

  return (
    <>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map(([title, value, Icon, onClick]) => (
          <div className={`card ${onClick ? 'cursor-pointer hover:shadow-md' : ''}`} key={title} onClick={onClick}>
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
          <Suspense fallback={<div className="h-[280px] animate-pulse rounded-xl bg-slate-100" />}>
            <DashboardMilkChart data={summary.topCows} />
          </Suspense>
        </div>
        <div className="card">
          <h3 className="font-black mb-4">Alerts</h3>
          {summary.vaccinationsDue?.map((record) => (
            <div key={record._id} className="p-3 rounded-xl bg-sky-50 text-sky-800 mb-2">
              Vaccine due: {record.cowId?.name || 'Cow'} ({record.vaccineType})
            </div>
          ))}
          {summary.highScc?.map((record) => (
            <div key={record._id} className="p-3 rounded-xl bg-red-50 text-red-800 mb-2">
              High SCC: {record.cowId?.name || 'Cow'} ({Number(record.scc || 0).toLocaleString()})
            </div>
          ))}
          {summary.lowInventory?.map((feed) => (
            <div key={feed._id} className="p-3 rounded-xl bg-amber-50 text-amber-800 mb-2">
              Low stock: {feed.feedType} ({feed.stockKg} kg)
            </div>
          ))}
          {summary.lowFeed?.map((feed) => (
            <div key={feed._id} className="p-3 rounded-xl bg-amber-50 text-amber-800 mb-2">
              Low stock: {feed.name} ({feed.currentStock} {feed.unit})
            </div>
          ))}
          {summary.overdueTasks?.map((task) => (
            <div key={task._id} className="p-3 rounded-xl bg-orange-50 text-orange-800 mb-2">
              Overdue task: {task.title}
            </div>
          ))}
          {summary.reminders?.map((reminder) => (
            <div key={reminder._id} className="p-3 rounded-xl bg-slate-50 mb-2">
              {reminder.title}
            </div>
          ))}
          {!summary.vaccinationsDue?.length &&
            !summary.highScc?.length &&
            !summary.lowInventory?.length &&
            !summary.lowFeed?.length &&
            !summary.overdueTasks?.length &&
            !summary.reminders?.length && (
              <EmptyState title="No alerts" description="Everything that needs attention will appear here." />
            )}
          <h3 className="font-black mb-3 mt-5">Recent field forms</h3>
          {summary.forms?.recentSubmissions?.map((submission) => (
            <button
              key={submission._id}
              className="mb-2 block w-full rounded-xl bg-slate-50 p-3 text-left text-sm"
              onClick={() => navigate(submission.status === 'submitted' ? `/forms/review/${submission._id}` : '/forms')}
            >
              <b>{submission.templateName}</b>
              <span className="ml-2 text-slate-500">{submission.status}</span>
            </button>
          ))}
          {!summary.forms?.recentSubmissions?.length && <p className="text-sm text-slate-500">No recent field form activity.</p>}
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
              {field.type === 'date' ? (
                <DatePicker value={form[field.name]} onChange={(value) => updateField(field, value)} />
              ) : (
                <input
                  className="input"
                  type={field.type || 'text'}
                  value={form[field.name] ?? ''}
                  onChange={(event) => updateField(field, event.target.value)}
                />
              )}
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

function ListPage({ path, title, cols, fields, writeRoles = ['owner', 'manager'], deleteRoles = ['owner'], emptyMessage }) {
  const { data, loading, error, load } = useData(path);
  const user = useCurrentUser();
  const [show, setShow] = useState(false);
  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState('');

  const filtered = data.filter((item) => JSON.stringify(item).toLowerCase().includes(q.toLowerCase()));
  const canWrite = canUse(user, writeRoles);
  const canDelete = canUse(user, deleteRoles);

  async function save(form) {
    await api.post(path, form);
    setShow(false);
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.delete(`${path}/${deleting._id}`);
      setDeleting(null);
      load();
    } catch {
      setToast('Delete failed, please try again');
    }
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-3xl font-black">{title}</h1>
          <p className="text-slate-500">Manage {title.toLowerCase()} with live farm records.</p>
        </div>
        {canWrite && (
          <button onClick={() => setShow(true)} className="btn-primary">
            <Plus size={18} />
            Add
          </button>
        )}
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
                {canDelete && <th></th>}
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
                  {canDelete && (
                    <td className="p-3">
                      <button onClick={() => setDeleting(row)} className="text-red-600">
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <EmptyState
              icon=""
              title={emptyMessage || `No ${title.toLowerCase()} yet`}
              description="Records will appear here once they are added."
              actionLabel={canWrite ? 'Add record' : undefined}
              onAction={canWrite ? () => setShow(true) : undefined}
            />
          )}
        </div>
      )}
      {show && <FormModal title={`Add ${title}`} fields={fields} onClose={() => setShow(false)} onSave={save} />}
      <ConfirmModal
        isOpen={Boolean(deleting)}
        title={`Delete ${title}`}
        message="This action cannot be undone."
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}

function Cows() {
  const { data, load, loading, error } = useData('/cows');
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [show, setShow] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState('');
  const canWrite = canUse(user, ['owner', 'manager']);

  async function save(form) {
    await api.post('/cows', form);
    setShow(false);
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.delete(`/cows/${deleting._id}`);
      setDeleting(null);
      load();
    } catch {
      setToast('Delete failed, please try again');
    }
  }

  return (
    <>
      <div className="flex justify-between items-center mb-5">
        <div>
          <h1 className="text-3xl font-black">Cows</h1>
          <p className="text-slate-500">Cow profiles with sale status and value scoring.</p>
        </div>
        {canWrite && (
          <button className="btn-primary" onClick={() => setShow(true)}>
            <Plus />
            Add Cow
          </button>
        )}
      </div>
      {error && <div className="card text-red-700">{error}</div>}
      {loading ? (
        <div>Loading cows...</div>
      ) : data.length ? (
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
            {canWrite && (
              <button
                type="button"
                className="mt-4 text-sm font-semibold text-red-600"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleting(cow);
                }}
              >
                Delete
              </button>
            )}
          </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon=""
          title="No cows yet - add your first cow to get started"
          description="Cow profiles will appear here with tags, breed details, status, and notes."
          actionLabel={canWrite ? 'Add Cow' : undefined}
          onAction={canWrite ? () => setShow(true) : undefined}
        />
      )}
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
      <ConfirmModal
        isOpen={Boolean(deleting)}
        title="Delete cow record"
        message="This cow will be archived with a soft delete and hidden from normal lists."
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
      <Toast message={toast} onClose={() => setToast('')} />
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
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState('');

  async function downloadCsv() {
    setDownloading(true);
    try {
      const response = await api.get('/reports/export/cows', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = 'dairytrack-cows.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setToast('Export failed, please try again');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="card">
      <h1 className="text-3xl font-black">Reports</h1>
      <p className="text-slate-500 mb-5">Export farm records as CSV, and use browser print for investor PDF previews.</p>
      <button className="btn-primary" onClick={downloadCsv} disabled={downloading}>
        <FileDown />
        {downloading ? 'Exporting...' : 'Export Cows CSV'}
      </button>
      <button className="btn-soft ml-2" onClick={() => window.print()}>
        Print Report View
      </button>
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  );
}

function RoleGate({ roles, children }) {
  const user = useCurrentUser();
  if (!canUse(user, roles)) {
    return <div className="card text-red-700">Insufficient permissions</div>;
  }
  return children;
}

function PageFallback() {
  return <div className="card animate-pulse text-slate-500">Loading page...</div>;
}

function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Suspense fallback={<PageFallback />}>
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
                writeRoles={['owner', 'manager']}
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
                emptyMessage="No milk records this week"
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
                writeRoles={['owner', 'manager']}
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
                emptyMessage="No health records yet"
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
          path="/forms"
          element={
            <Protected>
              <FormsPage />
            </Protected>
          }
        />
        <Route
          path="/forms/fill/:templateId"
          element={
            <Protected>
              <FillFormPage />
            </Protected>
          }
        />
        <Route
          path="/forms/review/:submissionId"
          element={
            <Protected>
              <ReviewSubmissionPage />
            </Protected>
          }
        />
        <Route
          path="/forms/templates"
          element={
            <Protected>
              <RoleGate roles={['owner', 'manager']}>
                <ManageTemplatesPage />
              </RoleGate>
            </Protected>
          }
        />
        <Route
          path="/forms/print/:templateId"
          element={
            <Protected>
              <RoleGate roles={['owner', 'manager']}>
                <PrintFormPage />
              </RoleGate>
            </Protected>
          }
        />
        <Route
          path="/vaccinations"
          element={
            <Protected>
              <VaccinationsPage />
            </Protected>
          }
        />
        <Route
          path="/milk-quality"
          element={
            <Protected>
              <MilkQualityPage />
            </Protected>
          }
        />
        <Route
          path="/feed-inventory"
          element={
            <Protected>
              <FeedInventoryPage />
            </Protected>
          }
        />
        <Route
          path="/tasks"
          element={
            <Protected>
              <TasksPage />
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
        <Route
          path="/reports/financial"
          element={
            <Protected>
              <FinancialReportPage />
            </Protected>
          }
        />
          <Route
            path="/users"
            element={
              <Protected>
                <RoleGate roles={['owner', 'manager']}>
                  <UserManagementPage />
                </RoleGate>
              </Protected>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

const rootElement = document.getElementById('root');
const root = globalThis.__dairyTrackRoot || createRoot(rootElement);
globalThis.__dairyTrackRoot = root;
root.render(<App />);
registerServiceWorker();
