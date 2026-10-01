import { validateImageFile, MAX_IMAGE_BYTES } from './validateImage';

test('rejects empty files, unsupported types and oversized images', () => {
  expect(() => validateImageFile(new File([], 'empty.png', { type: 'image/png' }))).toThrow('Файл пуст');
  expect(() => validateImageFile(new File(['x'], 'fake.png', { type: 'text/plain' }))).toThrow('JPEG');
  expect(() => validateImageFile({ size: MAX_IMAGE_BYTES + 1, type: 'image/png' })).toThrow('10 МБ');
  expect(() => validateImageFile({ size: MAX_IMAGE_BYTES, type: 'image/png' })).not.toThrow();
});
