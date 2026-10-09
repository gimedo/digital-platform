import { api, errorText } from '../core/api';
import { useAuth } from '../core/auth';
import { modules as frontendModules } from '../modules';
import { useToast } from '../shared/feedback';
import { fmtDateTime, useApiList } from '../shared/hooks';
import { Badge, ErrorBox, Loading, PageHeader } from '../shared/ui';

type Mod = { code: string; name: string; version: string; is_active: boolean; status: string; last_error: string | null; loaded_at: string | null };

export default function ModulesPage() {
  const { reload: reloadAuth } = useAuth();
  const toast = useToast();
  const { rows, loading, error, reload } = useApiList<Mod>('/sistema/modulos');
  const front = new Set(['core', ...frontendModules.map((m) => m.code)]);

  const toggle = async (m: Mod) => {
    if (m.is_active && !window.confirm(`¿Desactivar «${m.name}»? Sus menús y su API dejan de estar disponibles hasta reactivarlo.`)) return;
    try {
      await api.put(`/sistema/modulos/${m.code}`, { is_active: !m.is_active });
      toast.ok(m.is_active ? 'Módulo desactivado.' : 'Módulo activado.');
      await reload();
      await reloadAuth();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div>
      <PageHeader title="Módulos" subtitle="Cada módulo se carga aislado. Si uno falla al iniciar, queda marcado con error y el resto sigue funcionando. Desactivar un módulo no requiere reiniciar." />
      {error && <ErrorBox text={error} />}
      {loading ? <Loading /> : (
        <div className="module-grid">
          {rows.map((m) => (
            <div key={m.code} className={`card module ${m.status !== 'ok' ? 'bad' : ''}`}>
              <div className="module-head">
                <div><b>{m.name}</b><div className="muted"><code>{m.code}</code> · v{m.version}</div></div>
                <div className="chips">
                  {m.status === 'ok' ? <Badge kind="ok">Cargado</Badge> : m.status === 'error' ? <Badge kind="error">Error al cargar</Badge> : <Badge kind="warn">No encontrado</Badge>}
                  {m.is_active ? <Badge kind="dark">Activo</Badge> : <Badge kind="off">Desactivado</Badge>}
                  {!front.has(m.code) && <Badge kind="warn">Sin páginas en frontend</Badge>}
                </div>
              </div>
              <div className="muted">Último arranque: {fmtDateTime(m.loaded_at)}</div>
              {m.last_error && <details><summary>Ver detalle del error</summary><pre>{m.last_error}</pre></details>}
              {m.code !== 'core' && (
                <button className={`btn ${m.is_active ? '' : 'dark'}`} onClick={() => toggle(m)}>{m.is_active ? 'Desactivar' : 'Activar'}</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
