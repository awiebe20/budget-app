import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const accounts = {
  list: () => api.get('/accounts').then((r) => r.data),
  create: (data: object) => api.post('/accounts', data).then((r) => r.data),
  update: (id: number, data: object) => api.patch(`/accounts/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/accounts/${id}`).then((r) => r.data),
};

export const transactions = {
  list: (params?: object) => api.get('/transactions', { params }).then((r) => r.data),
  update: (id: number, data: object) => api.patch(`/transactions/${id}`, data).then((r) => r.data),
  addSplit: (id: number, data: object) => api.post(`/transactions/${id}/splits`, data).then((r) => r.data),
  deleteSplit: (id: number, splitId: number) => api.delete(`/transactions/${id}/splits/${splitId}`).then((r) => r.data),
};

export const categories = {
  list: () => api.get('/categories').then((r) => r.data),
  create: (data: object) => api.post('/categories', data).then((r) => r.data),
  update: (id: number, data: object) => api.patch(`/categories/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/categories/${id}`).then((r) => r.data),
};

export const budgets = {
  list: (month: number, year: number) => api.get('/budgets', { params: { month, year } }).then((r) => r.data),
  upsert: (data: object) => api.post('/budgets', data).then((r) => r.data),
};

export const imports = {
  preview: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/imports/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  confirm: (file: File, accountId: number) => {
    const form = new FormData();
    form.append('file', file);
    form.append('accountId', String(accountId));
    return api.post('/imports/confirm', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  history: () => api.get('/imports').then((r) => r.data),
};

export const settlements = {
  pending: () => api.get('/settlements/pending').then((r) => r.data),
  settle: (data: object) => api.post('/settlements', data).then((r) => r.data),
  history: () => api.get('/settlements').then((r) => r.data),
};

export const savings = {
  list: () => api.get('/savings').then((r) => r.data),
  create: (data: object) => api.post('/savings', data).then((r) => r.data),
  update: (id: number, data: object) => api.patch(`/savings/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/savings/${id}`).then((r) => r.data),
};

export const reports = {
  summary: (month: number, year: number) => api.get('/reports/summary', { params: { month, year } }).then((r) => r.data),
  byCategory: (month: number, year: number) => api.get('/reports/by-category', { params: { month, year } }).then((r) => r.data),
  trend: (months: number) => api.get('/reports/trend', { params: { months } }).then((r) => r.data),
  upcomingBills: () => api.get('/reports/upcoming-bills').then((r) => r.data),
};
