import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * BUGFIX-05: fixture works for tests that must be removable afterwards.
 * `create_work` seeds locked structure folders that the 0023 trigger refuses to hard-delete
 * (locked_node_immutable), and no product path deletes a work. So fixtures that are cleaned up
 * with scripts/lib/report-fixture-cleanup.mjs insert the work plus one unlocked setting folder
 * directly. The trigger invariants stay untouched; this is purely a fixture-shape choice.
 */
export async function createRemovableWork(admin: SupabaseClient, ownerId: string, title: string): Promise<string> {
  const { data: work, error } = await admin.from('works').insert({ owner_id: ownerId, title }).select('id').single();
  if (error) throw error;
  const { error: nodeError } = await admin.from('kb_nodes').insert({
    owner_id: ownerId, work_id: work.id, scope: 'work', parent_id: null,
    node_type: 'folder', category: '인물', is_locked: false, name: '인물',
  });
  if (nodeError) throw nodeError;
  return work.id as string;
}
