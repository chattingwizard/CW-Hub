import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnmrdlqqzxenyqjknqhy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubXJkbHFxenhlbnlxamtucWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODIxNzMsImV4cCI6MjA4NjY1ODE3M30.do4TDZdu84GA_Ek37qZi2ZPGqzRKJs9N80opQQP6V90';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Ensures the Supabase session is fresh before making queries.
 * Call this before critical data fetches to prevent stale token hangs.
 * Has a 5s timeout so it never blocks the UI indefinitely.
 */
export async function ensureSession(): Promise<void> {
  try {
    const result = await Promise.race([
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const expiresAt = session.expires_at ?? 0;
          const now = Math.floor(Date.now() / 1000);
          if (expiresAt - now < 60) {
            await supabase.auth.refreshSession();
          }
        }
      })(),
      new Promise<'timeout'>(r => setTimeout(() => r('timeout'), 5000)),
    ]);
    if (result === 'timeout') {
      console.warn('[ensureSession] Timed out refreshing session');
    }
  } catch {
    // Best-effort — queries will still work with the anon key
  }
}
