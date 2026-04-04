import { API_BASE_URL } from '../config';

export function useOpcApi() {
  const get = async <T = any>(path: string): Promise<T | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json() as T;
    } catch (e) {
      console.error(`[API] GET ${path} failed:`, e);
      return null;
    }
  };

  const post = async <T = any>(path: string, body: any): Promise<T | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await res.json() as T;
    } catch (e) {
      console.error(`[API] POST ${path} failed:`, e);
      return null;
    }
  };

  return {
    get,
    post
  };
}
