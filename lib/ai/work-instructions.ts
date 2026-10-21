import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkWriteAccess } from '@/lib/auth/write-access';

/**
 * 04-08: per-work custom AI system instruction (작품별 추가 지시).
 *
 * Stored in the private `work_ai_instructions` table (migration 0026), never on `works`, which
 * has a public SELECT policy. Every call uses the caller's session client: ownership is checked
 * here (owner_id + deleted_at) and again by RLS. There is no admin bypass.
 *
 * Only the author's extra instruction is stored. The built-in/default system instruction is
 * composed elsewhere and is never written here. A missing row and an empty string both mean
 * "no extra instruction"; saving an empty/whitespace string clears it.
 */

export const WORK_INSTRUCTION_MAX_LENGTH = 4000;

export type WorkInstructionResult = { ok: true; instruction: string } | { ok: false; error: string };

const INVALID_MESSAGE = '요청을 처리할 수 없어요.';
const NOT_FOUND_MESSAGE = '작품을 찾을 수 없어요.';
const TOO_LONG_MESSAGE = `추가 지시는 ${WORK_INSTRUCTION_MAX_LENGTH}자 이하로 입력해주세요.`;
const LOAD_FAILED_MESSAGE = '추가 지시를 불러오지 못했어요. 잠시 후 다시 시도해주세요.';
const SAVE_FAILED_MESSAGE = '추가 지시를 저장하지 못했어요. 잠시 후 다시 시도해주세요.';

const idsSchema = z.object({ ownerId: z.string().uuid(), workId: z.string().uuid() });
const instructionSchema = z.string().trim().max(WORK_INSTRUCTION_MAX_LENGTH, TOO_LONG_MESSAGE);

type OwnershipCheck = { ok: true } | { ok: false; error: string };

async function checkOwnership(supabase: SupabaseClient, ownerId: string, workId: string): Promise<OwnershipCheck> {
  try {
    const { data, error } = await supabase
      .from('works')
      .select('id')
      .eq('id', workId)
      .eq('owner_id', ownerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return { ok: false, error: LOAD_FAILED_MESSAGE };
    if (!data) return { ok: false, error: NOT_FOUND_MESSAGE };
    return { ok: true };
  } catch {
    return { ok: false, error: LOAD_FAILED_MESSAGE };
  }
}

export async function getWorkSystemInstruction(
  supabase: SupabaseClient,
  input: { ownerId: string; workId: string },
): Promise<WorkInstructionResult> {
  const ids = idsSchema.safeParse(input);
  if (!ids.success) return { ok: false, error: INVALID_MESSAGE };
  const { ownerId, workId } = ids.data;

  const owned = await checkOwnership(supabase, ownerId, workId);
  if (!owned.ok) return owned;

  try {
    const { data, error } = await supabase
      .from('work_ai_instructions')
      .select('instruction')
      .eq('work_id', workId)
      .maybeSingle();
    if (error) return { ok: false, error: LOAD_FAILED_MESSAGE };
    const instruction = (data as { instruction?: unknown } | null)?.instruction;
    if (data && typeof instruction !== 'string') return { ok: false, error: LOAD_FAILED_MESSAGE };
    return { ok: true, instruction: typeof instruction === 'string' ? instruction : '' };
  } catch {
    return { ok: false, error: LOAD_FAILED_MESSAGE };
  }
}

export async function saveWorkSystemInstruction(
  supabase: SupabaseClient,
  input: { ownerId: string; workId: string; instruction: string },
): Promise<WorkInstructionResult> {
  const ids = idsSchema.safeParse(input);
  if (!ids.success) return { ok: false, error: INVALID_MESSAGE };
  const parsed = instructionSchema.safeParse(input.instruction);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.code === 'too_big');
    return { ok: false, error: tooLong ? TOO_LONG_MESSAGE : INVALID_MESSAGE };
  }
  const { ownerId, workId } = ids.data;
  const instruction = parsed.data;

  const access = await checkWriteAccess(supabase, ownerId);
  if (!access.ok) return { ok: false, error: access.error };

  const owned = await checkOwnership(supabase, ownerId, workId);
  if (!owned.ok) return owned;

  try {
    const { data, error } = await supabase
      .from('work_ai_instructions')
      .upsert(
        { work_id: workId, instruction, updated_at: new Date().toISOString() },
        { onConflict: 'work_id' },
      )
      .select('instruction')
      .single();
    if (error || !data) return { ok: false, error: SAVE_FAILED_MESSAGE };
    const stored = (data as { instruction?: unknown }).instruction;
    if (typeof stored !== 'string') return { ok: false, error: SAVE_FAILED_MESSAGE };
    return { ok: true, instruction: stored };
  } catch {
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}
