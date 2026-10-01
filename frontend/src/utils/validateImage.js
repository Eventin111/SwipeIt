export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export const validateImageFile = (file) => {
  if (!file || !file.size) throw new Error('Файл пуст. Выберите фотографию.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Размер фотографии не должен превышать 10 МБ.');
  if (!IMAGE_ACCEPT.split(',').includes(file.type)) {
    throw new Error('Выберите фотографию JPEG, PNG, WebP или GIF.');
  }
};

export const validateImage = async (file) => {
  validateImageFile(file);
  const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => reject(new Error('Не удалось прочитать фотографию. Выберите другой файл.')), 10000);
      image.onload = () => {
        clearTimeout(timeout);
        if (image.naturalWidth * image.naturalHeight > 20000000) {
          reject(new Error('Фотография слишком большая: максимум 20 мегапикселей.'));
        } else resolve();
      };
      image.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Фотография повреждена или имеет неверный формат.'));
      };
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};
