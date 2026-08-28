import type { SupabaseClient } from '@supabase/supabase-js';

export interface UpgradeToWriterInput {
  userId: string;
  penName: string;
  bio?: string;
}

export interface UpgradeResult {
  ok: boolean;
  error?: string;
}

/** D-04/D-05: first-time writer conversion. Pen name uniqueness is enforced by the
 * DB's `profiles_pen_name_unique` index (case-insensitive, Postgres error 23505) —
 * that constraint is the actual race-condition-proof guarantee, not this function's
 * own filter, which only prevents a friendly-error round trip on the common case. */
export async function upgradeToWriter(
  supabase: SupabaseClient,
  { userId, penName, bio }: UpgradeToWriterInput
): Promise<UpgradeResult> {
  const trimmed = penName.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { ok: false, error: '필명은 2자 이상 20자 이하로 입력해주세요.' };
  }

  const { error, data } = await supabase
    .from('profiles')
    .update({
      role: 'writer',
      pen_name: trimmed,
      pen_name_bio: bio?.trim() || null,
      pen_name_set_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('role', 'reader')
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: '이미 사용 중인 필명입니다.' };
    }
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: false, error: '이미 작가로 전환된 계정입니다.' };
  }

  return { ok: true };
}
