import re
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, validator


class UsernameValidationMixin(BaseModel):
    @validator("username", pre=True, check_fields=False)
    def username_alphanumeric(cls, value):
        if value is None:
            raise ValueError("Имя пользователя не может быть пустым")
        if isinstance(value, str):
            value = value.strip()
        if value and not re.match(r"^[a-zA-Z0-9_а-яА-ЯёЁ]+$", value):
            raise ValueError("Username may contain only letters (Latin/Cyrillic), numbers, and underscores")
        return value


class UserBase(UsernameValidationMixin):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50, regex=r"^[a-zA-Z0-9_а-яА-ЯёЁ]+$")


class UserInputRules(BaseModel):
    @validator("username", pre=True, check_fields=False)
    def validate_name(cls, value):
        if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Zа-яА-ЯёЁ]+", value):
            raise ValueError("Только русские и английские буквы, без цифр, пробелов и знаков")
        return value[:1].upper() + value[1:]

    @validator("email", pre=True, check_fields=False)
    def validate_email(cls, value):
        if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9_.@-]+", value):
            raise ValueError("Разрешены только латинские буквы, цифры, дефис, подчёркивание, точка и @")
        if value.count("@") != 1:
            raise ValueError("Адрес должен содержать ровно один символ @")
        if not re.fullmatch(
            r"[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}", value
        ):
            raise ValueError("Укажите адрес в формате name@mail.ru: имя перед @ и домен после него")
        return value


class UserCreate(UserInputRules):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)

    @validator("password")
    def password_strength(cls, value):
        if not re.fullmatch(r"[a-zA-Zа-яА-ЯёЁ0-9]+", value):
            raise ValueError("Только русские и английские буквы и цифры, без пробелов и знаков")
        return value


class UserUpdate(UserInputRules):
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    avatar_url: Optional[str] = None
    status: Optional[str] = Field(None, max_length=60)
