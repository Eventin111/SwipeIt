import { inputError, capitalizeName } from '../../domain/services/authPolicy';

export const registerUser = async (authRepository, payload) => {
  for (const field of ['username', 'email', 'password']) {
    const error = inputError(field, payload[field]);
    if (error) throw new Error(error);
  }
  return authRepository.register({ ...payload, username: capitalizeName(payload.username) });
};
