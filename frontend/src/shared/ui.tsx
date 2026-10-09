import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Badge({ kind = 'neutral', children, title }: { kind?: 'ok' | 'off' | 'warn' | 'error' | 'neutral' | 'dark'; children: ReactNode; title?: string }) {
  return <span className={`badge ${kind}`} title={title}>{children}</span>;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress-wrap" title={`${value}%`}>
      <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
      <span>{value}%</span>
    </div>
  );
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return <div className="page-loading">{text}</div>;
}

export function ErrorBox({ text }: { text: string }) {
  return <div className="form-error">{text}</div>;
}
