import { loginUser } from './loginUser';

describe('loginUser use-case', () => {
  it('throws when email is invalid', async () => {
    const repo = { login: jest.fn() };
    await expect(loginUser(repo, { email: 'invalid', password: '123456' })).rejects.toThrow(
      'Почта должна содержать ровно один символ @.'
    );
  });

  it('throws when password is short', async () => {
    const repo = { login: jest.fn() };
    await expect(loginUser(repo, { email: 'user@mail.com', password: '123' })).rejects.toThrow(
      'Пароль должен содержать не менее 6 символов'
    );
  });

  it('calls repository with normalized payload', async () => {
    const repo = { login: jest.fn().mockResolvedValue({ token: 'x', user: { id: 1 } }) };
    const result = await loginUser(repo, { email: 'user@mail.com', password: '123456' });

    expect(repo.login).toHaveBeenCalledWith({ email: 'user@mail.com', password: '123456' });
    expect(result.user.id).toBe(1);
  });
});

