import {
  isValidEmail,
  isValidPassword,
  isValidUsername,
  isPasswordNotOnlyDigits
} from '../../domain/services/authPolicy';

export const registerUser = async (authRepository, payload) => {
  const { email, password, username } = payload;

  if (!isValidUsername(username)) {
    throw new Error('Имя пользователя: минимум 3 символа, только буквы/цифры/подчеркивание');
  }

  if (!isValidEmail(email)) {
    throw new Error('Введите корректный email');
  }

  if (!isValidPassword(password)) {
    throw new Error('Пароль должен содержать не менее 6 символов');
  }

  if (Array.from(password).length > 100) {
    throw new Error('Пароль слишком длинный: максимум 100 символов.');
  }

  if (!isPasswordNotOnlyDigits(password)) {
    throw new Error('Пароль не может состоять только из цифр');
  }

  return authRepository.register({ email, password, username });
};
