'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FolderPlus, Pencil, Trash2, FolderInput } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TreeNode } from '@/lib/kb/tree';
import {
  createNodeAction, renameNodeAction, deleteNodeAction, listTemplateOptionsAction, createFolderAction, moveTemplateFileAction,
} from '@/app/studio/[workId]/kb/[nodeId]/actions';

/** Rendered per tree row directly by kb-tree.tsx. 24px hit-area
 * icon buttons per UI-SPEC — every one carries a Tooltip (non-optional at this size). */
export function KbTreeActions({ workId, node, isTemplateCategoryFolder = false, categoryFolders = [] }: {
  workId: string; node: TreeNode; isTemplateCategoryFolder?: boolean; categoryFolders?: TreeNode[];
}) {
  const [dialog, setDialog] = useState<'create' | 'create-folder' | 'rename' | 'delete' | 'move-template' | null>(null);
  const router = useRouter();
  const isChapterFolder = node.category === '회차';

  return (
    <>
      <div className="flex items-center gap-1">
        {isChapterFolder && (
          <IconButton label="새 회차 만들기" onClick={() => router.push(`/studio/${workId}/chapters/new?folderId=${node.id}`)}>
            <Plus size={14} />
          </IconButton>
        )}
        {node.node_type === 'folder' && (node.category !== 'template' || isTemplateCategoryFolder) && !isChapterFolder && (
          <IconButton label="하위 문서 추가" onClick={() => setDialog('create')}><Plus size={14} /></IconButton>
        )}
        {node.node_type === 'folder' && node.category !== 'template' && (
          <IconButton label="새 폴더 만들기" onClick={() => setDialog('create-folder')}><FolderPlus size={14} /></IconButton>
        )}
        {node.node_type === 'file' && node.category === 'template' && categoryFolders.length > 0 && (
          <IconButton label="카테고리 폴더로 이동" onClick={() => setDialog('move-template')}><FolderInput size={14} /></IconButton>
        )}
        {!node.is_locked && (
          <>
            <IconButton label="이름 변경" onClick={() => setDialog('rename')}><Pencil size={14} /></IconButton>
            <IconButton label="삭제" onClick={() => setDialog('delete')}><Trash2 size={14} /></IconButton>
          </>
        )}
      </div>
      {dialog === 'create' && (
        <CreateNodeDialog
          open onOpenChange={(v) => !v && setDialog(null)}
          workId={workId} parentId={node.id} category={node.category} onCreated={() => router.refresh()}
        />
      )}
      {dialog === 'move-template' && (
        <MoveTemplateFileDialog
          open onOpenChange={(v) => !v && setDialog(null)} workId={workId}
          nodeId={node.id} currentParentId={node.parent_id} categoryFolders={categoryFolders}
          onMoved={() => router.refresh()}
        />
      )}
      {dialog === 'create-folder' && (
        <CreateFolderDialog
          open onOpenChange={(v) => !v && setDialog(null)}
          workId={workId} scope={node.scope} parentId={node.id} onCreated={() => router.refresh()}
        />
      )}
      {dialog === 'rename' && (
        <RenameNodeDialog
          open onOpenChange={(v) => !v && setDialog(null)}
          workId={workId} nodeId={node.id} currentName={node.name}
        />
      )}
      {dialog === 'delete' && (
        <DeleteNodeDialog
          open onOpenChange={(v) => !v && setDialog(null)}
          workId={workId} nodeId={node.id} name={node.name} isChapterFolder={isChapterFolder} onDeleted={() => router.refresh()}
        />
      )}
    </>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button onClick={onClick} aria-label={label} className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent">
            {children}
          </button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface TemplateOption {
  id: string | null;
  name: string;
  scope: 'work' | 'account_template' | 'canonical';
  content: string;
  isDefault: boolean;
}

const SCOPE_LABEL: Record<TemplateOption['scope'], string> = {
  work: '이 작품 전용',
  account_template: '계정 공용',
  canonical: '기본',
};

const TEMPLATE_GROUPS = [
  { scope: 'work', label: '작품 템플릿' },
  { scope: 'account_template', label: '계정 템플릿' },
  { scope: 'canonical', label: '기본 템플릿' },
] as const;

export function CreateNodeDialog({
  open, onOpenChange, workId, parentId, category, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; workId: string; parentId: string; category: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // D-10: every selectable template for this category (work-level, account-level,
  // canonical) — the writer picks which one seeds the new document, defaulting to
  // whichever option listTemplateOptions flagged isDefault (category-name match).
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('canonical');

  useEffect(() => {
    if (!open || category === 'template') return;
    listTemplateOptionsAction(workId, category).then((result) => {
      if (!result.ok) return;
      setTemplateOptions(result.options);
      const defaultOption = result.options.find((o) => o.isDefault);
      setSelectedTemplateId(defaultOption ? (defaultOption.id ?? 'canonical') : 'canonical');
    });
  }, [open, workId, category]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{category === 'template' ? '새 템플릿 만들기' : '새 문서 만들기'}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-node-name">{category === 'template' ? '템플릿 이름' : '문서 이름'}</Label>
          <Input id="new-node-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={category === 'template' ? '템플릿 이름' : '문서 이름'} />
        </div>
        {category !== 'template' && templateOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-node-template">템플릿 선택</Label>
            <Select value={selectedTemplateId} onValueChange={(value) => setSelectedTemplateId(value ?? 'canonical')}>
              <SelectTrigger id="new-node-template">
                <SelectValue>
                  {(value: string) => {
                    const opt = templateOptions.find((o) => (o.id ?? 'canonical') === value);
                    return opt ? `${opt.name} (${SCOPE_LABEL[opt.scope]})` : '템플릿 선택';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_GROUPS.map(({ scope, label }) => {
                  const options = templateOptions.filter((option) => option.scope === scope);
                  return options.length > 0 && (
                    <SelectGroup key={scope}>
                      <SelectLabel>{label}</SelectLabel>
                      {options.map((option) => (
                        <SelectItem key={option.id ?? 'canonical'} value={option.id ?? 'canonical'}>
                          {option.name} ({SCOPE_LABEL[option.scope]}){option.isDefault ? ' (기본)' : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const chosen = templateOptions.find((o) => (o.id ?? 'canonical') === selectedTemplateId);
              // Explicitly pass `null` only when the writer picked the canonical
              // option — this bypasses createNode's own auto-resolution, matching
              // D-10's "the picker's explicit choice overrides Pattern 3" contract.
              const templateOverrideContent = chosen && chosen.scope !== 'canonical' ? chosen.content : null;
              const result = await createNodeAction(workId, parentId, category, 'file', name, templateOverrideContent);
              if (!result.ok) { setError(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
              onOpenChange(false);
              onCreated();
            })}
          >
            {category === 'template' ? '새 템플릿 만들기' : '새 문서 만들기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoveTemplateFileDialog({ open, onOpenChange, workId, nodeId, currentParentId, categoryFolders, onMoved }: {
  open: boolean; onOpenChange: (v: boolean) => void; workId: string; nodeId: string;
  currentParentId: string | null; categoryFolders: TreeNode[]; onMoved: () => void;
}) {
  const [targetId, setTargetId] = useState(currentParentId && categoryFolders.some((folder) => folder.id === currentParentId) ? currentParentId : '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>카테고리 폴더로 이동</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="template-category-folder">이동할 카테고리</Label>
          <Select value={targetId} onValueChange={(value) => { setTargetId(value ?? ''); setError(null); }}>
            <SelectTrigger id="template-category-folder" className="w-full">
              <SelectValue>{(value: string) => categoryFolders.find((folder) => folder.id === value)?.name ?? '카테고리를 선택해주세요'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {categoryFolders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button disabled={isPending || !targetId || targetId === currentParentId} onClick={() => startTransition(async () => {
            const result = await moveTemplateFileAction(workId, nodeId, targetId);
            if (!result.ok) { setError(result.error ?? '이동하지 못했어요. 다시 시도해주세요.'); return; }
            onOpenChange(false);
            onMoved();
          })}>이동하기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateFolderDialog({
  open, onOpenChange, workId, scope, parentId, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; workId: string; scope: 'work' | 'account_template'; parentId: string | null; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>새 폴더 만들기</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-folder-name">폴더 이름</Label>
          <Input id="new-folder-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="폴더 이름" />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const result = await createFolderAction(workId, scope, parentId, name);
              if (!result.ok) { setError(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
              onOpenChange(false);
              onCreated();
            })}
          >
            새 폴더 만들기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Root-header entry point (UI-SPEC: "Root header actions") — neither root is
 * a real kb_nodes row, so there's no tree row to attach KbTreeActions to;
 * this is a standalone trigger for parentId=null creation. */
export function CreateRootFolderButton({ workId, scope }: { workId: string; scope: 'work' | 'account_template' }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <IconButton label="새 폴더 만들기" onClick={() => setOpen(true)}><FolderPlus size={14} /></IconButton>
      {open && (
        <CreateFolderDialog
          open onOpenChange={setOpen}
          workId={workId} scope={scope} parentId={null} onCreated={() => router.refresh()}
        />
      )}
    </>
  );
}

export function RenameNodeDialog({
  open, onOpenChange, workId, nodeId, currentName,
}: { open: boolean; onOpenChange: (v: boolean) => void; workId: string; nodeId: string; currentName: string }) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>이름 변경</DialogTitle></DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="기존 이름 유지" />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const result = await renameNodeAction(workId, nodeId, name);
              if (!result.ok) { setError(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
              onOpenChange(false);
              router.refresh();
            })}
          >
            변경 완료
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteNodeDialog({
  open, onOpenChange, workId, nodeId, name, isChapterFolder = false, onDeleted,
}: { open: boolean; onOpenChange: (v: boolean) => void; workId: string; nodeId: string; name: string; isChapterFolder?: boolean; onDeleted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isChapterFolder ? `'${name}' 폴더를 삭제할까요?` : `'${name}'을(를) 삭제할까요?`}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isChapterFolder ? '이 폴더 안의 회차는 삭제되지 않고 회차 폴더 상위로 이동해요.' : '삭제하면 되돌릴 수 없어요.'}
        </p>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const result = await deleteNodeAction(workId, nodeId);
              if (!result.ok) { setError(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
              onOpenChange(false);
              onDeleted();
            })}
          >
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
