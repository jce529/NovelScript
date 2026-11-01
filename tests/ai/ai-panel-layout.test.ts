import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Phase 16 BUG-03: the panel card has a fixed height, so overflow must be handled inside the card.
const PANEL_PATH = 'app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx';
const source = readFileSync(PANEL_PATH, 'utf8');

describe('AiPanel layout (BUG-03)', () => {
  it('clips the fixed-height card so nothing renders below its border', () => {
    const aside = source.match(/<aside className="([^"]+)"/)?.[1] ?? '';
    expect(aside).toContain('overflow-hidden');
    expect(aside).toContain('h-[85vh]');
  });

  it('scrolls settings and chat inside the card', () => {
    expect(source).toMatch(/className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4/);
  });

  it('keeps the chat log from collapsing to zero height', () => {
    expect(source).toMatch(/ref=\{chatLogRef\} className="flex min-h-48 flex-1 flex-col gap-3 overflow-y-auto"/);
  });

  it('pins the notice, wallet gauge and message input below the scroll area, inside the card', () => {
    const footerStart = source.indexOf('data-ai-panel-footer');
    const scrollEnd = source.indexOf('role={notice?.notice.variant');
    expect(footerStart).toBeGreaterThan(-1);
    expect(footerStart).toBeLessThan(scrollEnd);
    expect(source.indexOf('placeholder="AI에게 메시지 보내기"')).toBeGreaterThan(footerStart);
    expect(source.indexOf('</aside>')).toBeGreaterThan(source.indexOf('placeholder="AI에게 메시지 보내기"'));
  });
});
