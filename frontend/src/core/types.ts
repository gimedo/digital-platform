import type { ComponentType } from 'react';

/** Una página registrable. `load` es un import dinámico: cada página se descarga por separado. */
export type PageDef = {
  path: string;
  title: string;
  permission?: string | string[];   // alcanza con tener uno
  load: () => Promise<{ default: ComponentType }>;
};

/** Lo que un módulo de frontend expone a la plataforma. */
export type ModuleDef = {
  code: string;      // mismo código que el módulo del backend
  name: string;
  pages: PageDef[];
};
