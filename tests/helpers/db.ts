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
  await admin.auth.admin.deleteUser(userId, false);
}
