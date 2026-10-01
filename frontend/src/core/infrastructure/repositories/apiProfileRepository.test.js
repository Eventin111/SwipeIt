import { createApiProfileRepository } from './apiProfileRepository';

const okResponse = (payload, status = 200) => ({
  ok: true,
  status,
  json: jest.fn().mockResolvedValue(payload),
  text: jest.fn().mockResolvedValue('')
});

const errorResponse = ({ status = 400, payload = { detail: 'Ошибка запроса' }, text = 'Ошибка запроса' } = {}) => ({
  ok: false,
  status,
  json: jest.fn().mockResolvedValue(payload),
  text: jest.fn().mockResolvedValue(text)
});

describe('apiProfileRepository', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('requires auth token for profile requests', async () => {
    const repository = createApiProfileRepository();

    await expect(repository.fetchStats()).rejects.toThrow('Нужно войти в аккаунт.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('loads profile stats with auth header', async () => {
    localStorage.setItem('swipelt_token', 'token');
    global.fetch.mockResolvedValueOnce(okResponse({ posts_count: 10 }));
    const repository = createApiProfileRepository();

    await expect(repository.fetchStats()).resolves.toEqual({ posts_count: 10 });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/auth/me/stats',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token'
        })
      })
    );
  });

  it('loads recent try-ons and normalizes missing items', async () => {
    localStorage.setItem('swipelt_token', 'token');
    global.fetch
      .mockResolvedValueOnce(okResponse({ items: [{ session_id: 1 }] }))
      .mockResolvedValueOnce(okResponse({}));
    const repository = createApiProfileRepository();

    await expect(repository.fetchRecentTryOns({ limit: 2 })).resolves.toEqual([{ session_id: 1 }]);
    await expect(repository.fetchRecentTryOns({ limit: 2 })).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/api/v1/tryon/sessions/recent?limit=2',
      expect.any(Object)
    );
  });

  it('returns null on 204 response', async () => {
    localStorage.setItem('swipelt_token', 'token');
    global.fetch.mockResolvedValueOnce(okResponse(null, 204));
    const repository = createApiProfileRepository();

    await expect(repository.fetchStats()).resolves.toBeNull();
  });

  it('surfaces json and text backend errors', async () => {
    localStorage.setItem('swipelt_token', 'token');
    global.fetch
      .mockResolvedValueOnce(errorResponse({ status: 500, text: JSON.stringify({ detail: 'boom' }) }))
      .mockResolvedValueOnce(errorResponse({ status: 503, text: 'service unavailable' }));
    const repository = createApiProfileRepository();

    await expect(repository.fetchStats()).rejects.toThrow('Сервис временно недоступен');
    await expect(repository.fetchStats()).rejects.toThrow('Сервис временно недоступен');
  });
});
