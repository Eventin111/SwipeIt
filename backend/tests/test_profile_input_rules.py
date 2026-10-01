import pytest
from pydantic import ValidationError

from app.application.dto.user_dto import UserBase, UserCreate, UserUpdate
from app.presentation.api.schemas.feed import FeedCommentCreate


@pytest.mark.parametrize("name", ["анна", "ёлена", "alice", "АлисаAlice"])
def test_name_capitalization(name):
    assert UserUpdate(username=name).username == name[0].upper() + name[1:]


@pytest.mark.parametrize("name", ["Анна1", "Anna_", "Ан на", " Anna", "Anna!", "李明明", "Ан", "а" * 51])
def test_invalid_name(name):
    with pytest.raises(ValidationError):
        UserUpdate(username=name)


@pytest.mark.parametrize(
    "email",
    ["тест@mail.ru", "a+b@mail.ru", "a!b@mail.ru", "a@@mail.ru", "a.mail.ru", "a@mail", "a b@mail.ru", "a@ma_il.ru"],
)
def test_invalid_email(email):
    with pytest.raises(ValidationError):
        UserUpdate(email=email)


def test_allowed_email():
    assert UserUpdate(email="name_1.test-2@mail.ru").email == "name_1.test-2@mail.ru"


@pytest.mark.parametrize("password", ["абвЁ12", "123456", "Abc123", "a" * 100])
def test_allowed_password(password):
    assert UserCreate(username="Анна", email="a@mail.ru", password=password).password == password


@pytest.mark.parametrize("password", ["12345", "abc12!", "abc 12", "абв12🙂", "a" * 101])
def test_invalid_password(password):
    with pytest.raises(ValidationError):
        UserCreate(username="Анна", email="a@mail.ru", password=password)


def test_text_boundaries_and_legacy_response():
    assert UserUpdate(status="я" * 60).status == "я" * 60
    assert len(FeedCommentCreate(text="🙂" * 1000).text) == 1000
    for constructor, payload in [(UserUpdate, {"status": "я" * 61}), (FeedCommentCreate, {"text": "я" * 1001})]:
        with pytest.raises(ValidationError):
            constructor(**payload)
    assert UserBase(username="legacy_user1", email="old+tag@mail.ru").username == "legacy_user1"
    assert UserUpdate(avatar_url="photo.jpg").dict(exclude_unset=True) == {"avatar_url": "photo.jpg"}
