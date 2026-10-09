"""Registro de módulos.

Cada carpeta en app/modules/<codigo>/ con un manifest.py que exponga MODULE = ModuleManifest(...)
se carga automáticamente. Si un módulo falla al cargar (error de código, import roto, tabla inválida,
migración fallida), queda marcado con status='error' y la API sigue arrancando con el resto.
"""
import importlib
import logging
import pkgutil
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import Table, select, text
from sqlalchemy.orm import Session

from app.core.database import SCHEMA, Base, engine
from app.core.models import MenuItem, Module, Permission, Role, RolePermission, SchemaMigration

log = logging.getLogger("platform.registry")

ADMIN_ROLE = "Administrador"


@dataclass
class MenuDef:
    code: str
    label: str
    path: str
    permission: str | None = None
    icon: str = "•"
    group: str = "General"
    order: int = 100


@dataclass
class ModuleManifest:
    code: str
    name: str
    version: str = "0.1.0"
    permissions: list[tuple[str, str]] = field(default_factory=list)   # (codigo, descripcion)
    menus: list[MenuDef] = field(default_factory=list)
    router: APIRouter | None = None
    seed: Callable[[Session], None] | None = None   # datos iniciales (se ejecuta en cada arranque: debe ser idempotente)
    # Cambios de estructura sobre tablas EXISTENTES: [(id, [sentencias SQL])]. Usar {schema} para el esquema.
    # Se aplican una sola vez, en orden, y quedan registrados en schema_migrations.
    migrations: list[tuple[str, list[str]]] = field(default_factory=list)


@dataclass
class LoadResult:
    manifest: ModuleManifest | None
    code: str
    error: str | None = None
    tables: list[Table] = field(default_factory=list)


def discover_modules() -> list[LoadResult]:
    """Importa cada módulo de forma aislada y registra qué tablas aporta."""
    import app.modules as modules_pkg

    results: list[LoadResult] = []
    for info in sorted(pkgutil.iter_modules(modules_pkg.__path__), key=lambda i: i.name):
        if not info.ispkg or info.name.startswith("_"):
            continue
        before = set(Base.metadata.tables)
        try:
            mod = importlib.import_module(f"app.modules.{info.name}.manifest")
            manifest: ModuleManifest = getattr(mod, "MODULE")
            new_tables = [Base.metadata.tables[t] for t in set(Base.metadata.tables) - before]
            results.append(LoadResult(manifest=manifest, code=manifest.code, tables=new_tables))
            log.info("Módulo '%s' cargado", manifest.code)
        except Exception:  # noqa: BLE001 - aislamos cualquier falla del módulo
            for t in set(Base.metadata.tables) - before:
                Base.metadata.remove(Base.metadata.tables[t])
            err = traceback.format_exc(limit=6)
            log.error("Módulo '%s' con error, se desactiva:\n%s", info.name, err)
            results.append(LoadResult(manifest=None, code=info.name, error=err))
    return results


def _apply_migrations(r: LoadResult) -> None:
    if not r.manifest or not r.manifest.migrations:
        return
    with engine.connect() as conn:
        done = set(conn.execute(
            select(SchemaMigration.migration_id).where(SchemaMigration.module_code == r.code)).scalars())
    for mid, statements in r.manifest.migrations:
        if mid in done:
            continue
        with engine.begin() as conn:   # cada migración en su transacción
            for st in statements:
                conn.execute(text(st.format(schema=SCHEMA)))
            conn.execute(SchemaMigration.__table__.insert().values(module_code=r.code, migration_id=mid))
        log.info("Migración '%s' aplicada en el módulo '%s'", mid, r.code)


def create_tables(core_tables: list[Table], results: list[LoadResult]) -> None:
    """Crea tablas faltantes y aplica migraciones. Núcleo siempre; cada módulo aislado."""
    Base.metadata.create_all(engine, tables=core_tables)
    for r in results:
        if not r.manifest:
            continue
        try:
            if r.tables:
                Base.metadata.create_all(engine, tables=r.tables)
            _apply_migrations(r)
        except Exception:  # noqa: BLE001
            r.error = traceback.format_exc(limit=4)
            log.error("No se pudo preparar la base del módulo '%s':\n%s", r.code, r.error)


def sync_registry(db: Session, core: ModuleManifest, results: list[LoadResult]) -> None:
    """Sincroniza módulos, permisos y menús con la base.
    - Permisos: se crean los nuevos (el código es la fuente de verdad).
    - Menús: solo se crean los nuevos; los cambios del administrador se respetan.
    - El rol Administrador recibe siempre todos los permisos."""
    now = datetime.now(timezone.utc)
    entries: list[tuple[ModuleManifest | None, str, str | None]] = [(core, core.code, None)]
    entries += [(r.manifest, r.code, r.error) for r in results]
    seen = set()

    for manifest, code, error in entries:
        seen.add(code)
        row = db.get(Module, code)
        if not row:
            row = Module(code=code, name=manifest.name if manifest else code, is_active=True)
            db.add(row)
        if manifest:
            row.name, row.version = manifest.name, manifest.version
        row.status = "error" if error else "ok"
        row.last_error = error
        row.loaded_at = now
        if not manifest:
            continue

        existing = {p.code: p for p in db.scalars(select(Permission).where(Permission.module_code == code))}
        for pcode, desc in manifest.permissions:
            if pcode in existing:
                existing[pcode].description = desc
            else:
                db.add(Permission(code=pcode, description=desc, module_code=code))

        menu_codes = set(db.scalars(select(MenuItem.code).where(MenuItem.module_code == code)))
        for m in manifest.menus:
            if m.code not in menu_codes:
                db.add(MenuItem(code=m.code, module_code=code, label=m.label, path=m.path, icon=m.icon,
                                group_name=m.group, permission_code=m.permission, sort_order=m.order))

    for row in db.scalars(select(Module)):
        if row.code not in seen:
            row.status, row.last_error = "missing", "La carpeta del módulo ya no existe."
    db.flush()

    admin = db.scalar(select(Role).where(Role.name == ADMIN_ROLE))
    if not admin:
        admin = Role(name=ADMIN_ROLE, description="Acceso total. Rol de sistema.", is_system=True)
        db.add(admin)
        db.flush()
    granted = set(db.scalars(select(RolePermission.permission_id).where(RolePermission.role_id == admin.id)))
    for pid in db.scalars(select(Permission.id)):
        if pid not in granted:
            db.add(RolePermission(role_id=admin.id, permission_id=pid))
    db.commit()

    for manifest, code, error in entries:
        if manifest and manifest.seed and not error:
            try:
                manifest.seed(db)
                db.commit()
            except Exception:  # noqa: BLE001
                db.rollback()
                log.error("Falló la carga inicial del módulo '%s':\n%s", code, traceback.format_exc(limit=4))
