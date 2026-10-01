"""
Use Case для виртуальной примерки одежды.
Содержит бизнес-логику, отделенную от API и инфраструктуры.
"""

import base64
import io
import math

from PIL import Image

from app.application.dto.tryon_dto import TryOnRequest, TryOnResponse
from app.application.ports.tryon_gateway import TryOnGateway


class TryOnUseCase:
    """
    Use Case для виртуальной примерки одежды.

    Отвечает за:
    - Валидацию входных данных
    - Координацию вызовов ML сервиса
    - Формирование ответа
    """

    def __init__(self, ml_service: TryOnGateway):
        """
        Конструктор с внедрением зависимости.

        Args:
            ml_service: Инстанс ML сервиса (Infrastructure)
        """
        self._ml_service = ml_service

    def validate(self, request: TryOnRequest) -> None:
        """
        Валидация входных данных.
        Выбрасывает ValueError при невалидных данных.
        """
        # Валидация model_type
        valid_model_types = ("hd", "dc")
        if request.model_type not in valid_model_types:
            raise ValueError(f"model_type должен быть одним из {valid_model_types}, " f"получено: {request.model_type}")

        # Валидация category
        valid_categories = (0, 1, 2)
        if request.category not in valid_categories:
            raise ValueError(f"category должен быть одним из {valid_categories}, " f"получено: {request.category}")

        # Валидация для half-body модели
        if request.model_type == "hd" and request.category != 0:
            raise ValueError("model_type 'hd' (half-body) требует category=0 (upperbody)")

        # Валидация числовых параметров
        if not math.isfinite(request.scale) or request.scale <= 0 or request.scale > 5:
            raise ValueError("scale должен быть в диапазоне (0, 5]")

        if request.num_steps < 1 or request.num_steps > 100:
            raise ValueError("num_steps должен быть в диапазоне [1, 100]")

        if request.num_samples < 1 or request.num_samples > 10:
            raise ValueError("num_samples должен быть в диапазоне [1, 10]")

    def validate_payload(
        self,
        *,
        model_type: str,
        category: int,
        scale: float,
        num_steps: int,
        num_samples: int,
    ) -> None:
        self.validate(
            TryOnRequest(
                model_image=Image.new("RGB", (1, 1), "white"),
                cloth_image=Image.new("RGB", (1, 1), "white"),
                model_type=model_type,
                category=category,
                scale=scale,
                num_steps=num_steps,
                num_samples=num_samples,
                seed=-1,
            )
        )

    def _prepare_image(self, img: Image.Image) -> Image.Image:
        """
        Подготовка изображения к обработке.

        Args:
            img: Исходное изображение

        Returns:
            Подготовленное изображение в формате RGB
        """
        if img.mode != "RGB":
            return img.convert("RGB")
        return img

    def _encode_image_to_base64(self, img: Image.Image) -> str:
        """
        Кодирование изображения в base64 строку.

        Args:
            img: Изображение для кодирования

        Returns:
            Base64 строка с data URI префиксом
        """
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        return f"data:image/png;base64,{img_str}"

    def execute(self, request: TryOnRequest) -> TryOnResponse:
        """
        Выполнение Use Case.

        Args:
            request: DTO запроса на примерку

        Returns:
            DTO ответа с результатами
        """
        # 1. Валидация
        self.validate(request)

        # 2. Подготовка изображений
        model_img = self._prepare_image(request.model_image)
        cloth_img = self._prepare_image(request.cloth_image)

        # 3. Вызов ML сервиса
        results = self._ml_service.try_on(
            model_image=model_img,
            cloth_image=cloth_img,
            model_type=request.model_type,
            category=request.category,
            scale=request.scale,
            num_steps=request.num_steps,
            num_samples=request.num_samples,
            seed=request.seed,
        )

        # 4. Кодирование результатов
        result_urls = [self._encode_image_to_base64(img) for img in results]

        return TryOnResponse(
            success=True,
            results=result_urls,
            count=len(result_urls),
        )
