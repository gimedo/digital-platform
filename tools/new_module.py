"""Genera el esqueleto de un módulo nuevo (backend + frontend) listo para usar.

Uso (desde la raíz del proyecto):
    python tools/new_module.py inventario "Inventario de equipos"

Crea:
  backend/app/modules/<codigo>/  manifest.py, models.py, router.py  (ABM de ejemplo: tabla <codigo>_items)
  frontend/src/modules/<codigo>/ manifest.ts, ItemsPage.tsx
y registra el módulo en frontend/src/modules/index.ts.
Después: reiniciar la API (crea tablas, permisos y menú) y asignar los permisos en la Matriz de accesos.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    code, name = sys.argv[1].strip().lower(), sys.argv[2].strip()
    if not re.fullmatch(r"[a-z][a-z0-9_]{1,30}", code):
        print("El código debe ser minúsculas, números o _, empezando con letra (ej.: inventario).")
        return 1
    be = ROOT / "backend" / "app" / "modules" / code
    fe = ROOT / "frontend" / "src" / "modules" / code
    if be.exists() or fe.exists():
        print(f"El módulo '{code}' ya existe.")
        return 1
    cls = "".join(p.capitalize() for p in code.split("_")) + "Item"
    be.mkdir(parents=True)
    fe.mkdir(parents=True)

    (be / "__init__.py").write_text("", encoding="utf-8")
    (be / "models.py").write_text(f'''from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class {cls}(Base):
    __tablename__ = "{code}_items"   # prefijo del módulo en todas sus tablas
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(String(500), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
''', encoding="utf-8")
    (be / "router.py").write_text(f'''from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import log_action
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.models import User
from app.modules.{code}.models import {cls}

router = APIRouter(tags=["{name}"])
VER = require_permission("{code}.ver", "{code}.editar")
EDITAR = require_permission("{code}.editar")


class ItemIn(BaseModel):
    name: str
    description: str = ""
    is_active: bool = True


class ItemOut(ItemIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


@router.get("/items", response_model=list[ItemOut])
def list_items(db: Session = Depends(get_db), _=Depends(VER)):
    return db.scalars(select({cls}).order_by({cls}.name)).all()


@router.post("/items", response_model=ItemOut, status_code=201)
def create_item(data: ItemIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    item = {cls}(**data.model_dump())
    db.add(item)
    db.flush()
    log_action(db, actor, "create", "{code}.item", item.id, {{"name": item.name}})
    db.commit()
    return item


@router.put("/items/{{item_id}}", response_model=ItemOut)
def update_item(item_id: int, data: ItemIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    item = db.get({cls}, item_id)
    if not item:
        raise HTTPException(404, "Registro no encontrado.")
    for k, v in data.model_dump().items():
        setattr(item, k, v)
    log_action(db, actor, "update", "{code}.item", item.id)
    db.commit()
    return item


@router.delete("/items/{{item_id}}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    item = db.get({cls}, item_id)
    if not item:
        raise HTTPException(404, "Registro no encontrado.")
    log_action(db, actor, "delete", "{code}.item", item.id)
    db.delete(item)
    db.commit()
''', encoding="utf-8")
    (be / "manifest.py").write_text(f'''from app.core.registry import MenuDef, ModuleManifest
from app.modules.{code} import models  # noqa: F401
from app.modules.{code}.router import router

MODULE = ModuleManifest(
    code="{code}",
    name="{name}",
    version="0.1.0",
    permissions=[
        ("{code}.ver", "Ver {name}"),
        ("{code}.editar", "Crear y modificar {name}"),
    ],
    menus=[
        MenuDef("{code}.items", "{name}", "/{code}", "{code}.ver", "◆", "{name}", 10),
    ],
    router=router,
)
''', encoding="utf-8")

    (fe / "manifest.ts").write_text(f'''import type {{ ModuleDef }} from '../../core/types';

const mod: ModuleDef = {{
  code: '{code}',
  name: '{name}',
  pages: [
    {{ path: '/{code}', title: '{name}', permission: ['{code}.ver', '{code}.editar'], load: () => import('./ItemsPage') }},
  ],
}};

export default mod;
''', encoding="utf-8")
    (fe / "ItemsPage.tsx").write_text(f'''import {{ CrudPage }} from '../../shared/CrudPage';
import {{ Badge }} from '../../shared/ui';

type Item = {{ id: number; name: string; description: string; is_active: boolean }};

export default function ItemsPage() {{
  return (
    <CrudPage<Item>
      title="{name}"
      endpoint="/m/{code}/items"
      entityLabel="registro"
      editPermission="{code}.editar"
      searchKeys={{['name', 'description']}}
      columns={{[
        {{ key: 'name', label: 'Nombre' }},
        {{ key: 'description', label: 'Descripción' }},
        {{ key: 'is_active', label: 'Estado', render: (r) => r.is_active ? <Badge kind="ok">Activo</Badge> : <Badge kind="off">Inactivo</Badge> }},
      ]}}
      fields={{[
        {{ name: 'name', label: 'Nombre', required: true, full: true }},
        {{ name: 'description', label: 'Descripción', type: 'textarea', full: true }},
        {{ name: 'is_active', label: 'Activo', type: 'checkbox', full: true }},
      ]}}
      emptyValues={{{{ name: '', description: '', is_active: true }}}}
    />
  );
}}
''', encoding="utf-8")

    idx = ROOT / "frontend" / "src" / "modules" / "index.ts"
    txt = idx.read_text(encoding="utf-8")
    var = re.sub(r"_(\w)", lambda m: m.group(1).upper(), code)
    imp = f"import {var} from './{code}/manifest';\n"
    txt = txt.replace("\nexport const modules", f"{imp}\nexport const modules", 1) if imp not in txt else txt
    txt = re.sub(r"(export const modules: ModuleDef\[\] = \[\n)((?:.*\n)*?)(\];)", lambda m: m.group(1) + m.group(2) + f"  {var},\n" + m.group(3), txt, count=1)
    idx.write_text(txt, encoding="utf-8")

    print(f"Módulo '{code}' creado:\n  {be.relative_to(ROOT)}\n  {fe.relative_to(ROOT)}")
    print("Siguiente: reiniciar la API y asignar los permisos en «Matriz de accesos».")
    return 0


if __name__ == "__main__":
    sys.exit(main())
