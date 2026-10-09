import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _email(v: str) -> str:
    v = v.strip().lower()
    if not EMAIL_RE.match(v):
        raise ValueError("Correo electrónico inválido.")
    return v


# ---------- auth ----------
class LoginIn(BaseModel):
    email: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


# ---------- usuarios ----------
class UserOut(ORM):
    id: int
    name: str
    email: str
    is_active: bool
    created_at: datetime | None = None
    last_login_at: datetime | None = None


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    is_active: bool = True

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _email(v)


class UserUpdate(BaseModel):
    name: str
    email: str
    is_active: bool = True

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _email(v)


class PasswordIn(BaseModel):
    password: str


# ---------- roles ----------
class RoleOut(ORM):
    id: int
    name: str
    description: str
    is_system: bool


class RoleIn(BaseModel):
    name: str
    description: str = ""


# ---------- permisos / accesos ----------
class PermissionOut(ORM):
    id: int
    code: str
    description: str
    module_code: str


class IdsIn(BaseModel):
    ids: list[int]


# ---------- sistema ----------
class MenuOut(ORM):
    id: int
    code: str
    module_code: str
    label: str
    path: str
    icon: str
    group_name: str
    permission_code: str | None
    sort_order: int
    is_active: bool


class MenuUpdate(BaseModel):
    label: str
    icon: str
    group_name: str
    sort_order: int
    is_active: bool


class ModuleOut(ORM):
    code: str
    name: str
    version: str
    is_active: bool
    status: str
    last_error: str | None
    loaded_at: datetime | None


class ModuleToggle(BaseModel):
    is_active: bool


class AuditOut(ORM):
    id: int
    user_email: str | None
    action: str
    entity: str
    entity_id: str | None
    detail: dict | None
    created_at: datetime
