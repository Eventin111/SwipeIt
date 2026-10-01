import { inputError } from '../core/domain/services/authPolicy';

export const validateLoginForm = ({ email, password }) =>
  inputError('email', email) || (String(password || '').length < 6 ? 'Пароль должен содержать не менее 6 символов' : '');

export const validateRegisterForm = ({ email, password, username }) =>
  inputError('username', username) || inputError('email', email) || inputError('password', password);
