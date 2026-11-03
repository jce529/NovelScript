import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const CALL_TIMEOUT_MS = 5000;

function timedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

/** Per-call data client. The verified caller's bearer is the only session input. */
export function createMcpDbClient(bearer: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !bearer || bearer.length > 8192) {
    throw new Error('MCP 조회 연결을 만들 수 없습니다.');
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${bearer}` }, fetch: timedFetch },
  });
}
