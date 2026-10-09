import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../core/api';
import { useAuth } from '../core/auth';
import { useToast } from '../shared/feedback';
import { useApiList } from '../shared/hooks';
import { Badge, ErrorBox, Loading, PageHeader } from '../shared/ui';

type User = { id: number; name: string; email: string; is_active: boolean };
type Role = { id: number; name: string; description: string; is_system: boolean };

export default function UserRolesPage() {
  const { can, me, reload: reloadAuth } = useAuth();
  const toast = useToast();
  const editable = can('seguridad.accesos.editar');
  const users = useApiList<User>('/seguridad/usuarios');
  const roles = useApiList<Role>('/seguridad/roles');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<User | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [original, setOriginal] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!sel) return;
    api.get<{ role_ids: number[] }>(`/seguridad/usuarios/${sel.id}/roles`)
      .then((r) => { setChecked(new Set(r.role_ids)); setOriginal(new Set(r.role_ids)); })
      .catch((e) => toast.error(errorText(e)));
  }, [sel, toast]);

  const list = useMemo(
    () => users.rows.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())),
    [users.rows, q],
  );
  const changed = checked.size !== original.size || [...checked].some((id) => !original.has(id));

  const save = async () => {
    if (!sel) return;
    try {
      await api.put(`/seguridad/usuarios/${sel.id}/roles`, { ids: [...checked] });
      setOriginal(new Set(checked));
      toast.ok(`Roles de ${sel.name} actualizados.`);
      if (sel.id === me?.user.id) await reloadAuth();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  if (users.error || roles.error) return <ErrorBox text={users.error || roles.error || ''} />;
  return (
    <div>
      <PageHeader title="Roles por usuario" subtitle="Elegí un usuario y marcá sus roles. Los permisos efectivos son la suma de los permisos de sus roles." />
      <div className="split">
        <div className="card list-panel">
          <input className="search full" placeholder="Buscar usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
          {users.loading ? <Loading /> : list.map((u) => (
            <button key={u.id} className={`list-item ${sel?.id === u.id ? 'on' : ''}`} onClick={() => setSel(u)}>
              <b>{u.name}</b><span className="muted">{u.email}</span>
              {!u.is_active && <Badge kind="off">Inactivo</Badge>}
            </button>
          ))}
        </div>
        <div className="card">
          {!sel ? <p className="muted">Seleccioná un usuario de la lista.</p> : (
            <>
              <h3>{sel.name} <span className="muted">· {sel.email}</span></h3>
              <div className="role-list">
                {roles.rows.map((r) => (
                  <label key={r.id} className="role-opt">
                    <input type="checkbox" disabled={!editable} checked={checked.has(r.id)}
                           onChange={(e) => setChecked((c) => { const n = new Set(c); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
                    <div><b>{r.name}</b> {r.is_system && <Badge kind="dark">Sistema</Badge>}<div className="muted">{r.description}</div></div>
                  </label>
                ))}
              </div>
              {editable && (
                <div className="actions-row">
                  <button className="btn" disabled={!changed} onClick={() => setChecked(new Set(original))}>Descartar</button>
                  <button className="btn dark" disabled={!changed} onClick={save}>Guardar roles</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
