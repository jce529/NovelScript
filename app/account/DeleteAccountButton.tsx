'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { deleteAccountAction } from './actions';

export function DeleteAccountButton({ isWriter }: { isWriter: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction();
      if (result.ok) {
        router.replace('/login');
        router.refresh();
        return;
      }
      setError(result.message ?? '탈퇴를 끝내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
      <DialogTrigger render={<Button ref={triggerRef} type="button" variant="link" className="h-auto p-0 text-red-600 underline" onClick={() => setOpen(true)}>계정 탈퇴하기</Button>} />
      <DialogContent initialFocus={cancelRef} finalFocus={triggerRef}>
        <DialogHeader><DialogTitle>정말 탈퇴할까요?</DialogTitle></DialogHeader>
        <DialogDescription>
          <span className="block">탈퇴하면 되돌릴 수 없어요.</span>
          <span className="block">필명과 소개{isWriter ? ', 등록한 AI API 키' : ''}가 삭제되고, 같은 소셜 계정으로 다시 로그인하면 새 계정으로 시작해요.</span>
          <span className="block">결제·토큰 사용 기록은 법적·정산 목적으로 남아요.</span>
        </DialogDescription>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button ref={cancelRef} type="button" variant="outline" disabled={pending}>취소</Button>} />
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <span role="status">탈퇴 처리 중…</span> : '탈퇴하기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
