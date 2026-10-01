const toBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveApiBaseUrl = () => {
  if (process.env.REACT_APP_API_BASE_URL !== undefined) {
    return process.env.REACT_APP_API_BASE_URL;
  }

  return 'http://localhost:8000';
};

export const appConfig = Object.freeze({
  appName: process.env.REACT_APP_NAME || 'Swipelt',
  apiBaseUrl: resolveApiBaseUrl(),
  apiRequestTimeoutMs: toNumber(process.env.REACT_APP_API_TIMEOUT_MS, 15000),
  tryOnMaxProcessingSeconds: toNumber(process.env.REACT_APP_TRYON_MAX_PROCESSING_SECONDS, 0),
  useMockData: toBoolean(process.env.REACT_APP_USE_MOCK_DATA, false),
  mockDelayMs: toNumber(process.env.REACT_APP_MOCK_DELAY_MS, 200),
  authInitDelayMs: toNumber(process.env.REACT_APP_AUTH_INIT_DELAY_MS, 300),
  authStorageKeys: Object.freeze({
    token: 'swipelt_token',
    user: 'swipelt_user',
    registeredUsers: 'swipelt_registered_users',
    guestFlag: 'swipelt_is_guest'
  }),
  demoAccount: Object.freeze({
    email: 'test@mail.ru',
    password: '123123',
    username: 'testuser'
  }),
  guestAccount: Object.freeze({
    email: 'guest@swipelt.com',
    password: 'guest123',
    username: 'Гость'
  })
});

export const getConfig = () => appConfig;
