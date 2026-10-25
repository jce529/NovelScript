import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Phase 16 BUG-06: the popup is as wide as its trigger and clips overflow, so long item labels
// (e.g. "기본 인물 템플릿 (기본) (기본)" in the new-document dialog) were cut off.
const select = readFileSync('components/ui/select.tsx', 'utf8');
const dialogs = readFileSync('components/studio/kb-node-dialogs.tsx', 'utf8');

describe('SelectItem long labels (BUG-06)', () => {
  it('lets the item label wrap instead of clipping behind the check icon', () => {
    const itemText = select.match(/<SelectPrimitive\.ItemText className="([^"]+)"/)?.[1] ?? '';
    expect(itemText).toContain('min-w-0');
    expect(itemText).toContain('whitespace-normal');
    expect(itemText).not.toContain('whitespace-nowrap');
    expect(itemText).not.toContain('shrink-0');
    expect(itemText).toContain('break-keep');
  });

  it('gives the new-document template picker a full-width trigger so the popup is as wide as the dialog', () => {
    expect(dialogs).toMatch(/<SelectTrigger id="new-node-template" className="w-full">/);
  });
});
