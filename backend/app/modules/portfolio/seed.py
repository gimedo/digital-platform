"""Plantillas estándar. Solo se crean si el módulo todavía no tiene ninguna."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.portfolio.models import Template, TemplateStep

STANDARD = [
    ("GDTI Completo", "■", "Cambios a sistemas core o integraciones críticas. Requiere comité.", [
        ("Alcance", "fase", 8), ("Presupuesto", "fase", 4), ("Evaluación GDTI", "gate", 4), ("Desarrollo", "fase", 30),
        ("Pruebas", "fase", 12), ("Ajustes", "fase", 8), ("Plan Piloto", "fase", 6),
        ("Aceptación del Negocio", "fase", 4), ("GO-LIVE", "hito", 1), ("Cierre / Lecciones Aprendidas", "fase", 3)]),
    ("GDTI Simplificado", "⚙", "Riesgo medio, sin integración crítica. Aprobación directa.", [
        ("Alcance", "fase", 8), ("Evaluación GDTI", "gate", 3), ("Desarrollo", "fase", 25), ("Pruebas", "fase", 10),
        ("Aceptación del Negocio", "fase", 4), ("GO-LIVE", "hito", 1)]),
    ("Quick Win / Mejora Continua", "⚡", "Ajustes menores sin gate de gobierno.", [
        ("Alcance", "fase", 3), ("Desarrollo", "fase", 10), ("Pruebas", "fase", 4), ("GO-LIVE", "hito", 1)]),
]


def seed(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(Template)):
        return
    for name, icon, desc, steps in STANDARD:
        t = Template(name=name, icon=icon, description=desc)
        db.add(t)
        db.flush()
        for i, (sname, kind, w) in enumerate(steps, start=1):
            db.add(TemplateStep(template_id=t.id, position=i, name=sname, kind=kind, weight=w))
