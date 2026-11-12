import { tg } from './telegram';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const initData = tg?.initData;
  if (initData) headers.Authorization = `tma ${initData}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method || (body ? 'POST' : 'GET'),
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Internet aloqasini tekshiring');
  }
  if (res.status === 401 && onUnauthorized) onUnauthorized();
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code || 'HTTP_' + res.status, e?.message || 'Xatolik yuz berdi', e?.details);
  }
  return data as T;
}

export const get = <T = any>(path: string) => api<T>(path);
export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const patch = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

export function upload<T = any>(path: string, file: File, field = 'file') {
  const form = new FormData();
  form.append(field, file);
  return api<T>(path, { method: 'POST', form });
}

/** Query-string yasash: bo'sh qiymatlar tashlab yuboriladi */
export function qs(params: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
}
