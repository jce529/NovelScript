import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getWork } from '@/lib/works/actions';
import { getWorkKbNodes, getAccountSharedNodes } from '@/lib/kb/actions';
import { listChapters } from '@/lib/chapters/actions';
import { countPendingProposalsByWork } from '@/lib/proposals/queries';
import { ReviewQueueNavLink } from '@/components/proposals/pending-badges';
import { buildTree, groupChaptersByFolder } from '@/lib/kb/tree';
import { KbTree, KbTemplateSection } from '@/components/studio/kb-tree';
import { TemplateSidebarEntry } from '@/components/studio/template-sidebar-entry';
import { hasSettingDocument, partitionStudioSidebar } from '@/lib/kb/sidebar-sections';
import { CreateRootFolderButton, KbTreeActions } from '@/components/studio/kb-node-dialogs';
import { SidebarGroup } from '@/components/studio/sidebar-groups';
import { TreeDndProvider } from '@/components/studio/tree-dnd';
import { DROP } from '@/lib/kb/move-rules';
import { StudioPanelProvider, StudioSidebar } from '@/components/studio/studio-panel-shell';
import { StudioWorkspace, StudioMobileNavigation } from '@/components/studio/workspace/mobile-tabs';
import { StudioPane } from '@/components/studio/workspace/StudioPane';
import { StudioStage } from '@/components/studio/workspace/StudioStage';

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

  const [workNodes, accountNodes, chapters, pendingCounts] = await Promise.all([
    getWorkKbNodes(supabase, { ownerId: user.id, workId }),
    getAccountSharedNodes(supabase, { ownerId: user.id }),
    listChapters(supabase, { ownerId: user.id, workId }),
    // Owner-scoped; a failed count resolves to 0 (badge omitted), never throws.
    countPendingProposalsByWork(supabase, user.id, [workId]),
  ]);
  const pendingCount = pendingCounts[workId] ?? 0;

  const workTree = buildTree(workNodes);
  const accountTree = buildTree(accountNodes);
  const sections = partitionStudioSidebar(workTree, accountTree);
  const chapterRoot = sections.chapterRoots[0];
  const chaptersByFolderId = groupChaptersByFolder(
    chapters.map((c) => ({ id: c.id, title: c.title, isPublished: c.is_published, folderId: c.folder_id })),
    chapterRoot?.id ?? null
  );
  const rootChapters = chapterRoot ? (chaptersByFolderId[chapterRoot.id] ?? []) : [];
  const hasNoChapterContent = !chapterRoot || (chapterRoot.children.length === 0 && rootChapters.length === 0);
  const hasNoSettingDocument = !hasSettingDocument(sections.myFolders);
  const hasCustomSharedFolders = sections.sharedFolders.length > 0;
  const templateAreas = sections.templateRoots.map((root) => ({ scope: root.scope, rootId: root.id, folders: root.folders }));

  // 17-07 tree: 작품 폴더 (회차 · 설정 · 템플릿) / 계정 폴더 (설정). Depth: root group 0, section 1, rows 2+.
  const sidebar = (
    <>
      <Link
        href="/studio"
        className="flex items-center gap-1 px-4 pt-4 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={12} /> 작품 목록
      </Link>

      <TemplateSidebarEntry workId={workId} areas={templateAreas} />

      <TreeDndProvider workId={workId} workTree={workTree} accountTree={accountTree} chaptersByFolderId={chaptersByFolderId}>
      <nav aria-label="작품 트리" className="flex flex-col pb-6">
        <SidebarGroup id="work" kind="root" icon="work" label="작품 폴더" aside={work.title}>
          <SidebarGroup
            id="work-chapters" label="회차" href={`/studio/${workId}/chapters`} dropId={DROP.chapterRoot}
            actions={chapterRoot && <KbTreeActions workId={workId} node={chapterRoot} />}
          >
            {chapterRoot && (
              <KbTree
                nodes={chapterRoot.children} chaptersByFolderId={chaptersByFolderId} workId={workId} baseDepth={2}
                leaves={rootChapters} leavesFolderId={chapterRoot.id}
              />
            )}
            {chapterRoot && hasNoChapterContent && (
              <div className="flex h-8 items-center text-xs text-muted-foreground" style={{ paddingLeft: 48 }}>
                아직 회차가 없어요
              </div>
            )}
          </SidebarGroup>

          <SidebarGroup
            id="work-settings" label="설정" dropId={DROP.kbTop('work')}
            actions={<CreateRootFolderButton workId={workId} scope="work" />}
          >
            {hasNoSettingDocument && (
              <p className="py-2 text-xs text-muted-foreground" style={{ paddingLeft: 48 }}>
                아직 설정 문서가 없어요
              </p>
            )}
            <KbTree nodes={sections.myFolders} chaptersByFolderId={{}} workId={workId} baseDepth={2} />
          </SidebarGroup>

          <SidebarGroup
            id="work-templates" label="템플릿" defaultOpen={false}
            badge={`기본 ${sections.defaultTemplates.length} · 내 ${sections.myTemplates.length}`}
          >
            <KbTemplateSection defaults={sections.defaultTemplates} mine={sections.myTemplates} workId={workId} baseDepth={2} />
          </SidebarGroup>

          <ReviewQueueNavLink workId={workId} count={pendingCount} />
        </SidebarGroup>

        <SidebarGroup id="account"kind="root" icon="account" label="계정 폴더" aside="모든 작품 공용">
          <SidebarGroup
            id="account-settings" label="설정" dropId={DROP.kbTop('account_template')}
            actions={<CreateRootFolderButton workId={workId} scope="account_template" />}
          >
            {!hasCustomSharedFolders && (
              <div className="flex flex-col gap-1 py-4 pr-4 text-left" style={{ paddingLeft: 48 }}>
                <h3 className="text-sm font-semibold">공유 폴더가 아직 없어요</h3>
                <p className="text-xs text-muted-foreground">여러 작품에서 함께 쓸 폴더를 만들어보세요.</p>
              </div>
            )}
            <KbTree nodes={sections.sharedFolders} chaptersByFolderId={{}} workId={workId} baseDepth={2} />
          </SidebarGroup>
        </SidebarGroup>
      </nav>
      </TreeDndProvider>
    </>
  );

  return (
    <StudioPanelProvider>
      <StudioWorkspace>
        {/* lg 미만은 탭 3개(설정집·회차 / 집필 / AI), lg 이상은 기존 desktop 셸 */}
        <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col max-lg:overflow-hidden lg:h-auto lg:min-h-screen">
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
