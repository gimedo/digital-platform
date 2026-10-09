from typing import Any

from sqlalchemy.orm import Session

from app.core.models import AuditLog, User


def log_action(db: Session, user: User | None, action: str, entity: str,
               entity_id: Any = None, detail: dict | None = None) -> None:
    """Registra la acción. No hace commit: se guarda junto con la operación que la origina."""
    db.add(AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        detail=detail,
    ))
