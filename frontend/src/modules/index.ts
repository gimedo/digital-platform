// Registro de módulos de frontend. Para agregar un módulo: crear src/modules/<codigo>/manifest.ts
// y sumarlo a esta lista (una línea). Las páginas se cargan bajo demanda, así que un error en una
// página de un módulo no afecta al resto.
import type { ModuleDef } from '../core/types';
import portfolio from './portfolio/manifest';

export const modules: ModuleDef[] = [
  portfolio,
];
