import hashlib
import uuid
import json
import redis
from app.core.config import settings

redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash

def issue_token(username: str, role: str) -> str:
    token = str(uuid.uuid4())
    redis_client.setex(f"token:{token}", 86400, json.dumps({"username": username, "role": role}, ensure_ascii=False))
    return token

def get_token_payload(token: str):
    value = redis_client.get(f"token:{token}")
    if not value:
        return None
    return json.loads(value)
