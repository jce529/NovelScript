'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyTemplateDialog, CreateNodeDialog, RenameNodeDialog } from '@/components/studio/kb-node-dialogs';

export interface TemplateEditorToolbarProps {
  workId: string;
  nodeId: string;
  name: string;
  /** default_template = locked canonical copy (read-only); user_template = 내 템플릿. */
  mode: 'default_template' | 'user_template';
  /** Resolved category of the open template; null for a loose (미분류) 내 템플릿. */
  templateCategory: string | null;
  /** Save controls owned by the editor page (02-12); shown for 내 템플릿 only. */
  saveSlot?: React.ReactNode;
  /** Save-status chip owned by the editor page; rendered at the end of the actions tier for every mode. */
  statusSlot?: React.ReactNode;
}

/** Toolbar above an open template, split into two tiers so a narrow width can never squeeze the name
 * or overlap the buttons (BUG-02): the title tier shows the name plus a gray kind label, the actions
 * tier holds the buttons and the save-status chip and wraps when it runs out of room. Takes metadata
 * props only. A default template is read-only: no save or rename, just 사본 만들어 수정. Every template
 * can seed a new document. */
export function TemplateEditorToolbar({ workId, nodeId, name, mode, templateCategory, saveSlot, statusSlot }: TemplateEditorToolbarProps) {
  const [dialog, setDialog] = useState<'copy' | 'create' | 'rename' | null>(null);
  const router = useRouter();
  const isDefault = mode === 'default_template';

  return (
    <div className="flex flex-col gap-1.5 border-b px-3 py-2" data-template-mode={mode}>
      <div className="flex min-w-0 flex-col gap-0.5" data-toolbar-tier="title">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium" title={name}>{name}</span>
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{isDefault ? '기본 템플릿' : '내 템플릿'}</span>
        </div>
        {isDefault && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock size={12} aria-hidden className="shrink-0" />
            기본 템플릿은 읽기 전용이에요. 사본을 만들어 수정해보세요.
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 [&_button]:whitespace-nowrap" data-toolbar-tier="actions">
        {isDefault ? (
          <Button size="sm" onClick={() => setDialog('copy')}>사본 만들어 수정</Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => setDialog('rename')}>이름 변경</Button>
            {saveSlot}
          </>
        )}
        {templateCategory && (
          <Button size="sm" variant={isDefault ? 'outline' : 'default'} onClick={() => setDialog('create')}>이 템플릿으로 새 문서</Button>
        )}
        {statusSlot && <div className="ml-auto shrink-0">{statusSlot}</div>}
      </div>
      {dialog === 'copy' && (
        <CopyTemplateDialog
          open onOpenChange={(v) => !v && setDialog(null)}
          workId={workId} nodeId={nodeId} currentName={name}
        />
      )}
      {dialog === 'rename' && !isDefault && (
        <RenameNodeDialog
          open onOpenChange={(v) => !v && setDialog(null)}
          workId={workId} nodeId={nodeId} currentName={name}
        />
      )}
      {dialog === 'create' && templateCategory && (
        <CreateNodeDialog
          open onOpenChange={(v) => !v && setDialog(null)}
          workId={workId} parentId={null} category={templateCategory}
          // The locked default previews the canonical seed, so it selects the default (id null).
          preselectedTemplateId={isDefault ? null : nodeId}
          onCreated={(newId) => { router.refresh(); if (newId) router.push(`/studio/${workId}/kb/${newId}`); }}
        />
      )}
    </div>
  );
}
