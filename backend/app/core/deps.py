from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.models import Module, Permission, RolePermission, User, UserRole
from app.core.security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    user_id = decode_access_token(cred.credentials) if cred else None
    user = db.get(User, user_id) if user_id else None
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o vencida.")
    return user


def user_permissions(db: Session, user_id: int) -> set[str]:
    rows = db.execute(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(UserRole.user_id == user_id)
    ).scalars()
    return set(rows)


def require_permission(*codes: str):
    """Dependencia: exige al menos uno de los permisos indicados."""
    def dependency(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        perms = user_permissions(db, user.id)
        if not perms.intersection(codes):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tenés permiso para esta acción.")
        request.state.user = user
        return user
    return dependency


def module_guard(module_code: str):
    """Corta las rutas de un módulo si el administrador lo desactivó (sin reiniciar la API)."""
    def dependency(db: Session = Depends(get_db)) -> None:
        mod = db.get(Module, module_code)
        if not mod or not mod.is_active or mod.status != "ok":
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"El módulo '{module_code}' está deshabilitado.")
    return dependency
