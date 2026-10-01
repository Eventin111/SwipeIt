from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.application.dto.feed_dto import FeedItemBase, FeedItemCreate, FeedItemUpdate
from app.presentation.api.schemas.garment import GarmentResponse
from app.presentation.api.schemas.media import MediaResponse
from app.presentation.api.schemas.user import UserResponse

__all__ = [
    "FeedItemBase",
    "FeedItemCreate",
    "FeedItemUpdate",
    "FeedItemResponse",
    "FeedItemWithStats",
    "FeedPagination",
    "FeedLikeUser",
    "FeedLikesResponse",
    "FeedCommentCreate",
    "FeedCommentItem",
    "FeedCommentsResponse",
    "FeedCommentLikeResponse",
]


class FeedItemResponse(FeedItemBase):
    id: int
    user_id: int
    garment_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    user: Optional[UserResponse] = None
    garment: Optional[GarmentResponse] = None
    media_items: List[MediaResponse] = []

    class Config:
        orm_mode = True


class FeedItemWithStats(FeedItemResponse):
    likes_count: int = 0
    comments_count: int = 0
    is_liked: bool = False
    author_is_followed: bool = False


class FeedPagination(BaseModel):
    items: List[FeedItemWithStats]
    next_cursor: Optional[str] = None
    has_more: bool = False


class FeedLikeUser(BaseModel):
    user_id: int
    username: str
    avatar_url: Optional[str] = None
    liked_at: datetime


class FeedLikesResponse(BaseModel):
    items: List[FeedLikeUser]
    total: int = 0


class FeedCommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)


class FeedCommentItem(BaseModel):
    id: int
    user_id: int
    username: str
    avatar_url: Optional[str] = None
    text: str
    created_at: datetime
    is_mine: bool = False
    likes_count: int = 0
    is_liked: bool = False


class FeedCommentsResponse(BaseModel):
    items: List[FeedCommentItem]
    total: int = 0


class FeedCommentLikeResponse(BaseModel):
    comment_id: int
    likes_count: int
    is_liked: bool
