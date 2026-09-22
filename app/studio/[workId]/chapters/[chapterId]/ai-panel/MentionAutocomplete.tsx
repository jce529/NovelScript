'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import getCaretCoordinates from 'textarea-caret';
import { Popover } from '@base-ui/react/popover';
import { Command, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { User, MapPin, Zap, Shield, Package, Folder } from 'lucide-react';
import type { KbCategory } from '@/lib/kb/templates';
import { resolveMentionKeyboardCommand } from '@/lib/ai/mention-keyboard';
import { searchMentionsAction } from '../actions';
import { QuickAddDialog } from './QuickAddDialog';

export interface MentionCandidate {
  id: string;
  name: string;
  category: KbCategory | 'custom' | 'template';
  scope?: 'work' | 'account_template';
}

export interface MentionAutocompleteProps {
  workId: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  content: string;
  onContentChange: (content: string) => void;
  onMention: (candidate: MentionCandidate) => void;
}

const CATEGORY_ICON: Record<string, typeof User> = {
  인물: User, 장소: MapPin, 사건: Zap, 세력: Shield, 아이템: Package,
};

const EMPTY_RESULTS: MentionCandidate[] = [];

/** UI-SPEC Copywriting Contract: never render the raw internal 'custom'/
 * 'template' category string to the writer. */
function mentionTrailingText(candidate: MentionCandidate): string {
  if (candidate.scope === 'account_template') return '계정 공유';
  if (candidate.category === 'custom') return '사용자 폴더';
  return candidate.category;
}

/** D-02: caret-anchored mention search overlay on the existing plain <textarea>.
 * Composes @base-ui/react/popover primitives DIRECTLY (Pitfall 3) rather than the
 * shadcn-generated wrapper, to guarantee the virtual-anchor positioning works. */
export function MentionAutocomplete({ workId, textareaRef, content, onContentChange, onMention }: MentionAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [triggerStart, setTriggerStart] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<{ getBoundingClientRect: () => DOMRect } | null>(null);
  const [resultState, setResultState] = useState<{ query: string; candidates: MentionCandidate[] }>({
    query: '',
    candidates: EMPTY_RESULTS,
  });
  const [activeCandidateId, setActiveCandidateId] = useState('');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const results = open && resultState.query === query ? resultState.candidates : EMPTY_RESULTS;

  // Detect an active "@query" run ending exactly at the caret, on every keystroke.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const caretIndex = textarea.selectionStart;
    const upToCaret = content.slice(0, caretIndex);
    const match = /@([^\s@]*)$/.exec(upToCaret);
    if (!match) {
      setOpen(false);
      return;
    }
    setQuery(match[1]);
    setTriggerStart(caretIndex - match[0].length);
    const caret = getCaretCoordinates(textarea, caretIndex);
    const rect = textarea.getBoundingClientRect();
    const x = rect.left + caret.left - textarea.scrollLeft;
    const y = rect.top + caret.top - textarea.scrollTop;
    setAnchor({ getBoundingClientRect: () => new DOMRect(x, y, 0, caret.height) });
    setOpen(true);
  }, [content, textareaRef]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    searchMentionsAction(workId, query).then((found) => {
      if (cancelled) return;
      const candidates = found as MentionCandidate[];
      setResultState({ query, candidates });
      setActiveCandidateId(candidates[0]?.id ?? '');
    });
    return () => { cancelled = true; };
  }, [open, workId, query]);

  const consumeTrigger = useCallback(() => {
    if (triggerStart === null) return;
    const textarea = textareaRef.current;
    const caretIndex = textarea ? textarea.selectionStart : triggerStart + query.length + 1;
    onContentChange(content.slice(0, triggerStart) + content.slice(caretIndex));
    setOpen(false);
  }, [content, onContentChange, query.length, textareaRef, triggerStart]);

  const selectCandidate = useCallback((candidate: MentionCandidate) => {
    consumeTrigger();
    onMention(candidate);
  }, [consumeTrigger, onMention]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!open) return;

      const activeIndex = results.findIndex((candidate) => candidate.id === activeCandidateId);
      const command = resolveMentionKeyboardCommand({
        key: event.key,
        isComposing: event.isComposing || event.keyCode === 229,
        candidateCount: results.length,
        activeIndex,
      });

      if (command.type === 'ignore') return;
      event.preventDefault();

      if (command.type === 'close') {
        setOpen(false);
        return;
      }

      const candidate = results[command.index];
      if (!candidate) return;

      if (command.type === 'move') {
        setActiveCandidateId(candidate.id);
        return;
      }

      selectCandidate(candidate);
    }

    textarea.addEventListener('keydown', handleKeyDown);
    return () => textarea.removeEventListener('keydown', handleKeyDown);
  }, [activeCandidateId, open, results, selectCandidate, textareaRef]);

  return (
    <>
      {open && anchor && (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Portal>
            <Popover.Positioner anchor={anchor} side="bottom" sideOffset={4} className="z-50">
              <Popover.Popup className="w-80 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md">
                <Command
                  shouldFilter={false}
                  value={activeCandidateId}
                  onValueChange={setActiveCandidateId}
                >
                  <CommandList className="max-h-[280px]">
                    {results.length === 0 ? (
                      <CommandEmpty className="p-0">
                        <button
                          type="button"
                          className="flex h-8 w-full items-center px-3 text-left text-sm hover:bg-accent"
                          onClick={() => { setOpen(false); setQuickAddOpen(true); }}
                        >
                          {`새 문서 만들기: '${query}'`}
                        </button>
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {results.map((candidate) => {
                          const Icon = CATEGORY_ICON[candidate.category] ?? Folder;
                          return (
                            <CommandItem
                              key={candidate.id}
                              value={candidate.id}
                              onSelect={() => selectCandidate(candidate)}
                              className="h-8 gap-2"
                            >
                              <Icon className="size-4 text-muted-foreground" />
                              <span className="flex-1">{candidate.name}</span>
                              <span className="text-xs text-muted-foreground">{mentionTrailingText(candidate)}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}

      <QuickAddDialog
        workId={workId}
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        initialName={query}
        onCreated={(node) => { consumeTrigger(); onMention({ ...node, scope: 'work' }); setQuickAddOpen(false); }}
      />
    </>
  );
}
