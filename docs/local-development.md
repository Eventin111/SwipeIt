# Локальная разработка на этом Mac без ML

Сервисы: React на localhost:3000, FastAPI на localhost:8000, PostgreSQL и Redis в Docker.
Веса и ML-worker не нужны. Фото хранятся в backend/local_media, данные БД — в Docker-томах.

На текущем компьютере уже подготовлены:

- `.env` с локальными паролями и `TRYON_ENABLED=false`;
- `frontend/.env.local` с `REACT_APP_TRYON_ENABLED=false` и `REACT_APP_USE_MOCK_DATA=false`;
- `backend/.venv` с зависимостями backend без группы `ml`;
- `.tools/node` с Node.js 20 и npm.

Эти файлы и каталоги не отправляются в Git. Модель не имитируется: примерка явно отключена.

## Запуск

В корне проекта:

```bash
cd /Users/egor/Desktop/SwipeIt
open -a Docker
# Дождаться запуска Docker Desktop, затем:
docker compose -p swipeit-local -f docker-compose.yml -f docker-compose.local.yml up -d postgres redis
AWS_MAX_ATTEMPTS=1 backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Во втором терминале:

```bash
cd /Users/egor/Desktop/SwipeIt
export PATH="$PWD/.tools/node/bin:$PATH"
cd frontend
HOST=127.0.0.1 PORT=3000 BROWSER=none npm start
```

Открыть http://localhost:3000. API-документация: http://localhost:8000/docs.
Демо-вход, автоматически создаваемый локальным backend: `test@mail.ru` / `123123`.

## Остановка

`Ctrl+C` в обоих терминалах, затем из корня проекта:

```bash
docker compose -p swipeit-local -f docker-compose.yml -f docker-compose.local.yml stop postgres redis
```

Тома не удалять: в них сохранены пользователи и остальные данные.

## Восстановление окружения после нового клонирования

Понадобятся Python 3.10, Node.js 20, Docker Desktop и uv.
Скопировать `.env.example` в `.env`, задать отдельные локальные секреты, `TRYON_ENABLED=false`.
В `frontend/.env.local` задать:

```env
REACT_APP_API_BASE_URL=http://localhost:8000
REACT_APP_TRYON_ENABLED=false
REACT_APP_USE_MOCK_DATA=false
```

Установить только backend и frontend:

```bash
uv sync --project backend --frozen --no-dev
cd frontend
npm ci
```

`docker-compose.local.yml` настроен для Apple Silicon (linux/arm64).
MinIO не запускается: используется существующий механизм локального хранения файлов.
Первое обращение к отсутствующему S3 завершается переходом на локальное хранилище;
`AWS_MAX_ATTEMPTS=1` сокращает ожидание этой проверки.
