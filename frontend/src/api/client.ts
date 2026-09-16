export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response (e.g. a network proxy error page).
  }

  if (!response.ok) {
    const errorPayload = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(
      response.status,
      errorPayload.error || 'request_failed',
      errorPayload.message || 'خطا در ارتباط با سرور.'
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, options: ApiOptions = {}) => request<T>(path, options),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body })
};

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.statusCode === 401;
}

export function downloadGeojson(data: unknown, suggestedName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/geo+json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}
