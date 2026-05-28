import axios from 'axios';
const defaultApiUrl = import.meta.env.PROD ? '/api' : 'http://localhost:5000/api';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || defaultApiUrl });
api.interceptors.request.use(config => { const token = localStorage.getItem('dt_token'); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
api.interceptors.response.use(r=>r, err=>{ if(err.response?.status===401) localStorage.removeItem('dt_token'); return Promise.reject(err); });
export const money = n => `KSh ${Number(n||0).toLocaleString()}`;
export const litres = n => `${Number(n||0).toFixed(1)}L`;
