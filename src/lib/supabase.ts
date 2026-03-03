import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnmrdlqqzxenyqjknqhy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubXJkbHFxenhlbnlxamtucWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODIxNzMsImV4cCI6MjA4NjY1ODE3M30.do4TDZdu84GA_Ek37qZi2ZPGqzRKJs9N80opQQP6V90';

const AUTH_PATH = '/auth/';

const timeoutFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  if (url.includes(AUTH_PATH)) {
    return fetch(input, init);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: timeoutFetch },
  auth: { autoRefreshToken: true, persistSession: true },
});

/**
 * No-op kept for backward compatibility. DO NOT call refreshSession() manually —
 * with refresh_token_rotation + 10s reuse interval, manual refreshes cause
 * token family revocation.
 */
export async function ensureSession(): Promise<void> {
  // intentionally empty — let Supabase auto-refresh handle it
}
