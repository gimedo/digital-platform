import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../core/api';

/** Carga una lista desde la API con estado de carga/error y función de recarga. */
export function useApiList<T>(path: string | null) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setRows(await api.get<T[]>(path));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, setRows, loading, error, reload };
}

/** Carga un objeto desde la API. */
export function useApiItem<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api.get<T>(path));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loading, error, reload };
}

export function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const d = v.length === 10 ? new Date(v + 'T00:00:00') : new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('es-PY');
}

export function fmtDateTime(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' });
}
