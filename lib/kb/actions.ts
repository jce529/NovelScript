import type { SupabaseClient } from '@supabase/supabase-js';
import type { FlatKbNode } from './tree';

/** KB-02: merges the caller's work-scoped nodes with their account-level
 * template/ root + descendants into one flat list for buildTree to nest. */
export async function getKbTree(
  supabase: SupabaseClient,
  { ownerId, workId }: { ownerId: string; workId: string }
): Promise<FlatKbNode[]> {
  const [workNodes, accountNodes] = await Promise.all([
    supabase
      .from('kb_nodes')
      .select('id, parent_id, name, node_type, category, is_locked, scope')
      .eq('owner_id', ownerId)
      .eq('work_id', workId)
      .eq('scope', 'work')
      .is('deleted_at', null),
    supabase
      .from('kb_nodes')
      .select('id, parent_id, name, node_type, category, is_locked, scope')
      .eq('owner_id', ownerId)
      .eq('scope', 'account_template')
      .is('deleted_at', null),
  ]);

  return [...(workNodes.data ?? []), ...(accountNodes.data ?? [])] as FlatKbNode[];
}
