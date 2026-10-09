"""Crea (o actualiza) el primer usuario administrador. No hay usuarios precargados en el código.

Uso (desde la carpeta backend, con el .venv activo):
    python -m scripts.create_admin
    python -m scripts.create_admin --name "José Gimenez" --email jose@empresa.com
La contraseña se pide por consola sin mostrarse.
"""
import argparse
import getpass
import sys

from sqlalchemy import select

from app.core.database import SessionLocal, ensure_schema
from app.core.models import Role, User, UserRole
from app.core.security import hash_password, validate_password_strength
from app.main import CORE, CORE_TABLES, RESULTS
from app.core.registry import ADMIN_ROLE, create_tables, sync_registry


def main() -> int:
    ap = argparse.ArgumentParser(description="Crear usuario administrador")
    ap.add_argument("--name")
    ap.add_argument("--email")
    ap.add_argument("--password", help="Solo para automatizar. Si se omite, se pide por consola.")
    a = ap.parse_args()

    name = a.name or input("Nombre completo: ").strip()
    email = (a.email or input("Correo: ")).strip().lower()
    password = a.password or getpass.getpass("Contraseña (mín. 8): ")
    if not a.password and password != getpass.getpass("Repetir contraseña: "):
        print("Las contraseñas no coinciden.")
        return 1
    try:
        validate_password_strength(password)
    except ValueError as e:
        print(e)
        return 1

    # Asegura tablas, permisos y rol Administrador aunque la API nunca se haya iniciado
    ensure_schema()
    create_tables(CORE_TABLES, RESULTS)
    with SessionLocal() as db:
        sync_registry(db, CORE, RESULTS)
        admin = db.scalar(select(Role).where(Role.name == ADMIN_ROLE))
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.name, user.is_active = name, True
            user.password_hash = hash_password(password)
            print(f"Usuario existente actualizado: {email}")
        else:
            user = User(name=name, email=email, password_hash=hash_password(password), is_active=True)
            db.add(user)
            db.flush()
            print(f"Usuario creado: {email}")
        if not db.get(UserRole, (user.id, admin.id)):
            db.add(UserRole(user_id=user.id, role_id=admin.id))
        db.commit()
    print("Listo. Ya podés iniciar sesión con rol Administrador.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
