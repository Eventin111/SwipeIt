from datetime import datetime

import pytest
from pydantic import ValidationError

from app.presentation.api.schemas.feed import FeedItemCreate, FeedItemWithStats, FeedPagination
from app.presentation.api.schemas.garment import GarmentCreate, GarmentUpdate
from app.presentation.api.schemas.media import MediaCreate, MediaResponse, MediaType
from app.presentation.api.schemas.social import LikeStats
from app.presentation.api.schemas.tryon import TryOnEventResponse, TryOnResult, TryOnSessionResponse, TryOnSessionUpdate
from app.presentation.api.schemas.user import Token, UserCreate, UserLogin, UserUpdate
from app.domain.enums.tryon import TryOnEventType, TryOnStatus


def test_media_create_rejects_non_positive_dimensions():
    with pytest.raises(ValidationError):
        MediaCreate(kind=MediaType.IMAGE, storage_key="key", width=0)


def test_media_response_calculates_aspect_ratio():
    response = MediaResponse(
        id=1,
        kind=MediaType.IMAGE,
        storage_key="key",
        width=1920,
        height=1080,
        owner_user_id=5,
        public_url="https://example.com/file.jpg",
        created_at=datetime.utcnow(),
    )

    assert response.aspect_ratio == 1.78


def test_garment_title_is_trimmed():
    garment = GarmentCreate(title="  Jacket  ", brand="ACME", media_id=10)

    assert garment.title == "Jacket"


def test_garment_rejects_invalid_media_id():
    with pytest.raises(ValidationError):
        GarmentCreate(title="Jacket", media_id=0)


def test_garment_update_allows_partial_payload():
    garment = GarmentUpdate(brand="Brand")

    assert garment.brand == "Brand"
    assert garment.title is None


def test_user_create_accepts_numeric_password():
    user = UserCreate(email="user@example.com", username="validname", password="123456")
    assert user.username == "Validname"


def test_user_update_rejects_invalid_username():
    with pytest.raises(ValidationError):
        UserUpdate(username="bad name")


def test_user_login_and_token_defaults():
    login = UserLogin(email="user@example.com", password="secret")
    token = Token(access_token="jwt")

    assert login.email == "user@example.com"
    assert token.token_type == "bearer"


def test_feed_item_create_rejects_non_positive_media_ids():
    with pytest.raises(ValidationError):
        FeedItemCreate(media_ids=[1, 0])


def test_feed_pagination_accepts_stats_items():
    session = TryOnSessionResponse(
        id=7,
        user_id=8,
        garment_id=1,
        avatar_media_id=2,
        status=TryOnStatus.COMPLETED,
        created_at=datetime.utcnow(),
    )
    result = TryOnResult(session=session, result_image_url="https://example.com/image.png")
    item = FeedItemWithStats(
        id=1,
        user_id=2,
        caption="hello",
        likes_count=3,
        comments_count=4,
        created_at=datetime.utcnow(),
    )
    page = FeedPagination(items=[item], has_more=True, next_cursor="next")
    likes = LikeStats(feed_item_id=1, likes_count=3, is_liked=True)
    update = TryOnSessionUpdate(status=TryOnStatus.FAILED, error_text="boom")

    assert result.session.status == TryOnStatus.COMPLETED
    assert page.items[0].likes_count == 3
    assert likes.is_liked is True
    assert update.error_text == "boom"


def test_tryon_event_response_accepts_event_type():
    event = TryOnEventResponse(
        id=1,
        session_id=7,
        event_type=TryOnEventType.RETRY,
        attempt=2,
        error_text="boom",
        details="retry scheduled",
        created_at=datetime.utcnow(),
    )

    assert event.event_type == TryOnEventType.RETRY
    assert event.attempt == 2
