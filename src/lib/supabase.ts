import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bnmrdlqqzxenyqjknqhy.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubXJkbHFxenhlbnlxamtucWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODIxNzMsImV4cCI6MjA4NjY1ODE3M30.do4TDZdu84GA_Ek37qZi2ZPGqzRKJs9N80opQQP6V90';

const STORAGE_KEY = 'sb-bnmrdlqqzxenyqjknqhy-auth-token';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true },
});

/**
 * Reads the access token directly from localStorage, bypassing the
 * Supabase client's internal auth lock that can hang indefinitely.
 */
export function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as { access_token?: string };
    return session.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Direct POST to Supabase REST API, bypassing the JS client entirely.
 * Immune to the client's internal auth lock / token refresh hangs.
 */
export async function directInsert<T = unknown>(
  table: string,
  body: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<{ data: T[] | null; error: string | null }> {
  const token = getAccessToken();
  if (!token) return { data: null, error: 'No session — please refresh the page and log in again.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const json = await res.json() as T[] | { message?: string; code?: string };

    if (!res.ok) {
      const err = json as { message?: string };
      return { data: null, error: err.message ?? `HTTP ${res.status}` };
    }
    return { data: json as T[], error: null };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { data: null, error: 'Request timed out. Please try again.' };
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/** No-op for backward compatibility. */
export async function ensureSession(): Promise<void> {}
