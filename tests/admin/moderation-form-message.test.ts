import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { describeFailure, StatusMessage } from '@/components/admin/moderation-form';

// BUG-04 (Phase 7): the self-sanction block keeps its own code and shows its own message.
const render = (error: Parameters<typeof describeFailure>[0]['error']) =>
  renderToStaticMarkup(createElement(StatusMessage, { status: describeFailure({ ok: false, error }), onRefresh: () => {} }));

describe('moderation form failure messages', () => {
  it('shows the dedicated self-sanction message as an alert', () => {
    const html = render('self_sanction_forbidden');
    expect(html).toContain('role="alert"');
    expect(html).toContain('자기 자신은 제재할 수 없어요.');
    expect(html).not.toContain('입력 내용을 확인해 주세요.');
  });

  it('keeps the generic validation message for other validation failures', () => {
    expect(render('validation_failed')).toContain('입력 내용을 확인해 주세요.');
  });

  it('keeps the default message for unexpected failures', () => {
    expect(render('unavailable')).toContain('처리하지 못했습니다. 다시 시도해 주세요.');
  });
});
