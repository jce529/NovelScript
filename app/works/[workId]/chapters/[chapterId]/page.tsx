import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Viewport } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getPublicChapter, listPublicChapters } from '@/lib/chapters/actions';
import { getPublicWork } from '@/lib/works/actions';
import { getChapterReadingState } from '@/lib/reader/chapter-reading';
import { getSubscriptionState } from '@/lib/reader/subscriptions';
import { VIEWER_COOKIE, parseViewerPreferences } from '@/lib/reader/viewer-preferences';
import { ViewerShell } from '@/components/reader/viewer-shell';
import { submitReportAction } from './actions';

// 03-16: safe-area insets for the fixed viewer bars (root layout is owned by 03-17).
export const viewport: Viewport = { viewportFit: 'cover' };

export default async function ViewerPage({
  params,
}: {
  params: Promise<{ workId: string; chapterId: string }>;
}) {
  const { workId, chapterId } = await params;
  const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
  const [work, chapter, toc, { data: { user } }] = await Promise.all([
    getPublicWork(supabase, { workId }),
    getPublicChapter(supabase, { chapterId }),
    listPublicChapters(supabase, { workId }),
    supabase.auth.getUser(),
  ]);
  if (!work || !chapter || chapter.workId !== workId) notFound();

  const index = toc.findIndex((c) => c.id === chapterId);
  const prev = index > 0 ? toc[index - 1] : null;
  const next = index >= 0 && index < toc.length - 1 ? toc[index + 1] : null;

  const initialPreferences = parseViewerPreferences(cookieStore.get(VIEWER_COOKIE)?.value);

  // Saved position only for a signed-in reader of a genuinely readable chapter (no content, no lookup otherwise).
  const readable = chapter.accessState === 'readable' && chapter.content !== null;
  let initialReadingState = null;
  if (user && readable) {
    try {
      initialReadingState = await getChapterReadingState(supabase, { userId: user.id, chapterId });
    } catch {
      initialReadingState = null;
    }
  }
  let initialSubscribed = false;
  if (user) {
    try {
      initialSubscribed = await getSubscriptionState(supabase, { workId, userId: user.id });
    } catch {
      initialSubscribed = false;
    }
  }

  return (
    <ViewerShell
      // A new chapter is a new visit: remount for a fresh session id and scroll start.
      key={chapter.id}
      workId={workId} chapter={chapter} prev={prev} next={next} toc={toc}
      loggedIn={Boolean(user)}
      onSubmitReport={submitReportAction}
      initialPreferences={initialPreferences}
      initialReadingState={initialReadingState}
      initialSubscribed={initialSubscribed}
    />
  );
}
