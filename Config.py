import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from pydantic import AnyUrl, BaseSettings


ROOT_DIR = Path(__file__).resolve().parent
ENV_FILE = ROOT_DIR / ".env"


class BackendSettings(BaseSettings):
    API_V1: str = "/api/v1"
    SECRET_KEY: str
    DB_URL: AnyUrl

    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_BUCKET_NAME: str = "swipeit-media"
    S3_REGION: str = "us-east-1"
    S3_SECURE: bool = False
    S3_PUBLIC_URL: Optional[str] = None

    REDIS_URL: str = "redis://localhost:6379/0"
    TRYON_CACHE_TTL_SECONDS: int = 86400
    TRYON_QUEUE_NAME: str = "tryon:queue"
    TRYON_DEAD_LETTER_QUEUE_NAME: str = "tryon:dead-letter"
    TRYON_QUEUE_BLOCK_TIMEOUT_SECONDS: int = 5
    TRYON_QUEUE_MAX_RETRIES: int = 2
    TRYON_PROCESSING_LOCK_TTL_SECONDS: int = 900
    TRYON_TASK_SNAPSHOT_TTL_SECONDS: int = 86400
    TRYON_STALE_PROCESSING_THRESHOLD_SECONDS: int = 1800
    TRYON_RECOVERY_INTERVAL_SECONDS: int = 300
    TRYON_RATE_LIMIT_REQUESTS: int = 5
    TRYON_RATE_LIMIT_WINDOW_SECONDS: int = 60
    TRYON_RETENTION_DAYS: int = 7
    TRYON_CLEANUP_INTERVAL_SECONDS: int = 3600
    TRYON_CLEANUP_BATCH_SIZE: int = 50
    TRYON_DEAD_LETTER_MAX_ITEMS: int = 100
    TRYON_REQUIRE_CUDA: bool = False
    TRYON_WORKER_HEARTBEAT_KEY: str = "tryon:worker:heartbeat"
    TRYON_WORKER_HEARTBEAT_TTL_SECONDS: int = 30
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
    CORS_ORIGIN_REGEX: str = r"^https?://[A-Za-z0-9.-]+(:\d+)?$"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    DB_ASYNC_URL: AnyUrl | None = None

    @property
    def async_database_url(self) -> str:
        if self.DB_ASYNC_URL:
            return str(self.DB_ASYNC_URL)
        return str(self.DB_URL).replace("postgresql://", "postgresql+asyncpg://")

    @property
    def s3_public_url(self) -> str:
        return self.S3_PUBLIC_URL or self.S3_ENDPOINT

    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"


@dataclass(frozen=True)
class FrontendSettings:
    app_name: str
    api_base_url: str
    use_mock_data: bool
    mock_delay_ms: int
    auth_init_delay_ms: int


@dataclass(frozen=True)
class MLSettings:
    root_dir: Path
    package_dir: Path
    third_party_dir: Path
    checkpoints_dir: Path
    examples_dir: Path
    outputs_dir: Path
    unit_tests_dir: Path
    integration_tests_dir: Path
    device: str


@dataclass(frozen=True)
class ProjectConfig:
    root_dir: Path
    env_file: Path
    backend: BackendSettings
    frontend: FrontendSettings
    ml: MLSettings


def _to_bool(value: Optional[str], fallback: bool) -> bool:
    if value is None:
        return fallback
    return str(value).lower() == "true"


def _to_int(value: Optional[str], fallback: int) -> int:
    try:
        return int(value) if value is not None else fallback
    except (TypeError, ValueError):
        return fallback


def load_backend_settings() -> BackendSettings:
    return BackendSettings()


def load_frontend_settings() -> FrontendSettings:
    return FrontendSettings(
        app_name=os.getenv("REACT_APP_NAME", "Swipelt"),
        api_base_url=os.getenv("REACT_APP_API_BASE_URL", "http://localhost:8000"),
        use_mock_data=_to_bool(os.getenv("REACT_APP_USE_MOCK_DATA"), False),
        mock_delay_ms=_to_int(os.getenv("REACT_APP_MOCK_DELAY_MS"), 200),
        auth_init_delay_ms=_to_int(os.getenv("REACT_APP_AUTH_INIT_DELAY_MS"), 300),
    )


def load_ml_settings() -> MLSettings:
    ml_root = ROOT_DIR / "ml"
    tests_root = ml_root / "tests"
    return MLSettings(
        root_dir=ml_root,
        package_dir=ml_root / "swipeit_ml",
        third_party_dir=ml_root / "third_party",
        checkpoints_dir=ml_root / "checkpoints",
        examples_dir=ml_root / "examples",
        outputs_dir=ml_root / "images_output",
        unit_tests_dir=tests_root / "unit",
        integration_tests_dir=tests_root / "integration",
        device=os.getenv("ML_DEVICE", "cuda"),
    )


def load_project_config() -> ProjectConfig:
    return ProjectConfig(
        root_dir=ROOT_DIR,
        env_file=ENV_FILE,
        backend=load_backend_settings(),
        frontend=load_frontend_settings(),
        ml=load_ml_settings(),
    )


settings = load_project_config()
