export class ApiClientError extends Error {
  public status: number;
  public code?: string;
  public details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    let message = 'Error en la petición';
    let code: string | undefined;
    let details: any;

    try {
      const body = await res.json();
      if (body?.error) {
        message = body.error.message || message;
        code = body.error.code;
        details = body.error.details;
      } else if (body?.message) {
        message = body.message;
        code = body.code;
      }
    } catch {
      // If it's not JSON, provide generic but useful messages based on status
      if (res.status === 404) message = 'Recurso no encontrado';
      else if (res.status === 403) message = 'Acceso denegado';
      else if (res.status === 401) message = 'No autenticado';
      else if (res.status >= 500) message = 'Error interno del servidor';
    }

    throw new ApiClientError(res.status, message, code, details);
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

export const apiClient = {
  async get<T>(url: string): Promise<T> {
    const res = await fetch(`/api${url}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    return handleResponse(res);
  },
  async post<T>(url: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    return handleResponse(res);
  },
  async patch<T>(url: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api${url}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    return handleResponse(res);
  },
};
