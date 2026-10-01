"""Coalesce identical submissions across API workers for a short retry window."""

import json
import uuid

from fastapi import HTTPException

from app.infrastructure.queue.redis_client import get_redis_client


async def submit_once(key, operation):
    redis = get_redis_client()
    result_key = f"tryon:submission:result:{key}"
    lock_key = f"tryon:submission:lock:{key}"
    cached = await redis.get(result_key)
    if cached:
        return json.loads(cached)
    owner = str(uuid.uuid4())
    if not await redis.set(lock_key, owner, nx=True, ex=180):
        raise HTTPException(409, "Эта примерка уже отправляется. Подождите и проверьте недавние примерки в профиле.")
    try:
        cached = await redis.get(result_key)
        if cached:
            return json.loads(cached)
        result = await operation()
        await redis.set(result_key, json.dumps(result), ex=60)
        return result
    finally:
        await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            lock_key,
            owner,
        )
