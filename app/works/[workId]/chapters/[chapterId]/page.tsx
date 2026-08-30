import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPublicChapter, listPublicChapters } from '@/lib/chapters/actions';
import { getPublicWork } from '@/lib/works/actions';
import { ViewerShell } from '@/components/reader/viewer-shell';

export default async function ViewerPage({
  params,
}: {
  params: Promise<{ workId: string; chapterId: string }>;
}) {
  const { workId, chapterId } = await params;
  const supabase = await createClient();
  const [work, chapter, toc, { data: { user } }] = await Promise.all([
    getPublicWork(supabase, { workId }),
    getPublicChapter(supabase, { chapterId }),
    listPublicChapters(supabase, { workId }),
    supabase.auth.getUser(),
  ]);
  if (!work || !chapter) notFound();

  const index = toc.findIndex((c) => c.id === chapterId);
  const prev = index > 0 ? toc[index - 1] : null;
  const next = index >= 0 && index < toc.length - 1 ? toc[index + 1] : null;

  return (
    <ViewerShell
      workId={workId} chapter={chapter} prev={prev} next={next} toc={toc}
      loggedIn={Boolean(user)}
      onSubmitReport={async () => ({ ok: false, error: '준비 중이에요.' })}
    />
  );
}
