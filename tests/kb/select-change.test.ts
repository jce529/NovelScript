import { describe, expect, it } from 'vitest';
import { isSelectionChange } from '@/lib/kb/select-change';

describe('isSelectionChange (Phase 15 BUG-08)', () => {
  it('ignores the echo Base UI Select sends with the value the app just set', () => {
    expect(isSelectionChange('folder-root', 'folder-root')).toBe(false);
    expect(isSelectionChange(null, null)).toBe(false);
  });

  it('treats a different value as a real selection change', () => {
    expect(isSelectionChange('folder-child', 'folder-root')).toBe(true);
    expect(isSelectionChange('template-a', null)).toBe(true);
    expect(isSelectionChange(null, 'template-a')).toBe(true);
  });
});
