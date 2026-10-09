import { useState } from 'react';
import { DataTable } from '../shared/DataTable';
import { fmtDateTime, useApiList } from '../shared/hooks';
import { ErrorBox, Loading, PageHeader } from '../shared/ui';

type Row = { id: number; user_email: string | null; action: string; entity: string; entity_id: string | null; detail: Record<string, unknown> | null; created_at: string };

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const { rows, loading, error } = useApiList<Row>(`/sistema/auditoria?limit=300${entity ? `&entity=${encodeURIComponent(entity)}` : ''}`);
  const entities = ['', 'auth', 'user', 'role', 'menu', 'module', 'portfolio.project', 'portfolio.stage', 'portfolio.dependency', 'portfolio.template'];
  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Últimas acciones registradas en la plataforma."
        actions={<select value={entity} onChange={(e) => setEntity(e.target.value)}>{entities.map((x) => <option key={x} value={x}>{x || 'Todas las entidades'}</option>)}</select>} />
      {error && <ErrorBox text={error} />}
      {loading ? <Loading /> : (
        <DataTable rows={rows} rowKey={(r) => r.id} columns={[
          { key: 'created_at', label: 'Fecha', render: (r) => fmtDateTime(r.created_at), width: '150px' },
          { key: 'user_email', label: 'Usuario', render: (r) => r.user_email ?? '—' },
          { key: 'action', label: 'Acción', render: (r) => <code>{r.action}</code> },
          { key: 'entity', label: 'Entidad', render: (r) => <>{r.entity}{r.entity_id ? ` #${r.entity_id}` : ''}</> },
          { key: 'detail', label: 'Detalle', render: (r) => r.detail ? <code className="detail">{JSON.stringify(r.detail)}</code> : '' },
        ]} />
      )}
    </div>
  );
}
