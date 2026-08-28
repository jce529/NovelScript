import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listChapters } from '@/lib/chapters/actions';
import { ChapterList } from '@/components/studio/chapter-list';

export default async function ChaptersPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const chapters = user ? await listChapters(supabase, { ownerId: user.id, workId }) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">회차 목록</h1>
        <Link href={`/studio/${workId}/chapters/new`} className="bg-primary text-primary-foreground rounded px-4 py-2">
          새 회차 추가
        </Link>
      </div>
      {chapters.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <h2 className="text-2xl font-semibold">첫 회차를 써볼까요?</h2>
          <p className="text-muted-foreground">회차를 추가하면 이곳에 표시돼요.</p>
          <Link href={`/studio/${workId}/chapters/new`} className="bg-primary text-primary-foreground rounded px-4 py-2">
            새 회차 추가
          </Link>
        </div>
      ) : (
        <ChapterList workId={workId} chapters={chapters} />
      )}
    </div>
  );
}
