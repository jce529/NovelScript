'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/categories';
import type { FlatKbNode } from '@/lib/kb/tree';
import {
  MAX_ATTACHMENTS, MAX_ATTACHMENT_CHARS, MAX_IMPORT_FILES, MAX_IMPORT_CHARS,
  isAcceptedTextFile, type ChatAttachment,
} from '@/lib/ai/attachments';
import {
  importFilesAction, listCategoryFoldersAction, classifyUploadFilesAction, importClassifiedFilesAction,
  loadPlacementTreeAction,
} from '../actions';
import { initialQuickAddFoldersState, quickAddFoldersReducer } from './quick-add-folders';
import { PlacementTree } from './PlacementTree';

type UploadMode = 'import' | 'auto' | 'attach';

export interface UploadFilesDialogProps {
  workId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Files already attached to the conversation — counts toward the attach limit. */
  attachedCount: number;
  onAttach: (files: ChatAttachment[]) => void;
}

/** 로컬 작업물(.md/.txt)을 (a) 설정 문서로 일괄 저장하거나 (b) Jev가 분류한 트리를 승인해 저장하거나 (c) 이번 대화에만 첨부한다. */
export function UploadFilesDialog({ workId, open, onOpenChange, attachedCount, onAttach }: UploadFilesDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<UploadMode>('import');
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [category, setCategory] = useState<KbCategory>('인물');
  const [isPending, setIsPending] = useState(false);
  const [folderState, dispatch] = useReducer(quickAddFoldersReducer, initialQuickAddFoldersState);
  const seqRef = useRef(0);
  /** 'auto' 모드 승인 단계: 기존 트리 + Jev 제안 배치. tree가 null이면 아직 분류 전. */
  const [tree, setTree] = useState<FlatKbNode[] | null>(null);
  const [placement, setPlacement] = useState<Record<string, string | null>>({});
  const [suggested, setSuggested] = useState<Record<string, string | null>>({});
  const inReview = mode === 'auto' && tree !== null;
  const allPlaced = files.every((file) => Boolean(placement[file.name]));
  const limit = mode !== 'attach' ? MAX_IMPORT_FILES : Math.max(0, MAX_ATTACHMENTS - attachedCount);
  const maxChars = mode !== 'attach' ? MAX_IMPORT_CHARS : MAX_ATTACHMENT_CHARS;

  function resetReview() {
    setTree(null);
    setPlacement({});
    setSuggested({});
  }

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the previous selection each time the dialog reopens
    setFiles([]);
    resetReview();
  }, [open]);

  useEffect(() => {
    if (!open || mode !== 'import') return;
    const seq = ++seqRef.current;
    dispatch({ type: 'request', seq });
    listCategoryFoldersAction(workId, category)
      .then((result) => dispatch({ type: 'loaded', seq, result }))
      .catch(() => dispatch({ type: 'failed', seq }));
  }, [open, mode, category, workId]);

  async function pickFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((file) => isAcceptedTextFile(file.name));
    const skippedType = list.length - picked.length;
    const next = [...files];
    let skippedLimit = 0;
    let skippedSize = 0;
    for (const file of picked) {
      if (next.some((existing) => existing.name === file.name)) continue;
      if (next.length >= limit) { skippedLimit += 1; continue; }
      const text = await file.text();
      if (text.length > maxChars) { skippedSize += 1; continue; }
      next.push({ name: file.name, content: text });
    }
    setFiles(next);
    resetReview();
    const notes = [
      skippedType && `${skippedType}개는 .md/.txt 파일이 아니라서 제외했어요.`,
      skippedLimit && `한 번에 ${limit}개까지만 올릴 수 있어요. ${skippedLimit}개를 제외했어요.`,
      skippedSize && `${skippedSize}개는 ${maxChars.toLocaleString()}자를 넘어서 제외했어요.`,
    ].filter(Boolean);
    if (notes.length) toast.warning(notes.join(' '));
  }

  /** Jev에게 배치를 제안받고, 승인 화면에 쓸 기존 트리를 함께 불러온다. 이 단계에서는 아무것도 저장하지 않는다. */
  async function classify() {
    setIsPending(true);
    try {
      const [result, nodes] = await Promise.all([
        classifyUploadFilesAction({ workId, files }),
        loadPlacementTreeAction(workId),
      ]);
      if (!result.ok) { toast.error(result.error); return; }
      if (!nodes) { toast.error('문서 트리를 불러오지 못했어요.'); return; }
      const initial: Record<string, string | null> = {};
      for (const item of result.items) initial[item.fileName] = item.folderId;
      setTree(nodes);
      setPlacement(initial);
      setSuggested(initial);
      const unsure = result.items.filter((item) => !item.folderId).length;
      if (unsure > 0) toast.warning(`${unsure}개는 AI가 확신하지 못했어요. 트리에서 직접 배치해 주세요.`);
    } catch {
      toast.error('분류하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsPending(false);
    }
  }

  function reportImport(result: { created: unknown[]; failed: { fileName: string; error: string }[] }, successText: string) {
    if (result.created.length > 0) toast.success(successText);
    if (result.failed.length === 0) { onOpenChange(false); router.refresh(); return; }
    toast.error(`${result.failed.length}개는 저장하지 못했어요: ${result.failed.slice(0, 3).map((item) => `${item.fileName}(${item.error})`).join(', ')}`);
    const failedNames = new Set(result.failed.map((item) => item.fileName));
    setFiles((prev) => prev.filter((file) => failedNames.has(file.name)));
    resetReview();
    router.refresh();
  }

  async function approvePlacement() {
    if (!allPlaced) return;
    setIsPending(true);
    try {
      const result = await importClassifiedFilesAction({
        workId,
        files: files.map((file) => ({ name: file.name, content: file.content, targetFolderId: placement[file.name] })),
      });
      if (!result.ok) { toast.error(result.error); return; }
      reportImport(result, `${result.created.length}개 문서를 승인한 위치에 저장했어요.`);
    } catch {
      toast.error('저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsPending(false);
    }
  }

  async function submit() {
    if (files.length === 0) return;
    if (mode === 'auto') { if (inReview) await approvePlacement(); else await classify(); return; }
    if (mode === 'attach') {
      onAttach(files);
      toast.success(`${files.length}개 파일을 이번 대화에 첨부했어요.`);
      onOpenChange(false);
      return;
    }
    if (!folderState.selectedFolderId) return;
    setIsPending(true);
    try {
      const result = await importFilesAction({
        workId, category, targetFolderId: folderState.selectedFolderId, folderVersion: folderState.selectedVersion, files,
      });
      if (!result.ok) { toast.error(result.error); return; }
      reportImport(result, `${result.created.length}개 문서를 ${category} 폴더에 저장했어요.`);
    } catch {
      toast.error('저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsPending(false);
    }
  }

  const importBlocked = mode === 'import' && (folderState.loading || !folderState.canSubmit);
  const submitLabel = mode === 'auto'
    ? (isPending ? '처리 중...' : inReview ? `승인하고 ${files.length}개 저장` : `${files.length}개 AI로 분류하기`)
    : mode === 'import' ? `${files.length}개 저장` : `${files.length}개 첨부`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>파일 업로드</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="업로드 방식" className="flex flex-wrap gap-2">
            {([['import', '설정 문서로 저장'], ['auto', 'AI 자동 분류'], ['attach', '이번 대화에만 첨부']] as const).map(([value, label]) => (
              <Button key={value} type="button" role="radio" aria-checked={mode === value} size="sm" variant={mode === value ? 'default' : 'outline'} onClick={() => { setMode(value); resetReview(); }}>
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === 'auto'
              ? 'AI(Jev)가 문서를 어느 폴더에 둘지 트리로 제안해요. 마음에 안 들면 끌어서 옮기고, 승인하면 그대로 저장돼요. 승인 전에는 아무것도 저장되지 않아요.'
              : mode === 'import'
                ? `로컬에서 작업한 .md/.txt 파일을 한 번에 최대 ${MAX_IMPORT_FILES}개까지 설정 문서로 옮겨요. 파일 이름이 문서 이름이 돼요.`
                : `파일 내용을 이번 대화의 참고 자료로만 AI에게 전달해요. 저장되지 않고, 최대 ${MAX_ATTACHMENTS}개까지 첨부할 수 있어요.`}
          </p>

          <div className="flex flex-col gap-1">
            <Label htmlFor="upload-files-input">파일 선택</Label>
            <input
              id="upload-files-input" type="file" multiple accept=".md,.markdown,.txt,text/plain,text/markdown"
              className="text-sm" onChange={(e) => { void pickFiles(e.target.files); e.target.value = ''; }}
            />
            {mode !== 'attach' && (
              <label className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                또는 폴더째 선택
                <input
                  type="file" multiple className="text-sm text-foreground"
                  // webkitdirectory is non-standard and has no React typing.
                  {...({ webkitdirectory: '' } as Record<string, string>)}
                  onChange={(e) => { void pickFiles(e.target.files); e.target.value = ''; }}
                />
              </label>
            )}
          </div>

          {files.length > 0 && !inReview && (
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
              {files.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-2">
                  <span className="truncate">{file.name} <span className="text-xs text-muted-foreground">({file.content.length.toLocaleString()}자)</span></span>
                  <button type="button" aria-label={`${file.name} 제외`} onClick={() => { setFiles(files.filter((f) => f.name !== file.name)); resetReview(); }}>
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {inReview && tree && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">배치 제안 — 확인하고 필요하면 끌어서 옮겨 주세요</p>
              <PlacementTree
                nodes={tree}
                files={files.map((file) => file.name)}
                placement={placement}
                suggested={suggested}
                disabled={isPending}
                onMove={(fileName, folderId) => setPlacement((prev) => ({ ...prev, [fileName]: folderId }))}
              />
            </div>
          )}

          {mode === 'import' && (
            <>
              <div className="flex flex-col gap-1">
                <Label>템플릿 종류</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as KbCategory)}>
                  <SelectTrigger className="w-full"><SelectValue>{(value: string) => value}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {KB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label>저장 폴더</Label>
                <Select
                  value={folderState.selectedFolderId ?? null}
                  onValueChange={(value) => value && dispatch({ type: 'select', folderId: value })}
                >
                  <SelectTrigger className="w-full" disabled={folderState.loading || folderState.folders.length === 0}>
                    <SelectValue placeholder={folderState.loading ? '폴더 불러오는 중...' : '저장 폴더 선택'}>
                      {(value: string) => {
                        const selected = folderState.folders.find((folder) => folder.id === value);
                        return selected?.isRoot ? `${category} (최상위)` : selected?.path;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {folderState.folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.isRoot ? `${category} (최상위)` : folder.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {folderState.message && (
                  <p className="text-xs text-muted-foreground" role={folderState.canSubmit ? undefined : 'alert'}>{folderState.message}</p>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            disabled={isPending || files.length === 0 || importBlocked || (mode === 'attach' && limit === 0) || (inReview && !allPlaced)}
            onClick={submit}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
