"""ABM de usuarios. Solo datos del usuario: los roles se asignan en /seguridad/accesos."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import log_action
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.models import User
from app.core.schemas import PasswordIn, UserCreate, UserOut, UserUpdate
from app.core.security import hash_password, validate_password_strength

router = APIRouter(prefix="/seguridad/usuarios", tags=["Seguridad · Usuarios"])
VER = require_permission("seguridad.usuarios.ver", "seguridad.usuarios.editar", "seguridad.accesos.ver")
EDITAR = require_permission("seguridad.usuarios.editar")


def _check_password(p: str) -> None:
    try:
        validate_password_strength(p)
    except ValueError as e:
        raise HTTPException(400, str(e))


def _email_taken(db: Session, email: str, exclude_id: int | None = None) -> bool:
    q = select(func.count()).select_from(User).where(User.email == email)
    if exclude_id:
        q = q.where(User.id != exclude_id)
    return db.scalar(q) > 0


@router.get("", response_model=list[UserOut])
def list_users(q: str = "", db: Session = Depends(get_db), _=Depends(VER)):
    stmt = select(User).order_by(User.name)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.name).like(like), User.email.like(like)))
    return db.scalars(stmt).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    _check_password(data.password)
    if _email_taken(db, data.email):
        raise HTTPException(409, "Ya existe un usuario con ese correo.")
    user = User(name=data.name.strip(), email=data.email, password_hash=hash_password(data.password),
                is_active=data.is_active)
    db.add(user)
    db.flush()
    log_action(db, actor, "create", "user", user.id, {"email": user.email})
    db.commit()
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    user = db.get(User, user_id) or _404()
    if _email_taken(db, data.email, user_id):
        raise HTTPException(409, "Ya existe un usuario con ese correo.")
    if user.id == actor.id and not data.is_active:
        raise HTTPException(400, "No podés desactivar tu propio usuario.")
    user.name, user.email, user.is_active = data.name.strip(), data.email, data.is_active
    log_action(db, actor, "update", "user", user.id, data.model_dump())
    db.commit()
    return user


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, data: PasswordIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    user = db.get(User, user_id) or _404()
    _check_password(data.password)
    user.password_hash = hash_password(data.password)
    log_action(db, actor, "reset_password", "user", user.id)
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    user = db.get(User, user_id) or _404()
    if user.id == actor.id:
        raise HTTPException(400, "No podés eliminar tu propio usuario.")
    log_action(db, actor, "delete", "user", user.id, {"email": user.email})
    db.delete(user)
    db.commit()


def _404():
    raise HTTPException(404, "Usuario no encontrado.")
