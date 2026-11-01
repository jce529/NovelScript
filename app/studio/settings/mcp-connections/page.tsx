import { redirect } from 'next/navigation';
import { isAccountActive } from '@/lib/auth/account';
import { getMcpPublicOrigin } from '@/lib/mcp/auth';
import { listMcpConnections } from '@/lib/mcp/connections';
import { createClient } from '@/lib/supabase/server';
import ConnectionCards from './ConnectionCards';

export default async function McpConnectionsSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role, deleted_at').eq('id', user.id).maybeSingle();
  if (!profile || !isAccountActive(profile)) redirect('/login');
  if (profile.role !== 'writer') redirect('/studio');

  const result = await listMcpConnections(supabase, user.id);
  const origin = getMcpPublicOrigin();
  const connectorUrl = origin ? `${origin}/mcp` : '';

  return <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-8">
    <div>
      <h1 className="text-2xl font-semibold">AI 커넥터</h1>
      <p className="mt-2 text-sm text-muted-foreground">Claude 같은 외부 AI가 내 NovelScript 계정에 연결된 목록이에요. 연결을 해제하면 다음 호출부터 차단돼요.</p>
    </div>
    <ConnectionCards initialConnections={result.connections} loadError={!result.ok} connectorUrl={connectorUrl} />
  </main>;
}
