import { guardedFetch } from '../../../services/api/guardedFetch';
import { appConfig } from '../../../config/appConfig';

const getAuthToken = () => localStorage.getItem(appConfig.authStorageKeys.token);

const request = async (path, init = {}) => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Нужно войти в аккаунт.');
  }

  const response = await guardedFetch(`${appConfig.apiBaseUrl}/api/v1/feed${path}`, {
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

export const createApiFeedRepository = () => ({
  async fetchFeedPage({ skip = 0, limit = 20 } = {}) {
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit)
    });
    const payload = await request(`/?${query.toString()}`);
    return {
      items: Array.isArray(payload?.items) ? payload.items : [],
      hasMore: Boolean(payload?.has_more),
      nextCursor: payload?.next_cursor || null
    };
  },

  async fetchFeedItems({ skip = 0, limit = 200 } = {}) {
    const page = await this.fetchFeedPage({ skip, limit });
    return page.items;
  },

  async fetchLikedFeedIds() {
    const payload = await request('/liked-ids');
    return Array.isArray(payload?.items) ? payload.items : [];
  },

  async likeFeedItem(feedItemId) {
    return request(`/${feedItemId}/like`, { method: 'POST' });
  },

  async unlikeFeedItem(feedItemId) {
    return request(`/${feedItemId}/like`, { method: 'DELETE' });
  },

  async fetchFeedItemLikes(feedItemId, { skip = 0, limit = 100 } = {}) {
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit)
    });
    const payload = await request(`/${feedItemId}/likes?${query.toString()}`);
    return {
      items: Array.isArray(payload?.items) ? payload.items : [],
      total: Number(payload?.total || 0)
    };
  },

  async fetchFeedItemComments(feedItemId, { skip = 0, limit = 100 } = {}) {
    const query = new URLSearchParams({
      skip: String(skip),
      limit: String(limit)
    });
    const payload = await request(`/${feedItemId}/comments?${query.toString()}`);
    return {
      items: Array.isArray(payload?.items) ? payload.items : [],
      total: Number(payload?.total || 0)
    };
  },

  async addFeedItemComment(feedItemId, { text }) {
    return request(`/${feedItemId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: String(text || '') })
    });
  },

  async likeComment(commentId) {
    return request(`/comments/${commentId}/like`, {
      method: 'POST'
    });
  },

  async unlikeComment(commentId) {
    return request(`/comments/${commentId}/like`, {
      method: 'DELETE'
    });
  },

  async deleteFeedItem(feedItemId) {
    return request(`/${feedItemId}`, { method: 'DELETE' });
  }
});

