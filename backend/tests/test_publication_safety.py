import asyncio
import importlib
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException


def load_routes(monkeypatch):
    monkeypatch.setitem(
        sys.modules, "app.infrastructure.ml.ootd_service", SimpleNamespace(get_ootd_service=lambda: None)
    )
    return importlib.import_module("app.presentation.api.v1.tryon")


def result_with(value):
    result = Mock()
    result.scalar_one_or_none.return_value = value
    result.unique.return_value = result
    return result


def session(status="completed"):
    return SimpleNamespace(id=7, user_id=1, status=status, result_media_id=9, avatar_media_id=2, cloth_media_id=3)


def test_publish_retry_returns_existing_post_without_writing(monkeypatch):
    route = load_routes(monkeypatch)
    db = Mock()
    db.execute = AsyncMock(side_effect=[result_with(session()), result_with(SimpleNamespace(id=12, garment_id=8))])
    db.commit = AsyncMock()
    result = asyncio.run(route.publish_tryon_session(7, route.PublishTryOnRequest(), SimpleNamespace(id=1), db))
    assert result.feed_item_id == 12
    db.add.assert_not_called()
    assert "FOR UPDATE" in str(db.execute.call_args_list[0].args[0])
    db.commit.assert_awaited_once()


@pytest.mark.parametrize("value,status_code", [(None, 404), (session("queued"), 400)])
def test_publish_requires_completed_session(monkeypatch, value, status_code):
    route = load_routes(monkeypatch)
    db = Mock()
    db.execute = AsyncMock(return_value=result_with(value))
    with pytest.raises(HTTPException) as error:
        asyncio.run(route.publish_tryon_session(7, route.PublishTryOnRequest(), SimpleNamespace(id=1), db))
    assert error.value.status_code == status_code
    db.add.assert_not_called()


def test_publish_commits_garment_and_post_together(monkeypatch):
    route = load_routes(monkeypatch)
    db = Mock()
    db.execute = AsyncMock(side_effect=[result_with(session()), result_with(None)])
    db.commit = AsyncMock()
    added = []

    def add(item):
        item.id = len(added) + 10
        added.append(item)

    db.add.side_effect = add
    db.flush = AsyncMock()
    result = asyncio.run(
        route.publish_tryon_session(
            7, route.PublishTryOnRequest(caption="Мой образ", hashtags=["#лук", "лук"]), SimpleNamespace(id=1), db
        )
    )
    assert result.feed_item_id == 11
    assert added[0].garment_metadata["source_tryon_session_id"] == 7
    assert added[1].caption == "Мой образ #лук"
    db.commit.assert_awaited_once()


def test_invalid_combined_caption_does_not_create_orphan_garment(monkeypatch):
    route = load_routes(monkeypatch)
    db = Mock()
    db.execute = AsyncMock(side_effect=[result_with(session()), result_with(None)])
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            route.publish_tryon_session(
                7, route.PublishTryOnRequest(caption="a" * 2000, hashtags=["tag"]), SimpleNamespace(id=1), db
            )
        )
    assert error.value.status_code == 400
    db.add.assert_not_called()
