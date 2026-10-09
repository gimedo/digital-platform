"""ABM de roles. Solo datos del rol: los permisos se asignan en la matriz de accesos."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import log_action
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.models import Role, User, UserRole
from app.core.schemas import RoleIn, RoleOut

router = APIRouter(prefix="/seguridad/roles", tags=["Seguridad · Roles"])
VER = require_permission("seguridad.roles.ver", "seguridad.roles.editar", "seguridad.accesos.ver")
EDITAR = require_permission("seguridad.roles.editar")


@router.get("", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db), _=Depends(VER)):
    return db.scalars(select(Role).order_by(Role.is_system.desc(), Role.name)).all()


@router.post("", response_model=RoleOut, status_code=201)
def create_role(data: RoleIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "El nombre es obligatorio.")
    if db.scalar(select(func.count()).select_from(Role).where(func.lower(Role.name) == name.lower())):
        raise HTTPException(409, "Ya existe un rol con ese nombre.")
    role = Role(name=name, description=data.description.strip())
    db.add(role)
    db.flush()
    log_action(db, actor, "create", "role", role.id, {"name": name})
    db.commit()
    return role


@router.put("/{role_id}", response_model=RoleOut)
def update_role(role_id: int, data: RoleIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Rol no encontrado.")
    if role.is_system and data.name.strip() != role.name:
        raise HTTPException(400, "El nombre de un rol de sistema no se puede cambiar.")
    role.name, role.description = data.name.strip(), data.description.strip()
    log_action(db, actor, "update", "role", role.id, data.model_dump())
    db.commit()
    return role


@router.delete("/{role_id}", status_code=204)
def delete_role(role_id: int, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Rol no encontrado.")
    if role.is_system:
        raise HTTPException(400, "Un rol de sistema no se puede eliminar.")
    users = db.scalar(select(func.count()).select_from(UserRole).where(UserRole.role_id == role_id))
    if users:
        raise HTTPException(409, f"El rol está asignado a {users} usuario(s). Quitáselo antes de eliminarlo.")
    log_action(db, actor, "delete", "role", role.id, {"name": role.name})
    db.delete(role)
    db.commit()
