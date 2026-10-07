'use client';

import { useState, useTransition, useEffect, useRef, use } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { saveNodeContentAction, getNodeContentAction } from './actions';
import { getNodeAiContextAction } from '../../chapters/[chapterId]/actions';
import { AiPanel, type MentionedNode } from '../../chapters/[chapterId]/ai-panel/AiPanel';
import { MentionAutocomplete, type MentionCandidate } from '../../chapters/[chapterId]/ai-panel/MentionAutocomplete';
import type { DefaultFallback, ProviderModelPair } from '@/lib/ai/providers/settings';
import type { ByokModelMap } from '@/lib/ai/providers/selection';

export default function KbNodeEditorPage({
  params,
}: {
  params: Promise<{ workId: string; nodeId: string }>;
}) {
  const { workId, nodeId } = use(params);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [genre, setGenre] = useState<string | null>(null);
  const [defaultProviderModel, setDefaultProviderModel] = useState<ProviderModelPair | null>(null);
  const [defaultFallback, setDefaultFallback] = useState<DefaultFallback | null>(null);
  const [byokModels, setByokModels] = useState<ByokModelMap>({});
  const [mentionedNodes, setMentionedNodes] = useState<MentionedNode[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets load state when nodeId changes, before the async fetch below
    setLoaded(false);
    setMentionedNodes([]);
    Promise.all([getNodeContentAction(nodeId), getNodeAiContextAction(workId, nodeId)]).then(([result, ai]) => {
      if (result.ok) setContent(result.content);
      if (ai) {
        setGenre(ai.genre);
        setDefaultProviderModel(ai.defaultProviderModel);
        setDefaultFallback(ai.defaultFallback ?? null);
        setByokModels(ai.byokModels);
      } else {
        setDefaultProviderModel(null);
      }
      setLoaded(true);
    });
  }, [workId, nodeId]);

  function addMention(candidate: MentionCandidate) {
    setMentionedNodes((prev) => (prev.some((n) => n.id === candidate.id) ? prev : [...prev, candidate]));
  }

  function removeMention(id: string) {
    setMentionedNodes((prev) => prev.filter((n) => n.id !== id));
  }

  /** AI 초안을 문서의 현재 커서 위치에 넣는다 (회차 편집기와 동일). */
  function insertTextAtCursor(text: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((current) => current + text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setContent((current) => current.slice(0, start) + text + current.slice(end));
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + text.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={!loaded}
          className="min-h-[60vh] font-mono text-sm leading-[1.7]"
        />
        <Button
          className="w-fit"
          disabled={isPending || !loaded}
          onClick={() => startTransition(async () => {
            const result = await saveNodeContentAction(workId, nodeId, content);
            if (result.ok) toast.success('저장했어요.');
            else toast.error(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
          })}
        >
          문서 저장
        </Button>
        <MentionAutocomplete
          workId={workId}
          textareaRef={textareaRef}
          content={content}
          onContentChange={setContent}
          onMention={addMention}
        />
      </div>

      {loaded && defaultProviderModel && (
        <AiPanel
          key={nodeId}
          defaultProviderId={defaultProviderModel.providerId}
          defaultModel={defaultProviderModel.model}
          defaultKeySource={defaultProviderModel.keySource}
          defaultFallback={defaultFallback}
          byokModels={byokModels}
          workId={workId}
          nodeId={nodeId}
          content={content}
          defaultGenre={genre}
          mentionedNodes={mentionedNodes}
          onRemoveMention={removeMention}
          onAddMention={addMention}
          onInsertText={insertTextAtCursor}
        />
      )}
    </div>
  );
}
