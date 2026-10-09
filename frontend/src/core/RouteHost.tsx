import { lazy, Suspense, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { useAuth } from './auth';
import { ErrorBoundary } from './ErrorBoundary';
import { findPage } from './routes';
import { Link, usePath } from './router';
import type { PageDef } from './types';

const cache = new Map<string, LazyExoticComponent<ComponentType>>();
function lazyPage(page: PageDef, attempt: number) {
  const key = `${page.path}#${attempt}`;
  let c = cache.get(key);
  if (!c) {
    c = lazy(page.load);
    cache.set(key, c);
  }
  return c;
}

/** Monta la página de la ruta actual: verifica permiso, la carga bajo demanda y la aísla con un ErrorBoundary. */
export function RouteHost() {
  const path = usePath();
  const { can } = useAuth();
  const [attempts, setAttempts] = useState<Record<string, number>>({});

  const page = findPage(path);
  if (!page) {
    return (
      <div className="empty-state">
        <h2>Página no encontrada</h2>
        <p>La ruta <code>{path}</code> no existe o el módulo no está instalado en el frontend.</p>
        <Link to="/" className="btn">Ir al inicio</Link>
      </div>
    );
  }
  const perms = page.permission ? ([] as string[]).concat(page.permission) : [];
  if (perms.length && !can(...perms)) {
    return (
      <div className="empty-state">
        <h2>Sin acceso</h2>
        <p>No tenés permiso para ver «{page.title}». Pedilo al administrador.</p>
      </div>
    );
  }
  const attempt = attempts[page.path] ?? 0;
  const Page = lazyPage(page, attempt);
  return (
    <ErrorBoundary
      key={`${page.path}#${attempt}`}
      onRetry={() => setAttempts((a) => ({ ...a, [page.path]: attempt + 1 }))}
    >
      <Suspense fallback={<div className="page-loading">Cargando…</div>}>
        <Page />
      </Suspense>
    </ErrorBoundary>
  );
}
