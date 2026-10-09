"""Permisos (solo lectura), matriz rol × permiso y asignación de roles a usuarios."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.audit import log_action
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.models import Permission, Role, RolePermission, User, UserRole
from app.core.schemas import IdsIn, PermissionOut, RoleOut

router = APIRouter(prefix="/seguridad", tags=["Seguridad · Accesos"])
VER_PERMISOS = require_permission("seguridad.permisos.ver", "seguridad.accesos.ver")
VER = require_permission("seguridad.accesos.ver", "seguridad.accesos.editar")
EDITAR = require_permission("seguridad.accesos.editar")


@router.get("/permisos", response_model=list[PermissionOut])
def list_permissions(db: Session = Depends(get_db), _=Depends(VER_PERMISOS)):
    return db.scalars(select(Permission).order_by(Permission.module_code, Permission.code)).all()


@router.get("/matriz")
def get_matrix(db: Session = Depends(get_db), _=Depends(VER)):
    roles = db.scalars(select(Role).order_by(Role.is_system.desc(), Role.name)).all()
    perms = db.scalars(select(Permission).order_by(Permission.module_code, Permission.code)).all()
    grants: dict[int, list[int]] = {r.id: [] for r in roles}
    for rp in db.scalars(select(RolePermission)):
        grants.setdefault(rp.role_id, []).append(rp.permission_id)
    return {
        "roles": [RoleOut.model_validate(r) for r in roles],
        "permissions": [PermissionOut.model_validate(p) for p in perms],
        "grants": grants,
    }


@router.put("/matriz/{role_id}")
def set_role_permissions(role_id: int, data: IdsIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Rol no encontrado.")
    if role.is_system:
        raise HTTPException(400, "El rol Administrador tiene siempre todos los permisos.")
    valid = set(db.scalars(select(Permission.id).where(Permission.id.in_(data.ids))))
    db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
    db.add_all(RolePermission(role_id=role_id, permission_id=pid) for pid in valid)
    log_action(db, actor, "set_permissions", "role", role_id, {"permission_ids": sorted(valid)})
    db.commit()
    return {"ok": True, "count": len(valid)}


@router.get("/usuarios/{user_id}/roles")
def get_user_roles(user_id: int, db: Session = Depends(get_db), _=Depends(VER)):
    if not db.get(User, user_id):
        raise HTTPException(404, "Usuario no encontrado.")
    return {"role_ids": list(db.scalars(select(UserRole.role_id).where(UserRole.user_id == user_id)))}


@router.put("/usuarios/{user_id}/roles")
def set_user_roles(user_id: int, data: IdsIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado.")
    valid = set(db.scalars(select(Role.id).where(Role.id.in_(data.ids))))

    # Protección: que siempre quede al menos un Administrador activo
    admin_id = db.scalar(select(Role.id).where(Role.is_system))
    if admin_id and admin_id not in valid:
        others = db.scalar(
            select(func.count()).select_from(UserRole).join(User, User.id == UserRole.user_id)
            .where(UserRole.role_id == admin_id, UserRole.user_id != user_id, User.is_active)
        )
        had = db.scalar(select(func.count()).select_from(UserRole)
                        .where(UserRole.role_id == admin_id, UserRole.user_id == user_id))
        if had and not others:
            raise HTTPException(400, "Debe quedar al menos un usuario activo con el rol Administrador.")

    db.execute(delete(UserRole).where(UserRole.user_id == user_id))
    db.add_all(UserRole(user_id=user_id, role_id=rid) for rid in valid)
    log_action(db, actor, "set_roles", "user", user_id, {"role_ids": sorted(valid)})
    db.commit()
    return {"ok": True}
