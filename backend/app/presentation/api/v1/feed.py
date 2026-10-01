from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.auth.security import get_current_user
from app.infrastructure.db.db import get_db
from app.infrastructure.persistence.models.comment import Comment
from app.infrastructure.persistence.models.comment_like import CommentLike
from app.infrastructure.persistence.models.likes import Like
from app.infrastructure.persistence.models.user import User
from app.infrastructure.persistence.repositories.feed_repo import FeedRepository
from app.infrastructure.persistence.repositories.like_repo import LikeRepository
from app.presentation.api.schemas.feed import (
    FeedCommentCreate,
    FeedCommentItem,
    FeedCommentLikeResponse,
    FeedCommentsResponse,
    FeedItemCreate,
    FeedItemResponse,
    FeedItemWithStats,
    FeedLikesResponse,
    FeedLikeUser,
    FeedPagination,
)
from app.presentation.api.schemas.social import LikeCreate, LikeResponse
from app.presentation.api.schemas.user import UserResponse

router = APIRouter()


@router.post("/", response_model=FeedItemResponse)
async def create_feed_item(
    feed_data: FeedItemCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Создать пост в ленте"""
    feed_repo = FeedRepository()
    feed_item = await feed_repo.create(db, obj_in=feed_data, user_id=current_user.id)
    return feed_item


@router.get("/", response_model=FeedPagination)
async def get_feed(
    skip: int = 0,
    limit: int = 20,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Получить ленту постов"""
    feed_repo = FeedRepository()
    feed_with_stats = await feed_repo.get_feed_with_stats(db, current_user_id=current_user.id, skip=skip, limit=limit)

    items = []
    for item_data in feed_with_stats:
        items.append(
            FeedItemWithStats(
                **item_data["feed_item"].__dict__,
                likes_count=item_data["likes_count"],
                is_liked=item_data["is_liked"],
                comments_count=item_data["comments_count"],
                author_is_followed=item_data["author_is_followed"],
            )
        )

    return FeedPagination(
        items=items, next_cursor=str(skip + limit) if len(items) == limit else None, has_more=len(items) == limit
    )


@router.post("/{feed_item_id}/like", response_model=LikeResponse)
async def like_feed_item(
    feed_item_id: int, current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Лайкнуть пост"""
    like_repo = LikeRepository()
    like_data = LikeCreate(feed_item_id=feed_item_id)
    like = await like_repo.create(db, obj_in=like_data, user_id=current_user.id)
    return like


@router.get("/liked-ids")
async def get_liked_feed_item_ids(
    current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Получить id постов, которые текущий пользователь лайкнул."""
    like_repo = LikeRepository()
    likes = await like_repo.get_user_likes(db, user_id=current_user.id, limit=500)
    return {"items": [like.feed_item_id for like in likes]}


@router.delete("/{feed_item_id}/like")
async def unlike_feed_item(
    feed_item_id: int, current_user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Убрать лайк с поста"""
    like_repo = LikeRepository()
    success = await like_repo.delete_by_user_and_feed_item(db, user_id=current_user.id, feed_item_id=feed_item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Лайк не найден")
    return {"message": "Лайк удален"}


@router.get("/{feed_item_id}/likes", response_model=FeedLikesResponse)
async def get_feed_item_likes(
    feed_item_id: int,
    skip: int = 0,
    limit: int = 100,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ = current_user
    feed_repo = FeedRepository()
    feed_item = await feed_repo.get(db, feed_item_id)
    if feed_item is None:
        raise HTTPException(status_code=404, detail="Пост не найден")

    total_result = await db.execute(select(func.count(Like.id)).where(Like.feed_item_id == feed_item_id))
    total = int(total_result.scalar() or 0)

    rows = await db.execute(
        select(User.id, User.username, User.avatar_url, Like.created_at)
        .join(Like, Like.user_id == User.id)
        .where(Like.feed_item_id == feed_item_id)
        .order_by(Like.created_at.desc())
        .offset(max(0, skip))
        .limit(max(1, min(limit, 500)))
    )
    items = [
        FeedLikeUser(
            user_id=int(user_id),
            username=str(username),
            avatar_url=avatar_url,
            liked_at=liked_at,
        )
        for user_id, username, avatar_url, liked_at in rows.all()
    ]

    return FeedLikesResponse(items=items, total=total)


@router.get("/{feed_item_id}/comments", response_model=FeedCommentsResponse)
async def get_feed_item_comments(
    feed_item_id: int,
    skip: int = 0,
    limit: int = 100,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    feed_repo = FeedRepository()
    feed_item = await feed_repo.get(db, feed_item_id)
    if feed_item is None:
        raise HTTPException(status_code=404, detail="Пост не найден")

    total_result = await db.execute(select(func.count(Comment.id)).where(Comment.feed_item_id == feed_item_id))
    total = int(total_result.scalar() or 0)

    normalized_skip = max(0, skip)
    normalized_limit = max(1, min(limit, 500))
    effective_skip = normalized_skip
    if normalized_skip == 0 and total > normalized_limit:
        # Keep chronological order in UI, but return the latest window of comments
        # so freshly added comments are visible even on heavily commented posts.
        effective_skip = max(0, total - normalized_limit)

    rows = await db.execute(
        select(Comment.id, Comment.user_id, User.username, User.avatar_url, Comment.text, Comment.created_at)
        .join(User, User.id == Comment.user_id)
        .where(Comment.feed_item_id == feed_item_id)
        .order_by(Comment.created_at.asc(), Comment.id.asc())
        .offset(effective_skip)
        .limit(normalized_limit)
    )
    raw_rows = rows.all()
    comment_ids = [int(comment_id) for comment_id, *_ in raw_rows]

    likes_count_map: dict[int, int] = {}
    liked_comment_ids: set[int] = set()
    if comment_ids:
        likes_count_rows = await db.execute(
            select(CommentLike.comment_id, func.count(CommentLike.id))
            .where(CommentLike.comment_id.in_(comment_ids))
            .group_by(CommentLike.comment_id)
        )
        likes_count_map = {int(comment_id): int(count_value or 0) for comment_id, count_value in likes_count_rows.all()}

        liked_rows = await db.execute(
            select(CommentLike.comment_id).where(
                CommentLike.comment_id.in_(comment_ids),
                CommentLike.user_id == current_user.id,
            )
        )
        liked_comment_ids = {int(comment_id) for (comment_id,) in liked_rows.all()}

    items = []
    for comment_id, user_id, username, avatar_url, text_value, created_at in raw_rows:
        normalized_comment_id = int(comment_id)
        items.append(
            FeedCommentItem(
                id=normalized_comment_id,
                user_id=int(user_id),
                username=str(username),
                avatar_url=avatar_url,
                text=str(text_value),
                created_at=created_at,
                is_mine=int(user_id) == int(current_user.id),
                likes_count=likes_count_map.get(normalized_comment_id, 0),
                is_liked=normalized_comment_id in liked_comment_ids,
            )
        )
    return FeedCommentsResponse(items=items, total=total)


@router.post("/{feed_item_id}/comments", response_model=FeedCommentItem)
async def add_feed_item_comment(
    feed_item_id: int,
    payload: FeedCommentCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    feed_repo = FeedRepository()
    feed_item = await feed_repo.get(db, feed_item_id)
    if feed_item is None:
        raise HTTPException(status_code=404, detail="Пост не найден")

    normalized_text = str(payload.text or "").strip()
    if not normalized_text:
        raise HTTPException(status_code=400, detail="Комментарий не должен быть пустым")
    if len(normalized_text) > 1000:
        raise HTTPException(status_code=400, detail="Комментарий: максимум 1000 символов. Сократите текст.")

    comment = Comment(
        feed_item_id=feed_item_id,
        user_id=current_user.id,
        text=normalized_text,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return FeedCommentItem(
        id=int(comment.id),
        user_id=int(current_user.id),
        username=str(current_user.username),
        avatar_url=getattr(current_user, "avatar_url", None),
        text=normalized_text,
        created_at=comment.created_at,
        is_mine=True,
        likes_count=0,
        is_liked=False,
    )


@router.post("/comments/{comment_id}/like", response_model=FeedCommentLikeResponse)
async def like_comment(
    comment_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    existing = await db.execute(
        select(CommentLike).where(
            CommentLike.comment_id == comment_id,
            CommentLike.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(CommentLike(comment_id=comment_id, user_id=current_user.id))
        await db.commit()

    total_result = await db.execute(select(func.count(CommentLike.id)).where(CommentLike.comment_id == comment_id))
    return FeedCommentLikeResponse(
        comment_id=comment_id,
        likes_count=int(total_result.scalar() or 0),
        is_liked=True,
    )


@router.delete("/comments/{comment_id}/like", response_model=FeedCommentLikeResponse)
async def unlike_comment(
    comment_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    await db.execute(
        delete(CommentLike).where(
            CommentLike.comment_id == comment_id,
            CommentLike.user_id == current_user.id,
        )
    )
    await db.commit()

    total_result = await db.execute(select(func.count(CommentLike.id)).where(CommentLike.comment_id == comment_id))
    return FeedCommentLikeResponse(
        comment_id=comment_id,
        likes_count=int(total_result.scalar() or 0),
        is_liked=False,
    )


@router.delete("/{feed_item_id}")
async def delete_feed_item(
    feed_item_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Удалить собственный пост."""
    feed_repo = FeedRepository()
    deleted = await feed_repo.delete_by_id_and_user(db, feed_item_id=feed_item_id, user_id=current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Пост не найден")
    return {"success": True}
