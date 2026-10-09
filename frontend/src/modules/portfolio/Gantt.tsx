/**
 * Gantt en SVG, sin librerías externas.
 * Muestra por fila: plan vigente, línea base, proyección (atraso) y avance; flechas de dependencia;
 * línea de HOY; hitos como rombos. Si se pasa onChange, las barras se pueden mover/estirar por día.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode } from 'react';

export type GanttRow = {
  id: string;
  label: string;
  sub?: string;
  depth: 0 | 1;
  kind: 'proyecto' | 'fase' | 'gate' | 'hito';
  color: string;
  start: string;
  end: string;
  planned?: [string, string];
  forecast?: [string, string];
  progress: number;
  state: 'ok' | 'en_riesgo' | 'atrasada' | 'completada';
  critical?: boolean;
  editable?: boolean;
  badge?: ReactNode;
  tip: ReactNode;
  expandable?: boolean;
  expanded?: boolean;
};
export type GanttLink = { id: string; from: string; to: string; type: 'FS' | 'SS' | 'FF'; state: 'ok' | 'propaga' | 'conflicto'; tip: ReactNode };
export type Scale = 'dia' | 'semana' | 'mes';

type Props = {
  rows: GanttRow[];
  links?: GanttLink[];
  today: string;
  scale: Scale;
  showBaseline?: boolean;
  showCritical?: boolean;
  selected?: string | null;
  onChange?: (id: string, start: string, end: string) => void;
  onRowClick?: (id: string) => void;
  onToggle?: (id: string) => void;
};

const ROW = 34, HEAD = 46, LABEL_W = 300;
const PX: Record<Scale, number> = { dia: 26, semana: 9, mes: 3.2 };
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const RED = '#dc2626', AMBER = '#d97706', GREY = '#9ca3af';

const toDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const toIso = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

type Drag = { id: string; mode: 'move' | 'start' | 'end'; x0: number; s0: number; e0: number; ds: number; de: number };

export function Gantt(p: Props) {
  const px = PX[p.scale];
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; node: ReactNode } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const { d0, d1 } = useMemo(() => {
    const all: number[] = [toDay(p.today)];
    p.rows.forEach((r) => {
      all.push(toDay(r.start), toDay(r.end));
      if (r.planned) all.push(toDay(r.planned[0]), toDay(r.planned[1]));
      if (r.forecast) all.push(toDay(r.forecast[0]), toDay(r.forecast[1]));
    });
    const lo = new Date(Math.min(...all) * 86400000), hi = new Date(Math.max(...all) * 86400000);
    const a = Math.round(Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth(), 1) / 86400000);
    const b = Math.round(Date.UTC(hi.getUTCFullYear(), hi.getUTCMonth() + 1, 0) / 86400000) + 1;
    return { d0: a, d1: b };
  }, [p.rows, p.today]);

  const width = Math.max(600, (d1 - d0) * px);

  // Al abrir (o cambiar la escala) se ubica la vista en HOY
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, (toDay(p.today) - d0) * px - el.clientWidth * 0.3);
  }, [p.scale, d0, px, p.today]);
  const height = HEAD + p.rows.length * ROW + 6;
  const X = (day: number) => (day - d0) * px;
  const idx = new Map(p.rows.map((r, i) => [r.id, i]));

  // ---- dates in effect (con vista previa del arrastre)
  const span = (r: GanttRow): [number, number] => {
    if (drag && drag.id === r.id) return [drag.s0 + drag.ds, drag.e0 + drag.de];
    return [toDay(r.start), toDay(r.end)];
  };

  // ---- cabecera
  const header: ReactNode[] = [];
  for (let d = d0; d < d1; d++) {
    const dt = new Date(d * 86400000);
    const dom = dt.getUTCDate(), dow = dt.getUTCDay();
    if (dom === 1) {
      header.push(<line key={`m${d}`} x1={X(d)} x2={X(d)} y1={0} y2={height} stroke="#d4d4d4" />);
      header.push(<text key={`mt${d}`} x={X(d) + 6} y={17} className="g-month">{MONTHS[dt.getUTCMonth()]} {dt.getUTCFullYear()}</text>);
    }
    if (p.scale === 'dia') {
      if (dow === 0 || dow === 6) header.push(<rect key={`w${d}`} x={X(d)} y={HEAD} width={px} height={height - HEAD} fill="#f5f5f4" />);
      header.push(<text key={`d${d}`} x={X(d) + px / 2} y={38} className="g-day" textAnchor="middle">{dom}</text>);
    } else if (p.scale === 'semana' && dow === 1) {
      header.push(<line key={`wl${d}`} x1={X(d)} x2={X(d)} y1={HEAD} y2={height} stroke="#f0f0ee" />);
      header.push(<text key={`wt${d}`} x={X(d) + 2} y={38} className="g-day">{dom}</text>);
    }
  }

  // ---- arrastre
  const startDrag = (e: RMouseEvent, r: GanttRow, mode: Drag['mode']) => {
    if (!p.onChange || !r.editable) return;
    e.preventDefault();
    e.stopPropagation();
    setTip(null);
    setDrag({ id: r.id, mode, x0: e.clientX, s0: toDay(r.start), e0: toDay(r.end), ds: 0, de: 0 });
  };
  const onMove = (e: RMouseEvent) => {
    if (!drag) return;
    const dd = Math.round((e.clientX - drag.x0) / px);
    let ds = 0, de = 0;
    if (drag.mode === 'move') ds = de = dd;
    else if (drag.mode === 'start') ds = Math.min(dd, drag.e0 - drag.s0);
    else de = Math.max(dd, drag.s0 - drag.e0);
    if (ds !== drag.ds || de !== drag.de) setDrag({ ...drag, ds, de });
    const box = wrap.current?.getBoundingClientRect();
    if (box) setTip({ x: e.clientX - box.left, y: e.clientY - box.top,
      node: <><b>{p.rows[idx.get(drag.id)!]?.label}</b><br />{ddmm(toIso(drag.s0 + ds))} → {ddmm(toIso(drag.e0 + de))} · {drag.e0 + de - drag.s0 - ds + 1} d</> });
  };
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    setTip(null);
    if ((d.ds !== 0 || d.de !== 0) && p.onChange) p.onChange(d.id, toIso(d.s0 + d.ds), toIso(d.e0 + d.de));
  };

  const showTip = (e: RMouseEvent, node: ReactNode) => {
    if (drag) return;
    const box = wrap.current?.getBoundingClientRect();
    if (box) setTip({ x: e.clientX - box.left, y: e.clientY - box.top, node });
  };

  // ---- barras
  const bars = p.rows.map((r, i) => {
    const y = HEAD + i * ROW;
    const [s, e] = span(r);
    const x1 = X(s), x2 = X(e + 1), w = Math.max(3, x2 - x1);
    const out: ReactNode[] = [];
    const sel = p.selected === r.id;
    if (sel) out.push(<rect key="sel" x={0} y={y} width={width} height={ROW} fill="#fef9c3" />);
    if (p.showBaseline && r.planned && (r.planned[0] !== r.start || r.planned[1] !== r.end)) {
      const b1 = X(toDay(r.planned[0])), b2 = X(toDay(r.planned[1]) + 1);
      out.push(<rect key="base" x={b1} y={y + ROW - 8} width={Math.max(3, b2 - b1)} height={4} rx={2} fill={GREY} />);
    }
    if (r.forecast && !(drag && drag.id === r.id)) {
      const fs = toDay(r.forecast[0]), fe = toDay(r.forecast[1]);
      if (fs > toDay(r.start) && r.kind !== 'hito') {
        out.push(<rect key="fsh" x={X(fs)} y={y + 7} width={Math.max(3, X(fe + 1) - X(fs))} height={16} rx={3}
                       fill="none" stroke={AMBER} strokeWidth={1.5} strokeDasharray="4 3" />);
      }
      if (fe > e) {
        out.push(<rect key="ext" x={x2} y={y + 9} width={X(fe + 1) - x2} height={12} fill="url(#g-hatch)" stroke={RED} strokeWidth={1} />);
        out.push(<text key="extt" x={X(fe + 1) + 4} y={y + 19} className="g-delay">+{fe - e} d</text>);
      }
    }
    const stroke = r.state === 'atrasada' ? RED : r.state === 'en_riesgo' ? AMBER : p.showCritical && r.critical ? '#111' : 'none';
    const dash = r.state === 'atrasada' ? '5 3' : undefined;
    const handlers = {
      onMouseMove: (ev: RMouseEvent) => showTip(ev, r.tip),
      onMouseLeave: () => !drag && setTip(null),
      onClick: () => p.onRowClick?.(r.id),
    };
    if (r.kind === 'hito' || r.kind === 'gate') {
      const cx = r.kind === 'hito' ? x1 + px / 2 : x1, cy = y + ROW / 2, k = 8;
      if (r.kind === 'gate' && w > 6) {
        out.push(<rect key="gbar" x={x1} y={y + 9} width={w} height={12} rx={2} fill={r.color} opacity={r.state === 'completada' ? 1 : 0.4}
                       stroke={stroke} strokeWidth={2} strokeDasharray={dash} />);
      }
      out.push(<path key="dia" d={`M${cx},${cy - k} L${cx + k},${cy} L${cx},${cy + k} L${cx - k},${cy}Z`}
                     fill={r.state === 'completada' ? '#111' : '#fff'} stroke={stroke === 'none' ? '#111' : stroke} strokeWidth={2}
                     className={p.onChange && r.editable ? 'g-drag' : 'g-bar'}
                     onMouseDown={(ev) => startDrag(ev, r, 'move')} {...handlers} />);
    } else if (r.kind === 'proyecto') {
      out.push(<rect key="pb" x={x1} y={y + 10} width={w} height={14} rx={3} fill={r.color} opacity={0.25} />);
      out.push(<rect key="pp" x={x1} y={y + 10} width={w * r.progress / 100} height={14} rx={3} fill={r.color} />);
      out.push(<rect key="po" x={x1} y={y + 10} width={w} height={14} rx={3} fill="transparent"
                     stroke={stroke === 'none' ? r.color : stroke} strokeWidth={1.5} strokeDasharray={dash} className="g-bar" {...handlers} />);
    } else {
      const op = r.state === 'completada' ? 1 : 0.38;
      out.push(<rect key="b" x={x1} y={y + 7} width={w} height={16} rx={3} fill={r.color} opacity={op} />);
      if (r.state !== 'completada' && r.progress > 0)
        out.push(<rect key="bp" x={x1} y={y + 7} width={w * r.progress / 100} height={16} rx={3} fill={r.color} />);
      if (p.showCritical && r.critical && r.state !== 'completada')
        out.push(<rect key="crit" x={x1} y={y + 24} width={w} height={3} fill="#111" />);
      out.push(<rect key="bo" x={x1} y={y + 7} width={w} height={16} rx={3} fill="transparent" stroke={stroke} strokeWidth={2}
                     strokeDasharray={dash} className={p.onChange && r.editable ? 'g-drag' : 'g-bar'}
                     onMouseDown={(ev) => startDrag(ev, r, 'move')} {...handlers} />);
      if (w > 34) out.push(<text key="pt" x={x1 + 5} y={y + 19} className="g-pct">{r.progress}%</text>);
      if (p.onChange && r.editable) {
        out.push(<rect key="h1" x={x1 - 3} y={y + 7} width={7} height={16} className="g-handle" onMouseDown={(ev) => startDrag(ev, r, 'start')} />);
        out.push(<rect key="h2" x={x2 - 4} y={y + 7} width={7} height={16} className="g-handle" onMouseDown={(ev) => startDrag(ev, r, 'end')} />);
      }
    }
    return <g key={r.id}>{out}</g>;
  });

  // ---- dependencias
  const linkEls = (p.links ?? []).map((l) => {
    const a = idx.get(l.from), b = idx.get(l.to);
    if (a === undefined || b === undefined) return null;
    const ra = p.rows[a], rb = p.rows[b];
    const [as, ae] = span(ra), [bs, be] = span(rb);
    const y1 = HEAD + a * ROW + ROW / 2, y2 = HEAD + b * ROW + ROW / 2;
    const xa = l.type === 'SS' ? X(as) : X(ae + 1);
    const xb = l.type === 'FF' ? X(be + 1) : X(bs) - (rb.kind === 'hito' ? -px / 2 + 9 : 1);
    let d: string;
    if (l.type === 'FF') {
      const xm = Math.max(xa, xb) + 10;
      d = `M${xa},${y1} H${xm} V${y2} H${xb + 2}`;
    } else if (xb - 12 >= xa) {
      d = `M${xa},${y1} H${xa + 6} V${y2} H${xb}`;
    } else {
      const ym = y2 > y1 ? y2 - ROW / 2 + 1 : y2 + ROW / 2 - 1;
      d = `M${xa},${y1} H${xa + 6} V${ym} H${xb - 10} V${y2} H${xb}`;
    }
    const col = l.state === 'propaga' ? RED : l.state === 'conflicto' ? AMBER : GREY;
    const mk = l.state === 'propaga' ? 'g-arr-red' : l.state === 'conflicto' ? 'g-arr-amb' : 'g-arr';
    return (
      <g key={l.id}>
        <path d={d} fill="none" stroke={col} strokeWidth={l.state === 'ok' ? 1.2 : 2} markerEnd={`url(#${mk})`} />
        <path d={d} fill="none" stroke="transparent" strokeWidth={9} className="g-link"
              onMouseMove={(ev) => showTip(ev, l.tip)} onMouseLeave={() => setTip(null)} />
      </g>
    );
  });

  const tday = toDay(p.today);
  return (
    <div className="gantt" ref={wrap} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
      <div className="g-labels" style={{ width: LABEL_W }}>
        <div className="g-lhead" style={{ height: HEAD }}>Etapa / proyecto</div>
        {p.rows.map((r) => (
          <div key={r.id} className={`g-lrow d${r.depth} ${p.selected === r.id ? 'sel' : ''}`} style={{ height: ROW }}
               onClick={() => p.onRowClick?.(r.id)} title={r.label}>
            {r.expandable ? (
              <button className="g-tog" onClick={(ev) => { ev.stopPropagation(); p.onToggle?.(r.id); }}>{r.expanded ? '▾' : '▸'}</button>
            ) : <span className="g-tog-sp" />}
            <i style={{ background: r.color }} className={`g-dot ${r.kind}`} />
            <span className="g-lname">{r.label}{r.sub && <small>{r.sub}</small>}</span>
            {r.badge}
          </div>
        ))}
      </div>
      <div className="g-scroll" ref={scroller}>
        <svg width={width} height={height} className={drag ? 'dragging' : ''}>
          <defs>
            <pattern id="g-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#fee2e2" /><line x1="0" y1="0" x2="0" y2="6" stroke={RED} strokeWidth="2" />
            </pattern>
            {[['g-arr', GREY], ['g-arr-red', RED], ['g-arr-amb', AMBER]].map(([id, c]) => (
              <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10z" fill={c} />
              </marker>
            ))}
          </defs>
          <rect x={0} y={0} width={width} height={HEAD} fill="#fafaf9" />
          {header}
          <line x1={0} x2={width} y1={HEAD} y2={HEAD} stroke="#e2e2e0" />
          {p.rows.map((_, i) => <line key={`r${i}`} x1={0} x2={width} y1={HEAD + (i + 1) * ROW} y2={HEAD + (i + 1) * ROW} stroke="#f2f2f0" />)}
          {tday >= d0 && tday < d1 && (
            <g>
              <rect x={X(tday)} y={HEAD} width={Math.max(2, px)} height={height - HEAD} fill="#111" opacity={0.06} />
              <line x1={X(tday) + px / 2} x2={X(tday) + px / 2} y1={HEAD - 4} y2={height} stroke="#111" strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={X(tday) + px / 2} y={HEAD - 6} textAnchor="middle" className="g-today">HOY</text>
            </g>
          )}
          {bars}
          {linkEls}
        </svg>
      </div>
      {tip && <div className="g-tip" style={{ left: tip.x + 360 > (wrap.current?.clientWidth ?? 0) ? Math.max(0, tip.x - 340) : tip.x + 14, top: tip.y + 14 }}>{tip.node}</div>}
    </div>
  );
}
