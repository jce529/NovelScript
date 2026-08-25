'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function submitEmail(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  if (!email || !email.includes('@')) {
    redirect('/auth/complete-email?error=invalid');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    redirect(`/auth/complete-email?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/account');
}
