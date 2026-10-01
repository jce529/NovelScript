'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BYOK_COPY } from '@/lib/ai/providers/byok-copy';
import { deleteByokKey, recheckByokKey, registerByokKey } from '@/lib/ai/providers/byok';
import { loadConnectedByokModels } from '@/lib/ai/providers/byok-models';
import { decodeSelection } from '@/lib/ai/providers/selection';
import { setDefaultProviderModel } from '@/lib/ai/providers/settings';
import type { ProviderId } from '@/lib/ai/providers/types';
import { isAccountActive } from '@/lib/auth/account';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const settingsPath = '/studio/settings/ai-providers';
const providerSchema = z.enum(['openai', 'anthropic', 'gemini']);
type ActionResult = { ok: boolean; message?: string; modelCount?: number; reason?: string };

async function authorizedClients() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role, deleted_at').eq('id', user.id).maybeSingle();
  if (!profile || !isAccountActive(profile)) redirect('/login');
  if (profile.role !== 'writer') redirect('/studio');
  return { supabase, ownerId: user.id };
}

function providerFrom(formData: FormData): ProviderId | null {
  const parsed = providerSchema.safeParse(formData.get('provider'));
  return parsed.success ? parsed.data : null;
}

function sanitize(result: { ok: boolean; message?: string; modelCount?: number; reason?: string }): ActionResult {
  return {
    ok: result.ok,
    ...(typeof result.message === 'string' ? { message: result.message } : {}),
    ...(typeof result.modelCount === 'number' ? { modelCount: result.modelCount } : {}),
    ...(typeof result.reason === 'string' ? { reason: result.reason } : {}),
  };
}

export async function registerByokKeyAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const provider = providerFrom(formData);
  const apiKey = formData.get('apiKey');
  if (!provider || typeof apiKey !== 'string' || !apiKey) return { ok: false, reason: 'format', message: BYOK_COPY.internalError };
  const { supabase, ownerId } = await authorizedClients();
  const admin = createAdminClient();
  const result = sanitize(await registerByokKey({ supabase, admin } as unknown as Parameters<typeof registerByokKey>[0], ownerId, provider, apiKey));
  if (result.ok) revalidatePath(settingsPath);
  return result;
}

export async function recheckByokKeyAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const provider = providerFrom(formData);
  if (!provider) return { ok: false, reason: 'format', message: BYOK_COPY.internalError };
  const clients = await authorizedClients();
  const result = sanitize(await recheckByokKey({ supabase: clients.supabase, admin: createAdminClient() } as unknown as Parameters<typeof recheckByokKey>[0], clients.ownerId, provider));
  if (result.ok || result.reason === 'invalid' || result.reason === 'forbidden') revalidatePath(settingsPath);
  return result;
}

export async function deleteByokKeyAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const provider = providerFrom(formData);
  if (!provider) return { ok: false, reason: 'format', message: BYOK_COPY.internalError };
  const clients = await authorizedClients();
  const result = sanitize(await deleteByokKey({ supabase: clients.supabase, admin: createAdminClient() } as unknown as Parameters<typeof deleteByokKey>[0], clients.ownerId, provider));
  if (result.ok) revalidatePath(settingsPath);
  return result;
}

export async function saveDefaultAction(formData: FormData): Promise<never> {
  const { supabase, ownerId } = await authorizedClients();
  const raw = formData.get('providerModel');
  if (typeof raw !== 'string') redirect(`${settingsPath}?error=1`);
  const selection = decodeSelection(raw);
  if (!selection) redirect(`${settingsPath}?error=1`);
  const connectedModels = await loadConnectedByokModels(supabase, ownerId);
  const result = await setDefaultProviderModel(supabase, ownerId, selection, connectedModels);
  if (!result.ok) redirect(`${settingsPath}?error=1`);
  revalidatePath(settingsPath);
  redirect(`${settingsPath}?saved=1`);
}
