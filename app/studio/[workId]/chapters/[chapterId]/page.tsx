'use client';

import { useState, useTransition, useEffect, useReducer, useRef, use } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { PRICE_TIERS } from '@/lib/chapters/actions';
import {
  getChapterAction, saveChapterContentAction, publishChapterAction, unpublishChapterAction,
} from './actions';
import { ReviewRequestPanel } from '@/components/moderation/review-request';
import { AiPanel, type MentionedNode } from './ai-panel/AiPanel';
import type { DefaultFallback, ProviderModelPair } from '@/lib/ai/providers/settings';
import type { ByokModelMap } from '@/lib/ai/providers/selection';
import { MentionAutocomplete, type MentionCandidate } from './ai-panel/MentionAutocomplete';
import { StudioEditorPanels } from '@/components/studio/studio-panel-shell';
import { StudioPane } from '@/components/studio/workspace/StudioPane';
import { useStudioWorkspace } from '@/components/studio/workspace/mobile-tabs';
import { SaveStatusChip } from '@/components/studio/save-status-chip';
import { createEditorState, editorReducer, selectSaveStatus } from '@/lib/studio/editor-state';
import { applyEdit, performSave, spliceAtSelection } from '@/lib/studio/editor-session';

/** Load result for one resourceKey; a different key means "not loaded yet" (no reset effect needed). */
type LoadState =
  | {
      key: string;
      status: 'ok';
      title: string;
      genre: string | null;
      defaultProviderModel: ProviderModelPair | null;
      defaultFallback: DefaultFallback | null;
      byokModels: ByokModelMap;
    }
  | { key: string; status: 'error' };

export default function ChapterEditorPage({
  params,
}: {
  params: Promise<{ workId: string; chapterId: string }>;
}) {
  const { workId, chapterId } = use(params);
  const resourceKey = `chapter:${workId}:${chapterId}`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { notifyInsert } = useStudioWorkspace();
  const [editor, dispatch] = useReducer(editorReducer, undefined, createEditorState);
  const [isPublished, setIsPublished] = useState(false);
  const [priceTier, setPriceTier] = useState<number | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  // Publish/unpublish pending only; save pending lives in the editor reducer (separate states).
  const [isPublishPending, startPublishTransition] = useTransition();
  const [mentionedNodes, setMentionedNodes] = useState<MentionedNode[]>([]);
  const editorRef = useRef(editor);
  const activeKeyRef = useRef(resourceKey);
  const requestCounter = useRef(0);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    activeKeyRef.current = resourceKey;
    // A late answer for another chapter must never reach the new draft.
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets mentions when the chapter changes, before the async fetch below
    setMentionedNodes([]);
    getChapterAction(chapterId).then((chapter) => {
      if (cancelled) return;
      if (!chapter) {
        setLoadState({ key: resourceKey, status: 'error' });
        return;
      }
      dispatch({ type: 'load', resourceKey, content: chapter.content ?? '' });
      setIsPublished(chapter.is_published);
      setPriceTier(chapter.price_tier);
      setIsPaid(chapter.price_tier !== null);
      setConfirmUnpublish(false);
      setLoadState({
        key: resourceKey,
        status: 'ok',
        title: chapter.title,
        genre: chapter.genre ?? null,
        defaultProviderModel: chapter.defaultProviderModel,
        defaultFallback: chapter.defaultFallback ?? null,
        byokModels: chapter.byokModels,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [workId, chapterId, resourceKey]);

  const current = loadState?.key === resourceKey ? loadState : null;
  const loaded = current?.status === 'ok';
  const synced = editor.resourceKey === resourceKey;
  const saving = selectSaveStatus(editor) === 'saving';

  function onEdit(content: string) {
    applyEdit(!loaded, resourceKey, content, dispatch);
  }

  const save = () => {
    requestCounter.current += 1;
    void performSave({
      state: editorRef.current,
      readOnly: !loaded,
      requestId: `${resourceKey}#${requestCounter.current}`,
      dispatch,
      save: (content) => saveChapterContentAction(workId, chapterId, content),
      onSuccess: () => toast.success('저장했어요.'),
      onFailure: (message) => toast.error(message),
    });
  };

  const publish = () => {
    const key = resourceKey;
    startPublishTransition(async () => {
      const result = await publishChapterAction(workId, chapterId, isPaid ? (priceTier ?? PRICE_TIERS[0]) : null);
      if (activeKeyRef.current !== key) return;
      if (result.ok) { setIsPublished(true); toast.success('발행했어요.'); }
      else toast.error(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    });
  };

  const unpublish = () => {
    const key = resourceKey;
    startPublishTransition(async () => {
      const result = await unpublishChapterAction(workId, chapterId);
      if (activeKeyRef.current !== key) return;
      setConfirmUnpublish(false);
      if (result.ok) { setIsPublished(false); toast.success('발행을 취소했어요.'); }
      else toast.error(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    });
  };

  function addMention(candidate: MentionCandidate) {
    setMentionedNodes((prev) => (prev.some((n) => n.id === candidate.id) ? prev : [...prev, candidate]));
  }

  function removeMention(id: string) {
    setMentionedNodes((prev) => prev.filter((n) => n.id !== id));
  }

  /** D-10/EDIT-04: insert generated text at the CURRENT cursor position (read at
   * insert-click time, not at generation-click time — the writer may move the
   * cursor while a preview is showing). Goes through the edit event so it marks the draft dirty. */
  function insertTextAtCursor(text: string) {
    if (!loaded) return;
    const textarea = textareaRef.current;
    const latest = editorRef.current.currentContent;
    const start = textarea ? textarea.selectionStart : null;
    const end = textarea ? textarea.selectionEnd : null;
    onEdit(spliceAtSelection(latest, text, start, end));
    notifyInsert();
    if (textarea && start !== null) {
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + text.length;
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
      });
    }
  }

  if (current?.status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        회차를 불러오지 못했어요.
      </p>
    );
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2">
      {current?.status === 'ok' && <span className="truncate text-sm font-medium">{current.title}</span>}
      <SaveStatusChip state={editor} />
      <Button variant="outline" size="sm" disabled={saving || !loaded} onClick={save}>회차 저장</Button>

      <div className="ml-4 flex items-center gap-2">
        <Button
          type="button"
          variant={!isPaid ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIsPaid(false)}
        >
          무료
        </Button>
        <Button
          type="button"
          variant={isPaid ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIsPaid(true)}
        >
          유료
        </Button>
        {isPaid && (
          <Select
            value={String(priceTier ?? PRICE_TIERS[0])}
            onValueChange={(value) => setPriceTier(Number(value))}
          >
            <SelectTrigger aria-label="가격 선택" className="w-32">
              <SelectValue>{(value: string) => `${value} 토큰`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRICE_TIERS.map((tier) => (
                <SelectItem key={tier} value={String(tier)}>{tier} 토큰</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!isPublished ? (
        <Button size="sm" disabled={isPublishPending || !loaded} onClick={publish} className="ml-auto">발행하기</Button>
      ) : (
        <Button size="sm" variant="outline" disabled={isPublishPending} onClick={() => setConfirmUnpublish(true)} className="ml-auto">
          발행 취소
        </Button>
      )}

      <Dialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <DialogContent>
          <DialogHeader><DialogTitle>발행을 취소할까요?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            발행을 취소하면 독자에게 더 이상 보이지 않아요. 언제든 다시 발행할 수 있어요.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUnpublish(false)}>취소</Button>
            <Button variant="outline" disabled={isPublishPending} onClick={unpublish}>발행 취소</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <StudioEditorPanels
      resourceKey={resourceKey}
      toolbar={
        <StudioPane pane="write" domId={false}>
          {toolbar}
        </StudioPane>
      }
      editor={
        <StudioPane pane="write" className="flex min-w-0 flex-1 flex-col gap-4">
          <ReviewRequestPanel workId={workId} chapterId={chapterId} />
          <Textarea
            ref={textareaRef}
            value={synced ? editor.currentContent : ''}
            onChange={(e) => onEdit(e.target.value)}
            disabled={!loaded || !synced}
            className="min-h-[50vh] text-sm leading-[1.7]"
          />
          <MentionAutocomplete
            workId={workId}
            textareaRef={textareaRef}
            content={editor.currentContent}
            onContentChange={onEdit}
            onMention={addMention}
          />
        </StudioPane>
      }
      ai={
        current?.status === 'ok' && current.defaultProviderModel ? (
          <StudioPane pane="ai">
          <AiPanel
            key={chapterId}
            defaultProviderId={current.defaultProviderModel.providerId}
            defaultModel={current.defaultProviderModel.model}
            defaultKeySource={current.defaultProviderModel.keySource}
            defaultFallback={current.defaultFallback}
            byokModels={current.byokModels}
            workId={workId}
            chapterId={chapterId}
            content={editor.currentContent}
            defaultGenre={current.genre}
            mentionedNodes={mentionedNodes}
            onRemoveMention={removeMention}
            onAddMention={addMention}
            onInsertText={insertTextAtCursor}
          />
          </StudioPane>
        ) : undefined
      }
    />
  );
}
