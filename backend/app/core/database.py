from collections.abc import Iterator

from sqlalchemy import ForeignKey, MetaData, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.sqlalchemy_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

SCHEMA = settings.db_schema


class Base(DeclarativeBase):
    """Base de todas las tablas (núcleo y módulos). Todas viven en el esquema configurado."""
    metadata = MetaData(schema=SCHEMA)


def fk(target: str, ondelete: str | None = None) -> ForeignKey:
    """FK calificada con el esquema. Ej.: fk("users.id", "SET NULL")."""
    return ForeignKey(f"{SCHEMA}.{target}", ondelete=ondelete)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema() -> None:
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))
