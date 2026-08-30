import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

/** D-16: fixed set, must match the reports.reason_category check constraint in
 * 0003_reader.sql verbatim. Single source of truth — UI plans (03-06/03-07) import
 * this for their <Select> options rather than retyping the list. */
export const REPORT_CATEGORIES = ['내용 불일치/표절', '혐오·유해 콘텐츠', '스팸/광고', '기타'] as const;

const reportSchema = z.object({
  workId: z.string().uuid(),
  chapterId: z.string().uuid().nullable(),
  reasonCategory: z.enum(REPORT_CATEGORIES),
  detail: z.string().trim().optional().nullable(),
}).refine((v) => v.reasonCategory !== '기타' || Boolean(v.detail && v.detail.length > 0), {
  message: '상세 내용을 입력해주세요.',
  path: ['detail'],
});

export interface ReportMutationResult {
  ok: boolean;
  error?: string;
  reportId?: string;
}

/** READ-05/D-16/D-17: login-gated (caller must supply a real reporterId from the
 * session — never derive it from client input). chapterId null = work-level report. */
export async function submitReport(
  supabase: SupabaseClient,
  input: { reporterId: string; workId: string; chapterId: string | null; reasonCategory: string; detail?: string | null }
): Promise<ReportMutationResult> {
  const parsed = reportSchema.safeParse({
    workId: input.workId, chapterId: input.chapterId,
    reasonCategory: input.reasonCategory, detail: input.detail,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '신고를 접수하지 못했어요.' };
  }
  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: input.reporterId,
      work_id: parsed.data.workId,
      chapter_id: parsed.data.chapterId,
      reason_category: parsed.data.reasonCategory,
      detail: parsed.data.detail ?? null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, reportId: data.id };
}
