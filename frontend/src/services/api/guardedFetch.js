import { appConfig } from '../../config/appConfig';

const pending = new Map();
const fileIds = new WeakMap();
let nextFileId = 0;
const bodyKey = (body) => {
  if (body instanceof FormData) {
    return JSON.stringify(Array.from(body.entries(), ([name, value]) => {
      if (typeof value === 'string') return [name, value];
      if (!fileIds.has(value)) fileIds.set(value, ++nextFileId);
      return [name, fileIds.get(value)];
    }));
  }
  return String(body || '');
};

// Coalesce identical mutations while their response is pending. Never retry writes automatically.
export const guardedFetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  const key = ['GET', 'HEAD'].includes(method) ? null : JSON.stringify([
    url, method, Array.from(new Headers(options.headers).entries()), bodyKey(options.body)
  ]);
  if (key && pending.has(key)) {
    const response = await pending.get(key);
    return typeof response.arrayBuffer === 'function' && response.clone ? response.clone() : response;
  }
  const run = async () => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort);
    if (options.signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, appConfig.apiRequestTimeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok && response.status >= 500) {
        throw new Error('Сервис временно недоступен. Попробуйте позже.');
      }
      if (response.status === 413) {
        throw new Error('Файлы слишком большие. Выберите фотографии до 10 МБ каждая.');
      }
      if (response.status === 429) {
        throw new Error('Слишком много запросов. Подождите немного и повторите действие.');
      }
      // Buffer the body under the same deadline; a stalled response must also time out.
      if (typeof response.arrayBuffer === 'function') {
        const body = response.status === 204 || response.status === 205 ? null : await response.arrayBuffer();
        if (body && response.headers.get('content-type')?.includes('application/json')) {
          try { JSON.parse(new TextDecoder().decode(body)); }
          catch (error) { throw new Error('Не удалось прочитать ответ сервера. Попробуйте позже.'); }
        }
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      return response;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Сервер не ответил вовремя. Проверьте результат действия перед повторной отправкой.');
      }
      if (error instanceof TypeError) {
        throw new Error('Нет связи с сервером. Проверьте подключение к интернету и попробуйте ещё раз.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  };
  const request = run();
  if (key) pending.set(key, request);
  try {
    const response = await request;
    return typeof response.arrayBuffer === 'function' && response.clone ? response.clone() : response;
  } finally {
    if (key) pending.delete(key);
  }
};
