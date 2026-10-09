import { useState } from 'react';
import { api, errorText } from '../core/api';
import { useAuth } from '../core/auth';
import { useToast } from '../shared/feedback';
import { useApiList } from '../shared/hooks';
import { ErrorBox, Loading, PageHeader } from '../shared/ui';

type Menu = { id: number; code: string; module_code: string; label: string; path: string; icon: string;
              group_name: string; permission_code: string | null; sort_order: number; is_active: boolean };

export default function MenusPage() {
  const { reload: reloadAuth } = useAuth();
  const toast = useToast();
  const { rows, setRows, loading, error } = useApiList<Menu>('/sistema/menus');
  const [dirty, setDirty] = useState<Set<number>>(new Set());

  const edit = (id: number, patch: Partial<Menu>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty((d) => new Set(d).add(id));
  };

  const save = async () => {
    try {
      for (const r of rows.filter((x) => dirty.has(x.id))) {
        await api.put(`/sistema/menus/${r.id}`, { label: r.label, icon: r.icon, group_name: r.group_name, sort_order: r.sort_order, is_active: r.is_active });
      }
      setDirty(new Set());
      toast.ok('Menú actualizado.');
      await reloadAuth();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Menús"
        subtitle="Las entradas las crea cada módulo. Acá podés renombrarlas, cambiar ícono, grupo y orden, o desactivarlas, sin tocar código."
        actions={<button className="btn dark" disabled={!dirty.size} onClick={save}>Guardar cambios{dirty.size ? ` (${dirty.size})` : ''}</button>}
      />
      {error && <ErrorBox text={error} />}
      {loading ? <Loading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Ícono</th><th>Nombre</th><th>Grupo</th><th>Orden</th><th>Ruta</th><th>Permiso requerido</th><th>Módulo</th><th className="center">Activo</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={dirty.has(r.id) ? 'dirty' : ''}>
                  <td><input className="cell xs" value={r.icon} onChange={(e) => edit(r.id, { icon: e.target.value })} /></td>
                  <td><input className="cell" value={r.label} onChange={(e) => edit(r.id, { label: e.target.value })} /></td>
                  <td><input className="cell sm" value={r.group_name} onChange={(e) => edit(r.id, { group_name: e.target.value })} /></td>
                  <td><input className="cell xs" type="number" value={r.sort_order} onChange={(e) => edit(r.id, { sort_order: Number(e.target.value) })} /></td>
                  <td><code>{r.path}</code></td>
                  <td>{r.permission_code ? <code className="perm">{r.permission_code}</code> : <span className="muted">Todos</span>}</td>
                  <td><code>{r.module_code}</code></td>
                  <td className="center"><input type="checkbox" checked={r.is_active} disabled={r.code === 'core.inicio'} onChange={(e) => edit(r.id, { is_active: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
