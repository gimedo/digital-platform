import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore } from './api';
import { navigate } from './router';

export type Me = {
  user: { id: number; name: string; email: string };
  roles: string[];
  permissions: string[];
};
export type MenuItem = { code: string; label: string; path: string; icon: string; module: string };
export type MenuGroup = { group: string; items: MenuItem[] };

type AuthCtx = {
  me: Me | null;
  menu: MenuGroup[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...codes: string[]) => boolean;
  reload: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState<MenuGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tokenStore.get()) {
      setMe(null);
      return;
    }
    try {
      const [m, mn] = await Promise.all([api.get<Me>('/auth/me'), api.get<MenuGroup[]>('/auth/menu')]);
      setMe(m);
      setMenu(mn);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
    const onLogout = () => {
      setMe(null);
      setMenu([]);
    };
    window.addEventListener('dp:logout', onLogout);
    return () => window.removeEventListener('dp:logout', onLogout);
  }, [reload]);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api.post<{ access_token: string }>('/auth/login', { email, password });
      tokenStore.set(r.access_token);
      await reload();
    },
    [reload],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    setMe(null);
    setMenu([]);
    navigate('/');
  }, []);

  const can = useCallback(
    (...codes: string[]) => !!me && codes.some((c) => me.permissions.includes(c)),
    [me],
  );

  const value = useMemo(
    () => ({ me, menu, loading, login, logout, can, reload }),
    [me, menu, loading, login, logout, can, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}
