import type { ReactNode } from 'react';

export type ColumnDef<T> = { key: string; label: string; render?: (row: T) => ReactNode; width?: string; align?: 'left' | 'center' | 'right' };

type Props<T> = { columns: ColumnDef<T>[]; rows: T[]; rowKey: (r: T) => string | number; empty?: string; actions?: (r: T) => ReactNode };

export function DataTable<T>({ columns, rows, rowKey, empty = 'Sin registros.', actions }: Props<T>) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} style={{ width: c.width, textAlign: c.align }}>{c.label}</th>)}
            {actions && <th style={{ width: 1 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="muted center">{empty}</td></tr>
          )}
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align }}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
              {actions && <td className="row-actions">{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
