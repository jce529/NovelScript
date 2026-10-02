import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

export function pgPool(max = 5) {
  return postgres(process.env.SUPABASE_DB_URL!, { max, prepare: false });
}

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function createTestUser(email?: string) {
  const admin = adminClient();
  const testEmail = email ?? `test-${crypto.randomUUID()}@novelscript.test`;
  const { data, error } = await admin.auth.admin.createUser({ email: testEmail, email_confirm: true });
  if (error) throw error;
  return data.user!;
}

export async function deleteTestUser(userId: string) {
  const admin = adminClient();
  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) throw error;
}

export function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Supabase client signed in as `user` (real session, so auth.uid() works inside RPCs). */
export async function signedInClient(user: { email?: string }) {
  const admin = adminClient();
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email! });
  if (error) throw error;
  const client = anonClient();
  const { error: otpError } = await client.auth.verifyOtp({
    type: 'magiclink', token_hash: link.properties.hashed_token,
  });
  if (otpError) throw otpError;
  return client;
}
