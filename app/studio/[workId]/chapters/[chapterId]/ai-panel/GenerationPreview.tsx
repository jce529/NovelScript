'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';

export interface GenerationPreviewProps {
  text: string;
  wasCapped: boolean;
  isRegenerating: boolean;
  onAccept: () => void;
  onRegenerate: (feedback?: string) => void;
  onReject: () => void;
}

/** D-10rev: Claude-Code-style permission prompt replacing the old plain
 * accept/regenerate/discard 3-button row. Option 1 (accept/insert) is the
 * only accent-colored control in this card. */
export function GenerationPreview({ text, wasCapped, isRegenerating, onAccept, onRegenerate, onReject }: GenerationPreviewProps) {
  const [feedback, setFeedback] = useState('');

  const submitFeedback = () => {
    const trimmed = feedback.trim();
    if (!trimmed) return;
    onRegenerate(trimmed);
    setFeedback('');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[400px] overflow-y-auto rounded-lg bg-secondary p-4 text-sm leading-[1.7] whitespace-pre-wrap">
        {text}
      </div>

      {wasCapped && (
        <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-muted-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-sm font-medium">토큰이 모두 소진됐어요</p>
            <p className="text-xs">남은 토큰 범위까지만 생성됐어요.</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-3 py-2.5 text-sm font-medium">
          이 내용을 본문에 삽입할까요?
        </div>
        <div className="flex flex-col">
          <button
            type="button"
            onClick={onAccept}
            disabled={isRegenerating}
            className="border-l-2 border-l-primary bg-primary/5 px-3 py-2.5 text-left text-sm font-medium text-primary disabled:opacity-50"
          >
            1. 본문에 삽입하기
          </button>
          <button
            type="button"
            onClick={() => onRegenerate()}
            disabled={isRegenerating}
            className="border-l-2 border-l-transparent px-3 py-2.5 text-left text-sm disabled:opacity-50"
          >
            2. 다시 생성하기
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={isRegenerating}
            className="border-l-2 border-l-transparent px-3 py-2.5 text-left text-sm disabled:opacity-50"
          >
            3. 거부하고 지우기
          </button>
        </div>
        <div className="flex items-center gap-2 border-t border-border px-3 py-2">
          <span className="text-xs text-muted-foreground shrink-0">또는</span>
          <Input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitFeedback(); }}
            placeholder="원하는 방향을 알려주세요 (예: 좀 더 긴장감 있게)"
            disabled={isRegenerating}
            className="h-8 flex-1 border-none bg-transparent text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
    </div>
  );
}
