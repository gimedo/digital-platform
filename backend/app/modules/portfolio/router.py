from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.audit import log_action
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.models import User
from app.modules.portfolio.models import Project, Stage, StageDep, Template, TemplateStep
from app.modules.portfolio.service import (analyze, build_stages, chain_deps, remap_dates,
                                           would_create_cycle)

router = APIRouter(tags=["Portfolio"])
VER = require_permission("portfolio.ver", "portfolio.editar")
EDITAR = require_permission("portfolio.editar")
PLANTILLAS = require_permission("portfolio.plantillas.editar")
KINDS = {"fase", "gate", "hito"}
STATUSES = {"pendiente", "en_curso", "completada"}
DEP_TYPES = {"FS", "SS", "FF"}


# ---------- esquemas ----------
class StepIn(BaseModel):
    name: str
    kind: str = "fase"
    weight: int = 1
    description: str = ""


class TemplateIn(BaseModel):
    name: str
    description: str = ""
    icon: str = "◆"
    is_active: bool = True
    steps: list[StepIn] = []


class ProjectIn(BaseModel):
    name: str
    description: str = ""
    template_id: int | None = None
    owner_id: int | None = None
    start_date: date
    end_date: date
    color: str = "#3b82f6"
    priority: str = "media"
    status: str = "planificado"

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio.")
        return self


class StageUpdate(BaseModel):
    status: str
    progress: int
    start_date: date
    end_date: date
    name: str | None = None
    kind: str | None = None


class StageCreate(BaseModel):
    name: str
    kind: str = "fase"
    start_date: date
    end_date: date
    after_stage_id: int | None = None       # se inserta a continuación de esta etapa
    depends_on_id: int | None = None        # dependencia Fin→Inicio inicial


class DepIn(BaseModel):
    stage_id: int
    depends_on_id: int
    dep_type: str = "FS"
    lag_days: int = 0


class DepUpdate(BaseModel):
    dep_type: str = "FS"
    lag_days: int = 0


# ---------- helpers ----------
def _today(hoy: date | None) -> date:
    return hoy or date.today()


def _project(db: Session, pid: int) -> Project:
    p = db.get(Project, pid)
    if not p:
        raise HTTPException(404, "Proyecto no encontrado.")
    return p


def _stages(db: Session, pid: int) -> list[Stage]:
    return list(db.scalars(select(Stage).where(Stage.project_id == pid).order_by(Stage.position, Stage.id)))


def _deps(db: Session, pid: int) -> list[StageDep]:
    return list(db.scalars(select(StageDep).where(StageDep.project_id == pid)))


def _analysis(db: Session, p: Project, today: date) -> dict:
    return analyze(p, _stages(db, p.id), _deps(db, p.id), today)


def _project_dict(db: Session, p: Project, today: date, with_detail: bool = False) -> dict:
    a = _analysis(db, p, today)
    owner = db.get(User, p.owner_id) if p.owner_id else None
    tpl = db.get(Template, p.template_id) if p.template_id else None
    d = {"id": p.id, "name": p.name, "description": p.description, "template_id": p.template_id,
         "template_name": tpl.name if tpl else None, "owner_id": p.owner_id,
         "owner_name": owner.name if owner else None, "start_date": p.start_date, "end_date": p.end_date,
         "color": p.color, "priority": p.priority, "status": p.status, "progress": a["progress"],
         "stages_count": len(a["stages"]), "current_stage": a["current_stage"], "health": a["health"],
         "projected_end": a["projected_end"], "slip_days": a["slip_days"], "overdue": a["overdue"],
         "golive": a["golive"], "alerts_count": len(a["alerts"]),
         "alerts_high": sum(1 for x in a["alerts"] if x["sev"] == "alta")}
    if with_detail:
        d.update({"today": a["today"], "alerts": a["alerts"], "stages": a["stages"], "deps": a["deps"]})
    return d


def _template_dict(t: Template, steps: list[TemplateStep]) -> dict:
    return {"id": t.id, "name": t.name, "description": t.description, "icon": t.icon, "is_active": t.is_active,
            "steps": [{"id": s.id, "position": s.position, "name": s.name, "kind": s.kind, "weight": s.weight,
                       "description": s.description} for s in sorted(steps, key=lambda s: s.position)]}


def _steps_of(db: Session, template_id: int) -> list[TemplateStep]:
    return list(db.scalars(select(TemplateStep).where(TemplateStep.template_id == template_id)))


def _save_steps(db: Session, template_id: int, steps: list[StepIn]) -> None:
    db.execute(delete(TemplateStep).where(TemplateStep.template_id == template_id))
    for i, s in enumerate(steps, start=1):
        if not s.name.strip():
            raise HTTPException(400, f"El paso {i} no tiene nombre.")
        if s.kind not in KINDS:
            raise HTTPException(400, f"Tipo inválido en el paso {i}.")
        db.add(TemplateStep(template_id=template_id, position=i, name=s.name.strip(), kind=s.kind,
                            weight=max(1, s.weight), description=s.description.strip()))


def _create_stages_from_template(db: Session, p: Project, template_id: int) -> None:
    stages = build_stages(p.id, _steps_of(db, template_id), p.start_date, p.end_date)
    db.add_all(stages)
    db.flush()
    db.add_all(chain_deps(p.id, stages))


# ---------- plantillas ----------
@router.get("/plantillas")
def list_templates(db: Session = Depends(get_db), _=Depends(VER)):
    return [_template_dict(t, _steps_of(db, t.id)) for t in db.scalars(select(Template).order_by(Template.name))]


@router.post("/plantillas", status_code=201)
def create_template(data: TemplateIn, db: Session = Depends(get_db), actor: User = Depends(PLANTILLAS)):
    if db.scalar(select(func.count()).select_from(Template).where(Template.name == data.name.strip())):
        raise HTTPException(409, "Ya existe una plantilla con ese nombre.")
    t = Template(name=data.name.strip(), description=data.description, icon=data.icon, is_active=data.is_active)
    db.add(t)
    db.flush()
    _save_steps(db, t.id, data.steps)
    log_action(db, actor, "create", "portfolio.template", t.id, {"name": t.name})
    db.commit()
    return _template_dict(t, _steps_of(db, t.id))


@router.put("/plantillas/{tid}")
def update_template(tid: int, data: TemplateIn, db: Session = Depends(get_db), actor: User = Depends(PLANTILLAS)):
    t = db.get(Template, tid)
    if not t:
        raise HTTPException(404, "Plantilla no encontrada.")
    t.name, t.description, t.icon, t.is_active = data.name.strip(), data.description, data.icon, data.is_active
    _save_steps(db, t.id, data.steps)
    log_action(db, actor, "update", "portfolio.template", t.id, {"name": t.name, "steps": len(data.steps)})
    db.commit()
    return _template_dict(t, _steps_of(db, t.id))


@router.delete("/plantillas/{tid}", status_code=204)
def delete_template(tid: int, db: Session = Depends(get_db), actor: User = Depends(PLANTILLAS)):
    t = db.get(Template, tid)
    if not t:
        raise HTTPException(404, "Plantilla no encontrada.")
    log_action(db, actor, "delete", "portfolio.template", t.id, {"name": t.name})
    db.delete(t)
    db.commit()


# ---------- proyectos ----------
@router.get("/responsables")
def owners(db: Session = Depends(get_db), _=Depends(VER)):
    """Lista mínima de usuarios activos para elegir responsable (sin exigir permisos de seguridad)."""
    return [{"id": u.id, "name": u.name} for u in db.scalars(select(User).where(User.is_active).order_by(User.name))]


@router.get("/proyectos")
def list_projects(hoy: date | None = None, db: Session = Depends(get_db), _=Depends(VER)):
    t = _today(hoy)
    return [_project_dict(db, p, t) for p in db.scalars(select(Project).order_by(Project.start_date))]


@router.get("/proyectos/{pid}")
def get_project(pid: int, hoy: date | None = None, db: Session = Depends(get_db), _=Depends(VER)):
    return _project_dict(db, _project(db, pid), _today(hoy), with_detail=True)


@router.get("/analisis")
def portfolio_analysis(hoy: date | None = None, db: Session = Depends(get_db), _=Depends(VER)):
    """Todos los proyectos con etapas, dependencias, proyección y alertas (para el cronograma y los riesgos)."""
    t = _today(hoy)
    return [_project_dict(db, p, t, with_detail=True)
            for p in db.scalars(select(Project).order_by(Project.start_date))]


@router.post("/proyectos", status_code=201)
def create_project(data: ProjectIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    p = Project(**data.model_dump())
    db.add(p)
    db.flush()
    if data.template_id:
        _create_stages_from_template(db, p, data.template_id)
    log_action(db, actor, "create", "portfolio.project", p.id, {"name": p.name})
    db.commit()
    return _project_dict(db, p, date.today())


@router.put("/proyectos/{pid}")
def update_project(pid: int, data: ProjectIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    p = _project(db, pid)
    old_start, old_end = p.start_date, p.end_date
    payload = data.model_dump()
    payload.pop("template_id")  # la plantilla solo se usa al crear
    for k, v in payload.items():
        setattr(p, k, v)
    replanned = (old_start, old_end) != (p.start_date, p.end_date)
    if replanned:   # cambiar el plazo del proyecto replanifica sus etapas y fija nueva línea base
        remap_dates(_stages(db, pid), old_start, old_end, p.start_date, p.end_date)
    log_action(db, actor, "update", "portfolio.project", p.id,
               {"name": p.name, "replanificado": replanned,
                "plazo_anterior": [str(old_start), str(old_end)] if replanned else None})
    db.commit()
    return _project_dict(db, p, date.today())


@router.delete("/proyectos/{pid}", status_code=204)
def delete_project(pid: int, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    p = _project(db, pid)
    log_action(db, actor, "delete", "portfolio.project", p.id, {"name": p.name})
    db.delete(p)
    db.commit()


@router.post("/proyectos/{pid}/linea-base")
def set_baseline(pid: int, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    """Fija el plan vigente como nueva línea base (replanificación aprobada)."""
    p = _project(db, pid)
    stages = _stages(db, pid)
    for s in stages:
        s.planned_start, s.planned_end = s.start_date, s.end_date
    if stages:
        p.end_date = max(p.end_date, max(s.end_date for s in stages))
    log_action(db, actor, "set_baseline", "portfolio.project", pid, {"fin": str(p.end_date)})
    db.commit()
    return {"ok": True}


# ---------- etapas ----------
@router.get("/proyectos/{pid}/etapas")
def list_stages(pid: int, hoy: date | None = None, db: Session = Depends(get_db), _=Depends(VER)):
    return _analysis(db, _project(db, pid), _today(hoy))["stages"]


@router.post("/proyectos/{pid}/etapas", status_code=201)
def create_stage(pid: int, data: StageCreate, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    _project(db, pid)
    if data.kind not in KINDS:
        raise HTTPException(400, "Tipo inválido.")
    if data.end_date < data.start_date:
        raise HTTPException(400, "La fecha de fin no puede ser anterior a la de inicio.")
    stages = _stages(db, pid)
    pos = (max((s.position for s in stages), default=0) + 1)
    if data.after_stage_id:
        after = next((s for s in stages if s.id == data.after_stage_id), None)
        if not after:
            raise HTTPException(400, "La etapa de referencia no pertenece al proyecto.")
        pos = after.position + 1
        db.execute(update(Stage).where(Stage.project_id == pid, Stage.position >= pos)
                   .values(position=Stage.position + 1))
    s = Stage(project_id=pid, position=pos, name=data.name.strip(), kind=data.kind,
              start_date=data.start_date, end_date=data.end_date,
              planned_start=data.start_date, planned_end=data.end_date)
    db.add(s)
    db.flush()
    if data.depends_on_id:
        if not any(x.id == data.depends_on_id for x in stages):
            raise HTTPException(400, "La etapa de la que depende no pertenece al proyecto.")
        db.add(StageDep(project_id=pid, stage_id=s.id, depends_on_id=data.depends_on_id, dep_type="FS"))
    log_action(db, actor, "create", "portfolio.stage", s.id, {"project": pid, "name": s.name})
    db.commit()
    return {"id": s.id}


@router.put("/proyectos/{pid}/etapas/{sid}")
def update_stage(pid: int, sid: int, data: StageUpdate, db: Session = Depends(get_db),
                 actor: User = Depends(EDITAR)):
    s = db.get(Stage, sid)
    if not s or s.project_id != pid:
        raise HTTPException(404, "Etapa no encontrada.")
    if data.status not in STATUSES:
        raise HTTPException(400, "Estado inválido.")
    if data.end_date < data.start_date:
        raise HTTPException(400, "La fecha de fin no puede ser anterior a la de inicio.")
    if data.kind and data.kind not in KINDS:
        raise HTTPException(400, "Tipo inválido.")
    s.status = data.status
    s.progress = 100 if data.status == "completada" else (0 if data.status == "pendiente" else max(0, min(99, data.progress)))
    s.start_date, s.end_date = data.start_date, data.end_date
    if data.name and data.name.strip():
        s.name = data.name.strip()
    if data.kind:
        s.kind = data.kind
    log_action(db, actor, "update", "portfolio.stage", s.id, data.model_dump(mode="json"))
    db.commit()
    return {"ok": True}


@router.delete("/proyectos/{pid}/etapas/{sid}", status_code=204)
def delete_stage(pid: int, sid: int, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    s = db.get(Stage, sid)
    if not s or s.project_id != pid:
        raise HTTPException(404, "Etapa no encontrada.")
    # Reconectar: quienes dependían de esta etapa pasan a depender de sus predecesoras (no se corta la cadena)
    deps = _deps(db, pid)
    preds = [d for d in deps if d.stage_id == sid]
    succs = [d for d in deps if d.depends_on_id == sid]
    existing = {(d.stage_id, d.depends_on_id) for d in deps}
    for a in succs:
        for b in preds:
            if (a.stage_id, b.depends_on_id) not in existing:
                db.add(StageDep(project_id=pid, stage_id=a.stage_id, depends_on_id=b.depends_on_id, dep_type="FS"))
                existing.add((a.stage_id, b.depends_on_id))
    log_action(db, actor, "delete", "portfolio.stage", sid, {"name": s.name})
    db.delete(s)
    db.commit()


# ---------- dependencias (solo dentro del mismo proyecto) ----------
@router.get("/proyectos/{pid}/dependencias")
def list_deps(pid: int, db: Session = Depends(get_db), _=Depends(VER)):
    return [{"id": d.id, "stage_id": d.stage_id, "depends_on_id": d.depends_on_id, "dep_type": d.dep_type,
             "lag_days": d.lag_days} for d in _deps(db, pid)]


@router.post("/proyectos/{pid}/dependencias", status_code=201)
def create_dep(pid: int, data: DepIn, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    _project(db, pid)
    if data.dep_type not in DEP_TYPES:
        raise HTTPException(400, "Tipo de dependencia inválido (FS, SS o FF).")
    ids = {s.id for s in _stages(db, pid)}
    if data.stage_id not in ids or data.depends_on_id not in ids:
        raise HTTPException(400, "Las dependencias solo pueden ser entre etapas del mismo proyecto.")
    deps = _deps(db, pid)
    if any(d.stage_id == data.stage_id and d.depends_on_id == data.depends_on_id for d in deps):
        raise HTTPException(409, "Esa dependencia ya existe.")
    if would_create_cycle(deps, data.stage_id, data.depends_on_id):
        raise HTTPException(400, "No se puede: generaría una dependencia circular.")
    d = StageDep(project_id=pid, **data.model_dump())
    db.add(d)
    db.flush()
    log_action(db, actor, "create", "portfolio.dependency", d.id, data.model_dump())
    db.commit()
    return {"id": d.id}


@router.put("/proyectos/{pid}/dependencias/{did}")
def update_dep(pid: int, did: int, data: DepUpdate, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    d = db.get(StageDep, did)
    if not d or d.project_id != pid:
        raise HTTPException(404, "Dependencia no encontrada.")
    if data.dep_type not in DEP_TYPES:
        raise HTTPException(400, "Tipo de dependencia inválido (FS, SS o FF).")
    d.dep_type, d.lag_days = data.dep_type, data.lag_days
    log_action(db, actor, "update", "portfolio.dependency", d.id, data.model_dump())
    db.commit()
    return {"ok": True}


@router.delete("/proyectos/{pid}/dependencias/{did}", status_code=204)
def delete_dep(pid: int, did: int, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    d = db.get(StageDep, did)
    if not d or d.project_id != pid:
        raise HTTPException(404, "Dependencia no encontrada.")
    log_action(db, actor, "delete", "portfolio.dependency", d.id)
    db.delete(d)
    db.commit()


@router.post("/proyectos/{pid}/dependencias/encadenar")
def rechain(pid: int, db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    """Reemplaza las dependencias del proyecto: cada etapa depende (FS) de la anterior."""
    _project(db, pid)
    db.execute(delete(StageDep).where(StageDep.project_id == pid))
    db.add_all(chain_deps(pid, _stages(db, pid)))
    log_action(db, actor, "rechain", "portfolio.project", pid)
    db.commit()
    return {"ok": True}


# ---------- ejemplo ----------
@router.post("/ejemplo", status_code=201)
def create_example(db: Session = Depends(get_db), actor: User = Depends(EDITAR)):
    """Crea un proyecto de ejemplo con atrasos reales respecto de hoy, para ver cómo se detectan los riesgos."""
    tpl = db.scalar(select(Template).where(Template.name == "GDTI Completo")) or db.scalar(select(Template))
    if not tpl:
        raise HTTPException(400, "No hay plantillas para generar el ejemplo.")
    today = date.today()
    if db.scalar(select(func.count()).select_from(Project).where(Project.name == "Ejemplo · Migración iJServ → Flota")):
        raise HTTPException(409, "El proyecto de ejemplo ya existe. Eliminalo para volver a crearlo.")
    p = Project(name="Ejemplo · Migración iJServ → Flota", description="Proyecto de ejemplo. Se puede eliminar.",
                template_id=tpl.id, owner_id=actor.id, start_date=today - timedelta(days=100),
                end_date=today + timedelta(days=60), color="#e4572e", priority="alta", status="en_curso")
    db.add(p)
    db.flush()
    _create_stages_from_template(db, p, tpl.id)
    stages = _stages(db, p.id)
    late_set = False
    for s in stages:
        if s.end_date < today - timedelta(days=14):
            s.status, s.progress = "completada", 100
        elif not late_set and s.start_date <= today:
            s.status, s.progress = "en_curso", 70     # etapa que debía terminar y sigue abierta
            if s.end_date >= today:
                s.end_date = s.planned_end = today - timedelta(days=9)
            late_set = True
    log_action(db, actor, "create_example", "portfolio.project", p.id)
    db.commit()
    return _project_dict(db, p, today)
