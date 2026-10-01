"""
ML Infrastructure - интеграция с OOTDiffusion.
"""

import sys
from pathlib import Path
from typing import Optional

from PIL import Image

# Добавляем путь к ML коду
# Путь: backend/app/infrastructure/ml/ootd_service.py -> корень проекта
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent.parent  # -> D:\Projects\SwipeIt
ML_ROOT = PROJECT_ROOT / "ml"  # -> D:\Projects\SwipeIt\ml

if str(ML_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_ROOT))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from run.ootd_app.adapters import DiffusionAdapter, OpenPoseAdapter, ParsingAdapter
from run.ootd_app.entities import InferenceRequest
from run.ootd_app.usecases import RunOOTDInference


class OOTDService:
    """
    Сервис для виртуальной примерки одежды.
    Infrastructure слой - реализация взаимодействия с ML моделью.
    """

    def __init__(self, gpu_id: int = 0):
        self.gpu_id = gpu_id
        self._openpose = None
        self._parsing = None
        self._diffusion = None
        self._runner = None

    def _ensure_initialized(self):
        """Ленивая инициализация компонентов модели."""
        if self._runner is None:
            self._openpose = OpenPoseAdapter(self.gpu_id)
            self._parsing = ParsingAdapter(self.gpu_id)
            self._diffusion = DiffusionAdapter(self.gpu_id, "hd")
            self._runner = RunOOTDInference(self._openpose, self._parsing, self._diffusion)

    def try_on(
        self,
        model_image: Image.Image,
        cloth_image: Image.Image,
        model_type: str = "hd",
        category: int = 0,
        scale: float = 2.0,
        num_steps: int = 20,
        num_samples: int = 1,
        seed: int = -1,
    ) -> list[Image.Image]:
        """
        Запуск виртуальной примерки.

        Args:
            model_image: PIL Image с фото человека
            cloth_image: PIL Image с фото одежды
            model_type: "hd" (half-body) или "dc" (full-body)
            category: 0=upperbody, 1=lowerbody, 2=dress
            scale: масштаб изображения
            num_steps: количество шагов инференса
            num_samples: количество сэмплов
            seed: seed для воспроизводимости

        Returns:
            Список сгенерированных изображений
        """
        self._ensure_initialized()

        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = Path(tmpdir) / "model.jpg"
            cloth_path = Path(tmpdir) / "cloth.jpg"

            model_image.save(model_path)
            cloth_image.save(cloth_path)

            category_dict = ["upperbody", "lowerbody", "dress"]

            if model_type == "hd" and category != 0:
                raise ValueError("model_type 'hd' requires category == 0")

            request = InferenceRequest(
                gpu_id=self.gpu_id,
                model_type=model_type,
                category=category_dict[category],
                cloth_path=str(cloth_path),
                model_path=str(model_path),
                image_scale=scale,
                num_steps=num_steps,
                num_samples=num_samples,
                seed=seed,
            )

            result = self._runner.execute(request)
            return result.outputs

    def health_check(self) -> dict:
        """Проверка готовности сервиса."""
        try:
            import torch

            cuda_available = torch.cuda.is_available()
            gpu_name = torch.cuda.get_device_name(self.gpu_id) if cuda_available else None
        except Exception:
            cuda_available = False
            gpu_name = None

        return {
            "status": "ready",
            "model": "OOTDiffusion",
            "gpu_id": self.gpu_id,
            "cuda_available": cuda_available,
            "gpu_name": gpu_name,
        }


# Singleton экземпляр
_service: Optional[OOTDService] = None


def get_ootd_service() -> OOTDService:
    """Получение экземпляра ML сервиса (Dependency Injection)."""
    global _service
    if _service is None:
        _service = OOTDService()
    return _service
