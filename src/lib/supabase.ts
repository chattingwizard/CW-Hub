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
 * Handles the PostgREST JWT propagation delay after sign-in without hacks.
 */
export async function fetchProfileWithRetry(
  userId: string,
  attempts = 3,
): Promise<Profile | null> {
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) return data as Profile;
    if (error && error.code !== 'PGRST116') return null;
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
