export const apiClient = {
  async get<T>(url: string): Promise<T> {
    const res = await fetch(`/api${url}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post<T>(url: string, body?: any): Promise<T> {
    const res = await fetch(`/api${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.error?.message || 'Error en la petición');
    }
    return res.json();
  },
};
