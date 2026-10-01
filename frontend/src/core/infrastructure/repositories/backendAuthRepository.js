import { appConfig } from '../../../config/appConfig';
import { createUserEntity } from '../../domain/entities/userEntity';
import { isGuestEmail } from '../../domain/services/authPolicy';
import { createBrowserStorage } from '../storage/browserStorage';
import { apiFetch } from '../../../services/api/http';

const toFormBody = (payload) => new URLSearchParams(payload).toString();

const extractErrorMessage = (error, fallback) => {
  const message = String(error?.message || '').trim();
  return message || fallback;
};

const sanitizeGuestUsername = () => `Guest${Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) => String.fromCharCode(97 + n % 26)).join('')}`;

export const createBackendAuthRepository = (deps = {}) => {
  const storage = deps.storage || createBrowserStorage();
  const config = deps.config || appConfig;
  const keys = config.authStorageKeys;

  const clearSession = () => {
    storage.removeItem(keys.token);
    storage.removeItem(keys.user);
    storage.removeItem(keys.guestFlag);
  };

  const toUserEntity = (rawUser, emailHint = '') => {
    const email = String(rawUser?.email || emailHint || '').trim().toLowerCase();
    const isGuest = isGuestEmail(email);
    return createUserEntity({
      id: rawUser?.id,
      email,
      username: rawUser?.username || 'user',
      status: rawUser?.status || '',
      avatar: rawUser?.avatar_url || rawUser?.avatar || undefined,
      isGuest
    });
  };

  const persistSession = (token, user) => {
    storage.setItem(keys.token, token);
    storage.setItem(keys.user, JSON.stringify(user));
    storage.setItem(keys.guestFlag, String(Boolean(user?.isGuest)));
  };

  const fetchCurrentUser = async (token) =>
    apiFetch('/api/v1/auth/me', {
      method: 'GET',
      withAuth: true,
      token
    });

  const loginWithPassword = async ({ email, password }) => {
    const payload = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      withAuth: false,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: toFormBody({
        username: email,
        password
      })
    });

    return payload?.access_token;
  };

  const tryRegisterGuest = async ({ email, password }) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const username = attempt === 0 ? 'Guest' : sanitizeGuestUsername();
      try {
        await apiFetch('/api/v1/auth/register', {
          method: 'POST',
          withAuth: false,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            password,
            username
          })
        });
        return;
      } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('email') && message.includes('существ')) {
          return;
        }
        if (message.includes('username') && message.includes('существ')) {
          continue;
        }
        throw error;
      }
    }
  };

  return {
    async initializeSession() {
      const token = storage.getItem(keys.token);
      if (!token) {
        clearSession();
        return { token: null, user: null };
      }

      try {
        const rawUser = await fetchCurrentUser(token);
        const user = toUserEntity(rawUser);
        persistSession(token, user);
        return { token, user };
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          clearSession();
          return { token: null, user: null };
        }
        throw error;
      }
    },

    async login({ email, password }) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const loginPayload = { email: normalizedEmail, password };
      let token;

      try {
        token = await loginWithPassword(loginPayload);
      } catch (error) {
        if (!isGuestEmail(normalizedEmail)) {
          throw new Error(extractErrorMessage(error, 'Неверный email или пароль'));
        }
        await tryRegisterGuest(loginPayload);
        token = await loginWithPassword(loginPayload);
      }

      const rawUser = await fetchCurrentUser(token);
      const user = toUserEntity(rawUser, normalizedEmail);
      persistSession(token, user);
      return { token, user };
    },

    async register({ email, password, username }) {
      const payload = {
        email: String(email || '').trim().toLowerCase(),
        password,
        username: String(username || '').trim()
      };

      try {
        await apiFetch('/api/v1/auth/register', {
          method: 'POST',
          withAuth: false,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } catch (error) {
        throw new Error(extractErrorMessage(error, 'Не удалось зарегистрироваться'));
      }

      return this.login({ email: payload.email, password: payload.password });
    },

    async updateProfile(partialUser) {
      const payload = {};

      if (partialUser?.email) {
        payload.email = String(partialUser.email).trim().toLowerCase();
      }
      if (partialUser?.username) {
        payload.username = String(partialUser.username).trim();
      }
      if (partialUser?.avatar || partialUser?.avatar_url) {
        payload.avatar_url = partialUser.avatar || partialUser.avatar_url;
      }
      if (Object.prototype.hasOwnProperty.call(partialUser || {}, 'status')) {
        payload.status = String(partialUser?.status || '').trim();
      }

      const rawUser = await apiFetch('/api/v1/auth/me', {
        method: 'PATCH',
        withAuth: true,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const token = storage.getItem(keys.token);
      const user = toUserEntity(rawUser);
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
