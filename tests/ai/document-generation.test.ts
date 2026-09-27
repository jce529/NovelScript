import { describe, expect, it } from 'vitest';
import {
  composeDocumentPlanDirective, composeSystemInstruction, BASELINE_SYSTEM_PROMPT,
  RESPONSE_PROTOCOL_INSTRUCTIONS, type DocumentGenerationPlanInfo,
} from '@/lib/ai/prompt';
import { extractRequiredHeadings, validateDocumentAgainstPlan } from '@/lib/ai/document-contract';

const plan: DocumentGenerationPlanInfo = {
  category: '인물', folderPath: '인물/주요 등장인물', templateName: '인물 템플릿',
  templateContent: '# <% tp.file.title %>\n## 기본 정보\n## 성격\n### 말투', purpose: '주요 인물 설정',
};

describe('document generation contract', () => {
  it('keeps the legacy instruction byte-for-byte when no document plan is supplied', () => {
    const input = { presetLevel: 'intermediate' as const, styleId: 'concise-hemingway' as const, genre: '판타지' };
    const expected = [BASELINE_SYSTEM_PROMPT,
      "이 작품의 장르는 '판타지'입니다. 장르 관습과 독자 기대에 맞게 작성하세요.",
      '본문 초안을 제시할 때는 짧고 절제된 문장으로, 군더더기 없이 묘사하는 문체로 작성하세요.',
      '표준적인 전개 지시를 따르되, 세부 표현과 전개 방향에는 어느 정도 재량을 발휘해 자연스럽게 이어 쓰세요.',
      RESPONSE_PROTOCOL_INSTRUCTIONS].join('\n\n');
    expect(composeSystemInstruction(input)).toBe(expected);
  });
  it('adds a document directive after existing preset/style/genre instructions and preserves template text', () => {
    const text = composeSystemInstruction({ presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지', documentPlan: plan });
    expect(text).toContain("이 작품의 장르는 '판타지'입니다.");
    expect(text).toContain('대상 폴더: 인물/주요 등장인물');
    expect(text).toContain('아래 템플릿의 제목·섹션 구조와 순서를 유지하면서 내용을 채우세요.');
    expect(text).toContain(plan.templateContent);
    expect(text.indexOf('대상 폴더:')).toBeGreaterThan(text.indexOf('concise'));
    expect(text.match(new RegExp(BASELINE_SYSTEM_PROMPT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
    expect(text.match(new RegExp(RESPONSE_PROTOCOL_INSTRUCTIONS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
  });

  it('builds the directive with the requested purpose and template', () => {
    expect(composeDocumentPlanDirective(plan)).toContain('저장 목적: 주요 인물 설정');
    expect(composeDocumentPlanDirective(plan)).toContain(plan.templateContent);
  });

  it('extracts non-placeholder headings in order', () => {
    expect(extractRequiredHeadings('# <% tp.file.title %>\n## 기본 정보\n내용\n## 성격\n### 말투')).toEqual(['## 기본 정보', '## 성격', '### 말투']);
  });

  it('rejects a missing proposal', () => {
    expect(validateDocumentAgainstPlan(null, plan)).toEqual({ ok: false, reason: 'missing_document' });
  });

  it('rejects a category mismatch', () => {
    expect(validateDocumentAgainstPlan({ category: '장소', name: 'x', content: '' }, plan)).toEqual({ ok: false, reason: 'category_mismatch' });
  });

  it('rejects missing or reordered required headings', () => {
    expect(validateDocumentAgainstPlan({ category: '인물', name: 'x', content: '## 기본 정보\n본문' }, plan)).toEqual({ ok: false, reason: 'missing_headings', missing: ['## 성격', '### 말투'] });
    expect(validateDocumentAgainstPlan({ category: '인물', name: 'x', content: '### 말투\n## 기본 정보\n## 성격' }, plan)).toEqual({ ok: false, reason: 'missing_headings', missing: ['### 말투'] });
  });

  it('accepts required headings in order with body and additional subheadings', () => {
    expect(validateDocumentAgainstPlan({ category: '인물', name: 'x', content: '## 기본 정보\n본문\n## 성격\n#### 추가\n### 말투\n본문' }, plan)).toEqual({ ok: true });
  });
});
