import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Single choke point for querying Phase 15's ai_doc_* tables, which aren't in the
 * generated Database type yet (migrations 0010/0011 haven't been applied to the
 * project the types were generated from). Isolates the one necessary `any` cast
 * instead of scattering `as any` across every call site.
 */
export function untypedTable(admin: SupabaseClient, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ai_doc_* tables predate the generated Database type (see comment above)
  return (admin as any).from(table);
}
