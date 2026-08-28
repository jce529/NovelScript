'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { GENRES } from '@/lib/works/actions';
import { submitCreateWork } from './actions';

export default function NewWorkPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await submitCreateWork({
        title,
        synopsis: synopsis.trim() ? synopsis : null,
        genre,
      });
      if (!result.ok) {
        setError(result.error ?? '작품을 만들지 못했어요.');
        return;
      }
      router.push(`/studio/${result.workId}`);
    });

  return (
    <main className="mx-auto max-w-md p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">새 작품 만들기</h1>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="work-title">작품 제목</Label>
          <Input id="work-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="work-synopsis">시놉시스 (선택)</Label>
          <Textarea id="work-synopsis" value={synopsis} onChange={(e) => setSynopsis(e.target.value)} />
          <span className="text-xs text-muted-foreground">시놉시스를 입력하지 않으면 독자 화면에 빈 문구로 표시돼요.</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="work-genre">장르 (선택)</Label>
          <Select value={genre} onValueChange={(value) => setGenre(value)}>
            <SelectTrigger id="work-genre"><SelectValue placeholder="선택 안 함" /></SelectTrigger>
            <SelectContent>
              {GENRES.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={isPending || !title.trim()} onClick={submit} className="w-fit">
          새 작품 만들기
        </Button>
      </div>
    </main>
  );
}
