import { modules } from '../modules';
import type { PageDef } from './types';

/** Páginas del núcleo (administración). */
const corePages: PageDef[] = [
  { path: '/', title: 'Inicio', load: () => import('../admin/HomePage') },
  { path: '/perfil', title: 'Mi cuenta', load: () => import('../admin/ProfilePage') },
  { path: '/seguridad/usuarios', title: 'Usuarios', permission: 'seguridad.usuarios.ver', load: () => import('../admin/UsersPage') },
  { path: '/seguridad/roles', title: 'Roles', permission: 'seguridad.roles.ver', load: () => import('../admin/RolesPage') },
  { path: '/seguridad/permisos', title: 'Permisos', permission: 'seguridad.permisos.ver', load: () => import('../admin/PermissionsPage') },
  { path: '/seguridad/matriz', title: 'Matriz de accesos', permission: 'seguridad.accesos.ver', load: () => import('../admin/AccessMatrixPage') },
  { path: '/seguridad/asignacion', title: 'Roles por usuario', permission: 'seguridad.accesos.ver', load: () => import('../admin/UserRolesPage') },
  { path: '/sistema/menus', title: 'Menús', permission: 'sistema.menus.editar', load: () => import('../admin/MenusPage') },
  { path: '/sistema/modulos', title: 'Módulos', permission: 'sistema.modulos.editar', load: () => import('../admin/ModulesPage') },
  { path: '/sistema/auditoria', title: 'Auditoría', permission: 'sistema.auditoria.ver', load: () => import('../admin/AuditPage') },
];

export const allPages: PageDef[] = [...corePages, ...modules.flatMap((m) => m.pages)];

export function findPage(path: string): PageDef | undefined {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return allPages.find((p) => p.path === clean);
}
