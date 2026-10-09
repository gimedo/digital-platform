// Cliente HTTP único de la plataforma. Todos los módulos lo usan.
const TOKEN_KEY = 'dp_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const d = body?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) {
      return d
        .map((e: { msg?: string }) => (e.msg ?? '').replace(/^Value error, /, ''))
        .filter(Boolean)
        .join(' · ');
    }
  } catch {
    /* respuesta sin JSON */
  }
  return `Error ${res.status}`;
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.', 0);
  }

  if (res.status === 401 && path !== '/auth/login') {
    tokenStore.clear();
    window.dispatchEvent(new Event('dp:logout'));
  }
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  del: (path: string) => request<void>('DELETE', path),
};

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
