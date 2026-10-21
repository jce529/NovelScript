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
import { StudioWorkspace, StudioMobileNavigation } from '@/components/studio/workspace/mobile-tabs';
import { StudioPane } from '@/components/studio/workspace/StudioPane';
import { StudioStage } from '@/components/studio/workspace/StudioStage';
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
      <StudioWorkspace>
        {/* lg 미만은 탭 3개(설정집·회차 / 집필 / AI), lg 이상은 기존 desktop 셸 */}
        <div className="flex h-dvh min-h-0 flex-col lg:h-auto lg:min-h-screen">
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div className="contents max-lg:hidden">
              <StudioSidebar>{sidebar}</StudioSidebar>
            </div>
            <div className="relative min-h-0 min-w-0 flex-1">
              <StudioPane pane="tree" className="bg-secondary max-lg:overflow-y-auto lg:hidden">
                {sidebar}
              </StudioPane>
              <StudioStage>{children}</StudioStage>
            </div>
          </div>
          <StudioMobileNavigation />
        </div>
      </StudioWorkspace>
    </StudioPanelProvider>
  );
}
