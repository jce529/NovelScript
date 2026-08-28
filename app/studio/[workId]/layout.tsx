import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWork } from '@/lib/works/actions';
import { getKbTree } from '@/lib/kb/actions';
import { buildTree } from '@/lib/kb/tree';
import { KbTree } from '@/components/studio/kb-tree';
import { ChaptersNavLink } from '@/components/studio/chapters-nav-link';
import { ScrollArea } from '@/components/ui/scroll-area';

export default async function WorkLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workId: string }>;
}) {
  const { workId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const work = await getWork(supabase, { ownerId: user.id, workId });
  if (!work) redirect('/studio');

  const flatNodes = await getKbTree(supabase, { ownerId: user.id, workId });
  const tree = buildTree(flatNodes);

  return (
    <div className="flex min-h-screen">
      <ScrollArea className="w-64 border-r bg-secondary">
        <div className="p-4 font-medium">{work.title}</div>
        {/* D-14: pinned, always-visible — rendered alongside (not inside) the KB
            tree so chapters navigation is never lost while browsing KB docs. */}
        <ChaptersNavLink workId={workId} />
        <KbTree nodes={tree} />
      </ScrollArea>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
