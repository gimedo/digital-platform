import { api, errorText } from '../../core/api';
import { useAuth } from '../../core/auth';
import { navigate } from '../../core/router';
import { CrudPage } from '../../shared/CrudPage';
import { useToast } from '../../shared/feedback';
import { useApiList } from '../../shared/hooks';
import { Badge, Loading, Progress } from '../../shared/ui';
import { API, HEALTH, ddmm, type Project, type Template } from './types';

const PRIORITY = [{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'baja', label: 'Baja' }];
const STATUS = [{ value: 'planificado', label: 'Planificado' }, { value: 'en_curso', label: 'En curso' }, { value: 'cerrado', label: 'Cerrado' }];

export default function ProjectsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const templates = useApiList<Template>(`${API}/plantillas`);
  const owners = useApiList<{ id: number; name: string }>(`${API}/responsables`);
  const today = new Date().toISOString().slice(0, 10);

  if (templates.loading || owners.loading) return <Loading />;
  return (
    <CrudPage<Project>
      title="Proyectos"
      subtitle="Al crear un proyecto con plantilla, sus etapas se generan y se encadenan solas. Abrí un proyecto para ver su Gantt, dependencias y riesgos."
      endpoint={`${API}/proyectos`}
      entityLabel="proyecto"
      editPermission="portfolio.editar"
      searchKeys={['name', 'owner_name', 'template_name']}
      columns={[
        { key: 'name', label: 'Proyecto', render: (p) => <span className="proj-name"><i style={{ background: p.color }} />{p.name}</span> },
        { key: 'health', label: 'Salud', render: (p) => <Badge kind={HEALTH[p.health].kind}>{HEALTH[p.health].label}</Badge> },
        { key: 'owner_name', label: 'Responsable', render: (p) => p.owner_name ?? '—' },
        { key: 'current_stage', label: 'Etapa actual', render: (p) => p.current_stage ?? '—' },
        { key: 'progress', label: 'Avance', render: (p) => <Progress value={p.progress} />, width: '120px' },
        { key: 'end_date', label: 'Fin comprometido → proyectado', render: (p) => <>{ddmm(p.end_date)} → {p.slip_days > 0 ? <b className="t-red">{ddmm(p.projected_end)} (+{p.slip_days} d)</b> : ddmm(p.projected_end)}</> },
        { key: 'alerts_count', label: 'Alertas', render: (p) => p.alerts_count ? <Badge kind={p.alerts_high ? 'error' : 'warn'}>{p.alerts_count}</Badge> : <span className="muted">—</span> },
      ]}
      fields={[
        { name: 'name', label: 'Nombre del proyecto', required: true, full: true },
        { name: 'template_id', label: 'Plantilla', type: 'select', createOnly: true, full: true,
          options: templates.rows.filter((t) => t.is_active).map((t) => ({ value: t.id, label: `${t.icon} ${t.name} (${t.steps.length} pasos)` })),
          help: 'Define las etapas estándar del proyecto. Se encadenan en orden (cada una depende de la anterior).' },
        { name: 'owner_id', label: 'Responsable', type: 'select', options: owners.rows.map((o) => ({ value: o.id, label: o.name })) },
        { name: 'priority', label: 'Prioridad', type: 'select', required: true, options: PRIORITY },
        { name: 'start_date', label: 'Inicio', type: 'date', required: true },
        { name: 'end_date', label: 'Fin comprometido', type: 'date', required: true },
        { name: 'status', label: 'Estado', type: 'select', required: true, options: STATUS },
        { name: 'color', label: 'Color', type: 'color' },
        { name: 'description', label: 'Descripción', type: 'textarea', full: true },
      ]}
      emptyValues={{ name: '', template_id: null, owner_id: null, priority: 'media', start_date: today, end_date: today, status: 'planificado', color: '#3b82f6', description: '' }}
      toForm={(p) => ({ name: p.name, owner_id: p.owner_id, priority: p.priority, start_date: p.start_date, end_date: p.end_date, status: p.status, color: p.color, description: p.description })}
      editNote="Si cambiás el inicio o el fin, las etapas se replanifican proporcionalmente y ese plan pasa a ser la nueva línea base."
      rowActions={[{ label: 'Abrir', always: true, onClick: (p) => navigate(`/portfolio/proyecto?id=${p.id}`) }]}
      extraActions={(reload) => can('portfolio.editar') && (
        <button className="btn" title="Crea un proyecto con etapas atrasadas para ver cómo se detectan los riesgos"
                onClick={async () => { try { await api.post(`${API}/ejemplo`); toast.ok('Proyecto de ejemplo creado.'); reload(); } catch (e) { toast.error(errorText(e)); } }}>
          Crear ejemplo
        </button>
      )}
    />
  );
}
