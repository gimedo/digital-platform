"""Manifiesto del módulo Portfolio. Es lo único que el núcleo necesita conocer del módulo."""
from app.core.registry import MenuDef, ModuleManifest
from app.modules.portfolio import models  # noqa: F401  (registra las tablas del módulo)
from app.modules.portfolio.router import router
from app.modules.portfolio.seed import seed

MIGRATIONS = [
    # v1.1 · línea base en las etapas (para instalaciones creadas con la v1.0)
    ("001_linea_base_etapas", [
        "ALTER TABLE {schema}.portfolio_stages ADD COLUMN IF NOT EXISTS planned_start DATE",
        "ALTER TABLE {schema}.portfolio_stages ADD COLUMN IF NOT EXISTS planned_end DATE",
        "UPDATE {schema}.portfolio_stages SET planned_start = start_date WHERE planned_start IS NULL",
        "UPDATE {schema}.portfolio_stages SET planned_end = end_date WHERE planned_end IS NULL",
    ]),
    # v1.1 · encadenar las etapas de los proyectos existentes (cada una depende de la anterior)
    ("002_encadenar_etapas_existentes", [
        """INSERT INTO {schema}.portfolio_stage_deps (project_id, stage_id, depends_on_id, dep_type, lag_days)
           SELECT a.project_id, b.id, a.id, 'FS', 0
           FROM {schema}.portfolio_stages a
           JOIN {schema}.portfolio_stages b ON b.project_id = a.project_id AND b.position = a.position + 1
           WHERE NOT EXISTS (SELECT 1 FROM {schema}.portfolio_stage_deps d WHERE d.project_id = a.project_id)""",
    ]),
]

MODULE = ModuleManifest(
    code="portfolio",
    name="Portfolio de proyectos",
    version="1.1.0",
    permissions=[
        ("portfolio.ver", "Ver proyectos y plantillas"),
        ("portfolio.editar", "Crear y modificar proyectos y etapas"),
        ("portfolio.plantillas.editar", "Administrar plantillas de proyecto"),
    ],
    menus=[
        MenuDef("portfolio.proyectos", "Proyectos", "/portfolio/proyectos", "portfolio.ver", "▤", "Portfolio", 10),
        MenuDef("portfolio.cronograma", "Cronograma", "/portfolio/cronograma", "portfolio.ver", "▥", "Portfolio", 15),
        MenuDef("portfolio.riesgos", "Riesgos", "/portfolio/riesgos", "portfolio.ver", "⚠", "Portfolio", 17),
        MenuDef("portfolio.plantillas", "Plantillas", "/portfolio/plantillas", "portfolio.plantillas.editar", "⚙", "Portfolio", 20),
    ],
    router=router,
    seed=seed,
    migrations=MIGRATIONS,
)
