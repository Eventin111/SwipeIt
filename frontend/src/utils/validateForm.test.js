import { validateLoginForm, validateRegisterForm } from './validateForm';

describe('validateForm utils', () => {
  it('validates login form', () => {
    expect(validateLoginForm({ email: 'mail', password: '123456' })).toBe('Почта должна содержать ровно один символ @.');
    expect(validateLoginForm({ email: 'user@mail.com', password: '123' })).toContain('Пароль');
    expect(validateLoginForm({ email: 'user@mail.com', password: '123456' })).toBe('');
  });

  it('validates register form', () => {
    expect(
      validateRegisterForm({ email: 'user@mail.com', password: '123456', username: 'ab' })
    ).toContain('Имя');
    expect(
      validateRegisterForm({ email: 'user@mail.com', password: '123456', username: 'alex' })
    ).toBe('');
  });
});

