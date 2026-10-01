'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/categories';
import { listCategoryFoldersAction, quickAddMentionAction } from '../actions';
import { initialQuickAddFoldersState, quickAddFoldersReducer } from './quick-add-folders';

export interface QuickAddDialogProps {
  workId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onCreated: (node: { id: string; name: string; category: KbCategory }) => void;
}

/** D-04: lightweight, in-place KB document creation — no navigation away from the editor. */
export function QuickAddDialog({ workId, open, onOpenChange, initialName, onCreated }: QuickAddDialogProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<KbCategory>('인물');
  const [isPending, setIsPending] = useState(false);
  const [folderState, dispatch] = useReducer(quickAddFoldersReducer, initialQuickAddFoldersState);
  const seqRef = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the editable name whenever the dialog reopens with a new initial value
    if (open) setName(initialName);
  }, [open, initialName]);

  useEffect(() => {
    if (!open) return;
    const seq = ++seqRef.current;
    dispatch({ type: 'request', seq });
    listCategoryFoldersAction(workId, category)
      .then((result) => dispatch({ type: 'loaded', seq, result }))
      .catch(() => dispatch({ type: 'failed', seq }));
  }, [open, category, workId]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { toast.error('문서 이름을 입력해주세요.'); return; }
    setIsPending(true);
    const result = await quickAddMentionAction(workId, category, trimmed, folderState.selectedFolderId, folderState.selectedVersion);
    setIsPending(false);
    if (!result.ok || !result.nodeId) {
      toast.error(result.error ?? '생성하지 못했어요. 잠시 후 다시 시도해주세요.');
      return;
    }
    onCreated({ id: result.nodeId, name: trimmed, category });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>새 문서 만들기</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="quick-add-name">문서 이름</Label>
            <Input id="quick-add-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
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
              value={folderState.selectedFolderId}
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
              <p
                className="text-xs text-muted-foreground"
                role={folderState.canSubmit ? undefined : 'alert'}
              >
                {folderState.message}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button disabled={isPending || folderState.loading || !folderState.canSubmit} onClick={submit}>만들기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
