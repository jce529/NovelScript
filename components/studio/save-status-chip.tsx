'use client';

import { saveStatusCopy, selectSaveStatus, type EditorState } from '@/lib/studio/editor-state';

/**
 * Save-status chip. Derives status from the editor state (saved snapshot, current content and
 * in-flight request) — never from publish or AI request flags.
 */
export function SaveStatusChip({ state, readOnly = false }: { state: EditorState; readOnly?: boolean }) {
  const status = selectSaveStatus(state);
  const text = saveStatusCopy(status, readOnly);
  const tone = readOnly
    ? 'text-muted-foreground'
    : status === 'failed'
      ? 'text-destructive'
      : status === 'saved'
        ? 'text-muted-foreground'
        : 'text-foreground';
  return (
    <span
      role="status"
      aria-live="polite"
      data-save-status={readOnly ? 'readonly' : status}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tone}`}
    >
      {text}
    </span>
  );
}
