import { guardedFetch } from '../../../services/api/guardedFetch';
import { appConfig } from '../../../config/appConfig';

const getAuthToken = () => localStorage.getItem(appConfig.authStorageKeys.token);

const extractErrorDetail = async (response, fallback) => {
  const rawText = await response.text();
  if (!rawText) {
    return fallback;
  }

  try {
    const payload = JSON.parse(rawText);
    return payload?.detail || JSON.stringify(payload);
  } catch (error) {
    return rawText;
  }
};

const normalizeUrl = (url) => {
  if (!url) {
    return '';
  }

  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) {
    return url;
  }

  if (url.startsWith('/')) {
    return `${appConfig.apiBaseUrl}${url}`;
  }

  return `${appConfig.apiBaseUrl}/${url}`;
};

const requestWithAuth = async (path, init = {}, defaultErrorMessage) => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Нужно войти в аккаунт, чтобы работать с медиа.');
  }

  const response = await guardedFetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const detail = await extractErrorDetail(response, defaultErrorMessage);
    throw new Error(detail || defaultErrorMessage);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export const createApiMediaRepository = () => ({
  async uploadMedia(file) {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Нужно войти в аккаунт, чтобы загружать файлы.');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await guardedFetch(`${appConfig.apiBaseUrl}/api/v1/media/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const detail = await extractErrorDetail(response, 'Ошибка загрузки файла');
      throw new Error(detail || 'Ошибка загрузки файла');
    }

    const payload = await response.json();

    return {
      ...payload,
      upload_url: normalizeUrl(payload.upload_url),
      media: payload.media
        ? {
            ...payload.media,
            public_url: normalizeUrl(payload.media.public_url)
          }
        : payload.media
    };
  },

  async fetchMyMedia() {
    const payload = await requestWithAuth('/api/v1/media/mine', {}, 'Ошибка загрузки медиа');
    return Array.isArray(payload)
      ? payload.map((item) => ({
          ...item,
          public_url: normalizeUrl(item.public_url)
        }))
      : [];
  },

  async deleteMedia(mediaId) {
    return requestWithAuth(
      `/api/v1/media/${mediaId}`,
      { method: 'DELETE' },
      'Ошибка удаления медиа'
    );
  }
});
