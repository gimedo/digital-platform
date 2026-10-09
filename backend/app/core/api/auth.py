from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import log_action
from app.core.database import get_db
from app.core.deps import get_current_user, user_permissions
from app.core.models import MenuItem, Module, Role, User, UserRole
from app.core.schemas import ChangePasswordIn, LoginIn, UserOut
from app.core.security import create_access_token, hash_password, validate_password_strength, verify_password

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Correo o contraseña incorrectos.")
    if not user.is_active:
        raise HTTPException(403, "El usuario está desactivado.")
    user.last_login_at = datetime.now(timezone.utc)
    log_action(db, user, "login", "auth")
    db.commit()
    return {"access_token": create_access_token(user.id), "token_type": "bearer"}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    roles = db.scalars(select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user.id))
    return {
        "user": UserOut.model_validate(user),
        "roles": sorted(roles),
        "permissions": sorted(user_permissions(db, user.id)),
    }


@router.get("/menu")
def my_menu(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Menú del usuario: solo entradas activas, de módulos operativos y con permiso."""
    perms = user_permissions(db, user.id)
    rows = db.scalars(
        select(MenuItem)
        .join(Module, Module.code == MenuItem.module_code)
        .where(MenuItem.is_active, Module.is_active, Module.status == "ok")
        .order_by(MenuItem.sort_order, MenuItem.label)
    )
    groups: dict[str, list[dict]] = {}
    for m in rows:
        if m.permission_code and m.permission_code not in perms:
            continue
        groups.setdefault(m.group_name, []).append(
            {"code": m.code, "label": m.label, "path": m.path, "icon": m.icon, "module": m.module_code}
        )
    # Orden de grupos: por el menor sort_order de sus items, "General" primero
    order = ["General"] + sorted(g for g in groups if g != "General")
    return [{"group": g, "items": groups[g]} for g in order if g in groups]


@router.post("/change-password")
def change_password(data: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "La contraseña actual no es correcta.")
    try:
        validate_password_strength(data.new_password)
    except ValueError as e:
        raise HTTPException(400, str(e))
    user.password_hash = hash_password(data.new_password)
    log_action(db, user, "change_password", "user", user.id)
    db.commit()
    return {"ok": True}
