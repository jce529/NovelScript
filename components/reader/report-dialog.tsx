'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Flag } from 'lucide-react';
import { toast } from 'sonner';
import { REPORT_CATEGORIES } from '@/lib/reader/reports';

export function ReportDialog({
  workId, chapterId, loggedIn, onSubmit,
}: {
  workId: string;
  chapterId: string | null;
  loggedIn: boolean;
  onSubmit: (input: { workId: string; chapterId: string | null; reasonCategory: string; detail: string | null }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(REPORT_CATEGORIES[0]);
  const [detail, setDetail] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next && !loggedIn) {
      toast.error('로그인이 필요해요.', { action: { label: '로그인하기', onClick: () => { window.location.href = '/login'; } } });
      return;
    }
    setOpen(next);
  }

  function submit() {
    startTransition(async () => {
      const result = await onSubmit({ workId, chapterId, reasonCategory: category, detail: detail.trim() || null });
      if (result.ok) {
        toast.success('신고가 접수되었어요. 검토 후 조치할게요.');
        setOpen(false);
        setDetail('');
      } else {
        toast.error(result.error ?? '신고를 접수하지 못했어요.');
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => handleOpenChange(true)}>
        <Flag className="mr-1 size-3.5" />신고
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>신고하기</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>신고 사유</Label>
            <Select value={category} onValueChange={(value) => { if (value) setCategory(value); }}>
              <SelectTrigger><SelectValue>{() => category}</SelectValue></SelectTrigger>
              <SelectContent>
                {REPORT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {category === '기타' && (
            <div className="flex flex-col gap-1.5">
              <Label>상세 내용</Label>
              <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          <Button variant="destructive" disabled={isPending} onClick={submit}>신고하기</Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}
