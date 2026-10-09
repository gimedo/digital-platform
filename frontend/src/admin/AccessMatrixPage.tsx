import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../core/api';
import { useAuth } from '../core/auth';
import { useToast } from '../shared/feedback';
import { ErrorBox, Loading, PageHeader } from '../shared/ui';

type Role = { id: number; name: string; is_system: boolean };
type Perm = { id: number; code: string; description: string; module_code: string };
type Matrix = { roles: Role[]; permissions: Perm[]; grants: Record<string, number[]> };

export default function AccessMatrixPage() {
  const { can, reload: reloadAuth } = useAuth();
  const toast = useToast();
  const editable = can('seguridad.accesos.editar');
  const [data, setData] = useState<Matrix | null>(null);
  const [grants, setGrants] = useState<Record<number, Set<number>>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const m = await api.get<Matrix>('/seguridad/matriz');
      setData(m);
      setGrants(Object.fromEntries(m.roles.map((r) => [r.id, new Set(m.grants[String(r.id)] ?? [])])));
      setDirty(new Set());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const modules = useMemo(() => {
    const m = new Map<string, Perm[]>();
    data?.permissions.forEach((p) => m.set(p.module_code, [...(m.get(p.module_code) ?? []), p]));
    return [...m.entries()];
  }, [data]);

  const setMany = (role: Role, ids: number[], on: boolean) => {
    if (role.is_system || !editable) return;
    setGrants((g) => {
      const next = new Set(g[role.id]);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return { ...g, [role.id]: next };
    });
    setDirty((d) => new Set(d).add(role.id));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const rid of dirty) await api.put(`/seguridad/matriz/${rid}`, { ids: [...grants[rid]] });
      toast.ok(`Permisos guardados (${dirty.size} rol/es).`);
      await load();
      await reloadAuth();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loading />;
  const roles = data.roles;

  return (
    <div>
      <PageHeader
        title="Matriz de accesos"
        subtitle="Tildá qué puede hacer cada rol. Clic en el nombre de un módulo para marcar o desmarcar todos sus permisos. El rol Administrador tiene siempre todo."
        actions={editable && (
          <>
            {dirty.size > 0 && <span className="muted">{dirty.size} rol/es con cambios sin guardar</span>}
            <button className="btn" disabled={!dirty.size || saving} onClick={() => void load()}>Descartar</button>
            <button className="btn dark" disabled={!dirty.size || saving} onClick={saveAll}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          </>
        )}
      />
      <div className="table-wrap">
        <table className="table matrix">
          <thead>
            <tr>
              <th>Permiso</th>
              {roles.map((r) => <th key={r.id} className={`center ${dirty.has(r.id) ? 'dirty' : ''}`}>{r.name}{r.is_system && <small> (sistema)</small>}</th>)}
            </tr>
          </thead>
          <tbody>
            {modules.map(([mod, perms]) => (
              <Fragment key={mod}>
                <tr className="group-row">
                  <td>Módulo <code>{mod}</code></td>
                  {roles.map((r) => {
                    const all = perms.every((p) => r.is_system || grants[r.id]?.has(p.id));
                    return (
                      <td key={r.id} className="center">
                        <button className="link-btn" disabled={r.is_system || !editable}
                                onClick={() => setMany(r, perms.map((p) => p.id), !all)}>{all ? 'quitar todos' : 'marcar todos'}</button>
                      </td>
                    );
                  })}
                </tr>
                {perms.map((p) => (
                  <tr key={p.id}>
                    <td><div>{p.description}</div><code className="perm">{p.code}</code></td>
                    {roles.map((r) => (
                      <td key={r.id} className="center">
                        <input type="checkbox" checked={r.is_system || !!grants[r.id]?.has(p.id)}
                               disabled={r.is_system || !editable}
                               onChange={(e) => setMany(r, [p.id], e.target.checked)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
