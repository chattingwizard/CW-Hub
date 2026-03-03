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
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/** No-op for backward compatibility. */
export async function ensureSession(): Promise<void> {}
