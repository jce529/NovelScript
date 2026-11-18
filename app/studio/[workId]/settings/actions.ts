'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { checkWriteAccess, writeDenial, type WriteDenialCode } from '@/lib/auth/write-access';
import { getWork } from '@/lib/works/actions';

export type SerialStatus = 'ongoing' | 'completed';

export type UpdateSerialStatusErrorCode =
  | WriteDenialCode
  | 'unauthenticated'
  | 'invalid_input'
  | 'forbidden'
  | 'update_failed';

export type UpdateSerialStatusResult =
  | {
      ok: true;
      serialStatus: SerialStatus;
    }
  | {
      ok: false;
      error: string;
      code?: UpdateSerialStatusErrorCode;
    };

const SAVE_ERROR_MESSAGE = '연재 상태를 저장하지 못했어요. 다시 시도해 주세요.';

function isValidSerialStatus(value: unknown): value is SerialStatus {
  return value === 'ongoing' || value === 'completed';
}

function revalidateSerialStatusPaths(workId: string): void {
  const paths = [
    `/studio/${workId}`,
    `/studio/${workId}/settings`,
    `/works/${workId}`,
    '/series/free',
    '/series/paid',
  ];
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      // Revalidation errors after a committed DB write do not roll back the saved status.
    }
  }
}

/**
 * Domain helper for updating `works.serial_status` with an already-verified session `ownerId`.
 * Follows `lib/works/actions.ts`: checks `checkWriteAccess(supabase, ownerId)` + `writeDenial`,
 * verifies ownership (`getWork`), and updates with `id` + `owner_id` + `deleted_at IS NULL`.
 */
export async function updateWorkSerialStatus(
  supabase: SupabaseClient,
  input: { ownerId: string; workId: string; serialStatus: unknown },
): Promise<UpdateSerialStatusResult> {
  const workId = typeof input.workId === 'string' ? input.workId.trim() : '';
  if (!workId || !isValidSerialStatus(input.serialStatus)) {
    return { ok: false, code: 'invalid_input', error: SAVE_ERROR_MESSAGE };
  }
  const ownerId = typeof input.ownerId === 'string' ? input.ownerId.trim() : '';
  if (!ownerId) {
    return { ok: false, code: 'unauthenticated', error: SAVE_ERROR_MESSAGE };
  }

  const access = await checkWriteAccess(supabase, ownerId);
  if (!access.ok) return writeDenial(access);

  const ownedWork = await getWork(supabase, { ownerId, workId });
  if (!ownedWork || (ownedWork.owner_id && ownedWork.owner_id !== ownerId)) {
    return { ok: false, code: 'forbidden', error: SAVE_ERROR_MESSAGE };
  }

  const { data: updated, error } = await supabase
    .from('works')
    .update({
      serial_status: input.serialStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workId)
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .select('id, serial_status')
    .maybeSingle();

  if (error || !updated || updated.serial_status !== input.serialStatus) {
    return { ok: false, code: 'update_failed', error: SAVE_ERROR_MESSAGE };
  }

  revalidateSerialStatusPaths(workId);
  return { ok: true, serialStatus: input.serialStatus };
}

/**
 * Server Action for `/studio/[workId]/settings` (21-02, LIST-04 / D-01).
 * Never trusts any client-provided `ownerId`; always reads `user.id` from the server session.
 */
export async function updateWorkSerialStatusAction(
  inputOrWorkId: { workId: string; serialStatus: unknown; ownerId?: string } | string,
  maybeSerialStatus?: unknown,
): Promise<UpdateSerialStatusResult> {
  const rawWorkId = typeof inputOrWorkId === 'string' ? inputOrWorkId : inputOrWorkId?.workId;
  const rawStatus =
    typeof inputOrWorkId === 'string' ? maybeSerialStatus : inputOrWorkId?.serialStatus;

  const workId = typeof rawWorkId === 'string' ? rawWorkId.trim() : '';
  if (!workId || !isValidSerialStatus(rawStatus)) {
    return { ok: false, code: 'invalid_input', error: SAVE_ERROR_MESSAGE };
  }

  let supabase: SupabaseClient;
  let sessionUserId: string | undefined;
  try {
    supabase = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await supabase.auth.getUser();
    sessionUserId = error ? undefined : data?.user?.id;
  } catch {
    return { ok: false, code: 'update_failed', error: SAVE_ERROR_MESSAGE };
  }

  if (!sessionUserId) {
    return { ok: false, code: 'unauthenticated', error: SAVE_ERROR_MESSAGE };
  }

  return updateWorkSerialStatus(supabase, {
    ownerId: sessionUserId,
    workId,
    serialStatus: rawStatus,
  });
}
