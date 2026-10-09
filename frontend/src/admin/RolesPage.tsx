import { CrudPage } from '../shared/CrudPage';
import { Badge } from '../shared/ui';

type Role = { id: number; name: string; description: string; is_system: boolean };

export default function RolesPage() {
  return (
    <CrudPage<Role>
      title="Roles"
      subtitle="Solo el nombre y la descripción del rol. Los permisos se asignan en la «Matriz de accesos»."
      endpoint="/seguridad/roles"
      entityLabel="rol"
      editPermission="seguridad.roles.editar"
      searchKeys={['name', 'description']}
      columns={[
        { key: 'name', label: 'Rol', render: (r) => <b>{r.name}</b> },
        { key: 'description', label: 'Descripción' },
        { key: 'is_system', label: 'Tipo', render: (r) => r.is_system ? <Badge kind="dark">Sistema</Badge> : <Badge>Personalizado</Badge> },
      ]}
      fields={[
        { name: 'name', label: 'Nombre del rol', required: true, full: true },
        { name: 'description', label: 'Descripción', type: 'textarea', full: true },
      ]}
      emptyValues={{ name: '', description: '' }}
      toPayload={(v) => ({ name: v.name, description: v.description ?? '' })}
      canDelete={(r) => !r.is_system}
    />
  );
}
