"""Reglas de negocio del módulo Portfolio (sin dependencia de FastAPI ni de la base).

analyze() es el motor de riesgo. Para cada etapa calcula:
  · fecha proyectada (forecast): dónde va a caer realmente según el estado de hoy y sus dependencias
  · desvío: cuántos días se corre respecto del plan vigente
  · holgura: cuántos días puede atrasarse sin mover la fecha de fin comprometida del proyecto
  · causa: qué etapa atrasada está empujando a esta (siguiendo la cadena de dependencias)
  · señales tempranas: ritmo insuficiente, sin avance, por vencer, bloqueada, plan inconsistente
Y para el proyecto: fin proyectado, desvío, salud (verde/ámbar/rojo) y alertas.
"""
from collections import defaultdict
from datetime import date, timedelta
from math import ceil

from app.modules.portfolio.models import Stage, StageDep, TemplateStep

DONE, PROG, PEND = "completada", "en_curso", "pendiente"
DUE_SOON_DAYS = 3        # "por vencer": termina en 3 días o menos con poco avance
PACE_TOLERANCE = 2       # días de tolerancia antes de avisar "ritmo insuficiente"
HIGH_SEVERITY_DAYS = 7   # más de 7 días de atraso/desvío = alerta alta
D1 = timedelta(days=1)


# ---------------------------------------------------------------- generación de etapas
def build_stages(project_id: int, steps: list[TemplateStep], start: date, end: date) -> list[Stage]:
    """Reparte el plazo del proyecto entre las etapas según su peso.
    Los hitos duran 1 día; el resto del plazo se reparte entre fases y gates proporcionalmente.
    La línea base (planned_*) arranca igual al plan."""
    ordered = sorted(steps, key=lambda x: x.position)
    total_days = max(1, (end - start).days + 1)
    milestones = sum(1 for s in ordered if s.kind == "hito")
    spread_days = max(1, total_days - milestones)
    total_w = sum(max(1, s.weight) for s in ordered if s.kind != "hito") or 1
    stages, cursor = [], 0
    for i, s in enumerate(ordered):
        if s.kind == "hito":
            length = 1
        elif i == len(ordered) - 1:
            length = max(1, total_days - cursor)
        else:
            length = max(1, round(spread_days * max(1, s.weight) / total_w))
        remaining_after = len(ordered) - i - 1
        length = max(1, min(length, total_days - cursor - remaining_after)) if cursor < total_days else 1
        st = start + timedelta(days=min(cursor, total_days - 1))
        en = start + timedelta(days=min(cursor + length - 1, total_days - 1))
        cursor += length
        stages.append(Stage(project_id=project_id, position=i + 1, name=s.name, kind=s.kind,
                            start_date=st, end_date=en, planned_start=st, planned_end=en))
    if stages and stages[-1].kind != "hito":
        stages[-1].end_date = stages[-1].planned_end = end
    return stages


def chain_deps(project_id: int, stages: list[Stage]) -> list[StageDep]:
    """Encadena las etapas en orden: cada una depende (Fin→Inicio) de la anterior."""
    ordered = sorted(stages, key=lambda s: (s.position, s.id or 0))
    return [StageDep(project_id=project_id, stage_id=b.id, depends_on_id=a.id, dep_type="FS", lag_days=0)
            for a, b in zip(ordered, ordered[1:])]


def remap_dates(stages: list[Stage], old_start: date, old_end: date, new_start: date, new_end: date) -> None:
    """Replanifica las etapas cuando cambian las fechas del proyecto (y fija nueva línea base)."""
    old_len = max(1, (old_end - old_start).days)
    new_len = max(0, (new_end - new_start).days)

    def f(d: date) -> date:
        return new_start + timedelta(days=round((d - old_start).days * new_len / old_len))

    for s in stages:
        a, b = f(s.start_date), f(s.end_date)
        s.start_date, s.end_date = a, max(a, b)
        s.planned_start, s.planned_end = s.start_date, s.end_date


def would_create_cycle(deps: list[StageDep], stage_id: int, depends_on_id: int) -> bool:
    """True si agregar 'stage_id depende de depends_on_id' genera un ciclo."""
    if stage_id == depends_on_id:
        return True
    preds = defaultdict(set)
    for d in deps:
        preds[d.stage_id].add(d.depends_on_id)
    stack, seen = [depends_on_id], set()
    while stack:
        cur = stack.pop()
        if cur == stage_id:
            return True
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(preds[cur])
    return False


def weighted_progress(stages: list[Stage]) -> int:
    if not stages:
        return 0
    total = sum((s.end_date - s.start_date).days + 1 for s in stages)
    done = sum(((s.end_date - s.start_date).days + 1) * (100 if s.status == DONE else s.progress) for s in stages)
    return round(done / max(1, total))


# ---------------------------------------------------------------- motor de riesgo
def _topo(stages: list[Stage], deps: list[StageDep]) -> list[Stage]:
    rank = {s.id: i for i, s in enumerate(stages)}
    indeg = {s.id: 0 for s in stages}
    succ = defaultdict(list)
    for d in deps:
        indeg[d.stage_id] += 1
        succ[d.depends_on_id].append(d.stage_id)
    ready = sorted((i for i, n in indeg.items() if n == 0), key=rank.get)
    by, out = {s.id: s for s in stages}, []
    while ready:
        i = ready.pop(0)
        out.append(by[i])
        for j in succ[i]:
            indeg[j] -= 1
            if indeg[j] == 0:
                ready.append(j)
                ready.sort(key=rank.get)
    out += [s for s in stages if s not in out]   # protección ante ciclos
    return out


def _fmt(d: date) -> str:
    return d.strftime("%d/%m")


def analyze(project, stages: list[Stage], deps: list[StageDep], today: date | None = None) -> dict:
    today = today or date.today()
    st = sorted(stages, key=lambda s: (s.position, s.id))
    by = {s.id: s for s in st}
    deps = [d for d in deps if d.stage_id in by and d.depends_on_id in by]
    preds, succs = defaultdict(list), defaultdict(list)
    for d in deps:
        preds[d.stage_id].append(d)
        succs[d.depends_on_id].append(d)
    order = _topo(st, deps)

    # --- pasada hacia adelante: fechas proyectadas
    F: dict[int, dict] = {}
    for s in order:
        dur = (s.end_date - s.start_date).days
        if s.status == DONE:
            F[s.id] = {"fs": s.start_date, "fe": s.end_date, "driver": None, "self": None}
            continue
        fs, driver, self_cause = s.start_date, None, None
        if s.status == PEND:
            for d in preds[s.id]:
                q, lag = F[d.depends_on_id], d.lag_days or 0
                cand = (q["fe"] + timedelta(days=1 + lag) if d.dep_type == "FS"
                        else q["fs"] + timedelta(days=lag) if d.dep_type == "SS" else None)
                if cand and cand > fs:
                    fs, driver = cand, d.depends_on_id
            if fs < today:              # debió empezar y no empezó, sin una anterior que lo explique
                fs, self_cause = today, "no_iniciada"
        fe = max(fs + timedelta(days=dur), today)
        if s.status == PROG and s.end_date < today:
            self_cause = "atrasada"
        for d in preds[s.id]:
            if d.dep_type == "FF":
                cand = F[d.depends_on_id]["fe"] + timedelta(days=d.lag_days or 0)
                if cand > fe:
                    fe, driver = cand, d.depends_on_id
        if s.status == PEND and s.end_date < today and not driver:
            self_cause = "atrasada"
        F[s.id] = {"fs": fs, "fe": fe, "driver": driver, "self": self_cause}

    # --- pasada hacia atrás: holgura contra la fecha de fin comprometida
    deadline = project.end_date
    LF: dict[int, date] = {}
    for s in reversed(order):
        dur = timedelta(days=(F[s.id]["fe"] - F[s.id]["fs"]).days)
        lim = deadline
        for d in succs[s.id]:
            if d.stage_id not in LF:
                continue
            nxt_lf = LF[d.stage_id]
            nxt_ls = nxt_lf - timedelta(days=(F[d.stage_id]["fe"] - F[d.stage_id]["fs"]).days)
            lag = timedelta(days=d.lag_days or 0)
            cand = (nxt_ls - D1 - lag if d.dep_type == "FS" else nxt_ls - lag + dur if d.dep_type == "SS"
                    else nxt_lf - lag)
            lim = min(lim, cand)
        LF[s.id] = lim

    def root_of(sid: int) -> int | None:
        seen = set()
        cur = sid
        while cur is not None and cur not in seen:
            seen.add(cur)
            nxt = F[cur]["driver"]
            if nxt is None:
                return cur
            cur = nxt
        return cur

    # --- señales por etapa
    out_stages, alerts = [], []
    for s in st:
        f = F[s.id]
        done = s.status == DONE
        delay = 0 if done else max(0, (f["fe"] - s.end_date).days)
        late_days = (today - s.end_date).days if (not done and s.end_date < today) else 0
        float_days = None if done else (LF[s.id] - f["fe"]).days
        flags: list[dict] = []

        if late_days:
            flags.append({"code": "atrasada", "sev": "alta" if late_days > HIGH_SEVERITY_DAYS else "media",
                          "text": f"Atrasada {late_days} d: debía terminar el {_fmt(s.end_date)} y está "
                                  f"{'sin iniciar' if s.status == PEND else f'al {s.progress}%'}."})
        elif f["self"] == "no_iniciada":
            days = (today - s.start_date).days
            flags.append({"code": "no_iniciada", "sev": "media",
                          "text": f"Debió iniciar el {_fmt(s.start_date)} ({days} d) y sigue pendiente."})

        cause_id = None
        if not done and delay > 0 and f["driver"] is not None:
            cause_id = root_of(s.id)
            c = by.get(cause_id)
            flags.append({"code": "impactada", "sev": "alta" if delay > HIGH_SEVERITY_DAYS else "media",
                          "text": f"Se corre +{delay} d ({_fmt(s.start_date)}–{_fmt(s.end_date)} → "
                                  f"{_fmt(f['fs'])}–{_fmt(f['fe'])}) por el atraso de «{c.name if c else '?'}»."})

        if s.status == PEND and s.start_date <= today:
            blockers = [by[d.depends_on_id] for d in preds[s.id]
                        if d.dep_type == "FS" and by[d.depends_on_id].status != DONE]
            if blockers:
                flags.append({"code": "bloqueada", "sev": "media",
                              "text": "Bloqueada: espera que termine " + ", ".join(f"«{b.name}»" for b in blockers) + "."})

        if s.status == PROG and not late_days:
            elapsed = (today - s.start_date).days + 1
            dur = (s.end_date - s.start_date).days + 1
            if s.progress > 0 and elapsed > 0:
                pace_end = s.start_date + timedelta(days=ceil(elapsed * 100 / s.progress) - 1)
                if pace_end > s.end_date + timedelta(days=PACE_TOLERANCE):
                    extra = (pace_end - s.end_date).days
                    flags.append({"code": "ritmo", "sev": "alta" if extra > HIGH_SEVERITY_DAYS else "media",
                                  "text": f"Ritmo insuficiente: va {s.progress}% con {round(elapsed * 100 / dur)}% "
                                          f"del plazo usado. A este ritmo terminaría el {_fmt(pace_end)} (+{extra} d)."})
            elif s.progress == 0 and dur > 2 and elapsed > dur * 0.3:
                flags.append({"code": "sin_avance", "sev": "media",
                              "text": f"Sin avance registrado con {round(elapsed * 100 / dur)}% del plazo usado."})
            left = (s.end_date - today).days
            if 0 <= left <= DUE_SOON_DAYS and s.progress < 80:
                flags.append({"code": "por_vencer", "sev": "media",
                              "text": f"Vence en {left} d y va al {s.progress}%."})

        for d in preds[s.id]:
            q = by[d.depends_on_id]
            bad = ((d.dep_type == "FS" and s.start_date <= q.end_date and not done)
                   or (d.dep_type == "SS" and s.start_date < q.start_date and not done)
                   or (d.dep_type == "FF" and s.end_date < q.end_date and not done))
            if bad:
                flags.append({"code": "plan_inconsistente", "sev": "media",
                              "text": f"Plan inconsistente: depende de «{q.name}» ({d.dep_type}) pero sus fechas se superponen."})

        if not done and float_days is not None and float_days < 0 and not any(x["code"] in ("atrasada", "impactada") for x in flags):
            flags.append({"code": "sin_holgura", "sev": "media",
                          "text": f"Supera la fecha de fin comprometida del proyecto por {-float_days} d."})

        if done:
            state = "completada"
        elif late_days or f["self"] == "no_iniciada":
            state = "atrasada"
        elif flags:
            state = "en_riesgo"
        else:
            state = "ok"

        out_stages.append({
            "id": s.id, "position": s.position, "name": s.name, "kind": s.kind, "status": s.status,
            "progress": 100 if done else s.progress,
            "start_date": s.start_date, "end_date": s.end_date,
            "planned_start": s.planned_start or s.start_date, "planned_end": s.planned_end or s.end_date,
            "forecast_start": f["fs"], "forecast_end": f["fe"],
            "delay_days": delay, "late_days": late_days,
            "baseline_variance": ((s.end_date - s.planned_end).days if s.planned_end else 0),
            "float_days": float_days, "critical": (float_days is not None and float_days <= 0),
            "cause_id": cause_id, "state": state, "flags": flags,
        })

    # --- proyecto
    projected_end = max([F[s.id]["fe"] for s in st] + [project.end_date]) if st else project.end_date
    slip = max(0, (projected_end - project.end_date).days)
    finished = bool(st) and all(s.status == DONE for s in st)
    overdue = (not finished) and project.end_date < today
    milestones = [x for x in out_stages if x["kind"] == "hito"]
    golive = next((x for x in reversed(milestones) if "live" in x["name"].lower()), milestones[-1] if milestones else None)
    roots = [x for x in out_stages if x["state"] == "atrasada"]
    impacted = [x for x in out_stages if any(fl["code"] == "impactada" for fl in x["flags"])]
    current = next((x for x in out_stages if x["status"] == PROG), None) or next(
        (x for x in out_stages if x["status"] != DONE), None)

    if finished or project.status == "cerrado":
        health = "cerrado"
    elif overdue or slip > HIGH_SEVERITY_DAYS or any(f["sev"] == "alta" for x in out_stages for f in x["flags"]):
        health = "rojo"
    elif slip > 0 or any(x["flags"] for x in out_stages):
        health = "ambar"
    else:
        health = "verde"

    if roots or slip > 0 or overdue:
        parts = []
        if overdue:
            parts.append(f"Proyecto vencido hace {(today - project.end_date).days} d.")
        if roots:
            r = roots[0]
            parts.append(f"Causa: «{r['name']}» " + (f"atrasada {r['late_days']} d" if r["late_days"] else "no iniciada a tiempo")
                         + (f" (+{len(roots) - 1} etapa/s más)" if len(roots) > 1 else "") + ".")
        elif impacted and impacted[0]["cause_id"] in by:
            c = by[impacted[0]["cause_id"]]
            late_vs_base = (c.end_date - c.planned_end).days if (c.planned_end and c.status == DONE) else 0
            parts.append(f"Causa: «{c.name}» " + (f"terminó el {_fmt(c.end_date)}, {late_vs_base} d después de lo planificado."
                                                   if late_vs_base > 0 else "se extendió más de lo previsto."))
        if impacted:
            names = ", ".join(x["name"] for x in impacted[:3]) + (f" y {len(impacted) - 3} más" if len(impacted) > 3 else "")
            parts.append(f"Corre en cadena: {names}.")
        if golive and golive["delay_days"] > 0:
            parts.append(f"GO-LIVE {_fmt(golive['end_date'])} ➜ {_fmt(golive['forecast_end'])} (+{golive['delay_days']} d).")
        if slip > 0:
            parts.append(f"Fin comprometido {_fmt(project.end_date)} ➜ {_fmt(projected_end)} (+{slip} d).")
        elif roots and not overdue:
            parts.append("Por ahora la holgura absorbe el atraso: el fin del proyecto no se mueve.")
        alerts.append({"sev": "alta" if health == "rojo" else "media", "kind": "atraso_en_cadena",
                       "stage_id": roots[0]["id"] if roots else None, "text": " ".join(parts)})
    for x in out_stages:
        for fl in x["flags"]:
            if fl["code"] in ("ritmo", "sin_avance", "por_vencer", "plan_inconsistente", "sin_holgura", "bloqueada"):
                if fl["code"] == "bloqueada" and roots:
                    continue   # ya está explicado en la alerta de atraso en cadena
                alerts.append({"sev": fl["sev"], "kind": fl["code"], "stage_id": x["id"], "text": f"«{x['name']}»: {fl['text']}"})

    return {
        "today": today,
        "projected_end": projected_end,
        "slip_days": slip,
        "overdue": overdue,
        "health": health,
        "progress": weighted_progress(st),
        "current_stage": current["name"] if current else ("Finalizado" if finished else None),
        "golive": ({"name": golive["name"], "planned": golive["end_date"], "forecast": golive["forecast_end"],
                    "delay_days": golive["delay_days"]} if golive else None),
        "alerts": alerts,
        "stages": out_stages,
        "deps": [{"id": d.id, "stage_id": d.stage_id, "depends_on_id": d.depends_on_id, "dep_type": d.dep_type,
                  "lag_days": d.lag_days or 0,
                  "propagating": (F[d.depends_on_id]["fe"] > by[d.depends_on_id].end_date
                                  and by[d.stage_id].status != DONE and F[d.stage_id]["driver"] == d.depends_on_id)}
                 for d in deps],
    }
