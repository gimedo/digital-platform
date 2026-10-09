"""Manifiesto del núcleo: permisos y menús de administración de la plataforma."""
from app.core.registry import MenuDef, ModuleManifest

CORE = ModuleManifest(
    code="core",
    name="Núcleo de la plataforma",
    version="1.0.0",
    permissions=[
        ("seguridad.usuarios.ver", "Ver usuarios"),
        ("seguridad.usuarios.editar", "Crear, modificar y eliminar usuarios"),
        ("seguridad.roles.ver", "Ver roles"),
        ("seguridad.roles.editar", "Crear, modificar y eliminar roles"),
        ("seguridad.permisos.ver", "Ver catálogo de permisos"),
        ("seguridad.accesos.ver", "Ver matriz de accesos y asignaciones"),
        ("seguridad.accesos.editar", "Asignar permisos a roles y roles a usuarios"),
        ("sistema.menus.editar", "Administrar menús"),
        ("sistema.modulos.editar", "Activar y desactivar módulos"),
        ("sistema.auditoria.ver", "Ver auditoría"),
    ],
    menus=[
        MenuDef("core.inicio", "Inicio", "/", None, "⌂", "General", 1),
        MenuDef("core.usuarios", "Usuarios", "/seguridad/usuarios", "seguridad.usuarios.ver", "●", "Seguridad", 10),
        MenuDef("core.roles", "Roles", "/seguridad/roles", "seguridad.roles.ver", "◆", "Seguridad", 20),
        MenuDef("core.permisos", "Permisos", "/seguridad/permisos", "seguridad.permisos.ver", "◇", "Seguridad", 30),
        MenuDef("core.matriz", "Matriz de accesos", "/seguridad/matriz", "seguridad.accesos.ver", "▦", "Seguridad", 40),
        MenuDef("core.asignacion", "Roles por usuario", "/seguridad/asignacion", "seguridad.accesos.ver", "⇄", "Seguridad", 50),
        MenuDef("core.menus", "Menús", "/sistema/menus", "sistema.menus.editar", "☰", "Sistema", 10),
        MenuDef("core.modulos", "Módulos", "/sistema/modulos", "sistema.modulos.editar", "▣", "Sistema", 20),
        MenuDef("core.auditoria", "Auditoría", "/sistema/auditoria", "sistema.auditoria.ver", "◷", "Sistema", 30),
    ],
)
