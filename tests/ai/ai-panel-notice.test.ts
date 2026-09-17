import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiPanelNotice, type AiPanelNoticeProps } from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanelNotice';
import { resolveChatOutcome, type ChatNotice } from '@/lib/ai/chat-request';
import type { ChatResult } from '@/lib/ai/chat-result';

const RETRY_BUTTON = /다시 시도<\/button>/;
const noop = () => {};

function toNotice(result: ChatResult): ChatNotice {
  const o = resolveChatOutcome(result);
  if (o.kind !== 'notice') throw new Error('expected notice');
  return o.notice;
}

const refusal = toNotice({ ok: false, status: 'refused', remainingBalance: 1234, refusal: { stage: 'input', reasonCode: 'SAFETY', debitAmount: 12 } });
const processed = toNotice({ ok: false, status: 'already_processed', remainingBalance: 500 });
const rateLimited = toNotice({ ok: false, status: 'failed', failureKind: 'rate_limited' });
const insufficient = toNotice({ ok: false, status: 'failed', failureKind: 'insufficient_balance' });

const outputs: string[] = [];
function render(props: Partial<AiPanelNoticeProps> & { notice: ChatNotice }): string {
  const html = renderToStaticMarkup(
    createElement(AiPanelNotice, { id: 'n1', disabled: false, onDismiss: noop, ...props }),
  );
  outputs.push(html);
  return html;
}

describe('AiPanelNotice', () => {
  it('refusal: collapsed, no retry', () => {
    const html = render({ notice: refusal, onRetry: noop });
    for (const s of [
      '안전 정책에 따라 답할 수 없는 요청이에요',
      '표현을 바꿔 다시 시도해보세요.',
      '12토큰 사용 · 보유 토큰 1,234',
      '거절 사유 보기',
      'aria-expanded="false"',
      'aria-controls="n1-reason"',
      'aria-label="알림 닫기"',
      'border-border',
    ]) expect(html).toContain(s);
    expect(html).not.toMatch(RETRY_BUTTON);
    expect(html).not.toContain('lucide-rotate-cw');
    expect(html).not.toContain('text-destructive');
    expect(html).not.toContain('입력 차단 · SAFETY');
  });

  it('refusal expanded shows reason line', () => {
    const html = render({ notice: refusal, defaultExpanded: true });
    for (const s of ['거절 사유 접기', 'aria-expanded="true"', 'id="n1-reason"', 'font-mono']) expect(html).toContain(s);
    const text = html.replace(/<[^>]+>/g, '');
    expect(text).toContain('입력 차단 · SAFETY · 유해할 수 있는 내용으로 판단됐어요.');
  });

  it('processed: no retry, no disclosure', () => {
    const html = render({ notice: processed, onRetry: noop });
    expect(html).toContain('이미 처리된 요청이에요');
    expect(html).toContain('보유 토큰 500');
    expect(html).not.toMatch(RETRY_BUTTON);
    expect(html).not.toContain('거절 사유 보기');
  });

  it('retryable error renders retry button', () => {
    const html = render({ notice: rateLimited, onRetry: noop });
    expect(html).toContain('지금 요청이 몰려 있어요. 1분 뒤 다시 시도해주세요.');
    expect(html).toMatch(RETRY_BUTTON);
    expect(html).toContain('lucide-rotate-cw');
    expect(html).toContain('border-destructive/40');
    expect(html).toContain('text-destructive');
    expect(html).not.toContain('text-xs text-muted-foreground tabular-nums');
    expect(html).not.toContain('text-sm break-keep"');
  });

  it('non-retryable error has no retry button', () => {
    expect(render({ notice: insufficient, onRetry: noop })).not.toMatch(RETRY_BUTTON);
  });

  it('disabled retry button', () => {
    const html = render({ notice: rateLimited, onRetry: noop, disabled: true });
    const button = html.match(/<button[^>]*>(?:(?!<\/button>).)*다시 시도<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).toContain('disabled');
  });

  it('never leaks provider or status', () => {
    for (const html of outputs) {
      expect(html.toLowerCase()).not.toContain('gemini');
      expect(html).not.toContain('429');
    }
  });
});
