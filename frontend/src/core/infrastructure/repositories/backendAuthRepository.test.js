import { createBackendAuthRepository } from './backendAuthRepository';
import { apiFetch } from '../../../services/api/http';

jest.mock('../../../services/api/http', () => ({
  apiFetch: jest.fn()
}));

const createMemoryStorage = () => {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    }
  };
};

const createConfig = () => ({
  authStorageKeys: {
    token: 'swipelt_token',
    user: 'swipelt_user',
    guestFlag: 'swipelt_is_guest'
  }
});

describe('backendAuthRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty session when token is missing', async () => {
    const storage = createMemoryStorage();
    const repository = createBackendAuthRepository({ storage, config: createConfig() });

    await expect(repository.initializeSession()).resolves.toEqual({ token: null, user: null });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('restores session for a valid token', async () => {
    const storage = createMemoryStorage();
    storage.setItem('swipelt_token', 'token-1');
    apiFetch.mockResolvedValueOnce({
      id: 7,
      email: 'user@mail.com',
      username: 'user7',
      avatar_url: 'https://img.test/user7.png'
    });

    const repository = createBackendAuthRepository({ storage, config: createConfig() });
    const session = await repository.initializeSession();

    expect(session.token).toBe('token-1');
    expect(session.user.username).toBe('user7');
    expect(storage.getItem('swipelt_user')).toContain('user@mail.com');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/v1/auth/me',
      expect.objectContaining({ method: 'GET', withAuth: true, token: 'token-1' })
    );
  });

  it('clears broken session if /auth/me fails', async () => {
    const storage = createMemoryStorage();
    storage.setItem('swipelt_token', 'broken');
    storage.setItem('swipelt_user', '{"id":1}');
    storage.setItem('swipelt_is_guest', 'false');
    apiFetch.mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { status: 401 }));

    const repository = createBackendAuthRepository({ storage, config: createConfig() });
    const session = await repository.initializeSession();

    expect(session).toEqual({ token: null, user: null });
    expect(storage.getItem('swipelt_token')).toBeNull();
    expect(storage.getItem('swipelt_user')).toBeNull();
    expect(storage.getItem('swipelt_is_guest')).toBeNull();
  });

  it('keeps credentials on a temporary connection failure', async () => {
    const storage = createMemoryStorage();
    storage.setItem('swipelt_token', 'valid-token');
    apiFetch.mockRejectedValueOnce(new Error('Нет связи с сервером'));
    const repository = createBackendAuthRepository({ storage, config: createConfig() });
    await expect(repository.initializeSession()).rejects.toThrow('Нет связи с сервером');
    expect(storage.getItem('swipelt_token')).toBe('valid-token');
  });

  it('logs in regular user', async () => {
    const storage = createMemoryStorage();
    apiFetch
      .mockResolvedValueOnce({ access_token: 'token-regular' })
      .mockResolvedValueOnce({ id: 2, email: 'regular@mail.com', username: 'regular_user' });

    const repository = createBackendAuthRepository({ storage, config: createConfig() });
    const session = await repository.login({ email: ' Regular@mail.com ', password: 'secret' });

    expect(session.token).toBe('token-regular');
    expect(session.user.email).toBe('regular@mail.com');
    expect(storage.getItem('swipelt_token')).toBe('token-regular');
    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/auth/login',
      expect.objectContaining({ method: 'POST', withAuth: false })
    );
  });

  it('throws login error for non-guest users', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Неверный email или пароль'));
    const repository = createBackendAuthRepository({
      storage: createMemoryStorage(),
      config: createConfig()
    });

    await expect(
      repository.login({ email: 'user@mail.com', password: 'wrong' })
    ).rejects.toThrow('Неверный email или пароль');
  });

  it('supports guest login via register fallback', async () => {
    apiFetch
      .mockRejectedValueOnce(new Error('Unauthorized')) // login attempt #1
      .mockResolvedValueOnce({}) // register guest
      .mockResolvedValueOnce({ access_token: 'guest-token' }) // login attempt #2
      .mockResolvedValueOnce({ id: 9, email: 'guest@swipelt.com', username: 'guest_user' }); // me

    const repository = createBackendAuthRepository({
      storage: createMemoryStorage(),
      config: createConfig()
    });
    const session = await repository.login({ email: 'guest@swipelt.com', password: 'guest123' });

    expect(session.token).toBe('guest-token');
    expect(session.user.isGuest).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(4);
  });

  it('handles guest register duplicate-email branch', async () => {
    apiFetch
      .mockRejectedValueOnce(new Error('Unauthorized'))
      .mockRejectedValueOnce(new Error('Пользователь с таким email уже существует'))
      .mockResolvedValueOnce({ access_token: 'guest-token-2' })
      .mockResolvedValueOnce({ id: 10, email: 'guest@example.com', username: 'guest_user' });

    const repository = createBackendAuthRepository({
      storage: createMemoryStorage(),
      config: createConfig()
    });
    const session = await repository.login({ email: 'guest@example.com', password: 'guest123' });

    expect(session.token).toBe('guest-token-2');
    expect(session.user.isGuest).toBe(true);
  });

  it('registers user and then logs in', async () => {
    apiFetch
      .mockResolvedValueOnce({}) // register
      .mockResolvedValueOnce({ access_token: 'token-new' }) // login
      .mockResolvedValueOnce({ id: 11, email: 'new@mail.com', username: 'new_user' }); // me

    const repository = createBackendAuthRepository({
      storage: createMemoryStorage(),
      config: createConfig()
    });
    const session = await repository.register({
      email: 'new@mail.com',
      password: 'Secret123',
      username: 'new_user'
    });

    expect(session.token).toBe('token-new');
    expect(session.user.username).toBe('new_user');
  });

  it('updates profile and persists returned user', async () => {
    const storage = createMemoryStorage();
    storage.setItem('swipelt_token', 'token-upd');
    apiFetch.mockResolvedValueOnce({
      id: 11,
      email: 'updated@mail.com',
      username: 'updated_user',
      avatar_url: 'https://img.test/new-avatar.png'
    });

    const repository = createBackendAuthRepository({
      storage,
      config: createConfig()
    });

    const user = await repository.updateProfile({
      email: 'Updated@mail.com',
      username: 'updated_user',
      avatar: 'https://img.test/new-avatar.png'
    });

    expect(user.email).toBe('updated@mail.com');
    expect(user.avatar).toBe('https://img.test/new-avatar.png');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/v1/auth/me',
      expect.objectContaining({
        method: 'PATCH',
        withAuth: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'updated@mail.com',
          username: 'updated_user',
          avatar_url: 'https://img.test/new-avatar.png'
        })
      })
    );
    expect(storage.getItem('swipelt_user')).toContain('updated@mail.com');
  });

  it('returns fallback register error message', async () => {
    apiFetch.mockRejectedValueOnce(new Error(''));
    const repository = createBackendAuthRepository({
      storage: createMemoryStorage(),
      config: createConfig()
    });

    await expect(
      repository.register({ email: 'new@mail.com', password: 'Secret123', username: 'new_user' })
    ).rejects.toThrow('Не удалось зарегистрироваться');
  });

  it('clears session on logout', () => {
    const storage = createMemoryStorage();
    storage.setItem('swipelt_token', 'some-token');
    storage.setItem('swipelt_user', '{"id":1}');
    storage.setItem('swipelt_is_guest', 'true');

    const repository = createBackendAuthRepository({ storage, config: createConfig() });
    repository.logout();

    expect(storage.getItem('swipelt_token')).toBeNull();
    expect(storage.getItem('swipelt_user')).toBeNull();
    expect(storage.getItem('swipelt_is_guest')).toBeNull();
  });
});
