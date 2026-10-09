/**
 * Página ABM genérica configurable. Un ABM nuevo = columnas + campos + endpoint.
 * GET {endpoint} · POST {endpoint} · PUT {endpoint}/{id} · DELETE {endpoint}/{id}
 */
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api, errorText } from '../core/api';
import { useAuth } from '../core/auth';
import { DataTable, type ColumnDef } from './DataTable';
import { useToast } from './feedback';
import { FormField, type FieldDef } from './FormField';
import { useApiList } from './hooks';
import { Modal } from './Modal';
import { ErrorBox, Loading, PageHeader } from './ui';

type Values = Record<string, unknown>;

export type RowAction<T> = { label: string; onClick: (row: T, reload: () => void) => void; show?: (row: T) => boolean; always?: boolean };

type Props<T extends { id: number }> = {
  title: string;
  subtitle?: ReactNode;
  endpoint: string;
  columns: ColumnDef<T>[];
  fields: FieldDef[];
  emptyValues: Values;
  editPermission?: string;            // sin este permiso la página es de solo lectura
  entityLabel?: string;               // "usuario", "rol"… para los mensajes
  searchKeys?: (keyof T & string)[];
  toForm?: (row: T) => Values;
  toPayload?: (values: Values, isNew: boolean) => unknown;
  canDelete?: (row: T) => boolean;
  canEdit?: (row: T) => boolean;
  rowActions?: RowAction<T>[];
  extraActions?: (reload: () => void) => ReactNode;
  editNote?: ReactNode;               // aviso que se muestra al editar
};

export function CrudPage<T extends { id: number }>(p: Props<T>) {
  const { can } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useApiList<T>(p.endpoint);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ row: T | null; values: Values } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const editable = !p.editPermission || can(p.editPermission);
  const label = p.entityLabel ?? 'registro';

  const filtered = useMemo(() => {
    if (!q || !p.searchKeys?.length) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => p.searchKeys!.some((k) => String(r[k] ?? '').toLowerCase().includes(s)));
  }, [rows, q, p.searchKeys]);

  const open = (row: T | null) => {
    setFormError('');
    const values = row ? (p.toForm ? p.toForm(row) : { ...(row as unknown as Values) }) : { ...p.emptyValues };
    setEditing({ row, values });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFormError('');
    const isNew = !editing.row;
    const payload = p.toPayload ? p.toPayload(editing.values, isNew) : editing.values;
    try {
      if (isNew) await api.post(p.endpoint, payload);
      else await api.put(`${p.endpoint}/${editing.row!.id}`, payload);
      toast.ok(isNew ? `Se creó el ${label}.` : `Se guardaron los cambios.`);
      setEditing(null);
      void reload();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: T) => {
    if (!window.confirm(`¿Eliminar este ${label}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.del(`${p.endpoint}/${row.id}`);
      toast.ok(`Se eliminó el ${label}.`);
      void reload();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const isNew = !editing?.row;
  const visibleFields = p.fields.filter((f) => isNew || !f.createOnly);

  return (
    <div>
      <PageHeader
        title={p.title}
        subtitle={p.subtitle}
        actions={
          <>
            {p.searchKeys?.length ? (
              <input className="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            ) : null}
            {p.extraActions?.(() => void reload())}
            {editable && <button className="btn dark" onClick={() => open(null)}>+ Nuevo</button>}
          </>
        }
      />
      {error && <ErrorBox text={error} />}
      {loading ? <Loading /> : (
        <DataTable
          columns={p.columns}
          rows={filtered}
          rowKey={(r) => r.id}
          actions={(r) => (
            <>
              {p.rowActions?.filter((a) => (a.always || editable) && (!a.show || a.show(r))).map((a) => (
                <button key={a.label} className="btn sm" onClick={() => a.onClick(r, () => void reload())}>{a.label}</button>
              ))}
              {editable && (!p.canEdit || p.canEdit(r)) && <button className="btn sm" onClick={() => open(r)}>Editar</button>}
              {editable && (!p.canDelete || p.canDelete(r)) && <button className="btn sm danger" onClick={() => remove(r)}>Eliminar</button>}
            </>
          )}
        />
      )}
      {editing && (
        <Modal
          title={isNew ? `Nuevo ${label}` : `Editar ${label}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn dark" type="submit" form="crud-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </>
          }
        >
          <form id="crud-form" className="form-grid" onSubmit={save}>
            {visibleFields.map((f) => (
              <FormField key={f.name} f={f} values={editing.values}
                         onChange={(n, v) => setEditing((s) => s && { ...s, values: { ...s.values, [n]: v } })} />
            ))}
            {!isNew && p.editNote && <div className="full note">{p.editNote}</div>}
            {formError && <div className="full"><ErrorBox text={formError} /></div>}
          </form>
        </Modal>
      )}
    </div>
  );
}
