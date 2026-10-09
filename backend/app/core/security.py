from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> int | None:
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        return int(data["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ValueError("La contraseña debe tener al menos 8 caracteres.")
