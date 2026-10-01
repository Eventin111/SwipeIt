import asyncio
import io
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image
from pydantic import ValidationError

from app.application.dto.user_dto import UserCreate
from app.application.dto.wardrobe_dto import WardrobeSaveFromPost
from app.core.upload_validation import MAX_UPLOAD_BYTES, read_validated_image
from app.infrastructure.cache import tryon_submission
from app.presentation.api.schemas.tryon import PublishTryOnRequest


def image_bytes(fmt="PNG"):
    buffer = io.BytesIO()
    Image.new("RGB", (20, 30)).save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.mark.parametrize("content", [b"", b"not an image", image_bytes()[:30]])
def test_invalid_uploads_are_rejected(content):
    with pytest.raises(HTTPException) as error:
        asyncio.run(read_validated_image(UploadFile(filename="fake.jpg", file=io.BytesIO(content))))
    assert error.value.status_code == 400


def test_upload_does_not_trust_filename_or_content_type():
    data, extension, mime = asyncio.run(
        read_validated_image(UploadFile(filename="image.html", file=io.BytesIO(image_bytes())))
    )
    assert data == image_bytes()
    assert (extension, mime) == (".png", "image/png")


def test_large_upload_uses_bounded_read():
    upload = AsyncMock()
    upload.read.return_value = b"x" * (MAX_UPLOAD_BYTES + 1)
    with pytest.raises(HTTPException) as error:
        asyncio.run(read_validated_image(upload))
    assert error.value.status_code == 413
    upload.read.assert_awaited_once_with(MAX_UPLOAD_BYTES + 1)


def test_pixel_limit(monkeypatch):
    monkeypatch.setattr("app.core.upload_validation.MAX_IMAGE_PIXELS", 599)
    with pytest.raises(HTTPException, match="20 мегапикселей"):
        asyncio.run(read_validated_image(UploadFile(file=io.BytesIO(image_bytes()))))


@pytest.mark.parametrize("password", ["      ", "  123456  ", "x" * 101])
def test_invalid_registration_password(password):
    with pytest.raises(ValidationError):
        UserCreate(email="valid@example.com", username="Validuser", password=password)


def test_normalize_username_and_reject_blank_wardrobe_title():
    user = UserCreate(email="valid@example.com", username="validuser", password="password")
    assert user.username == "Validuser"
    with pytest.raises(ValidationError):
        WardrobeSaveFromPost(title="   ", image_url="https://example.com/a.jpg")


@pytest.mark.parametrize(
    "payload",
    [
        {"caption": "x" * 2001},
        {"hashtags": ["a"] * 21},
        {"hashtags": ["a" * 65]},
        {"source_post_id": -1},
        {"source_type": "unknown"},
    ],
)
def test_invalid_publication(payload):
    with pytest.raises(ValidationError):
        PublishTryOnRequest(**payload)


class FakeRedis:
    def __init__(self):
        self.data = {}

    async def get(self, key):
        return self.data.get(key)

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.data:
            return False
        self.data[key] = value
        return True

    async def eval(self, script, count, key, owner):
        if self.data.get(key) == owner:
            del self.data[key]


def test_submission_retries_and_concurrency(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(tryon_submission, "get_redis_client", lambda: redis)

    async def scenario():
        entered, release = asyncio.Event(), asyncio.Event()

        async def work():
            entered.set()
            await release.wait()
            return {"session_id": 9}

        operation = AsyncMock(side_effect=work)
        first = asyncio.create_task(tryon_submission.submit_once("user:images", operation))
        await entered.wait()
        with pytest.raises(HTTPException) as error:
            await tryon_submission.submit_once("user:images", operation)
        assert error.value.status_code == 409
        release.set()
        assert await first == {"session_id": 9}
        assert await tryon_submission.submit_once("user:images", operation) == {"session_id": 9}
        operation.assert_awaited_once()
        assert await tryon_submission.submit_once("other:images", operation) == {"session_id": 9}
        assert operation.await_count == 2

    asyncio.run(scenario())


def test_failed_submission_releases_lock(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(tryon_submission, "get_redis_client", lambda: redis)

    async def scenario():
        operation = AsyncMock(side_effect=RuntimeError("failed"))
        with pytest.raises(RuntimeError):
            await tryon_submission.submit_once("key", operation)
        assert not redis.data
        assert await tryon_submission.submit_once("key", AsyncMock(return_value={"ok": True})) == {"ok": True}

    asyncio.run(scenario())
