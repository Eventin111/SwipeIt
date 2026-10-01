import { registerUser } from './registerUser';

describe('registerUser use-case', () => {
  it('throws for invalid username', async () => {
    const repo = { register: jest.fn() };
    await expect(
      registerUser(repo, { email: 'user@mail.com', password: '123456', username: 'ab' })
    ).rejects.toThrow('Имя должно содержать от 3 до 50 букв.');
  });

  it('throws for invalid email', async () => {
    const repo = { register: jest.fn() };
    await expect(
      registerUser(repo, { email: 'mail', password: '123456', username: 'alex' })
    ).rejects.toThrow('Почта должна содержать ровно один символ @.');
  });

  it('calls repository for valid payload', async () => {
    const repo = { register: jest.fn().mockResolvedValue({ token: 'y', user: { id: 2 } }) };
    const result = await registerUser(repo, {
      email: 'user@mail.com',
      password: 'abc123',
      username: 'alex'
    });

    expect(repo.register).toHaveBeenCalled();
    expect(result.user.id).toBe(2);
  });

  it('accepts numeric password and capitalizes username', async () => {
    const repo = { register: jest.fn() };
    await registerUser(repo, { email: 'user@mail.com', password: '123456', username: 'alex' });
    expect(repo.register).toHaveBeenCalledWith({ email: 'user@mail.com', password: '123456', username: 'Alex' });
  });
});
