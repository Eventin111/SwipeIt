import { guardedFetch } from '../../../services/api/guardedFetch';
import { appConfig } from '../../../config/appConfig';

const getAuthToken = () => localStorage.getItem(appConfig.authStorageKeys.token);

const request = async (path, init = {}) => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Нужно войти в аккаунт.');
  }

  const response = await guardedFetch(`${appConfig.apiBaseUrl}/api/v1/wardrobe${path}`, {
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

export const createApiWardrobeRepository = () => ({
  async fetchWardrobeItems({ skip = 0, limit = 100 } = {}) {
    const query = new URLSearchParams({ skip: String(skip), limit: String(limit) });
    const payload = await request(`/?${query.toString()}`);
    return Array.isArray(payload?.items) ? payload.items : [];
  },

  async fetchSavedGarmentIds() {
    const payload = await request('/garment-ids');
    return Array.isArray(payload?.items) ? payload.items : [];
  },

  async saveFromPost({ postId = null, title, brand, imageUrl, category = null, price = null }) {
    return request('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        post_id: postId,
        title,
        brand,
        image_url: imageUrl,
        category,
        price
      })
    });
  },

  async removeByGarmentId(garmentId) {
    return request(`/${garmentId}`, { method: 'DELETE' });
  }
});
