export type MentionKeyboardCommand =
  | { type: 'ignore' }
  | { type: 'move'; index: number }
  | { type: 'select'; index: number }
  | { type: 'close' };

interface MentionKeyboardInput {
  key: string;
  isComposing: boolean;
  candidateCount: number;
  activeIndex: number;
}

/** Decide how the mention menu should handle a textarea key press.
 * Returning `ignore` means the textarea keeps its native behavior. */
export function resolveMentionKeyboardCommand({
  key,
  isComposing,
  candidateCount,
  activeIndex,
}: MentionKeyboardInput): MentionKeyboardCommand {
  if (isComposing) return { type: 'ignore' };
  if (key === 'Escape') return { type: 'close' };
  if (candidateCount <= 0) return { type: 'ignore' };

  const hasActiveCandidate = activeIndex >= 0 && activeIndex < candidateCount;

  if (key === 'ArrowDown') {
    return {
      type: 'move',
      index: hasActiveCandidate ? (activeIndex + 1) % candidateCount : 0,
    };
  }

  if (key === 'ArrowUp') {
    return {
      type: 'move',
      index: hasActiveCandidate
        ? (activeIndex - 1 + candidateCount) % candidateCount
        : candidateCount - 1,
    };
  }

  if (key === 'Enter' || key === 'Tab') {
    return { type: 'select', index: hasActiveCandidate ? activeIndex : 0 };
  }

  return { type: 'ignore' };
}
