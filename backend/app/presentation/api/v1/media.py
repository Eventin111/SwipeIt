import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.upload_validation import read_validated_image
from app.infrastructure.auth.security import get_current_user
from app.infrastructure.db.db import get_db
from app.infrastructure.persistence.repositories.media_repo import MediaRepository
from app.infrastructure.storage.local_media import build_local_media_path
from app.infrastructure.storage.s3 import s3_client
from app.presentation.api.schemas.media import MediaResponse, MediaType, MediaUploadResponse
from app.presentation.api.schemas.user import UserResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def build_media_public_url(media_id: int) -> str:
    return f"{settings.API_V1}/media/{media_id}/file"


def serialize_media(media) -> MediaResponse:
    media_dict = {
        "id": media.id,
        "owner_user_id": media.owner_user_id,
        "kind": media.kind,
        "storage_key": media.storage_key,
        "width": media.width,
        "height": media.height,
        "created_at": media.created_at,
        "updated_at": media.updated_at,
    }

    if media.storage_key:
        media_dict["public_url"] = build_media_public_url(media.id)

    return MediaResponse(**media_dict)


def is_tryon_media_asset(storage_key: str | None) -> bool:
    key = str(storage_key or "").lower()
    return "/tryon/" in key or "\\tryon\\" in key


@router.post("/upload", response_model=MediaUploadResponse)
async def upload_media(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Загрузка медиа файла (работает с S3 и без S3)"""

    file_content, file_extension, content_type = await read_validated_image(file)
    unique_filename = f"user_{current_user.id}/{uuid.uuid4()}{file_extension}"
    local_file_path = build_local_media_path(unique_filename)
    local_file_path.parent.mkdir(parents=True, exist_ok=True)
    local_file_path.write_bytes(file_content)

    # Определяем тип медиа
    media_type = MediaType.IMAGE

    # Создаем медиа запись
    media_repo = MediaRepository()
    try:
        # Пытаемся загрузить в S3, если доступен
        media = await media_repo.create_with_upload(
            db,
            file_content=file_content,
            file_key=unique_filename,
            kind=media_type,
            owner_user_id=current_user.id,
            content_type=content_type,
        )

        # Формируем URL для ответа
        upload_url = f"{settings.API_V1}/media/{media.id}/file"

        logger.info(f"Файл загружен: {unique_filename}")

        return MediaUploadResponse(media=media, upload_url=upload_url)

    except Exception as e:
        local_file_path.unlink(missing_ok=True)
        logger.error(f"Ошибка загрузки файла: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить фотографию. Попробуйте позже.",
        )


@router.get("/mine", response_model=list[MediaResponse])
async def list_my_media(current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Вернуть профильные медиа текущего пользователя, исключая аватар и try-on артефакты."""
    media_repo = MediaRepository()
    user_media = await media_repo.get_by_owner(db, current_user.id)
    avatar_url = str(current_user.avatar_url or "")

    items: list[MediaResponse] = []
    for media in user_media:
        if is_tryon_media_asset(media.storage_key):
            continue
        media_response = serialize_media(media)
        media_public_url = str(media_response.public_url or "")
        if (
            avatar_url
            and media_public_url
            and (avatar_url == media_public_url or avatar_url.endswith(media_public_url))
        ):
            continue
        items.append(media_response)

    return items


@router.get("/{media_id}", response_model=MediaResponse)
async def get_media(media_id: int, db: AsyncSession = Depends(get_db)):
    """Получить информацию о медиа"""
    logger.info(f"GET /media/{media_id} вызван")

    try:
        media_repo = MediaRepository()
        logger.info("Создан MediaRepository")

        media = await media_repo.get(db, media_id)
        logger.info(f"Результат media_repo.get: {media}")

        if not media:
            logger.warning(f"Медиа {media_id} не найдено")
            raise HTTPException(status_code=404, detail="Медиа не найдено")

        logger.info(f"Медиа найдено: id={media.id}, storage_key={media.storage_key}")

        response = serialize_media(media)
        logger.info(f"Возвращаем ответ: {response}")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Необработанное исключение в get_media: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка сервера: {str(e)}")


@router.get("/{media_id}/file")
async def get_media_file(media_id: int, db: AsyncSession = Depends(get_db)):
    """Отдать файл медиа через backend, даже если MinIO приватный."""
    media_repo = MediaRepository()
    media = await media_repo.get(db, media_id)

    if not media:
        raise HTTPException(status_code=404, detail="Медиа не найдено")

    try:
        local_file_path = build_local_media_path(media.storage_key)
        if local_file_path.exists():
            suffix = Path(media.storage_key).suffix.lower()
            media_type = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
                ".webp": "image/webp",
            }.get(suffix, "application/octet-stream")
            return Response(content=local_file_path.read_bytes(), media_type=media_type)

        file_bytes, content_type = s3_client.get_file(media.storage_key)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка чтения файла: {str(e)}")

    return Response(content=file_bytes, media_type=content_type)


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: int, current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Удалить медиа текущего пользователя."""
    media_repo = MediaRepository()
    media = await media_repo.get(db, media_id)

    if not media:
        raise HTTPException(status_code=404, detail="Медиа не найдено")
    if media.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому медиа")

    media_public_url = build_media_public_url(media.id)
    if str(current_user.avatar_url or "") == media_public_url:
        current_user.avatar_url = None
        db.add(current_user)
        await db.commit()

    await media_repo.delete_many(db, [media_id])
    media_repo.delete_storage(media.storage_key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
