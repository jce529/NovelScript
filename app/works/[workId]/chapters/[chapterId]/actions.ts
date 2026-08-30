'use server';

import { createClient } from '@/lib/supabase/server';
import { incrementChapterView } from '@/lib/reader/views';
import { upsertReadingProgress } from '@/lib/reader/progress';
import { submitReport } from '@/lib/reader/reports';

/** D-09: increments unconditionally, regardless of login state or lock status —
 * "opened the viewer" is the trigger, not "successfully read content".
 * READ-04/D-14: reading progress is ONLY recorded for a chapter the reader could
 * actually read (Claude's discretion — a locked/paid chapter's D-06 message is not
 * "reading", so it must not become the reader's 이어보기 resume point). */
export async function trackChapterOpenAction(workId: string, chapterId: string, locked: boolean) {
  const supabase = await createClient();
  await incrementChapterView(supabase, { chapterId });
  if (!locked) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await upsertReadingProgress(supabase, { userId: user.id, workId, chapterId });
    }
  }
}

export async function submitReportAction(input: { workId: string; chapterId: string | null; reasonCategory: string; detail: string | null }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  return submitReport(supabase, { reporterId: user.id, ...input });
}
