import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnmrdlqqzxenyqjknqhy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubXJkbHFxenhlbnlxamtucWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODIxNzMsImV4cCI6MjA4NjY1ODE3M30.do4TDZdu84GA_Ek37qZi2ZPGqzRKJs9N80opQQP6V90';

const timeoutFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: timeoutFetch },
  auth: { autoRefreshToken: true, persistSession: true },
});

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts a background heartbeat that refreshes the Supabase session every 8 seconds.
 * This prevents the 10-second refresh token reuse interval from invalidating sessions.
 * Safe to call multiple times — only one interval runs at a time.
 */
export function startSessionHeartbeat(): void {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const expiresAt = session.expires_at ?? 0;
      const now = Math.floor(Date.now() / 1000);
      if (expiresAt - now < 120) {
        await supabase.auth.refreshSession();
      }
    } catch {
      // Silently ignore — the next heartbeat will retry
    }
  }, 8000);
}

export function stopSessionHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Force-refreshes the session and returns whether it's valid.
 * Use before critical write operations (inserts, updates, deletes).
 */
export async function ensureFreshSession(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return false;
    return true;
  } catch {
    return false;
  }
}

/** @deprecated Use ensureFreshSession() for write operations. Kept for backward compat. */
export async function ensureSession(): Promise<void> {
  await ensureFreshSession();
}
