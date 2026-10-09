import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api, errorText } from '../../core/api';
import { useAuth } from '../../core/auth';
import { Link, navigate, useQuery } from '../../core/router';
import { useToast } from '../../shared/feedback';
import { useApiItem } from '../../shared/hooks';
import { Modal } from '../../shared/Modal';
import { Badge, ErrorBox, Loading, PageHeader, Progress } from '../../shared/ui';
import { Gantt, type GanttLink, type GanttRow, type Scale } from './Gantt';
import { API, DEP_LABEL, HEALTH, KIND_LABEL, STATUS_LABEL, ddmm, type DepA, type ProjectDetail, type StageA } from './types';

export function stageTip(s: StageA, byId: Map<number, StageA>): ReactNode {
  const cause = s.cause_id ? byId.get(s.cause_id) : null;
  return (
    <>
      <b>{s.name}</b> <span className="t-muted">· {KIND_LABEL[s.kind]} · {STATUS_LABEL[s.status]} {s.status === 'en_curso' ? `${s.progress}%` : ''}</span><br />
      Plan: {ddmm(s.start_date)} → {ddmm(s.end_date)}
      {(s.planned_start !== s.start_date || s.planned_end !== s.end_date) && <span className="t-muted"> · línea base {ddmm(s.planned_start)} → {ddmm(s.planned_end)}</span>}<br />
      {s.status !== 'completada' && (
        <>Proyección: {ddmm(s.forecast_start)} → {ddmm(s.forecast_end)} {s.delay_days > 0 ? <span className="t-red">(+{s.delay_days} d)</span> : <span className="t-ok">(en fecha)</span>}<br />
          Holgura: {s.float_days === null ? '—' : s.float_days > 0 ? `${s.float_days} d sin mover el fin del proyecto` : <span className="t-red">sin holgura (crítica)</span>}<br /></>
      )}
      {cause && <><span className="t-red">Causa: «{cause.name}»</span><br /></>}
      {s.flags.map((f, i) => <div key={i} className={f.sev === 'alta' ? 't-red' : 't-amb'}>{f.sev === 'alta' ? '⛔' : '⚠'} {f.text}</div>)}
    </>
  );
}

export function depState(d: DepA, a?: StageA, b?: StageA): 'ok' | 'propaga' | 'conflicto' {
  if (d.propagating) return 'propaga';
  if (b?.flags.some((f) => f.code === 'plan_inconsistente' && a && f.text.includes(`«${a.name}»`))) return 'conflicto';
  return 'ok';
}

export default function ProjectDetailPage() {
  const id = useQuery().get('id');
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('portfolio.editar');
  const { data: p, loading, error, reload } = useApiItem<ProjectDetail>(id ? `${API}/proyectos/${id}` : null);
  const [scale, setScale] = useState<Scale>('semana');
  const [showBaseline, setShowBaseline] = useState(true);
  const [showCritical, setShowCritical] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const byId = useMemo(() => new Map((p?.stages ?? []).map((s) => [s.id, s])), [p]);

  if (!id) return <ErrorBox text="Falta el proyecto." />;
  if (loading) return <Loading />;
  if (error || !p) return <ErrorBox text={error ?? 'Proyecto no encontrado.'} />;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.ok(ok);
      await reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const saveStage = (s: StageA, patch: Partial<StageA>) => {
    const n = { ...s, ...patch };
    return run(() => api.put(`${API}/proyectos/${p.id}/etapas/${s.id}`, {
      status: n.status, progress: n.progress, start_date: n.start_date, end_date: n.end_date, name: n.name, kind: n.kind,
    }));
  };

  const rows: GanttRow[] = p.stages.map((s) => ({
    id: String(s.id), label: s.name, sub: `${ddmm(s.start_date)}–${ddmm(s.end_date)}`, depth: 0,
    kind: s.kind, color: p.color, start: s.start_date, end: s.end_date,
    planned: [s.planned_start, s.planned_end], forecast: s.status === 'completada' ? undefined : [s.forecast_start, s.forecast_end],
    progress: s.progress, state: s.state, critical: s.critical, editable: editable && s.status !== 'completada',
    badge: s.state === 'atrasada' ? <Badge kind="error">{s.late_days ? `+${s.late_days} d` : 'demorada'}</Badge>
      : s.state === 'en_riesgo' ? <Badge kind="warn">{s.delay_days ? `+${s.delay_days} d` : 'riesgo'}</Badge>
      : s.state === 'completada' ? <Badge kind="off">✓</Badge> : undefined,
    tip: stageTip(s, byId),
  }));
  const links: GanttLink[] = p.deps.map((d) => {
    const a = byId.get(d.depends_on_id), b = byId.get(d.stage_id);
    const st = depState(d, a, b);
    return {
      id: String(d.id), from: String(d.depends_on_id), to: String(d.stage_id), type: d.dep_type, state: st,
      tip: <><b>«{b?.name}»</b> depende de <b>«{a?.name}»</b><br />{DEP_LABEL[d.dep_type]}{d.lag_days ? ` · desfase ${d.lag_days} d` : ''}<br />
        {st === 'propaga' ? <span className="t-red">El atraso de «{a?.name}» se está trasladando a «{b?.name}».</span>
          : st === 'conflicto' ? <span className="t-amb">Las fechas planificadas no respetan esta dependencia.</span>
          : <span className="t-ok">Sin impacto.</span>}</>,
    };
  });

  const h = HEALTH[p.health];
  const alta = p.alerts.filter((a) => a.sev === 'alta').length;

  return (
    <div>
      <PageHeader
        title={p.name}
        subtitle={<><Link to="/portfolio/proyectos" className="link">← Proyectos</Link> · {p.template_name ?? 'Sin plantilla'} · Responsable: {p.owner_name ?? '—'}</>}
        actions={editable && (
          <>
            <button className="btn" onClick={() => setAdding(true)}>+ Tarea / hito</button>
            <button className="btn" title="Cada etapa depende (Fin→Inicio) de la anterior"
                    onClick={() => window.confirm('Se reemplazan las dependencias: cada etapa dependerá de la anterior. ¿Continuar?') &&
                      run(() => api.post(`${API}/proyectos/${p.id}/dependencias/encadenar`), 'Etapas encadenadas en orden.')}>⛓ Encadenar en orden</button>
            <button className="btn" title="El plan vigente pasa a ser el comprometido"
                    onClick={() => window.confirm('El plan vigente pasará a ser la nueva línea base (y el fin comprometido si se extendió). ¿Continuar?') &&
                      run(() => api.post(`${API}/proyectos/${p.id}/linea-base`), 'Nueva línea base fijada.')}>Fijar línea base</button>
          </>
        )}
      />

      <div className="kpis">
        <div className={`kpi ${p.health}`}><span>Salud</span><b><Badge kind={h.kind}>{h.label}</Badge></b></div>
        <div className="kpi"><span>Avance</span><Progress value={p.progress} /></div>
        <div className="kpi"><span>Etapa actual</span><b>{p.current_stage ?? '—'}</b></div>
        <div className={`kpi ${p.slip_days ? 'rojo' : ''}`}><span>Fin comprometido → proyectado</span>
          <b>{ddmm(p.end_date)} → {ddmm(p.projected_end)} {p.slip_days > 0 && <em className="t-red">+{p.slip_days} d</em>}</b></div>
        {p.golive && <div className={`kpi ${p.golive.delay_days ? 'rojo' : ''}`}><span>{p.golive.name}</span>
          <b>{ddmm(p.golive.planned)} → {ddmm(p.golive.forecast)} {p.golive.delay_days > 0 && <em className="t-red">+{p.golive.delay_days} d</em>}</b></div>}
        <div className={`kpi ${alta ? 'rojo' : p.alerts.length ? 'ambar' : ''}`}><span>Alertas</span><b>{p.alerts.length}{alta ? ` (${alta} altas)` : ''}</b></div>
      </div>

      <section className={`card risk-panel ${p.alerts.length ? '' : 'ok'}`}>
        <h3>{p.alerts.length ? '⚠ Riesgos detectados' : '✓ Sin riesgos detectados'} <span className="muted">· al {ddmm(p.today)}</span></h3>
        {p.alerts.length === 0 && <p className="muted">Todas las etapas están en fecha y sus dependencias se cumplen.</p>}
        {p.alerts.map((a, i) => (
          <div key={i} className={`risk ${a.sev}`} onClick={() => a.stage_id && setSelected(a.stage_id)}>
            <span className="risk-ico">{a.sev === 'alta' ? '⛔' : '⚠'}</span>
            <span>{a.text}</span>
            <span className="risk-kind">{a.kind.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </section>

      <div className="g-toolbar">
        <div className="seg">
          {(['dia', 'semana', 'mes'] as Scale[]).map((s) => <button key={s} className={scale === s ? 'on' : ''} onClick={() => setScale(s)}>{s === 'dia' ? 'Días' : s === 'semana' ? 'Semanas' : 'Meses'}</button>)}
        </div>
        <label className="check"><input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} /> Línea base</label>
        <label className="check"><input type="checkbox" checked={showCritical} onChange={(e) => setShowCritical(e.target.checked)} /> Ruta crítica</label>
        {editable && <span className="muted">Arrastrá una barra para moverla o sus bordes para estirarla: el riesgo se recalcula al soltar.</span>}
      </div>
      <Gantt rows={rows} links={links} today={p.today} scale={scale} showBaseline={showBaseline} showCritical={showCritical}
             selected={selected ? String(selected) : null}
             onRowClick={(sid) => setSelected(Number(sid))}
             onChange={editable ? (sid, start, end) => { const s = byId.get(Number(sid)); if (s) void saveStage(s, { start_date: start, end_date: end }); } : undefined} />
      <GanttLegend />

      <StagesTable p={p} editable={editable} selected={selected} onSelect={setSelected} saveStage={saveStage} run={run} />

      {adding && <AddStageModal p={p} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void reload(); }} />}
      <p className="muted small">¿Querés ver todos los proyectos juntos? <a className="link" href="/portfolio/cronograma" onClick={(e) => { e.preventDefault(); navigate('/portfolio/cronograma'); }}>Abrir el cronograma</a>.</p>
    </div>
  );
}

export function GanttLegend() {
  return (
    <div className="g-legend">
      <span><i className="lg-bar" /> Plan vigente (relleno = % de avance)</span>
      <span><i className="lg-base" /> Línea base</span>
      <span><i className="lg-hatch" /> Atraso proyectado</span>
      <span><i className="lg-shift" /> Nueva ubicación proyectada</span>
      <span><i className="lg-late" /> Atrasada (causa)</span>
      <span><i className="lg-risk" /> En riesgo</span>
      <span><i className="lg-crit" /> Ruta crítica</span>
      <span><b className="t-red">→</b> Dependencia que propaga atraso</span>
      <span><b style={{ color: '#9ca3af' }}>→</b> Dependencia sin impacto</span>
      <span>◆ Hito / gate</span>
    </div>
  );
}

function StagesTable({ p, editable, selected, onSelect, saveStage, run }: {
  p: ProjectDetail; editable: boolean; selected: number | null; onSelect: (id: number) => void;
  saveStage: (s: StageA, patch: Partial<StageA>) => Promise<void>; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
}) {
  const byId = new Map(p.stages.map((s) => [s.id, s]));
  const depsOf = (sid: number) => p.deps.filter((d) => d.stage_id === sid);
  return (
    <section className="card">
      <h3>Etapas, tareas e hitos</h3>
      <div className="table-wrap">
        <table className="table stages">
          <thead><tr><th>#</th><th>Etapa y señales de riesgo</th><th>Estado</th><th>%</th><th>Inicio</th><th>Fin</th><th>Depende de</th><th>Proyección</th><th>Holgura</th><th /></tr></thead>
          <tbody>
            {p.stages.map((s) => (
              <tr key={s.id} className={`${s.state} ${selected === s.id ? 'sel' : ''}`} onClick={() => onSelect(s.id)}>
                <td>{s.position}</td>
                <td className="stage-name">
                  <b>{s.name}</b> <span className="muted small">{KIND_LABEL[s.kind]}</span>
                  {s.baseline_variance !== 0 && <div className="muted small">línea base {ddmm(s.planned_start)}–{ddmm(s.planned_end)} ({s.baseline_variance > 0 ? '+' : ''}{s.baseline_variance} d)</div>}
                  {s.flags.map((f, i) => <div key={i} className={`flag ${f.sev === 'alta' ? 't-red' : 't-amb'}`}>{f.sev === 'alta' ? '⛔' : '⚠'} {f.text}</div>)}
                </td>
                <td>
                  <select disabled={!editable} value={s.status} onChange={(e) => void saveStage(s, { status: e.target.value, progress: e.target.value === 'en_curso' ? Math.max(1, s.progress) : s.progress })}>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td><input className="cell xs" type="number" min={0} max={99} disabled={!editable || s.status !== 'en_curso'} defaultValue={s.progress}
                           key={`${s.id}-${s.progress}`} onBlur={(e) => Number(e.target.value) !== s.progress && void saveStage(s, { progress: Number(e.target.value) })} /></td>
                <td><input className="cell" type="date" disabled={!editable} value={s.start_date} onChange={(e) => e.target.value && void saveStage(s, { start_date: e.target.value })} /></td>
                <td><input className="cell" type="date" disabled={!editable} value={s.end_date} onChange={(e) => e.target.value && void saveStage(s, { end_date: e.target.value })} /></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="dep-cell">
                    {depsOf(s.id).map((d) => (
                      <span key={d.id} className={`dep-chip ${d.propagating ? 'red' : ''}`} title={`${DEP_LABEL[d.dep_type]}${d.lag_days ? `, desfase ${d.lag_days} d` : ''}`}>
                        {editable ? (
                          <select value={d.dep_type} onChange={(e) => void run(() => api.put(`${API}/proyectos/${p.id}/dependencias/${d.id}`, { dep_type: e.target.value, lag_days: d.lag_days }))}>
                            <option value="FS">FS</option><option value="SS">SS</option><option value="FF">FF</option>
                          </select>
                        ) : <b>{d.dep_type}</b>}
                        {byId.get(d.depends_on_id)?.name}
                        {editable ? (
                          <input className="lag" type="number" title="Desfase en días (+ espera, − solapamiento)" defaultValue={d.lag_days} key={`${d.id}-${d.lag_days}`}
                                 onBlur={(e) => Number(e.target.value) !== d.lag_days && void run(() => api.put(`${API}/proyectos/${p.id}/dependencias/${d.id}`, { dep_type: d.dep_type, lag_days: Number(e.target.value) }))} />
                        ) : d.lag_days ? <em>{d.lag_days > 0 ? '+' : ''}{d.lag_days}d</em> : null}
                        {editable && <i onClick={() => void run(() => api.del(`${API}/proyectos/${p.id}/dependencias/${d.id}`))}>✕</i>}
                      </span>
                    ))}
                    {editable && (
                      <select className="dep-add" title="Agregar dependencia" value="" onChange={(e) => e.target.value && void run(() => api.post(`${API}/proyectos/${p.id}/dependencias`, { stage_id: s.id, depends_on_id: Number(e.target.value), dep_type: 'FS', lag_days: 0 }))}>
                        <option value="">＋</option>
                        {p.stages.filter((x) => x.id !== s.id && !depsOf(s.id).some((d) => d.depends_on_id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.position}. {x.name}</option>)}
                      </select>
                    )}
                  </div>
                </td>
                <td className="nowrap">{s.status === 'completada' ? <span className="muted">—</span>
                  : s.delay_days > 0 ? <b className="t-red">{ddmm(s.forecast_end)} (+{s.delay_days} d)</b> : <span className="t-ok">en fecha</span>}</td>
                <td className="nowrap">{s.float_days === null ? '—' : s.float_days <= 0 ? <b className="t-red">crítica</b> : `${s.float_days} d`}</td>
                <td>{editable && <button className="icon-btn danger" title="Eliminar etapa (sus dependencias se reconectan)"
                  onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar «${s.name}»? Las etapas que dependían de ella pasan a depender de sus anteriores.`)) void run(() => api.del(`${API}/proyectos/${p.id}/etapas/${s.id}`), 'Etapa eliminada.'); }}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        <b>FS</b> empieza cuando termina la anterior · <b>SS</b> empieza cuando empieza · <b>FF</b> termina cuando termina.
        El número junto a cada dependencia es el desfase en días (positivo = espera, negativo = solapamiento).
      </p>
    </section>
  );
}

function AddStageModal({ p, onClose, onSaved }: { p: ProjectDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const last = p.stages[p.stages.length - 1];
  const [v, setV] = useState({ name: '', kind: 'fase', start_date: p.today, end_date: p.today, after: last ? String(last.id) : '', dep: last ? String(last.id) : '' });
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`${API}/proyectos/${p.id}/etapas`, {
        name: v.name, kind: v.kind, start_date: v.start_date, end_date: v.kind === 'hito' ? v.start_date : v.end_date,
        after_stage_id: v.after ? Number(v.after) : null, depends_on_id: v.dep ? Number(v.dep) : null,
      });
      toast.ok('Etapa agregada.');
      onSaved();
    } catch (ex) {
      setErr(errorText(ex));
    }
  };
  return (
    <Modal title="Agregar tarea o hito" onClose={onClose}
           footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn dark" form="add-stage">Agregar</button></>}>
      <form id="add-stage" className="form-grid" onSubmit={submit}>
        <label className="full">Nombre<input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></label>
        <label>Tipo<select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="fase">Fase / tarea</option><option value="gate">◆ Gate (aprobación)</option><option value="hito">◆ Hito (1 día)</option></select></label>
        <label>Ubicar después de<select value={v.after} onChange={(e) => setV({ ...v, after: e.target.value, dep: e.target.value })}>
          <option value="">Al final</option>{p.stages.map((s) => <option key={s.id} value={s.id}>{s.position}. {s.name}</option>)}</select></label>
        <label>Inicio<input type="date" required value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} /></label>
        {v.kind !== 'hito' && <label>Fin<input type="date" required value={v.end_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} /></label>}
        <label className="full">Depende de (Fin → Inicio)<select value={v.dep} onChange={(e) => setV({ ...v, dep: e.target.value })}>
          <option value="">Ninguna</option>{p.stages.map((s) => <option key={s.id} value={s.id}>{s.position}. {s.name}</option>)}</select>
          <small className="muted">Las etapas que vienen después no se reconectan solas: revisá sus dependencias en la tabla.</small></label>
        {err && <div className="full"><ErrorBox text={err} /></div>}
      </form>
    </Modal>
  );
}
