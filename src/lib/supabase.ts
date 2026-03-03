import { createClient } from '@supabase/supabase-js';
import type { Profile } from '../types';

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
 * Fetches a user profile with retry + exponential backoff.
 * Uses direct REST calls to bypass the Supabase JS client's internal auth
 * lock which deadlocks when called from inside onAuthStateChange callbacks.
 */
export async function fetchProfileWithRetry(
  userId: string,
  attempts = 3,
): Promise<Profile | null> {
  for (let i = 0; i < attempts; i++) {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
        { headers, signal: controller.signal },
      );
      clearTimeout(timer);

      if (!res.ok) {
        if (i < attempts - 1) {
          await new Promise(r => setTimeout(r, 300 * (i + 1)));
          continue;
        }
        return null;
      }
      const rows = (await res.json()) as Profile[];
      if (rows[0]) return rows[0];
    } catch {
      // timeout or network error — retry
    }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 300 * (i + 1)));
  }
  return null;
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
      console.error('Supabase request failed:', err.message, res.status);
      return { data: null, error: 'Request failed. Please try again.' };
    }
    return { data: json as T[], error: null };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { data: null, error: 'Request timed out. Please try again.' };
    }
    console.error('Supabase network error:', err);
    return { data: null, error: 'Network error. Please check your connection.' };
  }
}

/** No-op kept for backward compatibility with imports that haven't been cleaned up yet. */
export async function ensureSession(): Promise<void> {}
