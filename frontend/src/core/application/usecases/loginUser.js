import { inputError } from '../../domain/services/authPolicy';

export const loginUser = async (authRepository, payload) => {
  const { email, password } = payload;

  const emailError = inputError('email', email);
  if (emailError) throw new Error(emailError);

  if (String(password || '').length < 6) {
    throw new Error('Пароль должен содержать не менее 6 символов');
  }

  return authRepository.login({ email, password });
};

