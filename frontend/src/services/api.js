import axios from 'axios';
import { authStore } from '../stores/authStore';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api' });
api.interceptors.request.use((config) => {
  if (authStore.token) config.headers.Authorization = `Bearer ${authStore.token}`;
  return config;
});

export default api;
