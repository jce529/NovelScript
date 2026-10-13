import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getWork } from '@/lib/works/actions';
import { getWorkKbNodes, getAccountSharedNodes } from '@/lib/kb/actions';
import { listChapters } from '@/lib/chapters/actions';
import { buildTree, groupChaptersByFolder } from '@/lib/kb/tree';
import { KbTree, KbTemplateSection } from '@/components/studio/kb-tree';
import { TemplateSidebarEntry } from '@/components/studio/template-sidebar-entry';
import { partitionStudioSidebar } from '@/lib/kb/sidebar-sections';
import { CreateRootFolderButton } from '@/components/studio/kb-node-dialogs';
import { StudioPanelProvider, StudioSidebar } from '@/components/studio/studio-panel-shell';
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
  const sections = partitionStudioSidebar(workTree, accountTree);
  const chapterRoot = sections.chapterRoots[0];
  const chaptersByFolderId = groupChaptersByFolder(
    chapters.map((c) => ({ id: c.id, title: c.title, isPublished: c.is_published, folderId: c.folder_id })),
    chapterRoot?.id ?? null
  );
  const hasCustomSharedFolders = sections.sharedFolders.length > 0;
  const templateAreas = sections.templateRoots.map((root) => ({ scope: root.scope, folders: root.folders }));

  const sidebar = (
    <>
      <Link
        href="/studio"
        className="flex items-center gap-1 px-4 pt-4 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={12} /> 작품 목록
      </Link>
      <div className="flex h-10 items-center px-4 font-medium text-sm">
        <span className="truncate">{work.title}</span>
      </div>

      <TemplateSidebarEntry workId={workId} areas={templateAreas} />
      <KbTemplateSection defaults={sections.defaultTemplates} mine={sections.myTemplates} workId={workId} />

      <Separator className="my-4" />

      <div className="flex h-10 items-center justify-between px-4 font-medium text-sm">
        <span>내 폴더</span>
        <CreateRootFolderButton workId={workId} scope="work" />
      </div>
      <KbTree nodes={sections.myFolders} chaptersByFolderId={{}} workId={workId} />

      <Separator className="my-4" />

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
      <KbTree nodes={sections.sharedFolders} chaptersByFolderId={{}} workId={workId} />

      <Separator className="my-4" />

      <div className="flex h-10 items-center px-4 font-medium text-sm">회차</div>
      <KbTree nodes={sections.chapterRoots} chaptersByFolderId={chaptersByFolderId} workId={workId} />
    </>
  );


  return (
    <StudioPanelProvider>
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* 모바일: 문서 트리를 접이식 패널로 위에 두고, md 이상에서는 왼쪽 고정 사이드바 */}
      <details className="group border-b bg-secondary md:hidden">
        <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium">
          <span className="truncate">{work.title} · 문서 목록</span>
          <span className="text-xs text-muted-foreground group-open:hidden">열기</span>
          <span className="hidden text-xs text-muted-foreground group-open:inline">닫기</span>
        </summary>
        {sidebar}
      </details>
      <StudioSidebar>{sidebar}</StudioSidebar>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
    </StudioPanelProvider>
  );
}
