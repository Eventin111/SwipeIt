import { guardedFetch } from '../../../services/api/guardedFetch';
import { appConfig } from '../../../config/appConfig';

const getAuthToken = () => localStorage.getItem(appConfig.authStorageKeys.token);

const request = async (path, init = {}) => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Нужно войти в аккаунт.');
  }

  const response = await guardedFetch(`${appConfig.apiBaseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    let detail = 'Ошибка запроса';
    const rawDetail = await response.text();
    if (rawDetail) {
      try {
        const payload = JSON.parse(rawDetail);
        detail = payload?.detail || JSON.stringify(payload);
      } catch (error) {
        detail = rawDetail;
      }
    }
    throw new Error(detail || 'Ошибка запроса');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export const createApiProfileRepository = () => ({
  async fetchStats() {
    return request('/auth/me/stats');
  },

  async fetchRecentTryOns({ limit = 20 } = {}) {
    const query = new URLSearchParams({ limit: String(limit) });
    const payload = await request(`/tryon/sessions/recent?${query.toString()}`);
    return Array.isArray(payload?.items) ? payload.items : [];
  }
});
