"""Menús, módulos y auditoría."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import log_action
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.models import AuditLog, MenuItem, Module, User
from app.core.schemas import AuditOut, MenuOut, MenuUpdate, ModuleOut, ModuleToggle

router = APIRouter(prefix="/sistema", tags=["Sistema"])
MENUS = require_permission("sistema.menus.editar")
MODULOS = require_permission("sistema.modulos.editar")
AUDITORIA = require_permission("sistema.auditoria.ver")


@router.get("/menus", response_model=list[MenuOut])
def list_menus(db: Session = Depends(get_db), _=Depends(MENUS)):
    return db.scalars(select(MenuItem).order_by(MenuItem.group_name, MenuItem.sort_order)).all()


@router.put("/menus/{menu_id}", response_model=MenuOut)
def update_menu(menu_id: int, data: MenuUpdate, db: Session = Depends(get_db), actor: User = Depends(MENUS)):
    item = db.get(MenuItem, menu_id)
    if not item:
        raise HTTPException(404, "Entrada de menú no encontrada.")
    if item.code == "core.inicio" and not data.is_active:
        raise HTTPException(400, "La entrada Inicio no se puede desactivar.")
    for k, v in data.model_dump().items():
        setattr(item, k, v.strip() if isinstance(v, str) else v)
    log_action(db, actor, "update", "menu", item.code, data.model_dump())
    db.commit()
    return item


@router.get("/modulos", response_model=list[ModuleOut])
def list_modules(db: Session = Depends(get_db), _=Depends(MODULOS)):
    return db.scalars(select(Module).order_by(Module.code)).all()


@router.put("/modulos/{code}", response_model=ModuleOut)
def toggle_module(code: str, data: ModuleToggle, db: Session = Depends(get_db), actor: User = Depends(MODULOS)):
    mod = db.get(Module, code)
    if not mod:
        raise HTTPException(404, "Módulo no encontrado.")
    if code == "core":
        raise HTTPException(400, "El núcleo no se puede desactivar.")
    mod.is_active = data.is_active
    log_action(db, actor, "toggle", "module", code, {"is_active": data.is_active})
    db.commit()
    return mod


@router.get("/auditoria", response_model=list[AuditOut])
def list_audit(limit: int = 200, entity: str = "", db: Session = Depends(get_db), _=Depends(AUDITORIA)):
    stmt = select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 1000))
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    return db.scalars(stmt).all()
