import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getWork } from '@/lib/works/actions';
import { getWorkKbNodes, getAccountSharedNodes } from '@/lib/kb/actions';
import { listChapters } from '@/lib/chapters/actions';
import { buildTree, groupChaptersByFolder } from '@/lib/kb/tree';
import { KbTree } from '@/components/studio/kb-tree';
import { CreateRootFolderButton } from '@/components/studio/kb-node-dialogs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

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

  const [workNodes, accountNodes, chapters] = await Promise.all([
    getWorkKbNodes(supabase, { ownerId: user.id, workId }),
    getAccountSharedNodes(supabase, { ownerId: user.id }),
    listChapters(supabase, { ownerId: user.id, workId }),
  ]);

  const workTree = buildTree(workNodes);
  const accountTree = buildTree(accountNodes);
  const chapterRoot = workTree.find((n) => n.category === '회차' && n.parent_id === null);
  const chaptersByFolderId = groupChaptersByFolder(
    chapters.map((c) => ({ id: c.id, title: c.title, isPublished: c.is_published, folderId: c.folder_id })),
    chapterRoot?.id ?? null
  );
  const hasCustomSharedFolders = accountTree.some((n) => n.category !== 'template');

  return (
    <div className="flex min-h-screen">
      <ScrollArea className="w-64 border-r bg-secondary">
        <Link
          href="/studio"
          className="flex items-center gap-1 px-4 pt-4 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} /> 작품 목록
        </Link>
        <div className="flex h-10 items-center justify-between px-4 font-medium text-sm">
          <span className="truncate">{work.title}</span>
          <CreateRootFolderButton workId={workId} scope="work" />
        </div>
        <KbTree nodes={workTree} chaptersByFolderId={chaptersByFolderId} workId={workId} />

        <Separator className="my-6" />

        <div className="flex h-10 items-center justify-between px-4 font-medium text-sm">
          <span>계정 공유 폴더</span>
          <CreateRootFolderButton workId={workId} scope="account_template" />
        </div>
        {!hasCustomSharedFolders && (
          <div className="flex flex-col gap-1 px-4 py-6 text-center">
            <h3 className="text-sm font-semibold">공유 폴더가 아직 없어요</h3>
            <p className="text-xs text-muted-foreground">여러 작품에서 함께 쓸 폴더를 만들어보세요.</p>
          </div>
        )}
        <KbTree nodes={accountTree} chaptersByFolderId={{}} workId={workId} />
      </ScrollArea>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
