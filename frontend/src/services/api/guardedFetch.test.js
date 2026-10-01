import { guardedFetch } from './guardedFetch';
import { appConfig } from '../../config/appConfig';

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.useRealTimers(); });

test('coalesces simultaneous identical writes but permits a later intentional action', async () => {
  let finish;
  global.fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const options = { method: 'POST', body: '{"text":"hello"}' };
  const first = guardedFetch('/comment', options);
  const second = guardedFetch('/comment', options);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  finish({ ok: true, status: 200 });
  await Promise.all([first, second]);
  global.fetch.mockResolvedValue({ ok: true, status: 200 });
  await guardedFetch('/comment', options);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('does not combine different users or bodies', async () => {
  global.fetch.mockResolvedValue({ ok: true, status: 200 });
  await Promise.all([
    guardedFetch('/x', { method: 'POST', body: 'a' }),
    guardedFetch('/x', { method: 'POST', body: 'b' }),
    guardedFetch('/x', { method: 'POST', body: 'a', headers: { Authorization: 'Bearer other' } })
  ]);
  expect(global.fetch).toHaveBeenCalledTimes(3);
});

test('aborts a stalled request with a useful message and allows retry', async () => {
  jest.useFakeTimers();
  global.fetch.mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  const result = expect(guardedFetch('/x', { method: 'POST' })).rejects.toThrow('Сервер не ответил вовремя');
  jest.advanceTimersByTime(appConfig.apiRequestTimeoutMs);
  await result;
  global.fetch.mockResolvedValue({ ok: true, status: 200 });
  await guardedFetch('/x', { method: 'POST' });
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('hides internal server errors and explains network failures', async () => {
  global.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
  await expect(guardedFetch('/x')).rejects.toThrow('Сервис временно недоступен');
  global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(guardedFetch('/x')).rejects.toThrow('Нет связи с сервером');
});
