import { useEffect, useState } from 'react';
import { api, errorText } from '../../core/api';
import { useToast } from '../../shared/feedback';
import { useApiList } from '../../shared/hooks';
import { Badge, ErrorBox, Loading, PageHeader } from '../../shared/ui';
import { API, type Step, type StepKind, type Template } from './types';

type Draft = Omit<Template, 'id'> & { id: number | null };
const blank = (): Draft => ({ id: null, name: '', description: '', icon: '◆', is_active: true, steps: [{ name: 'Alcance', kind: 'fase', weight: 1, description: '' }] });

export default function TemplatesPage() {
  const toast = useToast();
  const { rows, loading, error, reload } = useApiList<Template>(`${API}/plantillas`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!draft && rows.length) setDraft(structuredClone(rows[0]));
  }, [rows, draft]);

  const setStep = (i: number, patch: Partial<Step>) =>
    setDraft((d) => d && { ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...d, steps };
    });

  const save = async () => {
    if (!draft) return;
    setErr('');
    const body = { name: draft.name, description: draft.description, icon: draft.icon, is_active: draft.is_active, steps: draft.steps };
    try {
      const saved = draft.id
        ? await api.put<Template>(`${API}/plantillas/${draft.id}`, body)
        : await api.post<Template>(`${API}/plantillas`, body);
      toast.ok('Plantilla guardada.');
      await reload();
      setDraft(structuredClone(saved));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const remove = async () => {
    if (!draft?.id || !window.confirm(`¿Eliminar la plantilla «${draft.name}»? Los proyectos ya creados conservan sus etapas.`)) return;
    try {
      await api.del(`${API}/plantillas/${draft.id}`);
      toast.ok('Plantilla eliminada.');
      setDraft(null);
      await reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const totalW = draft?.steps.filter((s) => s.kind !== 'hito').reduce((a, s) => a + Math.max(1, s.weight), 0) || 1;

  return (
    <div>
      <PageHeader title="Plantillas de proyecto" subtitle="Definen las etapas estándar que se generan al crear un proyecto. El peso indica qué parte del plazo ocupa cada paso (los hitos duran 1 día)."
        actions={<button className="btn dark" onClick={() => { setErr(''); setDraft(blank()); }}>+ Nueva plantilla</button>} />
      {error && <ErrorBox text={error} />}
      {loading ? <Loading /> : (
        <div className="split">
          <div className="card list-panel">
            {rows.map((t) => (
              <button key={t.id} className={`list-item ${draft?.id === t.id ? 'on' : ''}`} onClick={() => { setErr(''); setDraft(structuredClone(t)); }}>
                <b>{t.icon} {t.name}</b><span className="muted">{t.steps.length} pasos</span>
                {!t.is_active && <Badge kind="off">Inactiva</Badge>}
              </button>
            ))}
          </div>
          {draft && (
            <div className="card">
              <div className="form-grid">
                <label>Nombre<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
                <label>Ícono<input value={draft.icon} maxLength={4} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} /></label>
                <label className="full">Cuándo usarla<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
                <label className="check full"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />Disponible al crear proyectos</label>
              </div>
              <table className="table steps">
                <thead><tr><th>#</th><th>Orden</th><th>Paso</th><th>Tipo</th><th>Peso</th><th>% plazo</th><th>Descripción</th><th /></tr></thead>
                <tbody>
                  {draft.steps.map((s, i) => (
                    <tr key={i} className={`kind-${s.kind}`}>
                      <td>{i + 1}</td>
                      <td className="nowrap"><button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0}>▲</button><button className="icon-btn" onClick={() => move(i, 1)} disabled={i === draft.steps.length - 1}>▼</button></td>
                      <td><input className="cell" value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} /></td>
                      <td><select value={s.kind} onChange={(e) => setStep(i, { kind: e.target.value as StepKind })}><option value="fase">Fase</option><option value="gate">◆ Gate</option><option value="hito">◆ Hito</option></select></td>
                      <td><input className="cell xs" type="number" min={1} value={s.weight} disabled={s.kind === 'hito'} onChange={(e) => setStep(i, { weight: Number(e.target.value) })} /></td>
                      <td className="muted">{s.kind === 'hito' ? '1 día' : `${Math.round((Math.max(1, s.weight) / totalW) * 100)}%`}</td>
                      <td><input className="cell" value={s.description} onChange={(e) => setStep(i, { description: e.target.value })} /></td>
                      <td><button className="icon-btn danger" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn block dashed" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { name: '', kind: 'fase', weight: 1, description: '' }] })}>+ Agregar paso</button>
              {err && <ErrorBox text={err} />}
              <div className="actions-row">
                {draft.id && <button className="btn danger" onClick={remove}>Eliminar</button>}
                {draft.id && <button className="btn" onClick={() => setDraft({ ...draft, id: null, name: `${draft.name} (copia)` })}>Duplicar</button>}
                <button className="btn dark" onClick={save}>Guardar plantilla</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
