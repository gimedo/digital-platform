# Digital Platform — base reutilizable

Plataforma base para construir sistemas internos. El **núcleo** (login, usuarios, roles, permisos, menús,
módulos y auditoría) se reutiliza tal cual; cada sistema se agrega como **módulo** independiente.
El primer módulo es **Portfolio de proyectos** (plantillas y proyectos con etapas).

```
digital-platform/
├── backend/                     Python · FastAPI · SQLAlchemy · PostgreSQL
│   ├── app/core/                NÚCLEO (no se modifica por proyecto)
│   │   ├── api/                 auth, usuarios, roles, accesos, sistema
│   │   ├── models.py            tablas de seguridad, menús, módulos y auditoría
│   │   ├── registry.py          carga aislada de módulos + sincronización de permisos/menús
│   │   └── manifest.py          permisos y menús del núcleo
│   ├── app/modules/<codigo>/    UN MÓDULO = manifest.py + models.py + router.py
│   └── scripts/create_admin.py  crea el primer administrador (sin usuarios precargados)
├── frontend/                    React · TypeScript · Vite (sin librerías de UI externas)
│   └── src/
│       ├── config/branding.ts   nombre y textos de la app (lo único a cambiar por proyecto)
│       ├── core/                login, layout, menú dinámico, enrutador, ErrorBoundary
│       ├── shared/              componentes reutilizables (CrudPage, DataTable, Modal, FormField…)
│       ├── admin/               páginas del núcleo
│       └── modules/<codigo>/    UN MÓDULO = manifest.ts + páginas
└── tools/new_module.py          generador de módulos nuevos
```

## Requisitos
Python 3.12+, Node 20.19+ (probado con Node 24), PostgreSQL 14+ (remoto).
El usuario de base de datos necesita poder crear el esquema (`DB_SCHEMA`, por defecto `platform`)
o el esquema ya debe existir con permisos de creación de tablas.

## 1. Backend (PowerShell)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env          # completar DB_* y JWT_SECRET
python -m scripts.create_admin  # pide nombre, correo y contraseña
uvicorn app.main:app --reload --port 8000
```
Verificar: http://127.0.0.1:8000/api/health → `database: connected` y la lista de módulos.
Documentación de la API: http://127.0.0.1:8000/api/docs

Al iniciar, la API crea las tablas que falten, registra permisos y menús de cada módulo y le da
todos los permisos al rol **Administrador**.

## 2. Frontend (otra terminal)
```powershell
cd frontend
npm install
npm run dev
```
Abrir http://localhost:5173 e ingresar con el administrador creado.

## 3. Primeros pasos en la plataforma
1. **Roles** → crear el rol (solo nombre y descripción).
2. **Matriz de accesos** → tildar los permisos del rol y guardar.
3. **Usuarios** → crear el usuario (solo sus datos).
4. **Roles por usuario** → asignarle el rol.
5. **Menús** → renombrar, reordenar o desactivar entradas sin tocar código.

## Agregar un módulo nuevo
```powershell
python tools/new_module.py inventario "Inventario de equipos"
```
Genera backend y frontend con un ABM de ejemplo y registra el módulo en `frontend/src/modules/index.ts`.
Reiniciar la API, refrescar el navegador y asignar los permisos `inventario.*` en la Matriz.

Manual: crear `backend/app/modules/<codigo>/manifest.py` con `MODULE = ModuleManifest(...)`
(permisos, menús, router, `seed` opcional) y `frontend/src/modules/<codigo>/manifest.ts`, y sumarlo a
`frontend/src/modules/index.ts`.

## Cómo se evita que un cambio tire abajo todo
| Capa | Mecanismo |
|---|---|
| Backend, al iniciar | Cada módulo se importa aislado. Si falla, queda con estado **Error al cargar** (ver *Módulos*) y la API arranca igual con el resto. Sus tablas se crean por separado. |
| Backend, en uso | Interruptor por módulo (*Módulos → Desactivar*): corta su API (503) y su menú al instante, sin reiniciar. |
| Frontend | Cada página se descarga por separado y está envuelta en un **ErrorBoundary**: si falla, muestra el error solo en esa página; el menú y las demás páginas siguen funcionando. |
| Antes de publicar | `npm run typecheck` y probar. Un error de compilación sí impide generar el build, por eso se valida antes. Trabajar con una rama de Git por cambio. |

## Reglas para reutilizar la base en otros proyectos
- **No modificar `core/` ni `shared/` dentro de un proyecto.** Las mejoras se hacen en la plantilla y se
  traen con `git merge`. Así todos los proyectos reciben las correcciones.
- Lo propio de cada proyecto va en `modules/` y en `config/branding.ts`.
- Tablas de un módulo con prefijo de su código (`portfolio_*`, `inventario_*`).
- Permisos con el formato `<modulo>.<recurso>.<accion>`.
- Un módulo no importa código de otro módulo; si necesita datos de otro, los pide por API.

## Pendientes conocidos
- Las tablas **nuevas** se crean solas, pero los **cambios de columnas** en tablas existentes no.
  Cuando haga falta modificar una tabla en producción, se incorpora Alembic para migraciones.
- La sesión dura `JWT_EXPIRE_MINUTES` (8 h por defecto) y se guarda en el navegador.
- Producción: `npm run build` y servir `frontend/dist` con NGINX, con `/api` redirigido al backend.
