import { guardedFetch } from '../../../services/api/guardedFetch';
import { appConfig } from '../../../config/appConfig';
import { createUserEntity } from '../../domain/entities/userEntity';
import { createBrowserStorage } from '../storage/browserStorage';

const buildUrl = (path) => `${appConfig.apiBaseUrl}/api/v1${path}`;

export const createApiAuthRepository = (deps = {}) => {
  const storage = deps.storage || createBrowserStorage();
  const config = deps.config || appConfig;
  const keys = config.authStorageKeys;
  const legacyTokenPrefixes = ['mock-jwt-token', 'user-token-', 'guest-token-'];

  const persistSession = (token, user) => {
    storage.setItem(keys.token, token);
    storage.setItem(keys.user, JSON.stringify(user));
    storage.setItem(keys.guestFlag, 'false');
  };

  const clearSession = () => {
    storage.removeItem(keys.token);
    storage.removeItem(keys.user);
    storage.removeItem(keys.guestFlag);
  };

  const getToken = () => storage.getItem(keys.token);
  const isLegacyToken = (token) =>
    legacyTokenPrefixes.some((prefix) => String(token || '').startsWith(prefix));

  const fetchJson = async (path, init = {}) => {
    const token = getToken();
    const headers = new Headers(init.headers || {});
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), appConfig.apiRequestTimeoutMs);

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    let response;
    try {
      response = await guardedFetch(buildUrl(path), {
        ...init,
        headers,
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Превышено время ожидания API (${appConfig.apiRequestTimeoutMs} мс)`);
      }
      if (error instanceof TypeError) {
        throw new Error('Сетевой доступ к API недоступен. Проверь backend, URL и CORS.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let detail = 'Request failed';
      const rawDetail = await response.text();
      if (rawDetail) {
        try {
          const payload = JSON.parse(rawDetail);
          detail = payload?.detail || JSON.stringify(payload);
        } catch (error) {
          detail = rawDetail;
        }
      }

      throw new Error(detail || 'Request failed');
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  };

  return {
    async initializeSession() {
      const token = getToken();

      if (!token) {
        clearSession();
        return { token: null, user: null };
      }

       if (isLegacyToken(token)) {
        clearSession();
        return { token: null, user: null };
      }

      try {
        const userPayload = await fetchJson('/auth/me');
        const user = createUserEntity(userPayload);
        persistSession(token, user);
        return { token, user };
      } catch (error) {
        clearSession();
        return { token: null, user: null };
      }
    },

    async login({ email, password }) {
      const body = new URLSearchParams({
        username: String(email || '').trim(),
        password: String(password || '')
      });

      const tokenPayload = await fetchJson('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      });

      storage.setItem(keys.token, tokenPayload.access_token);
      const userPayload = await fetchJson('/auth/me');
      const user = createUserEntity(userPayload);
      persistSession(tokenPayload.access_token, user);
      return { token: tokenPayload.access_token, user };
    },

    async register({ email, password, username }) {
      await fetchJson('/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, username })
      });

      return this.login({ email, password });
    },

    async updateProfile(partialUser) {
      const payload = {};

      if (partialUser.email) {
        payload.email = partialUser.email;
      }
      if (partialUser.username) {
        payload.username = partialUser.username;
      }
      if (partialUser.avatar || partialUser.avatar_url) {
        payload.avatar_url = partialUser.avatar || partialUser.avatar_url;
      }
      if (Object.prototype.hasOwnProperty.call(partialUser || {}, 'status')) {
        payload.status = String(partialUser.status || '').trim();
      }

      const userPayload = await fetchJson('/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const token = getToken();
      const user = createUserEntity(userPayload);
      if (token) {
        persistSession(token, user);
      }
      return user;
    },

    logout() {
      clearSession();
    }
  };
};
