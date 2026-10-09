import { useState, type ReactNode } from 'react';
import { BRANDING } from '../config/branding';
import { useAuth } from './auth';
import { findPage } from './routes';
import { Link, usePath } from './router';

export function Layout({ children }: { children: ReactNode }) {
  const { me, menu, logout } = useAuth();
  const path = usePath();
  const [collapsed, setCollapsed] = useState(false);
  const isActive = (p: string) => path === p || (p !== '/' && path.startsWith(p + '/'));
  const title = findPage(path)?.title ?? '';

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{BRANDING.shortName}</span>
          <span className="brand-name">{BRANDING.appName}</span>
        </div>
        <nav>
          {menu.map((g) => (
            <div key={g.group} className="nav-section">
              {g.group !== 'General' && <div className="nav-group">{g.group}</div>}
              {g.items.map((it) => (
                <Link key={it.code} to={it.path} title={it.label}
                      className={`nav-item ${isActive(it.path) ? 'on' : ''}`}>
                  <span className="nav-ico">{it.icon}</span>
                  <span className="nav-label">{it.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} title="Contraer menú">
          {collapsed ? '»' : '«'}
        </button>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="crumb">{title}</div>
          <div className="user-box">
            <div className="user-txt">
              <b>{me?.user.name}</b>
              <span>{me?.roles.join(', ') || 'Sin roles asignados'}</span>
            </div>
            <Link to="/perfil" className="btn sm">Mi cuenta</Link>
            <button className="btn sm" onClick={logout}>Salir</button>
          </div>
        </header>
        <main className="content">{children}</main>
        <footer className="footer">{BRANDING.company}</footer>
      </div>
    </div>
  );
}
