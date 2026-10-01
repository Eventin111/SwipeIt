"""Validate decoded images before writing files or scheduling ML work."""

import io
import warnings

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
IMAGE_FORMATS = {
    "JPEG": (".jpg", "image/jpeg"),
    "PNG": (".png", "image/png"),
    "WEBP": (".webp", "image/webp"),
    "GIF": (".gif", "image/gif"),
}


async def read_validated_image(file: UploadFile) -> tuple[bytes, str, str]:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Размер фотографии не должен превышать 10 МБ.")
    if not data:
        raise HTTPException(400, "Файл пуст. Выберите фотографию.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                image_format = image.format
                if image_format not in IMAGE_FORMATS:
                    raise HTTPException(400, "Выберите изображение JPEG, PNG, WebP или GIF.")
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(400, "Фотография слишком большая: максимум 20 мегапикселей.")
                if getattr(image, "is_animated", False):
                    raise HTTPException(400, "Выберите неподвижное изображение вместо анимации.")
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise HTTPException(400, "Не удалось прочитать фотографию. Файл повреждён или имеет неверный формат.") from exc
    extension, content_type = IMAGE_FORMATS[image_format]
    return data, extension, content_type
