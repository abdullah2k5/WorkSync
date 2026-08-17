import api from './api';

export const login = (credentials) => api.post('/auth/login', credentials).then((response) => response.data);
export const getCurrentUser = () => api.get('/auth/me').then((response) => response.data);
