const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email) => EMAIL_REGEX.test(String(email || '').trim());

export const isValidPassword = (password, minLength = 6) =>
  String(password || '').trim().length >= minLength;

export const isValidUsername = (username, minLength = 3) =>
  String(username || '').trim().length >= minLength &&
  String(username || '').trim().length <= 50 &&
  /^[a-zA-Z0-9_а-яА-ЯёЁ]+$/.test(String(username || '').trim());

export const isPasswordNotOnlyDigits = (password) =>
  !/^\d+$/.test(String(password || '').trim());

export const isGuestEmail = (email) => String(email || '').toLowerCase().includes('guest');

export const buildAvatarUrl = (username, background = 'ff0000') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${background}&color=fff`;
