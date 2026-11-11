import { describe, expect, it } from 'vitest';
import { resolveViewerDark } from '@/components/reader/viewer-dark';

describe('resolveViewerDark (BUG: system mode bars stayed light on a dark OS)', () => {
  it('follows the OS only in system mode', () => {
    expect(resolveViewerDark('system', true)).toBe(true);
    expect(resolveViewerDark('system', false)).toBe(false);
  });

  it('light stays light and dark stays dark regardless of the OS', () => {
    expect(resolveViewerDark('light', true)).toBe(false);
    expect(resolveViewerDark('light', false)).toBe(false);
    expect(resolveViewerDark('dark', true)).toBe(true);
    expect(resolveViewerDark('dark', false)).toBe(true);
  });
});
