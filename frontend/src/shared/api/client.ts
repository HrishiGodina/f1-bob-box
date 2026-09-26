export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}
