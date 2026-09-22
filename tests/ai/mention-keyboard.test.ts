import { describe, expect, it } from 'vitest';
import { resolveMentionKeyboardCommand } from '@/lib/ai/mention-keyboard';

function resolve(
  key: string,
  options: Partial<{
    isComposing: boolean;
    candidateCount: number;
    activeIndex: number;
  }> = {},
) {
  return resolveMentionKeyboardCommand({
    key,
    isComposing: false,
    candidateCount: 3,
    activeIndex: 0,
    ...options,
  });
}

describe('resolveMentionKeyboardCommand', () => {
  it('keeps native textarea behavior for unrelated keys', () => {
    expect(resolve('a')).toEqual({ type: 'ignore' });
  });

  it('never selects a candidate while an IME composition is active', () => {
    expect(resolve('Enter', { isComposing: true })).toEqual({ type: 'ignore' });
  });

  it('moves down and wraps from the final candidate', () => {
    expect(resolve('ArrowDown', { activeIndex: 1 })).toEqual({ type: 'move', index: 2 });
    expect(resolve('ArrowDown', { activeIndex: 2 })).toEqual({ type: 'move', index: 0 });
  });

  it('moves up and wraps from the first candidate', () => {
    expect(resolve('ArrowUp', { activeIndex: 1 })).toEqual({ type: 'move', index: 0 });
    expect(resolve('ArrowUp', { activeIndex: 0 })).toEqual({ type: 'move', index: 2 });
  });

  it('starts keyboard movement at the nearest edge when no candidate is active', () => {
    expect(resolve('ArrowDown', { activeIndex: -1 })).toEqual({ type: 'move', index: 0 });
    expect(resolve('ArrowUp', { activeIndex: -1 })).toEqual({ type: 'move', index: 2 });
  });

  it.each(['Enter', 'Tab'])('selects the active candidate with %s', (key) => {
    expect(resolve(key, { activeIndex: 1 })).toEqual({ type: 'select', index: 1 });
  });

  it('closes the menu with Escape even when there are no candidates', () => {
    expect(resolve('Escape', { candidateCount: 0, activeIndex: -1 })).toEqual({ type: 'close' });
  });

  it('preserves Enter and arrow keys when there are no candidates', () => {
    expect(resolve('Enter', { candidateCount: 0, activeIndex: -1 })).toEqual({ type: 'ignore' });
    expect(resolve('ArrowDown', { candidateCount: 0, activeIndex: -1 })).toEqual({ type: 'ignore' });
  });
});
