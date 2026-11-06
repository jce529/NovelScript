import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync('components/ui/select.tsx', 'utf8');

describe('공용 Select 팝업 위치 (Phase 2 BUG-05)', () => {
  it('기본값이 alignItemWithTrigger=false라 스크롤·리사이즈 때 트리거를 따라간다', () => {
    expect(SOURCE).toMatch(/alignItemWithTrigger = false,/);
    expect(SOURCE).not.toMatch(/alignItemWithTrigger = true/);
  });

  it('값은 positioner와 data 속성에 그대로 전달되어 화면별로 다시 켤 수 있다', () => {
    expect(SOURCE).toContain('alignItemWithTrigger={alignItemWithTrigger}');
    expect(SOURCE).toContain('data-align-trigger={alignItemWithTrigger}');
  });
});
