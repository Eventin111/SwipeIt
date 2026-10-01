import { guardedFetch } from '../../../services/api/guardedFetch';
import { appConfig } from '../../../config/appConfig';

const getAuthToken = () => localStorage.getItem(appConfig.authStorageKeys.token);

const request = async (path, init = {}) => {
  const token = getAuthToken();
  const headers = {
    ...(init.headers || {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await guardedFetch(`${appConfig.apiBaseUrl}/api/v1${path}`, {
    ...init,
    headers
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

  return response.json();
};

export const createApiUserRepository = () => ({
  async fetchPublicProfile(username, { limit = 24 } = {}) {
    const query = new URLSearchParams({ limit: String(limit) });
    return request(`/users/${encodeURIComponent(username)}/profile?${query.toString()}`);
  },

  async followUser(username) {
    return request(`/users/${encodeURIComponent(username)}/follow`, { method: 'POST' });
  },

  async unfollowUser(username) {
    return request(`/users/${encodeURIComponent(username)}/follow`, { method: 'DELETE' });
  },

  async fetchUserFollowing(username, { skip = 0, limit = 200 } = {}) {
    const query = new URLSearchParams({
      skip: String(Math.max(0, Number(skip) || 0)),
      limit: String(Math.max(1, Number(limit) || 1))
    });
    return request(`/users/${encodeURIComponent(username)}/following?${query.toString()}`);
  }
});
