'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronDown, ChevronRight, UserRound } from 'lucide-react';
import { folderPresentation } from '@/lib/kb/kb-node-menu-controller';
import { useTreeDrop } from '@/components/studio/tree-dnd';

/** Tree-style keyboard: ArrowLeft collapses an open group, ArrowRight opens a closed one. */
export function groupKeyAction(key: string, expanded: boolean): 'collapse' | 'expand' | null {
  if (key === 'ArrowLeft' && expanded) return 'collapse';
  if (key === 'ArrowRight' && !expanded) return 'expand';
  return null;
}

const ICONS = { work: BookOpen, account: UserRound } as const;

/** Collapsible sidebar group (17-07). `kind="root"` = 작품 폴더 / 계정 폴더 (semibold, icon, muted aside);
 * the default is a section (회차 / 설정 / 템플릿) one level below. Collapse state is client-only (not
 * saved) and the content stays mounted (`hidden`), so folder state inside survives a collapse. Header
 * actions sit next to — never inside — the toggle button. `dropId` makes the header a drop target. */
export function SidebarGroup({
  id, label, kind = 'section', icon, aside, badge, href, actions, defaultOpen = true, dropId, children,
}: {
  id: string; label: string; kind?: 'root' | 'section'; icon?: keyof typeof ICONS; aside?: string; badge?: string;
  href?: string; actions?: React.ReactNode; defaultOpen?: boolean; dropId?: string; children?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(defaultOpen ? [] : [id]));
  const presentation = folderPresentation(collapsed, id);
  const expanded = presentation.visible;
  const setExpanded = (next: boolean) => setCollapsed(next ? new Set() : new Set([id]));
  const contentId = `sidebar-group-${id}`;
  const { setNodeRef: setDropRef, className: dropLook, hint: dropHint, title: dropTitle } = useTreeDrop(dropId ?? null);
  const dropClass = dropId ? dropLook : '';
  const Icon = icon ? ICONS[icon] : null;
  const isRoot = kind === 'root';

  return (
    <div data-sidebar-group={id} className="flex flex-col">
      <div
        ref={setDropRef}
        className={`group/row relative flex h-8 items-center gap-1 pr-2 text-sm max-lg:h-10${dropClass}`}
        style={{ paddingLeft: isRoot ? 8 : 28 }}
        data-drop-id={dropId}
        title={dropTitle}
      >
        <button
          type="button"
          aria-expanded={presentation.ariaExpanded === 'true'}
          aria-controls={contentId}
          aria-label={href ? `${label} ${expanded ? '접기' : '펼치기'}` : undefined}
          className={`flex min-w-0 items-center gap-1 rounded text-left hover:bg-accent focus-visible:outline-2 ${href ? 'h-5 w-5 shrink-0 justify-center' : 'h-7 flex-1 px-0.5'}`}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => {
            const action = groupKeyAction(e.key, expanded);
            if (action) { e.preventDefault(); setExpanded(action === 'expand'); }
          }}
        >
          {expanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
          {!href && Icon && <Icon size={16} className="shrink-0 text-muted-foreground" />}
          {!href && <span className={`min-w-0 truncate ${isRoot ? 'font-semibold' : 'font-medium'}`}>{label}</span>}
          {!href && aside && <span className="ml-auto min-w-0 shrink truncate pl-2 text-xs font-normal text-muted-foreground">{aside}</span>}
          {!href && badge && <span className="ml-auto shrink-0 whitespace-nowrap rounded bg-background px-1.5 text-xs font-normal text-muted-foreground">{badge}</span>}
        </button>
        {href && (
          <Link href={href} className="min-w-0 flex-1 truncate font-medium">{label}</Link>
        )}
        {dropHint}
        {actions && <span className={`flex shrink-0 items-center${dropHint ? ' invisible' : ''}`}>{actions}</span>}
      </div>
      <div id={contentId} hidden={!expanded} role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
