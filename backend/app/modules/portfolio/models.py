from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, fk

# Convención: las tablas de un módulo llevan su código como prefijo.


class Template(Base):
    __tablename__ = "portfolio_templates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(String(300), default="")
    icon: Mapped[str] = mapped_column(String(8), default="◆")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TemplateStep(Base):
    __tablename__ = "portfolio_template_steps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(fk("portfolio_templates.id", "CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(10), default="fase")   # fase | gate | hito
    weight: Mapped[int] = mapped_column(Integer, default=1)         # peso para repartir la duración
    description: Mapped[str] = mapped_column(String(300), default="")


class Project(Base):
    __tablename__ = "portfolio_projects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, default="")
    template_id: Mapped[int | None] = mapped_column(fk("portfolio_templates.id", "SET NULL"), nullable=True)
    owner_id: Mapped[int | None] = mapped_column(fk("users.id", "SET NULL"), nullable=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)                    # fecha de fin comprometida
    color: Mapped[str] = mapped_column(String(9), default="#3b82f6")
    priority: Mapped[str] = mapped_column(String(10), default="media")     # alta | media | baja
    status: Mapped[str] = mapped_column(String(15), default="planificado")  # planificado | en_curso | cerrado
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Stage(Base):
    """Etapa (tarea, gate o hito) de un proyecto.
    start/end = plan vigente (editable). planned_start/planned_end = línea base (lo comprometido)."""
    __tablename__ = "portfolio_stages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(fk("portfolio_projects.id", "CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(10), default="fase")
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    planned_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(15), default="pendiente")   # pendiente | en_curso | completada
    progress: Mapped[int] = mapped_column(Integer, default=0)


class StageDep(Base):
    """Dependencia entre dos etapas del MISMO proyecto: stage depende de depends_on.
    FS: empieza cuando termina la anterior · SS: empieza cuando empieza · FF: termina cuando termina."""
    __tablename__ = "portfolio_stage_deps"
    __table_args__ = (UniqueConstraint("stage_id", "depends_on_id", name="uq_portfolio_stage_dep"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(fk("portfolio_projects.id", "CASCADE"), index=True)
    stage_id: Mapped[int] = mapped_column(fk("portfolio_stages.id", "CASCADE"), index=True)
    depends_on_id: Mapped[int] = mapped_column(fk("portfolio_stages.id", "CASCADE"))
    dep_type: Mapped[str] = mapped_column(String(2), default="FS")
    lag_days: Mapped[int] = mapped_column(Integer, default=0)
