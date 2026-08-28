import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { seedTemplateFiles } from '@/lib/kb/templates';

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'writer') redirect('/write/start');

  const { data: templateRootId } = await supabase.rpc('ensure_account_template_root', {
    p_owner_id: user.id,
  });
  if (templateRootId) {
    await seedTemplateFiles(supabase, {
      ownerId: user.id,
      workId: null,
      scope: 'account_template',
      templateRootId,
    });
  }

  return <div className="min-h-screen bg-background">{children}</div>;
}
