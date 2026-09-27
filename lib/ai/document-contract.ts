import type { DocumentProposal } from './prompt';
import type { KbCategory } from '@/lib/kb/categories';

export function extractRequiredHeadings(templateContent: string): string[] {
  return templateContent.split('\n').map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+\S/.test(line) && !line.includes('<%'));
}

export type ContractCheck =
  | { ok: true }
  | { ok: false; reason: 'missing_document' | 'category_mismatch' }
  | { ok: false; reason: 'missing_headings'; missing: string[] };

/** BUG-01 §Gemini 생성 계약 검증 — headings must occur as an ordered subsequence. */
export function validateDocumentAgainstPlan(
  proposal: DocumentProposal | null, plan: { category: KbCategory; templateContent: string },
): ContractCheck {
  if (!proposal) return { ok: false, reason: 'missing_document' };
  if (proposal.category !== plan.category) return { ok: false, reason: 'category_mismatch' };
  const required = extractRequiredHeadings(plan.templateContent);
  const lines = proposal.content.split('\n').map((line) => line.trim());
  const missing: string[] = [];
  let cursor = 0;
  for (const heading of required) {
    const index = lines.indexOf(heading, cursor);
    if (index === -1) missing.push(heading);
    else cursor = index + 1;
  }
  return missing.length ? { ok: false, reason: 'missing_headings', missing } : { ok: true };
}

export const DOCUMENT_CONTRACT_COPY = '문서가 템플릿 형식과 달라 저장용 제안을 만들지 못했어요. 다시 요청해주세요.';
