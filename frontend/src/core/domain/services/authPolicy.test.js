import {
  buildAvatarUrl,
  isGuestEmail,
  isValidEmail,
  isValidPassword,
  isValidUsername
} from './authPolicy';

describe('authPolicy', () => {
  it('validates email format', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail()).toBe(false);
  });

  it('validates password length', () => {
    expect(isValidPassword('123456')).toBe(true);
    expect(isValidPassword('12345')).toBe(false);
    expect(isValidPassword(undefined, 1)).toBe(false);
  });

  it('validates username length', () => {
    expect(isValidUsername('alice')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername()).toBe(false);
  });

  it('detects guest email', () => {
    expect(isGuestEmail('guest@swipelt.com')).toBe(true);
    expect(isGuestEmail('user@mail.com')).toBe(false);
    expect(isGuestEmail(undefined)).toBe(false);
  });

  it('builds encoded avatar url', () => {
    const url = buildAvatarUrl('Тест Юзер');
    expect(url).toContain('ui-avatars.com');
    expect(url).toContain('%D0%A2%D0%B5%D1%81%D1%82');
  });
});

describe('new input rules', () => {
  const { inputError, capitalizeName } = require('./authPolicy');
  test.each(['анна', 'alice', 'ёлена'])('capitalizes %s', (name) => {
    expect(capitalizeName(name)).toBe(name[0].toUpperCase() + name.slice(1));
  });
  test.each(['Anna1', 'Anna_', 'Ан на', 'Anna!', ' Anna'])('rejects name %s', (name) => {
    expect(inputError('username', name)).toBeTruthy();
  });
  test.each(['a+b@mail.ru', 'тест@mail.ru', 'a@@mail.ru', 'a@mail', 'a b@mail.ru'])('rejects email %s', (email) => {
    expect(inputError('email', email)).toBeTruthy();
  });
  test.each(['абвЁ12', '123456', 'Abc123'])('accepts password %s', (password) => {
    expect(inputError('password', password)).toBe('');
  });
  test.each(['12345', 'abc12!', 'abc 12', 'абв12🙂'])('rejects password %s', (password) => {
    expect(inputError('password', password)).toBeTruthy();
  });
  it('checks text boundaries including emoji', () => {
    expect(inputError('status', 'я'.repeat(60))).toBe('');
    expect(inputError('status', 'я'.repeat(61))).toContain('60');
    expect(inputError('comment', '🙂'.repeat(1000))).toBe('');
    expect(inputError('comment', 'я'.repeat(1001))).toContain('1000');
    expect(inputError('comment', '   ')).toBeTruthy();
  });
});
