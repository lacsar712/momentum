import json
import redis
from datetime import date, datetime
from app.core.config import settings

redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)

class DateEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles date and datetime objects"""
    def default(self, obj):
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return super().default(obj)

def cache_get(key: str):
    value = redis_client.get(key)
    if value is None:
        return None
    return json.loads(value)

def cache_set(key: str, payload, ttl: int = 300):
    redis_client.setex(key, ttl, json.dumps(payload, ensure_ascii=False, cls=DateEncoder))

