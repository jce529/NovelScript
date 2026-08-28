'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { upgradeToWriter } from '@/lib/auth/writer';

export async function submitWriterUpgrade(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const penName = String(formData.get('penName') ?? '');
  const bio = String(formData.get('bio') ?? '');

  const result = await upgradeToWriter(supabase, { userId: user.id, penName, bio });
  if (!result.ok) {
    redirect(`/write/start?error=${encodeURIComponent(result.error ?? 'unknown')}`);
  }
  redirect('/account');
}
