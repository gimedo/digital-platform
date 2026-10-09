export const API = '/m/portfolio';

export type StepKind = 'fase' | 'gate' | 'hito';
export type Step = { id?: number; name: string; kind: StepKind; weight: number; description: string };
export type Template = { id: number; name: string; description: string; icon: string; is_active: boolean; steps: Step[] };

export type Health = 'verde' | 'ambar' | 'rojo' | 'cerrado';
export type Flag = { code: string; sev: 'alta' | 'media'; text: string };
export type Alert = { sev: 'alta' | 'media'; kind: string; stage_id: number | null; text: string };

export type StageA = {
  id: number; position: number; name: string; kind: StepKind; status: string; progress: number;
  start_date: string; end_date: string; planned_start: string; planned_end: string;
  forecast_start: string; forecast_end: string; delay_days: number; late_days: number; baseline_variance: number;
  float_days: number | null; critical: boolean; cause_id: number | null;
  state: 'ok' | 'en_riesgo' | 'atrasada' | 'completada'; flags: Flag[];
};
export type DepA = { id: number; stage_id: number; depends_on_id: number; dep_type: 'FS' | 'SS' | 'FF'; lag_days: number; propagating: boolean };

export type Project = {
  id: number; name: string; description: string; template_id: number | null; template_name: string | null;
  owner_id: number | null; owner_name: string | null; start_date: string; end_date: string; color: string;
  priority: string; status: string; progress: number; stages_count: number; current_stage: string | null;
  health: Health; projected_end: string; slip_days: number; overdue: boolean;
  golive: { name: string; planned: string; forecast: string; delay_days: number } | null;
  alerts_count: number; alerts_high: number;
};
export type ProjectDetail = Project & { today: string; alerts: Alert[]; stages: StageA[]; deps: DepA[] };

export const KIND_LABEL: Record<StepKind, string> = { fase: 'Fase', gate: '◆ Gate', hito: '◆ Hito' };
export const STATUS_LABEL: Record<string, string> = { pendiente: '○ Pendiente', en_curso: '◉ En curso', completada: '✓ Completada' };
export const HEALTH: Record<Health, { kind: 'ok' | 'warn' | 'error' | 'off'; label: string }> = {
  verde: { kind: 'ok', label: 'En término' },
  ambar: { kind: 'warn', label: 'En riesgo' },
  rojo: { kind: 'error', label: 'Atrasado' },
  cerrado: { kind: 'off', label: 'Cerrado' },
};
export const DEP_LABEL = { FS: 'Fin → Inicio', SS: 'Inicio → Inicio', FF: 'Fin → Fin' } as const;

export function ddmm(iso?: string | null): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
