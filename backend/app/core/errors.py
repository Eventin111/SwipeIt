import logging
import traceback

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Обработчик ошибок валидации Pydantic"""
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error["loc"])
        errors.append({"field": field, "message": error["msg"], "type": error["type"]})

    logger.warning(f"Ошибка валидации: {errors}")

    labels = {
        "email": "Почта",
        "username": "Имя пользователя",
        "password": "Пароль",
        "caption": "Подпись",
        "text": "Комментарий",
        "status": "Статус",
        "hashtags": "Хештеги",
    }
    messages = []
    for error in exc.errors():
        field = str(error["loc"][-1])
        label = labels.get(field, "Поле " + field)
        kind = error["type"]
        limit = error.get("ctx", {}).get("limit_value")
        if kind == "value_error.missing":
            message = "заполните обязательное поле"
        elif kind == "value_error.any_str.min_length":
            message = f"минимум {limit} символов"
        elif kind == "value_error.any_str.max_length":
            message = f"максимум {limit} символов"
        elif field == "email":
            message = "введите корректный адрес электронной почты"
        elif field == "username":
            message = "используйте от 3 до 50 букв, цифр или подчёркиваний"
        elif field == "password":
            message = "минимум 6 символов без пробелов по краям, не только цифры; максимум 100 символов"
        else:
            message = "проверьте значение и допустимую длину"
        messages.append(f"{label}: {message}.")
    return JSONResponse(status_code=422, content={"detail": " ".join(messages), "errors": errors})


async def http_exception_handler(request: Request, exc: HTTPException):
    """Обработчик HTTP исключений"""
    logger.warning(f"HTTP ошибка {exc.status_code}: {exc.detail}")
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


async def global_exception_handler(request: Request, exc: Exception):
    """Глобальный обработчик исключений"""
    logger.error(f"Необработанное исключение: {str(exc)}\n{traceback.format_exc()}")
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})


def setup_exception_handlers(app: FastAPI):
    """Настройка обработчиков исключений"""
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, global_exception_handler)
