'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getWorkSystemInstruction,
  saveWorkSystemInstruction,
  type WorkInstructionResult,
} from '@/lib/ai/work-instructions';

/**
 * 04-08: shared Server Actions for the per-work AI extra instruction (⚙). Both the chapter editor
 * and the KB/document editor call these, so they read and write the same value.
 *
 * The owner id always comes from the session (auth.getUser), never from the client, and the
 * default system instruction is never accepted as input. Ownership, suspension and validation
 * are enforced by the DAL (and RLS); this boundary only authenticates and revalidates.
 */

const LOGIN_REQUIRED = '로그인이 필요해요.';
const UNAVAILABLE = '지금은 이 작업을 처리할 수 없어요. 잠시 후 다시 시도해주세요.';

async function sessionOwner() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, ownerId: data?.user?.id ?? null };
}

export async function loadWorkSystemInstructionAction(workId: string): Promise<WorkInstructionResult> {
  try {
    const { supabase, ownerId } = await sessionOwner();
    if (!ownerId) return { ok: false, error: LOGIN_REQUIRED };
    return await getWorkSystemInstruction(supabase, { ownerId, workId });
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function saveWorkSystemInstructionAction(
  workId: string,
  instruction: string,
): Promise<WorkInstructionResult> {
  let result: WorkInstructionResult;
  try {
    const { supabase, ownerId } = await sessionOwner();
    if (!ownerId) return { ok: false, error: LOGIN_REQUIRED };
    result = await saveWorkSystemInstruction(supabase, { ownerId, workId, instruction });
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
  if (result.ok) revalidatePath(`/studio/${workId}`, 'layout');
  return result;
}
