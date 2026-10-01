import { guardedFetch } from '../../../services/api/guardedFetch';
import { appConfig } from '../../../config/appConfig';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildTryOnUrl = () => `${appConfig.apiBaseUrl}/api/v1/tryon/try-on`;
const buildTryOnSessionStatusUrl = (sessionId) => `${appConfig.apiBaseUrl}/api/v1/tryon/sessions/${sessionId}`;
const buildTryOnSessionCancelUrl = (sessionId) => `${appConfig.apiBaseUrl}/api/v1/tryon/sessions/${sessionId}/cancel`;
const buildTryOnSessionPublishUrl = (sessionId) => `${appConfig.apiBaseUrl}/api/v1/tryon/sessions/${sessionId}/publish`;
const getAuthToken = () => localStorage.getItem(appConfig.authStorageKeys.token);
const MODEL_MAX_UPLOAD_DIMENSION = 1536;
const CLOTH_MAX_UPLOAD_DIMENSION = 1536;

const normalizeMediaUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return '';
  }

  try {
    return new URL(value, appConfig.apiBaseUrl).toString();
  } catch (error) {
    return value;
  }
};

const resolveBrowserOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return '';
};

const normalizeTryOnSessionPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const normalizedPayload = { ...payload };
  const nestedSession = payload.session && typeof payload.session === 'object' ? payload.session : null;

  if (!normalizedPayload.status && nestedSession?.status) {
    normalizedPayload.status = nestedSession.status;
  }

  if (normalizedPayload.error_text === undefined && nestedSession?.error_text !== undefined) {
    normalizedPayload.error_text = nestedSession.error_text;
  }

  const payloadResultMediaId = normalizedPayload.result_media_id;
  const nestedResultMediaId = nestedSession?.result_media_id;
  const resolvedResultMediaId =
    payloadResultMediaId !== undefined && payloadResultMediaId !== null
      ? payloadResultMediaId
      : nestedResultMediaId !== undefined && nestedResultMediaId !== null
        ? nestedResultMediaId
        : null;

  if (normalizedPayload.result_media_id === undefined && resolvedResultMediaId !== null) {
    normalizedPayload.result_media_id = resolvedResultMediaId;
  }

  const candidateResultUrl =
    normalizedPayload.result_image_url ||
    normalizedPayload.resultUrl ||
    normalizedPayload?.results?.[0] ||
    nestedSession?.result_image_url ||
    (resolvedResultMediaId !== null ? `/api/v1/media/${resolvedResultMediaId}/file` : null);

  if (candidateResultUrl) {
    normalizedPayload.result_image_url = normalizeMediaUrl(candidateResultUrl);
  }

  return normalizedPayload;
};

const extractDetailFromPayload = (payload) => {
  if (!payload) {
    return '';
  }
  if (typeof payload === 'string') {
    return payload;
  }
  if (typeof payload === 'object') {
    return payload.detail || payload.error || payload.message || JSON.stringify(payload);
  }
  return String(payload);
};

const extractErrorDetail = async (response) => {
  if (!response) {
    return '';
  }

  // Real Fetch Response supports clone(), which lets us avoid "body stream already read".
  if (typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      const detail = extractDetailFromPayload(payload);
      if (detail) {
        return detail;
      }
    } catch (error) {
      // Fall through to text parser.
    }

    try {
      const rawText = await response.clone().text();
      if (!rawText) {
        return '';
      }
      try {
        const payload = JSON.parse(rawText);
        return extractDetailFromPayload(payload);
      } catch (error) {
        return rawText;
      }
    } catch (error) {
      return '';
    }
  }

  // Fallback for mocked responses in tests (no clone()).
  if (typeof response.json === 'function') {
    try {
      const payload = await response.json();
      const detail = extractDetailFromPayload(payload);
      if (detail) {
        return detail;
      }
    } catch (error) {
      // Fall through to text parser.
    }
  }

  if (typeof response.text === 'function') {
    try {
      const rawText = await response.text();
      if (!rawText) {
        return '';
      }
      try {
        const payload = JSON.parse(rawText);
        return extractDetailFromPayload(payload);
      } catch (error) {
        return rawText;
      }
    } catch (error) {
      return '';
    }
  }

  return '';
};

const buildTryOnWebSocketUrl = (sessionId) => {
  const token = getAuthToken();
  const rawBaseUrl = String(appConfig.apiBaseUrl || '').trim() || resolveBrowserOrigin();
  const normalizedBaseUrl = rawBaseUrl.replace(/^http/i, 'ws');
  const url = new URL(`/api/v1/tryon/sessions/${sessionId}/ws`, normalizedBaseUrl);
  if (token) {
    url.searchParams.set('token', token);
  }
  return url.toString();
};

const blobToJpegFile = async (blob, fallbackName, options = {}) => {
  const { maxDimension = null, quality = 0.9 } = options;
  const contentType = String(blob?.type || '').toLowerCase();
  if ((contentType === 'image/jpeg' || contentType === 'image/jpg') && !maxDimension) {
    return new File([blob], fallbackName, { type: 'image/jpeg' });
  }

  const hasDomImageTools =
    typeof document !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof URL.revokeObjectURL === 'function';

  if (!hasDomImageTools) {
    return new File([blob], fallbackName, { type: blob.type || 'image/jpeg' });
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image'));
      el.src = objectUrl;
    });

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const longestSide = Math.max(sourceWidth, sourceHeight);
    const scale =
      maxDimension && Number.isFinite(maxDimension) && maxDimension > 0 && longestSide > maxDimension
        ? maxDimension / longestSide
        : 1;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context is not available');
    }

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const jpegBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });

    if (!jpegBlob) {
      throw new Error('Failed to encode jpg');
    }

    return new File([jpegBlob], fallbackName, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const imageInputToFile = async (input, fallbackName, options = {}) => {
  const { preferJpeg = false, maxDimension = null, quality = 0.9 } = options;

  if (!input) {
    throw new Error('Image input is required');
  }

  if (input instanceof File) {
    return preferJpeg ? blobToJpegFile(input, fallbackName, { maxDimension, quality }) : input;
  }

  if (input instanceof Blob) {
    if (preferJpeg) {
      return blobToJpegFile(input, fallbackName, { maxDimension, quality });
    }
    return new File([input], fallbackName, { type: input.type || 'image/jpeg' });
  }

  if (typeof input === 'string') {
    const response = await guardedFetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch image source: ${response.status}`);
    }

    const blob = await response.blob();
    if (preferJpeg) {
      return blobToJpegFile(blob, fallbackName, { maxDimension, quality });
    }
    return new File([blob], fallbackName, { type: blob.type || 'image/jpeg' });
  }

  throw new Error('Unsupported image input type');
};

const runTryOnMock = async ({ modelImage, clothImage }) => {
  await sleep(appConfig.mockDelayMs);
  return {
    id: Date.now(),
    sessionId: null,
    queued: false,
    resultUrl: typeof modelImage === 'string' ? modelImage : (typeof clothImage === 'string' ? clothImage : ''),
    status: 'completed',
    raw: { success: true, results: [], count: 0, mock: true }
  };
};

export const createApiTryOnRepository = () => ({
  async runTryOn({
    modelImage,
    clothImage,
    modelType = 'hd',
    category = 0,
    scale = 2.0,
    numSteps = 20,
    numSamples = 1,
    seed = -1
  }) {
    const modelImageFile = await imageInputToFile(modelImage, 'model-image.jpg', {
      preferJpeg: true,
      maxDimension: MODEL_MAX_UPLOAD_DIMENSION,
      quality: 0.97
    });
    const clothImageFile = await imageInputToFile(clothImage, 'cloth-image.jpg', {
      preferJpeg: true,
      maxDimension: CLOTH_MAX_UPLOAD_DIMENSION,
      quality: 0.98
    });

    const formData = new FormData();
    formData.append('model_image', modelImageFile);
    formData.append('cloth_image', clothImageFile);
    formData.append('model_type', modelType);
    formData.append('category', String(category));
    formData.append('scale', String(scale));
    formData.append('num_steps', String(numSteps));
    formData.append('num_samples', String(numSamples));
    formData.append('seed', String(seed));

    try {
      const headers = {};
      const token = getAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await guardedFetch(buildTryOnUrl(), {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        const detail = await extractErrorDetail(response);
        throw new Error(typeof detail === 'string' && detail ? detail : 'Не удалось выполнить действие с примеркой.');
      }

      const payload = await response.json();
      const normalizedPayload = normalizeTryOnSessionPayload(payload);
      return {
        id: Date.now(),
        sessionId: normalizedPayload?.session_id || null,
        queued: Boolean(normalizedPayload?.queued),
        resultUrl: normalizedPayload?.result_image_url || '',
        status: normalizedPayload?.status || (normalizedPayload?.success ? 'completed' : 'failed'),
        raw: normalizedPayload
      };
    } catch (error) {
      if (appConfig.useMockData) {
        return runTryOnMock({ modelImage, clothImage });
      }
      if (error instanceof TypeError) {
        throw new Error(
          'Сетевой доступ к API недоступен (возможен CORS или неверный API URL). Проверь, что backend запущен и разрешает текущий origin.'
        );
      }

      throw error;
    }
  },

  async getTryOnSession(sessionId) {
    const headers = {};
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await guardedFetch(buildTryOnSessionStatusUrl(sessionId), {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const detail = await extractErrorDetail(response);
      throw new Error(typeof detail === 'string' && detail ? detail : 'Не удалось выполнить действие с примеркой.');
    }

    const payload = await response.json();
    return normalizeTryOnSessionPayload(payload);
  },

  async cancelTryOnSession(sessionId) {
    const headers = {};
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await guardedFetch(buildTryOnSessionCancelUrl(sessionId), {
      method: 'POST',
      headers
    });

    if (!response.ok) {
      const detail = await extractErrorDetail(response);
      throw new Error(typeof detail === 'string' && detail ? detail : 'Не удалось выполнить действие с примеркой.');
    }

    const payload = await response.json();
    return normalizeTryOnSessionPayload(payload);
  },

  async deleteTryOnSession(sessionId) {
    const headers = {};
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await guardedFetch(buildTryOnSessionStatusUrl(sessionId), {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      const detail = await extractErrorDetail(response);
      throw new Error(typeof detail === 'string' && detail ? detail : 'Не удалось выполнить действие с примеркой.');
    }

    if (response.status === 204) {
      return null;
    }
    return response.json();
  },

  async publishTryOnSession(
    sessionId,
    { caption = '', sourceType = null, sourcePostId = null, hashtags = [] } = {}
  ) {
    const headers = {
      'Content-Type': 'application/json'
    };
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await guardedFetch(buildTryOnSessionPublishUrl(sessionId), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        caption,
        source_type: sourceType,
        source_post_id: sourcePostId,
        hashtags
      })
    });

    if (!response.ok) {
      const detail = await extractErrorDetail(response);
      throw new Error(typeof detail === 'string' && detail ? detail : 'Не удалось выполнить действие с примеркой.');
    }

    return response.json();
  },

  subscribeToTryOnSession(
    sessionId,
    {
      onMessage,
      onError,
      onClose
    } = {}
  ) {
    const socket = new WebSocket(buildTryOnWebSocketUrl(sessionId));

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        onMessage?.(normalizeTryOnSessionPayload(payload));
      } catch (error) {
        onError?.(error);
      }
    };

    socket.onerror = (event) => {
      onError?.(event);
    };

    socket.onclose = (event) => {
      onClose?.(event);
    };

    return socket;
  }
});

