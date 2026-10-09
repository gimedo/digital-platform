import { useMemo, useState } from 'react';
import { navigate } from '../../core/router';
import { useApiList } from '../../shared/hooks';
import { Badge, ErrorBox, Loading, PageHeader } from '../../shared/ui';
import { Gantt, type GanttLink, type GanttRow, type Scale } from './Gantt';
import { GanttLegend, depState, stageTip } from './ProjectDetailPage';
import { API, HEALTH, ddmm, type Health, type ProjectDetail } from './types';

export default function SchedulePage() {
  const { rows: projects, loading, error } = useApiList<ProjectDetail>(`${API}/analisis`);
  const [scale, setScale] = useState<Scale>('mes');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [health, setHealth] = useState<'' | Health>('');
  const [owner, setOwner] = useState('');
  const [showBaseline, setShowBaseline] = useState(false);

  const owners = useMemo(() => [...new Set(projects.map((p) => p.owner_name).filter(Boolean))] as string[], [projects]);
  const list = projects.filter((p) =>
    (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (!health || p.health === health) && (!owner || p.owner_name === owner));

  const { rows, links } = useMemo(() => {
    const rows: GanttRow[] = [];
    const links: GanttLink[] = [];
    list.forEach((p) => {
      const h = HEALTH[p.health];
      rows.push({
        id: `p${p.id}`, label: p.name, sub: `${p.owner_name ?? 'Sin responsable'} · ${p.current_stage ?? ''}`, depth: 0, kind: 'proyecto',
        color: p.color, start: p.start_date, end: p.end_date, forecast: [p.start_date, p.projected_end], progress: p.progress,
        state: p.health === 'rojo' ? 'atrasada' : p.health === 'ambar' ? 'en_riesgo' : p.health === 'cerrado' ? 'completada' : 'ok',
        expandable: p.stages.length > 0, expanded: open.has(p.id),
        badge: <Badge kind={h.kind}>{p.slip_days ? `+${p.slip_days} d` : h.label}</Badge>,
        tip: <><b>{p.name}</b><br />Comprometido: {ddmm(p.start_date)} → {ddmm(p.end_date)}<br />
          Proyectado: {ddmm(p.projected_end)} {p.slip_days > 0 ? <span className="t-red">(+{p.slip_days} d)</span> : <span className="t-ok">(en fecha)</span>}<br />
          Avance {p.progress}% · etapa actual: {p.current_stage ?? '—'}<br />
          {p.alerts.slice(0, 3).map((a, i) => <div key={i} className={a.sev === 'alta' ? 't-red' : 't-amb'}>{a.sev === 'alta' ? '⛔' : '⚠'} {a.text}</div>)}
          <span className="t-muted">Clic para abrir el proyecto.</span></>,
      });
      if (open.has(p.id)) {
        const byId = new Map(p.stages.map((s) => [s.id, s]));
        p.stages.forEach((s) => rows.push({
          id: `s${s.id}`, label: s.name, sub: `${ddmm(s.start_date)}–${ddmm(s.end_date)}`, depth: 1, kind: s.kind, color: p.color,
          start: s.start_date, end: s.end_date, planned: [s.planned_start, s.planned_end],
          forecast: s.status === 'completada' ? undefined : [s.forecast_start, s.forecast_end],
          progress: s.progress, state: s.state, critical: s.critical, tip: stageTip(s, byId),
          badge: s.state === 'atrasada' ? <Badge kind="error">atrasada</Badge> : s.state === 'en_riesgo' ? <Badge kind="warn">riesgo</Badge> : undefined,
        }));
        p.deps.forEach((d) => links.push({
          id: `d${d.id}`, from: `s${d.depends_on_id}`, to: `s${d.stage_id}`, type: d.dep_type,
          state: depState(d, byId.get(d.depends_on_id), byId.get(d.stage_id)),
          tip: <>«{byId.get(d.stage_id)?.name}» depende de «{byId.get(d.depends_on_id)?.name}» ({d.dep_type})</>,
        }));
      }
    });
    return { rows, links };
  }, [list, open]);

  const counts = projects.reduce((a, p) => ({ ...a, [p.health]: (a[p.health] ?? 0) + 1 }), {} as Record<string, number>);
  const today = projects[0]?.today ?? new Date().toISOString().slice(0, 10);

  if (loading) return <Loading />;
  if (error) return <ErrorBox text={error} />;
  return (
    <div>
      <PageHeader title="Cronograma del portfolio"
        subtitle="Todos los proyectos en una línea de tiempo. Desplegá un proyecto (▸) para ver sus etapas y dependencias; clic en el nombre para abrirlo." />
      <div className="chips summary">
        {(['rojo', 'ambar', 'verde', 'cerrado'] as Health[]).map((k) => (
          <button key={k} className={`sum-chip ${k} ${health === k ? 'on' : ''}`} onClick={() => setHealth(health === k ? '' : k)}>
            <b>{counts[k] ?? 0}</b> {HEALTH[k].label}
          </button>
        ))}
      </div>
      <div className="g-toolbar">
        <input className="search" placeholder="Buscar proyecto…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Todos los responsables</option>{owners.map((o) => <option key={o}>{o}</option>)}
        </select>
        <div className="seg">
          {(['dia', 'semana', 'mes'] as Scale[]).map((s) => <button key={s} className={scale === s ? 'on' : ''} onClick={() => setScale(s)}>{s === 'dia' ? 'Días' : s === 'semana' ? 'Semanas' : 'Meses'}</button>)}
        </div>
        <button className="btn sm" onClick={() => setOpen(new Set(list.map((p) => p.id)))}>Desplegar todo</button>
        <button className="btn sm" onClick={() => setOpen(new Set())}>Contraer todo</button>
        <label className="check"><input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} /> Línea base</label>
      </div>
      {list.length === 0 ? <div className="empty-state"><p>No hay proyectos para mostrar.</p></div> : (
        <Gantt rows={rows} links={links} today={today} scale={scale} showBaseline={showBaseline} showCritical={false}
               onToggle={(rid) => { const n = Number(rid.slice(1)); setOpen((o) => { const x = new Set(o); if (x.has(n)) x.delete(n); else x.add(n); return x; }); }}
               onRowClick={(rid) => { if (rid.startsWith('p')) navigate(`/portfolio/proyecto?id=${rid.slice(1)}`); }} />
      )}
      <GanttLegend />
    </div>
  );
}
