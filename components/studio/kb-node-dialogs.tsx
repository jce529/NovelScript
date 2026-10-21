'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FolderPlus, Pencil, Trash2, FolderInput, Copy, FilePlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TreeNode } from '@/lib/kb/tree';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import {
  createNodeAction, renameNodeAction, deleteNodeAction, listTemplateOptionsAction, createFolderAction, moveTemplateFileAction,
  copyTemplateFileAction, createDocumentFromTemplateAction,
} from '@/app/studio/[workId]/kb/[nodeId]/actions';

type DialogKind =
  | 'create' | 'create-folder' | 'rename' | 'delete' | 'move-template'
  | 'copy-template' | 'create-from-template' | 'create-template' | null;

/** Rendered per tree row directly by kb-tree.tsx. 24px hit-area
 * icon buttons per UI-SPEC — every one carries a Tooltip (non-optional at this size). */
export function KbTreeActions({ workId, node, isTemplateCategoryFolder = false, categoryFolders = [] }: {
  workId: string; node: TreeNode; isTemplateCategoryFolder?: boolean; categoryFolders?: TreeNode[];
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const router = useRouter();
  const isChapterFolder = node.category === '회차';
  const isTemplateFile = node.node_type === 'file' && node.category === 'template';
  const isTemplateRootFolder = node.node_type === 'folder' && node.category === 'template' && node.parent_id === null;
  // The category a template file sits in decides which documents it can seed; loose (미분류) files have none.
  const templateCategoryName = isTemplateFile
    ? (categoryFolders.find((folder) => folder.id === node.parent_id)?.name ?? null)
    : null;

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
        {isTemplateRootFolder && categoryFolders.length > 0 && (
          <IconButton label="내 템플릿 만들기" onClick={() => setDialog('create-template')}><FilePlus size={14} /></IconButton>
        )}
        {isTemplateFile && (
          <IconButton label="사본 만들어 수정" onClick={() => setDialog('copy-template')}><Copy size={14} /></IconButton>
        )}
        {isTemplateFile && templateCategoryName && (
          <IconButton label="이 템플릿으로 새 문서" onClick={() => setDialog('create-from-template')}><Plus size={14} /></IconButton>
        )}
        {isTemplateFile && !node.is_locked && categoryFolders.length > 0 && (
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
      {dialog === 'copy-template' && (
        <CopyTemplateDialog
          open onOpenChange={(v) => !v && setDialog(null)}
          workId={workId} nodeId={node.id} currentName={node.name}
        />
      )}
      {dialog === 'create-from-template' && templateCategoryName && (
        <CreateNodeDialog
          open onOpenChange={(v) => !v && setDialog(null)}
          workId={workId} parentId={null} category={templateCategoryName}
          // A locked default previews the canonical seed, so its CTA selects the default (id null).
          preselectedTemplateId={node.is_locked ? null : node.id}
          onCreated={(newId) => { router.refresh(); if (newId) router.push(`/studio/${workId}/kb/${newId}`); }}
        />
      )}
      {dialog === 'create-template' && (
        <CreateTemplateDialog
          open onOpenChange={(v) => !v && setDialog(null)} workId={workId}
          areas={[{ scope: node.scope, folders: categoryFolders.map((folder) => ({ id: folder.id, name: folder.name })) }]}
          onCreated={() => router.refresh()}
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

/** Select value standing in for the canonical default (its template id is null). */
const CANONICAL = 'canonical';
const SAVE_FAILED = '저장하지 못했어요. 잠시 후 다시 시도해주세요.';

export type SubmitCallbacks = { onSuccess: (nodeId: string | undefined) => void; onError: (message: string) => void };

/** "사본 만들어 수정" submit. A failure (including a duplicate name) only reports the error:
 * the caller keeps the dialog open and does not navigate. */
export async function runCopyTemplate(
  args: { workId: string; nodeId: string; name: string }, cb: SubmitCallbacks,
): Promise<void> {
  const result = await copyTemplateFileAction(args.workId, args.nodeId, args.name);
  if (!result.ok) { cb.onError(result.error ?? SAVE_FAILED); return; }
  cb.onSuccess(result.nodeId);
}

/** New document from the selected template. Only the template id travels to the server, which
 * re-validates it and reads the stored content. `selected` CANONICAL means the default (id null). */
export async function runCreateFromTemplate(
  args: { workId: string; category: string; parentId: string | null; name: string; selected: string }, cb: SubmitCallbacks,
): Promise<void> {
  const result = await createDocumentFromTemplateAction(args.workId, {
    category: args.category, parentId: args.parentId, name: args.name,
    templateId: args.selected === CANONICAL ? null : args.selected,
  });
  if (!result.ok) { cb.onError(result.error ?? SAVE_FAILED); return; }
  cb.onSuccess(result.nodeId);
}

/** 내 템플릿 만들기: the existing createNode path (category=template) under the chosen category folder. */
export async function runCreateTemplate(
  args: { workId: string; folderId: string; name: string }, cb: SubmitCallbacks,
): Promise<void> {
  const result = await createNodeAction(args.workId, args.folderId, 'template', 'file', args.name);
  if (!result.ok) { cb.onError(result.error ?? SAVE_FAILED); return; }
  cb.onSuccess(result.nodeId);
}

export function CreateNodeDialog({
  open, onOpenChange, workId, parentId, category, onCreated, preselectedTemplateId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; workId: string;
  /** null = the category's root folder (resolved server-side). */
  parentId: string | null; category: string;
  onCreated: (nodeId?: string) => void;
  /** undefined/null = the default (canonical); a string = a 내 템플릿 id. */
  preselectedTemplateId?: string | null;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // D-10 (Reopen): the default is the single canonical option; 내 템플릿 are listed per scope and
  // chosen explicitly by id. A preselected id (folder row, section row, open-template CTA) wins.
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(preselectedTemplateId ?? CANONICAL);

  useEffect(() => {
    if (!open || category === 'template') return;
    listTemplateOptionsAction(workId, category).then((result) => {
      if (!result.ok) return;
      setTemplateOptions(result.options);
      const preselected = preselectedTemplateId ? result.options.find((o) => o.id === preselectedTemplateId) : undefined;
      const defaultOption = result.options.find((o) => o.isDefault);
      setSelectedTemplateId(preselected?.id ?? (defaultOption ? (defaultOption.id ?? CANONICAL) : CANONICAL));
    });
  }, [open, workId, category, preselectedTemplateId]);

  const isTemplateCategory = category === 'template';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isTemplateCategory ? '새 템플릿 만들기' : '새 문서 만들기'}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-node-name">{isTemplateCategory ? '템플릿 이름' : '문서 이름'}</Label>
          <Input id="new-node-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={isTemplateCategory ? '템플릿 이름' : '문서 이름'} />
        </div>
        {!isTemplateCategory && templateOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-node-template">템플릿 선택</Label>
            <Select value={selectedTemplateId} onValueChange={(value) => setSelectedTemplateId(value ?? CANONICAL)}>
              <SelectTrigger id="new-node-template">
                <SelectValue>
                  {(value: string) => {
                    const opt = templateOptions.find((o) => (o.id ?? CANONICAL) === value);
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
                        <SelectItem key={option.id ?? CANONICAL} value={option.id ?? CANONICAL}>
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
              const cb: SubmitCallbacks = {
                onError: (message) => setError(message),
                onSuccess: (nodeId) => { onOpenChange(false); onCreated(nodeId); },
              };
              if (isTemplateCategory) {
                if (!parentId) { setError(SAVE_FAILED); return; }
                await runCreateTemplate({ workId, folderId: parentId, name }, cb);
              } else {
                await runCreateFromTemplate({ workId, category, parentId, name, selected: selectedTemplateId }, cb);
              }
            })}
          >
            {isTemplateCategory ? '새 템플릿 만들기' : '새 문서 만들기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "사본 만들어 수정": asks for the copy name (suggesting "<기존 이름> 사본") and opens the new editor. */
export function CopyTemplateDialog({
  open, onOpenChange, workId, nodeId, currentName,
}: { open: boolean; onOpenChange: (v: boolean) => void; workId: string; nodeId: string; currentName: string }) {
  const [name, setName] = useState(`${currentName} 사본`);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>사본 만들어 수정</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="copy-template-name">사본 이름</Label>
          <Input id="copy-template-name" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="사본 이름" />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            disabled={isPending}
            onClick={() => startTransition(async () => {
              await runCopyTemplate({ workId, nodeId, name }, {
                onError: (message) => setError(message),
                onSuccess: (newId) => {
                  onOpenChange(false);
                  router.refresh();
                  if (newId) router.push(`/studio/${workId}/kb/${newId}`);
                },
              });
            })}
          >
            사본 만들기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface TemplateArea { scope: 'work' | 'account_template'; folders: { id: string; name: string }[] }

const AREA_LABEL: Record<TemplateArea['scope'], string> = { work: '이 작품 전용', account_template: '계정 공용' };

/** 내 템플릿 만들기: name + scope(영역) + category, resolved to the exact existing category folder. */
export function CreateTemplateDialog({
  open, onOpenChange, workId, areas, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; workId: string; areas: TemplateArea[]; onCreated: (nodeId?: string) => void }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TemplateArea['scope']>(areas[0]?.scope ?? 'work');
  const [category, setCategory] = useState<string>(KB_CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const area = areas.find((a) => a.scope === scope) ?? areas[0];
  const folder = area?.folders.find((f) => f.name === category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>내 템플릿 만들기</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-template-name">템플릿 이름</Label>
          <Input id="new-template-name" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="템플릿 이름" />
        </div>
        {areas.length > 1 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-template-scope">영역</Label>
            <Select value={scope} onValueChange={(v) => setScope((v ?? 'work') as TemplateArea['scope'])}>
              <SelectTrigger id="new-template-scope" className="w-full">
                <SelectValue>{(v: TemplateArea['scope']) => AREA_LABEL[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {areas.map((a) => <SelectItem key={a.scope} value={a.scope}>{AREA_LABEL[a.scope]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-template-category">카테고리</Label>
          <Select value={category} onValueChange={(v) => setCategory(v ?? KB_CATEGORIES[0])}>
            <SelectTrigger id="new-template-category" className="w-full"><SelectValue>{(v: string) => v}</SelectValue></SelectTrigger>
            <SelectContent>
              {KB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            disabled={isPending}
            onClick={() => startTransition(async () => {
              if (!folder) { setError('템플릿 카테고리 폴더를 찾을 수 없어요.'); return; }
              await runCreateTemplate({ workId, folderId: folder.id, name }, {
                onError: (message) => setError(message),
                onSuccess: (nodeId) => { onOpenChange(false); onCreated(nodeId); },
              });
            })}
          >
            새 템플릿 만들기
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
              if (!result.ok) { setError(result.error ?? SAVE_FAILED); return; }
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
              if (!result.ok) { setError(result.error ?? SAVE_FAILED); return; }
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
              if (!result.ok) { setError(result.error ?? SAVE_FAILED); return; }
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
