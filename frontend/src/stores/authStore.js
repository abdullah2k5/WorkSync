import { reactive } from 'vue';
import { getCurrentUser } from '../services/authService';

const saved = JSON.parse(localStorage.getItem('worksync_auth') || 'null');
export const authStore = reactive({ token: saved?.token || null, user: saved?.user || null, ready: false });

function persist() {
  if (authStore.token && authStore.user) localStorage.setItem('worksync_auth', JSON.stringify({ token: authStore.token, user: authStore.user }));
  else localStorage.removeItem('worksync_auth');
}

export function setAuth(payload) {
  authStore.token = payload.token;
  authStore.user = payload.user;
  persist();
}

export function logout() {
  authStore.token = null;
  authStore.user = null;
  persist();
}

export async function restoreAuth() {
  if (!authStore.token) { authStore.ready = true; return; }
  try {
    const data = await getCurrentUser();
    authStore.user = data.user;
    persist();
  } catch {
    logout();
  } finally {
    authStore.ready = true;
  }
}
