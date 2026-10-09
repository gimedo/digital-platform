import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Toast = { id: number; text: string; kind: 'ok' | 'error' };
type ToastApi = { ok: (t: string) => void; error: (t: string) => void };
const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind']) => {
    const id = ++seq;
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  const [api] = useState<ToastApi>(() => ({ ok: (t) => push(t, 'ok'), error: (t) => push(t, 'error') }));
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.kind === 'ok' ? '✓' : '!'} {t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast fuera de ToastProvider');
  return c;
}
