import { useState } from 'react';
import { Link, navigate } from '../../core/router';
import { useApiList } from '../../shared/hooks';
import { Badge, ErrorBox, Loading, PageHeader, Progress } from '../../shared/ui';
import { API, HEALTH, ddmm, type ProjectDetail } from './types';

const ORDER = { rojo: 0, ambar: 1, verde: 2, cerrado: 3 } as const;

export default function RisksPage() {
  const { rows, loading, error } = useApiList<ProjectDetail>(`${API}/analisis`);
  const [sev, setSev] = useState<'' | 'alta' | 'media'>('');
  if (loading) return <Loading />;
  if (error) return <ErrorBox text={error} />;

  const projects = [...rows].sort((a, b) => ORDER[a.health] - ORDER[b.health] || b.slip_days - a.slip_days);
  const alerts = projects.flatMap((p) => p.alerts.map((a) => ({ ...a, p })))
    .filter((a) => !sev || a.sev === sev)
    .sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'alta' ? -1 : 1));
  const nA = projects.reduce((n, p) => n + p.alerts.filter((a) => a.sev === 'alta').length, 0);
  const nM = projects.reduce((n, p) => n + p.alerts.filter((a) => a.sev === 'media').length, 0);

  return (
    <div>
      <PageHeader title="Riesgos del portfolio"
        subtitle={<>Se recalculan con el estado de cada etapa al día de hoy ({ddmm(projects[0]?.today)}). Una alerta explica la <b>causa</b>, qué etapas <b>arrastra</b> y cuánto se mueve el <b>fin del proyecto</b>.</>} />

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Proyecto</th><th>Salud</th><th>Avance</th><th>Etapa actual</th><th>Fin comprometido</th><th>Fin proyectado</th><th>GO-LIVE proyectado</th><th>Alertas</th></tr></thead>
          <tbody>
            {projects.length === 0 && <tr><td colSpan={8} className="muted center">No hay proyectos.</td></tr>}
            {projects.map((p) => (
              <tr key={p.id} className="click" onClick={() => navigate(`/portfolio/proyecto?id=${p.id}`)}>
                <td><span className="proj-name"><i style={{ background: p.color }} />{p.name}</span><div className="muted small">{p.owner_name ?? 'Sin responsable'}</div></td>
                <td><Badge kind={HEALTH[p.health].kind}>{HEALTH[p.health].label}</Badge></td>
                <td style={{ width: 120 }}><Progress value={p.progress} /></td>
                <td>{p.current_stage ?? '—'}</td>
                <td>{ddmm(p.end_date)}</td>
                <td>{p.slip_days > 0 ? <b className="t-red">{ddmm(p.projected_end)} (+{p.slip_days} d)</b> : <span className="t-ok">{ddmm(p.projected_end)}</span>}</td>
                <td>{p.golive ? (p.golive.delay_days > 0 ? <b className="t-red">{ddmm(p.golive.forecast)} (+{p.golive.delay_days} d)</b> : ddmm(p.golive.forecast)) : '—'}</td>
                <td>{p.alerts.length ? <Badge kind={p.alerts.some((a) => a.sev === 'alta') ? 'error' : 'warn'}>{p.alerts.length}</Badge> : <span className="t-ok">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card risk-panel" style={{ marginTop: 16 }}>
        <div className="page-head" style={{ marginBottom: 8 }}>
          <h3>Alertas ({nA} altas · {nM} medias)</h3>
          <div className="seg">
            {([['', 'Todas'], ['alta', 'Altas'], ['media', 'Medias']] as const).map(([k, l]) => <button key={k} className={sev === k ? 'on' : ''} onClick={() => setSev(k)}>{l}</button>)}
          </div>
        </div>
        {alerts.length === 0 && <p className="muted">Sin alertas.</p>}
        {alerts.map((a, i) => (
          <div key={i} className={`risk ${a.sev}`}>
            <span className="risk-ico">{a.sev === 'alta' ? '⛔' : '⚠'}</span>
            <span><Link to={`/portfolio/proyecto?id=${a.p.id}`} className="link"><b>{a.p.name}</b></Link> — {a.text}</span>
            <span className="risk-kind">{a.kind.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </section>

      <section className="card how">
        <h3>Cómo se detecta un riesgo</h3>
        <ul>
          <li><b>Atrasada (causa):</b> la etapa pasó su fecha de fin y no está completada, o debió empezar y sigue pendiente.</li>
          <li><b>Se corre en cadena:</b> el atraso se traslada por las dependencias a las etapas siguientes; se informa cuántos días y por culpa de qué etapa.</li>
          <li><b>Holgura:</b> días que una etapa puede atrasarse sin mover el fin comprometido. Si es 0, la etapa es <b>crítica</b>.</li>
          <li><b>Ritmo insuficiente:</b> con el % cargado y el tiempo transcurrido, la etapa terminaría después de su fecha (aviso anticipado, antes de que se atrase).</li>
          <li><b>Sin avance / por vencer / bloqueada:</b> señales tempranas para actuar antes de que el atraso se propague.</li>
          <li><b>Plan inconsistente:</b> las fechas cargadas no respetan las dependencias.</li>
        </ul>
      </section>
    </div>
  );
}
