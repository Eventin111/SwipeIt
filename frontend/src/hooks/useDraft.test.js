import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useDraft } from './useDraft';

let element;
let root;
let current;
const Draft = ({ draftKey }) => {
  current = useDraft(draftKey);
  return <span>{current[0]}</span>;
};
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  element = document.createElement('div');
  root = createRoot(element);
});
afterEach(() => { act(() => root.unmount()); });

test('restores drafts after remount and keeps accounts and sessions separate', () => {
  act(() => root.render(<Draft draftKey="user1:session1" />));
  act(() => current[1]('Мой образ'));
  act(() => root.render(<Draft draftKey="user2:session1" />));
  expect(current[0]).toBe('');
  act(() => current[1]('Другой образ'));
  act(() => root.render(<Draft draftKey="user1:session1" />));
  expect(current[0]).toBe('Мой образ');
  act(() => root.unmount());
  root = createRoot(element);
  act(() => root.render(<Draft draftKey="user1:session1" />));
  expect(current[0]).toBe('Мой образ');
  act(() => current[1](''));
  expect(sessionStorage.getItem('user1:session1')).toBeNull();
  expect(sessionStorage.getItem('user2:session1')).toBe('"Другой образ"');
});

test('ignores corrupted stored data and keeps draft when storage is full', () => {
  sessionStorage.setItem('draft', '{broken');
  act(() => root.render(<Draft draftKey="draft" />));
  expect(current[0]).toBe('');
  const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  act(() => current[1]('Сохранить в памяти'));
  expect(current[0]).toBe('Сохранить в памяти');
  storage.mockRestore();
});
