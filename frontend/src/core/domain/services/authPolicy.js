export const INPUT_RULES = {
  username: '3–50 русских или английских букв. Без пробелов. Первую букву сделаем заглавной.',
  email: 'Адрес вида name@mail.ru. Латинские буквы, цифры и знаки - _ . Один @ перед доменом.',
  password: '6–100 символов: русские или английские буквы, цифры. Без пробелов и знаков.',
  status: 'До 60 символов. Можно оставить пустым.',
  comment: 'До 1000 символов. Не оставляйте комментарий пустым.'
};

export const capitalizeName = (value) => value ? value[0].toUpperCase() + value.slice(1) : '';
export const inputError = (field, value) => {
  const text = String(value ?? '');
  const length = Array.from(text).length;
  if (field === 'username') {
    if (!text) return 'Введите имя.';
    if (!/^[a-zA-Zа-яА-ЯёЁ]+$/.test(text)) return 'Имя: только русские и английские буквы, без цифр, пробелов и знаков.';
    if (length < 3 || length > 50) return 'Имя должно содержать от 3 до 50 букв.';
  }
  if (field === 'email') {
    if (!text) return 'Введите почту.';
    if (!/^[a-zA-Z0-9_.@-]+$/.test(text)) return 'Почта: разрешены только латинские буквы, цифры, дефис, подчёркивание, точка и @.';
    if ((text.match(/@/g) || []).length !== 1) return 'Почта должна содержать ровно один символ @.';
    if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(text)) return 'Укажите адрес в формате name@mail.ru: имя перед @ и домен после него.';
  }
  if (field === 'password') {
    if (length < 6) return 'Пароль должен содержать не менее 6 символов';
    if (length > 100) return 'Пароль слишком длинный: максимум 100 символов.';
    if (!/^[a-zA-Zа-яА-ЯёЁ0-9]+$/.test(text)) return 'Пароль: только русские и английские буквы и цифры, без пробелов и знаков.';
  }
  if (field === 'status' && length > 60) return 'Статус: максимум 60 символов. Сократите текст.';
  if (field === 'comment') {
    if (!text.trim()) return 'Введите комментарий.';
    if (length > 1000) return 'Комментарий: максимум 1000 символов. Сократите текст.';
  }
  return '';
};

export const isValidEmail = (email) => !inputError('email', email);
export const isValidPassword = (password) => !inputError('password', password);
export const isValidUsername = (username) => !inputError('username', username);

export const isPasswordNotOnlyDigits = (password) =>
  !/^\d+$/.test(String(password || '').trim());

export const isGuestEmail = (email) => String(email || '').toLowerCase().includes('guest');

export const buildAvatarUrl = (username, background = 'ff0000') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=${background}&color=fff`;
