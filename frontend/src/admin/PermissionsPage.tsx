import { useMemo } from 'react';
import { DataTable } from '../shared/DataTable';
import { useApiList } from '../shared/hooks';
import { ErrorBox, Loading, PageHeader } from '../shared/ui';

type Perm = { id: number; code: string; description: string; module_code: string };

export default function PermissionsPage() {
  const { rows, loading, error } = useApiList<Perm>('/seguridad/permisos');
  const groups = useMemo(() => {
    const m = new Map<string, Perm[]>();
    rows.forEach((p) => m.set(p.module_code, [...(m.get(p.module_code) ?? []), p]));
    return [...m.entries()];
  }, [rows]);
  return (
    <div>
      <PageHeader title="Permisos" subtitle="Catálogo de solo lectura. Cada módulo declara sus permisos en su manifiesto y se registran solos al iniciar la API." />
      {error && <ErrorBox text={error} />}
      {loading ? <Loading /> : groups.map(([mod, perms]) => (
        <section key={mod} className="card">
          <h3>Módulo <code>{mod}</code> <span className="muted">· {perms.length} permisos</span></h3>
          <DataTable rows={perms} rowKey={(p) => p.id} columns={[
            { key: 'code', label: 'Código', render: (p) => <code className="perm">{p.code}</code>, width: '40%' },
            { key: 'description', label: 'Descripción' },
          ]} />
        </section>
      ))}
    </div>
  );
}
