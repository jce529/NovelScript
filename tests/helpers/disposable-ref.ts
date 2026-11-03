/**
 * Shared disposable-project guard for MCP DB suites (extracted from the inline copies in
 * cross-user / revoke-blocks, 13-01). The env ref must match the ref in both the Supabase
 * API URL and the Postgres URL (host or pooler user), and must never be the shared project.
 * Any mismatch or missing value throws so the suite fails instead of touching another DB.
 * Never prints the URLs or the ref.
 */

/** Prefix of the shared (non-disposable) project ref. A match always fails the suite. */
export const SHARED_PROJECT_REF_PREFIX = 'ymudwg';

export function isSharedProjectRef(ref: string): boolean {
  return ref.trim().startsWith(SHARED_PROJECT_REF_PREFIX);
}

export function assertDisposableRef(env: NodeJS.ProcessEnv = process.env): string {
  const ref = env.MCP_DISPOSABLE_PROJECT_REF?.trim();
  const apiUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const dbUrl = env.SUPABASE_DB_URL;
  if (!ref || !apiUrl || !dbUrl) throw new Error('MCP disposable project env is incomplete');
  const apiRef = new URL(apiUrl).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  const pg = new URL(dbUrl);
  if (ref !== apiRef || !`${pg.hostname} ${decodeURIComponent(pg.username)}`.includes(ref)) {
    throw new Error('MCP disposable ref must match both Supabase API and DB URLs');
  }
  if (isSharedProjectRef(ref)) throw new Error('Refusing to run on the shared Supabase project');
  return ref;
}
