import type { ModuleDef } from '../../core/types';

// Debe coincidir con app/modules/portfolio/manifest.py (código, rutas y permisos).
const VER = ['portfolio.ver', 'portfolio.editar'];
const portfolio: ModuleDef = {
  code: 'portfolio',
  name: 'Portfolio de proyectos',
  pages: [
    { path: '/portfolio/proyectos', title: 'Proyectos', permission: VER, load: () => import('./ProjectsPage') },
    { path: '/portfolio/proyecto', title: 'Detalle del proyecto', permission: VER, load: () => import('./ProjectDetailPage') },
    { path: '/portfolio/cronograma', title: 'Cronograma', permission: VER, load: () => import('./SchedulePage') },
    { path: '/portfolio/riesgos', title: 'Riesgos', permission: VER, load: () => import('./RisksPage') },
    { path: '/portfolio/plantillas', title: 'Plantillas', permission: 'portfolio.plantillas.editar', load: () => import('./TemplatesPage') },
  ],
};

export default portfolio;
