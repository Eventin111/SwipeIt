import { guardedFetch } from './guardedFetch';
import { appConfig } from '../../config/appConfig';

const buildApiUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${appConfig.apiBaseUrl}${normalizedPath}`;
};

const parseResponsePayload = async (response) => {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return text || null;
};

const toErrorMessage = (payload, fallback) => {
  if (!payload) {
    return fallback;
  }
  if (typeof payload === 'string') {
    return fallback;
  }
  if (typeof payload?.detail === 'string') {
    return payload.detail;
  }
  return fallback;
};

export const getStoredToken = () => localStorage.getItem(appConfig.authStorageKeys.token);

export const apiFetch = async (path, options = {}) => {
  const {
    token,
    headers,
    withAuth = true,
    ...restOptions
  } = options;

  const resolvedToken = token === undefined ? getStoredToken() : token;
  const requestHeaders = { ...(headers || {}) };
  if (withAuth && resolvedToken) {
    requestHeaders.Authorization = `Bearer ${resolvedToken}`;
  }

  const response = await guardedFetch(buildApiUrl(path), {
    ...restOptions,
    headers: requestHeaders
  });

  let payload;
  try {
    payload = response.status === 204 ? null : await parseResponsePayload(response);
  } catch (error) {
    throw new Error('Не удалось прочитать ответ сервера. Попробуйте позже.');
  }
  if (!response.ok) {
    const defaultMessage = response.status >= 500
      ? 'Сервис временно недоступен. Попробуйте позже.'
      : 'Не удалось выполнить действие. Проверьте данные и попробуйте снова.';
    const error = new Error(response.status >= 500 ? defaultMessage : toErrorMessage(payload, defaultMessage));
    error.status = response.status;
    throw error;
  }

  return payload;
};

export const apiUrl = buildApiUrl;
