'use client';

import { use, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { submitCreateChapter } from './actions';

export default function NewChapterPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = use(params);
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await submitCreateChapter(workId, title);
      if (!result.ok) {
        setError(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
        return;
      }
      router.push(`/studio/${workId}/chapters/${result.chapterId}`);
    });

  return (
    <main className="flex flex-col gap-4 max-w-md">
      <h1 className="text-xl font-semibold">새 회차 추가</h1>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="chapter-title">회차 제목</Label>
          <Input id="chapter-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="회차 제목" required />
        </div>
        <Button disabled={isPending || !title.trim()} onClick={submit} className="w-fit">새 회차 추가</Button>
      </div>
    </main>
  );
}
