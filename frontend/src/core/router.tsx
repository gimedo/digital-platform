// Enrutador mínimo basado en History API: sin dependencias externas.
// Soporta parámetros por query string: /portfolio/proyecto?id=3
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener('popstate', notify);

const current = () => window.location.pathname + window.location.search;

export function navigate(to: string) {
  if (to === current()) return;
  window.history.pushState(null, '', to);
  notify();
  window.scrollTo(0, 0);
}

function useLocation(): string {
  const [loc, setLoc] = useState(current());
  useEffect(() => {
    const l = () => setLoc(current());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return loc;
}

export function usePath(): string {
  return useLocation().split('?')[0];
}

export function useQuery(): URLSearchParams {
  const loc = useLocation();
  return new URLSearchParams(loc.includes('?') ? loc.slice(loc.indexOf('?')) : '');
}

type LinkProps = { to: string; className?: string; title?: string; children: ReactNode };

export function Link({ to, className, title, children }: LinkProps) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  );
}
