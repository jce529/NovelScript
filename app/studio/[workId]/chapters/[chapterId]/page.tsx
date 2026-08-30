'use client';

import { useState, useTransition, useEffect, useRef, use } from 'react';
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
import { AiPanel, type MentionedNode } from './ai-panel/AiPanel';
import { MentionAutocomplete, type MentionCandidate } from './ai-panel/MentionAutocomplete';

export default function ChapterEditorPage({
  params,
}: {
  params: Promise<{ workId: string; chapterId: string }>;
}) {
  const { workId, chapterId } = use(params);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [priceTier, setPriceTier] = useState<number | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [genre, setGenre] = useState<string | null>(null);
  const [mentionedNodes, setMentionedNodes] = useState<MentionedNode[]>([]);

  useEffect(() => {
    getChapterAction(chapterId).then((chapter) => {
      if (chapter) {
        setContent(chapter.content ?? '');
        setIsPublished(chapter.is_published);
        setPriceTier(chapter.price_tier);
        setIsPaid(chapter.price_tier !== null);
        setGenre(chapter.genre ?? null);
      }
      setLoaded(true);
    });
  }, [chapterId]);

  const save = () =>
    startTransition(async () => {
      const result = await saveChapterContentAction(workId, chapterId, content);
      if (result.ok) toast.success('저장했어요.');
      else toast.error(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    });

  const publish = () =>
    startTransition(async () => {
      const result = await publishChapterAction(workId, chapterId, isPaid ? (priceTier ?? PRICE_TIERS[0]) : null);
      if (result.ok) { setIsPublished(true); toast.success('발행했어요.'); }
      else toast.error(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    });

  const unpublish = () =>
    startTransition(async () => {
      const result = await unpublishChapterAction(workId, chapterId);
      setConfirmUnpublish(false);
      if (result.ok) { setIsPublished(false); toast.success('발행을 취소했어요.'); }
      else toast.error(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    });

  function addMention(candidate: MentionCandidate) {
    setMentionedNodes((prev) => (prev.some((n) => n.id === candidate.id) ? prev : [...prev, candidate]));
  }

  function removeMention(id: string) {
    setMentionedNodes((prev) => prev.filter((n) => n.id !== id));
  }

  /** D-10/EDIT-04: insert generated text at the CURRENT cursor position (read at
   * insert-click time, not at generation-click time — the writer may move the
   * cursor while a preview is showing). */
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
    <div className="flex gap-8">
      <div className="flex flex-1 flex-col gap-4">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={!loaded}
          className="min-h-[50vh] text-sm leading-[1.7]"
        />
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={isPending || !loaded} onClick={save}>회차 저장</Button>

          <div className="flex items-center gap-2 ml-4">
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
            <Button disabled={isPending || !loaded} onClick={publish} className="ml-auto">발행하기</Button>
          ) : (
            <Button variant="outline" disabled={isPending} onClick={() => setConfirmUnpublish(true)} className="ml-auto">
              발행 취소
            </Button>
          )}
        </div>

        <Dialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
          <DialogContent>
            <DialogHeader><DialogTitle>발행을 취소할까요?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              발행을 취소하면 독자에게 더 이상 보이지 않아요. 언제든 다시 발행할 수 있어요.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmUnpublish(false)}>취소</Button>
              <Button variant="outline" disabled={isPending} onClick={unpublish}>발행 취소</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MentionAutocomplete
          workId={workId}
          textareaRef={textareaRef}
          content={content}
          onContentChange={setContent}
          onMention={addMention}
        />
      </div>

      {loaded && (
        <AiPanel
          workId={workId}
          chapterId={chapterId}
          content={content}
          defaultGenre={genre}
          mentionedNodes={mentionedNodes}
          onRemoveMention={removeMention}
          onInsertText={insertTextAtCursor}
        />
      )}
    </div>
  );
}
