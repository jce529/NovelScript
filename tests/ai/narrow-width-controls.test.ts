import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Phase 16 BUG-05: at 375px the account default-model select clipped its label and the upload
// dialog mode buttons wrapped 2+1.
const settings = readFileSync('app/studio/settings/ai-providers/page.tsx', 'utf8');
const dialog = readFileSync('app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog.tsx', 'utf8');

describe('narrow width controls (BUG-05)', () => {
  it('ellipsizes the selected model label instead of cutting it off', () => {
    const select = settings.match(/<select[\s\S]*?className="([^"]+)"/)?.[1] ?? '';
    expect(select).toContain('truncate');
    expect(select).toContain('min-w-0');
  });

  it('stacks the upload mode buttons on narrow screens and keeps one row from sm up', () => {
    const group = dialog.match(/<div role="radiogroup" aria-label="업로드 방식" className="([^"]+)"/)?.[1] ?? '';
    expect(group).toContain('flex-col');
    expect(group).toContain('sm:flex-row');
    expect(dialog).toMatch(/role="radio"[^>]*className="w-full sm:w-auto"/);
  });
});
