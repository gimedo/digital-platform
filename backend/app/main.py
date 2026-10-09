"""Punto de entrada de la API.

Orden de arranque:
1. Se cargan los módulos de app/modules (cada uno aislado: si uno falla, se marca con error y se sigue).
2. Se crean las tablas faltantes y se aplican las migraciones de cada módulo (aisladas).
3. Se sincronizan módulos, permisos y menús con la base.
4. Se montan las rutas: núcleo en /api, cada módulo en /api/m/<codigo> protegido por su interruptor.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.core import models as core_models  # noqa: F401  (registra las tablas del núcleo)
from app.core.api import access, auth, roles, system, users
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, ensure_schema
from app.core.deps import module_guard
from app.core.manifest import CORE
from app.core.models import Module
from app.core.registry import create_tables, discover_modules, sync_registry

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("platform")

CORE_TABLES = list(Base.metadata.tables.values())   # antes de cargar módulos
RESULTS = discover_modules()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    create_tables(CORE_TABLES, RESULTS)
    with SessionLocal() as db:
        sync_registry(db, CORE, RESULTS)
    yield


app = FastAPI(title=f"{settings.app_name} API", version="1.1.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, users.router, roles.router, access.router, system.router):
    app.include_router(r, prefix="/api")

for res in RESULTS:
    if res.manifest and res.manifest.router:
        app.include_router(res.manifest.router, prefix=f"/api/m/{res.code}",
                           dependencies=[Depends(module_guard(res.code))])


@app.get("/api/health", tags=["Sistema"])
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = "connected"
    except Exception as e:  # noqa: BLE001
        db_ok = f"error: {e.__class__.__name__}"
    modules = []
    if db_ok == "connected":
        with SessionLocal() as db:
            modules = [{"code": m.code, "active": m.is_active, "status": m.status}
                       for m in db.scalars(select(Module).order_by(Module.code))]
    return {"status": "ok", "service": settings.app_name, "database": db_ok, "modules": modules}
