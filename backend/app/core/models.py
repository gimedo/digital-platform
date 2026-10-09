"""Tablas del núcleo: seguridad, menús, módulos, migraciones y auditoría.
Cada responsabilidad en su tabla: el usuario no conoce roles, el rol no conoce permisos;
las relaciones viven en tablas intermedias que se administran desde páginas separadas."""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, fk


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(String(250), default="")
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)  # Administrador: no se borra ni se edita su matriz


class Permission(Base):
    __tablename__ = "permissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(250), default="")
    module_code: Mapped[str] = mapped_column(String(60), index=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    role_id: Mapped[int] = mapped_column(fk("roles.id", "CASCADE"), primary_key=True)
    permission_id: Mapped[int] = mapped_column(fk("permissions.id", "CASCADE"), primary_key=True)


class UserRole(Base):
    __tablename__ = "user_roles"
    user_id: Mapped[int] = mapped_column(fk("users.id", "CASCADE"), primary_key=True)
    role_id: Mapped[int] = mapped_column(fk("roles.id", "CASCADE"), primary_key=True)


class Module(Base):
    """Registro de módulos instalados. Se completa solo al iniciar la API."""
    __tablename__ = "modules"
    code: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    version: Mapped[str] = mapped_column(String(20), default="0.1.0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)      # lo decide el administrador
    status: Mapped[str] = mapped_column(String(20), default="ok")       # ok | error | missing (lo decide el sistema)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    loaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SchemaMigration(Base):
    """Cambios de estructura ya aplicados por cada módulo (para no repetirlos)."""
    __tablename__ = "schema_migrations"
    module_code: Mapped[str] = mapped_column(String(60), primary_key=True)
    migration_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MenuItem(Base):
    """Entradas de menú. Las crea el manifiesto del módulo la primera vez;
    después el administrador puede renombrar, ordenar, agrupar o desactivar sin tocar código."""
    __tablename__ = "menu_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(120), unique=True)
    module_code: Mapped[str] = mapped_column(String(60), index=True)
    label: Mapped[str] = mapped_column(String(80))
    path: Mapped[str] = mapped_column(String(200))
    icon: Mapped[str] = mapped_column(String(16), default="•")
    group_name: Mapped[str] = mapped_column(String(60), default="General")
    permission_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(fk("users.id", "SET NULL"), nullable=True)
    user_email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    action: Mapped[str] = mapped_column(String(40))
    entity: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
