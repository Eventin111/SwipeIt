import { createApiTryOnRepository } from './apiTryOnRepository';

const okResponse = (payload, extras = {}) => ({
  ok: true,
  status: 200,
  json: jest.fn().mockResolvedValue(payload),
  text: jest.fn().mockResolvedValue(''),
  blob: jest.fn(),
  ...extras
});

const errorResponse = ({ status = 400, payload = { detail: 'Ошибка' }, text = 'Ошибка', jsonFails = false } = {}) => ({
  ok: false,
  status,
  json: jsonFails ? jest.fn().mockRejectedValue(new Error('bad json')) : jest.fn().mockResolvedValue(payload),
  text: jest.fn().mockResolvedValue(text)
});

class MockWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
}

describe('apiTryOnRepository', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
    global.WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('submits try-on request with files and auth token', async () => {
    localStorage.setItem('swipelt_token', 'token');
    global.fetch.mockResolvedValueOnce(
      okResponse({
        session_id: 21,
        queued: true,
        results: ['https://cdn.example.com/result.jpg'],
        status: 'queued'
      })
    );
    const repository = createApiTryOnRepository();

    const payload = await repository.runTryOn({
      modelImage: new File(['model'], 'model.png', { type: 'image/png' }),
      clothImage: new File(['cloth'], 'cloth.jpg', { type: 'image/jpeg' }),
      modelType: 'hd',
      category: 1,
      scale: 2.5,
      numSteps: 8,
      numSamples: 2,
      seed: 99
    });

    expect(payload).toEqual(
      expect.objectContaining({
        sessionId: 21,
        queued: true,
        resultUrl: 'https://cdn.example.com/result.jpg',
        status: 'queued'
      })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tryon/try-on',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token'
        }),
        body: expect.any(FormData)
      })
    );
  });

  it('supports string and blob image inputs', async () => {
    const sourceBlob = new Blob(['image'], { type: 'image/png' });
    global.fetch
      .mockResolvedValueOnce(
        okResponse(null, {
          blob: jest.fn().mockResolvedValue(sourceBlob)
        })
      )
      .mockResolvedValueOnce(
        okResponse({
          session_id: 33,
          queued: false,
          result_image_url: '/media/tryon/result.png',
          success: true
        })
      );
    const repository = createApiTryOnRepository();

    const payload = await repository.runTryOn({
      modelImage: 'https://example.com/model.png',
      clothImage: new Blob(['cloth'], { type: 'image/jpeg' })
    });

    expect(payload.sessionId).toBe(33);
    expect(payload.resultUrl).toBe('http://localhost:8000/media/tryon/result.png');
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://example.com/model.png', expect.objectContaining({ signal: expect.anything() }));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/api/v1/tryon/try-on',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('maps network TypeError to a friendly api message', async () => {
    global.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const repository = createApiTryOnRepository();

    await expect(
      repository.runTryOn({
        modelImage: new File(['model'], 'model.png', { type: 'image/png' }),
        clothImage: new File(['cloth'], 'cloth.jpg', { type: 'image/jpeg' })
      })
    ).rejects.toThrow('Нет связи с сервером');
  });

  it('throws a detailed error when image source fetch fails', async () => {
    global.fetch.mockResolvedValueOnce(errorResponse({ status: 404, text: 'not found', jsonFails: true }));
    const repository = createApiTryOnRepository();

    await expect(
      repository.runTryOn({
        modelImage: 'https://example.com/missing.png',
        clothImage: new Blob(['cloth'], { type: 'image/jpeg' })
      })
    ).rejects.toThrow('Failed to fetch image source: 404');
  });

  it('rejects unsupported image input types', async () => {
    const repository = createApiTryOnRepository();

    await expect(repository.runTryOn({ modelImage: 123, clothImage: new Blob(['cloth'], { type: 'image/jpeg' }) })).rejects.toThrow(
      'Unsupported image input type'
    );
  });

  it('loads try-on session details and surfaces backend errors', async () => {
    global.fetch
      .mockResolvedValueOnce(okResponse({ id: 55, status: 'completed' }))
      .mockResolvedValueOnce(errorResponse({ status: 500, payload: { detail: 'boom' } }));
    const repository = createApiTryOnRepository();

    await expect(repository.getTryOnSession(55)).resolves.toEqual({ id: 55, status: 'completed' });
    await expect(repository.getTryOnSession(55)).rejects.toThrow('Сервис временно недоступен. Попробуйте позже.');
  });

  it('falls back to response text when try-on session error is not json', async () => {
    global.fetch.mockResolvedValueOnce(errorResponse({ status: 503, text: 'service unavailable', jsonFails: true }));
    const repository = createApiTryOnRepository();

    await expect(repository.getTryOnSession(55)).rejects.toThrow('Сервис временно недоступен. Попробуйте позже.');
  });

  it('subscribes to websocket events and routes handlers', () => {
    localStorage.setItem('swipelt_token', 'token');
    const onMessage = jest.fn();
    const onError = jest.fn();
    const onClose = jest.fn();
    const repository = createApiTryOnRepository();

    const socket = repository.subscribeToTryOnSession(44, {
      onMessage,
      onError,
      onClose
    });

    expect(socket.url).toBe('ws://localhost:8000/api/v1/tryon/sessions/44/ws?token=token');

    socket.onmessage({ data: JSON.stringify({ status: 'queued' }) });
    socket.onmessage({ data: 'not-json' });
    socket.onerror({ type: 'error' });
    socket.onclose({ code: 1000 });

    expect(onMessage).toHaveBeenCalledWith({ status: 'queued' });
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledWith({ code: 1000 });
  });

  it('builds websocket url without token query when session token is absent', () => {
    const repository = createApiTryOnRepository();

    const socket = repository.subscribeToTryOnSession(77);

    expect(socket.url).toBe('ws://localhost:8000/api/v1/tryon/sessions/77/ws');
  });

  it('surfaces backend error details for failed try-on requests', async () => {
    global.fetch.mockResolvedValueOnce(errorResponse({ status: 422, payload: { detail: 'bad input' } }));
    const repository = createApiTryOnRepository();

    await expect(
      repository.runTryOn({
        modelImage: new File(['model'], 'model.png', { type: 'image/png' }),
        clothImage: new File(['cloth'], 'cloth.jpg', { type: 'image/jpeg' })
      })
    ).rejects.toThrow('bad input');
  });

  it('falls back to response text when try-on request error is not json', async () => {
    global.fetch.mockResolvedValueOnce(errorResponse({ status: 502, text: 'upstream fail', jsonFails: true }));
    const repository = createApiTryOnRepository();

    await expect(
      repository.runTryOn({
        modelImage: new File(['model'], 'model.png', { type: 'image/png' }),
        clothImage: new File(['cloth'], 'cloth.jpg', { type: 'image/jpeg' })
      })
    ).rejects.toThrow('Сервис временно недоступен. Попробуйте позже.');
  });

  it('cancels try-on session and returns normalized payload', async () => {
    localStorage.setItem('swipelt_token', 'token');
    global.fetch.mockResolvedValueOnce(
      okResponse({
        session: {
          id: 7,
          status: 'cancelled',
          result_media_id: null
        }
      })
    );
    const repository = createApiTryOnRepository();

    const payload = await repository.cancelTryOnSession(7);

    expect(payload).toEqual(
      expect.objectContaining({
        status: 'cancelled',
        session: expect.objectContaining({ id: 7, status: 'cancelled' })
      })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tryon/sessions/7/cancel',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token'
        })
      })
    );
  });

  it('surfaces cancel session backend error text', async () => {
    global.fetch.mockResolvedValueOnce(errorResponse({ status: 409, text: 'already completed', jsonFails: true }));
    const repository = createApiTryOnRepository();

    await expect(repository.cancelTryOnSession(3)).rejects.toThrow('already completed');
  });

  it('deletes try-on session and handles 204 response', async () => {
    global.fetch
      .mockResolvedValueOnce(okResponse(null, 204))
      .mockResolvedValueOnce(okResponse({ deleted: true }, 200));
    const repository = createApiTryOnRepository();

    await expect(repository.deleteTryOnSession(12)).resolves.toBeNull();
    await expect(repository.deleteTryOnSession(13)).resolves.toEqual({ deleted: true });
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/api/v1/tryon/sessions/12',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('publishes try-on session and forwards payload', async () => {
    global.fetch.mockResolvedValueOnce(okResponse({ feed_item_id: 77 }));
    const repository = createApiTryOnRepository();

    await expect(
      repository.publishTryOnSession(8, {
        caption: 'caption',
        sourceType: 'post',
        sourcePostId: 15,
        hashtags: ['a', 'b']
      })
    ).resolves.toEqual({ feed_item_id: 77 });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tryon/sessions/8/publish',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          caption: 'caption',
          source_type: 'post',
          source_post_id: 15,
          hashtags: ['a', 'b']
        })
      })
    );
  });

  it('surfaces publish backend error details', async () => {
    global.fetch.mockResolvedValueOnce(errorResponse({ status: 403, payload: { detail: 'forbidden publish' } }));
    const repository = createApiTryOnRepository();

    await expect(repository.publishTryOnSession(8, {})).rejects.toThrow('forbidden publish');
  });

  it('extracts backend error using clone().json() when available', async () => {
    const response = {
      ok: false,
      status: 502,
      clone: jest.fn(() => ({
        json: jest.fn().mockResolvedValue({ detail: 'clone json detail' })
      })),
      json: jest.fn().mockResolvedValue({ detail: 'ignored' }),
      text: jest.fn().mockResolvedValue('ignored')
    };
    global.fetch.mockResolvedValueOnce(response);
    const repository = createApiTryOnRepository();

    await expect(repository.getTryOnSession(77)).rejects.toThrow('Сервис временно недоступен. Попробуйте позже.');
  });

  it('falls back from clone().json() to clone().text()', async () => {
    const response = {
      ok: false,
      status: 503,
      clone: jest
        .fn()
        .mockReturnValueOnce({
          json: jest.fn().mockRejectedValue(new Error('bad json'))
        })
        .mockReturnValueOnce({
          text: jest.fn().mockResolvedValue('clone text fallback')
        }),
      json: jest.fn().mockResolvedValue({ detail: 'ignored' }),
      text: jest.fn().mockResolvedValue('ignored')
    };
    global.fetch.mockResolvedValueOnce(response);
    const repository = createApiTryOnRepository();

    await expect(repository.getTryOnSession(77)).rejects.toThrow('Сервис временно недоступен. Попробуйте позже.');
  });

  it('adds auth header when loading try-on session if token exists', async () => {
    localStorage.setItem('swipelt_token', 'token');
    global.fetch.mockResolvedValueOnce(okResponse({ id: 77, status: 'queued' }));
    const repository = createApiTryOnRepository();

    await repository.getTryOnSession(77);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/tryon/sessions/77',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token'
        })
      })
    );
  });

  it('normalizes nested session payload fields', async () => {
    global.fetch.mockResolvedValueOnce(
      okResponse({
        session: {
          id: 99,
          status: 'completed',
          result_media_id: 321,
          error_text: null
        }
      })
    );
    const repository = createApiTryOnRepository();

    await expect(repository.getTryOnSession(99)).resolves.toEqual(
      expect.objectContaining({
        session: expect.objectContaining({ id: 99, status: 'completed' }),
        status: 'completed',
        result_media_id: 321,
        result_image_url: 'http://localhost:8000/api/v1/media/321/file'
      })
    );
  });

  it('passes through non-object websocket payloads', () => {
    const onMessage = jest.fn();
    const repository = createApiTryOnRepository();

    const socket = repository.subscribeToTryOnSession(17, { onMessage });
    socket.onmessage({ data: JSON.stringify('queued') });

    expect(onMessage).toHaveBeenCalledWith('queued');
  });

  it('renders through canvas conversion path when URL.createObjectURL is available', async () => {
    const originalImage = global.Image;
    const originalCreateObjectURL = global.URL.createObjectURL;
    const originalRevokeObjectURL = global.URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);

    global.URL.createObjectURL = jest.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = jest.fn();

    class MockImage {
      constructor() {
        this.naturalWidth = 1200;
        this.naturalHeight = 800;
      }
      set src(_value) {
        setTimeout(() => this.onload?.(), 0);
      }
    }

    global.Image = MockImage;
    const drawImage = jest.fn();
    const toBlob = jest.fn((callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })));
    jest.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toBlob
        };
      }
      return originalCreateElement(tagName, options);
    });

    global.fetch.mockResolvedValueOnce(
      okResponse({
        session_id: 45,
        queued: false,
        result_image_url: '/api/v1/media/12/file',
        status: 'completed'
      })
    );

    try {
      const repository = createApiTryOnRepository();
      const payload = await repository.runTryOn({
        modelImage: new File(['model'], 'model.png', { type: 'image/png' }),
        clothImage: new File(['cloth'], 'cloth.png', { type: 'image/png' })
      });

      expect(payload.status).toBe('completed');
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      expect(drawImage).toHaveBeenCalled();
      expect(toBlob).toHaveBeenCalled();
    } finally {
      document.createElement.mockRestore();
      global.Image = originalImage;
      global.URL.createObjectURL = originalCreateObjectURL;
      global.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});
