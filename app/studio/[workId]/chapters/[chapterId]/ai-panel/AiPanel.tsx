'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuGroup, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { GENRES } from '@/lib/works/genres';
import {
  STYLE_PRESETS, DEFAULT_STYLE_PRESET, chatHistoryTurnContent,
  type StylePresetId, type PresetLevel, type DocumentProposal,
} from '@/lib/ai/prompt';
import type { ModelTier } from '@/lib/ai/gemini';
import type { KbCategory } from '@/lib/kb/categories';
import { chatAction, saveDocumentProposalAction } from '../actions';
import { ChatMessageBubble } from './ChatMessageBubble';

export interface MentionedNode {
  id: string;
  name: string;
  category: string;
}

export interface AiPanelProps {
  workId: string;
  chapterId: string;
  /** Current chapter textarea content — used as precedingText for cost estimate + generation. */
  content: string;
  /** Work's own genre (Phase 2 D-04) — D-07's default. null falls back to GENRES[0]. */
  defaultGenre: string | null;
  mentionedNodes: MentionedNode[];
  onRemoveMention: (id: string) => void;
  /** A chat turn's proposed document was saved — add it to the mention list immediately. */
  onAddMention: (node: { id: string; name: string; category: KbCategory }) => void;
  /** D-10 accept: caller (page.tsx, Plan 04-06) inserts `text` at the textarea's cursor. */
  onInsertText: (text: string) => void;
}

/** This session's redesign: all three levels are the SAME chat-driven
 * generation (no separate "생성하기" button, no separate UI for any level) —
 * they differ ONLY in which system-prompt instruction is active. */
const PRESET_LEVEL_META: Record<PresetLevel, { label: string; description: string }> = {
  beginner: { label: '초보자', description: 'AI가 알아서 다음 전개를 판단해요. 별다른 지시 없이 대화를 시작해보세요.' },
  intermediate: { label: '중급자', description: '표준 지시에 약간의 재량을 더해 대화를 이어가요.' },
  freeform: { label: '자유형', description: '정해진 지시 없이, 대화 내용을 최우선으로 반영해요.' },
};

const PRESET_LEVELS: PresetLevel[] = ['beginner', 'intermediate', 'freeform'];
const STYLE_IDS = Object.keys(STYLE_PRESETS) as StylePresetId[];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  draft?: string | null;
  proposal?: DocumentProposal | null;
  savedNodeId?: string;
  wasCapped?: boolean;
}

export function AiPanel({ workId, chapterId, content, defaultGenre, mentionedNodes, onRemoveMention, onAddMention, onInsertText }: AiPanelProps) {
  const [modelTier, setModelTier] = useState<ModelTier>('lite');
  const [genre, setGenre] = useState<string>(defaultGenre ?? GENRES[0]);
  const [presetLevel, setPresetLevel] = useState<PresetLevel>('intermediate');
  const [styleId, setStyleId] = useState<StylePresetId>(DEFAULT_STYLE_PRESET);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savingProposalId, setSavingProposalId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatLogRef = useRef<HTMLDivElement>(null);

  const mentionedNodeIds = mentionedNodes.map((n) => n.id);

  useEffect(() => {
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isGenerating]);

  /** Sends one AI 패널 chat turn — the ONLY entry point for talking to the AI
   * now (no separate "생성하기" call shape). `history` is every PRIOR turn
   * (not including `userMessage`) — passed explicitly (rather than reading
   * `messages` state) so 다시 생성하기/거부하고 지우기 can replay a truncated
   * history without a stale-closure race against the pending setMessages(). */
  async function sendMessage(userMessage: string, history: ChatMessage[]) {
    const base = [...history, { id: crypto.randomUUID(), role: 'user' as const, text: userMessage }];
    setMessages(base);
    setIsGenerating(true);

    const result = await chatAction({
      workId, chapterId, modelTier, mentionedNodeIds, presetLevel, styleId, genre,
      precedingText: content,
      chatHistory: base.map((m) => ({ role: m.role, content: chatHistoryTurnContent(m) })),
    });
    setIsGenerating(false);

    if (!result.ok) {
      toast.error(result.error ?? '응답을 받지 못했어요. 잠시 후 다시 시도해주세요.');
      return;
    }

    setMessages([...base, {
      id: crypto.randomUUID(), role: 'assistant', text: result.reply ?? '',
      draft: result.draft ?? null, proposal: result.proposal ?? null, wasCapped: Boolean(result.wasCapped),
    }]);
    if (result.wasCapped) {
      toast('보유 토큰을 모두 사용해서 여기까지만 응답했어요.');
    }
  }

  function handleSend() {
    const trimmed = chatInput.trim();
    if (!trimmed || isGenerating) return;
    setChatInput('');
    sendMessage(trimmed, messages);
  }

  /** Drops the last AI turn (and the user message that prompted it, if any)
   * and resends the same request — a "redo" of the last exchange. */
  function handleRegenerate() {
    if (isGenerating) return;
    const withoutLastAssistant = messages.slice(0, -1);
    const tail = withoutLastAssistant[withoutLastAssistant.length - 1];
    if (tail?.role === 'user') {
      sendMessage(tail.text, withoutLastAssistant.slice(0, -1));
    }
  }

  /** Discards the last AI turn (and the user message that prompted it, if
   * any) without resending — back to the chat state before that exchange. */
  function handleReject() {
    if (isGenerating) return;
    const withoutLastAssistant = messages.slice(0, -1);
    const tail = withoutLastAssistant[withoutLastAssistant.length - 1];
    setMessages(tail?.role === 'user' ? withoutLastAssistant.slice(0, -1) : withoutLastAssistant);
  }

  async function handleSaveProposal(message: ChatMessage) {
    if (!message.proposal || savingProposalId) return;
    setSavingProposalId(message.id);
    const result = await saveDocumentProposalAction(workId, message.proposal);
    setSavingProposalId(null);

    if (!result.ok || !result.nodeId) {
      toast.error(result.error ?? '문서를 저장하지 못했어요.');
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, savedNodeId: result.nodeId } : m)));
    onAddMention({ id: result.nodeId, name: message.proposal.name, category: message.proposal.category });
    toast.success(`"${message.proposal.name}" 문서를 저장하고 멘션에 추가했어요.`);
  }

  return (
    <aside className="sticky top-8 flex h-[calc(100vh-4rem)] w-96 shrink-0 flex-col gap-6 rounded-lg border border-border bg-background p-6">
      <h2 className="text-xl font-semibold">AI 어시스턴트</h2>

      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs text-muted-foreground">AI 모델</label>
            <Select value={modelTier} onValueChange={(value) => setModelTier(value as ModelTier)}>
              <SelectTrigger className="w-full"><SelectValue>{(value: string) => (value === 'lite' ? '라이트' : '프로')}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="lite">라이트</SelectItem>
                <SelectItem value="pro">프로</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs text-muted-foreground">장르</label>
            <Select value={genre} onValueChange={(value) => setGenre(value ?? GENRES[0])}>
              <SelectTrigger className="w-full"><SelectValue>{(value: string) => value}</SelectValue></SelectTrigger>
              <SelectContent>
                {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button" variant="outline" size="icon"
                  aria-label="AI 지시 프리셋 설정"
                  title={`AI 지시 프리셋: ${PRESET_LEVEL_META[presetLevel].label}`}
                  className="size-8 shrink-0"
                >
                  <Settings2 className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>AI 지시 프리셋</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={presetLevel} onValueChange={(value) => setPresetLevel(value as PresetLevel)}>
                  {PRESET_LEVELS.map((level) => (
                    <DropdownMenuRadioItem key={level} value={level} className="flex-col items-start gap-0.5">
                      <span className="font-medium">{PRESET_LEVEL_META[level].label}</span>
                      <span className="text-xs text-muted-foreground">{PRESET_LEVEL_META[level].description}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">문체 프리셋</label>
          <Select value={styleId} onValueChange={(value) => setStyleId(value as StylePresetId)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {() => (
                  <span className="flex flex-col items-start text-left">
                    <span>{STYLE_PRESETS[styleId].name}</span>
                    <span className="text-xs text-muted-foreground">{STYLE_PRESETS[styleId].description}</span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STYLE_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  <span className="flex flex-col items-start">
                    <span>{STYLE_PRESETS[id].name}</span>
                    <span className="text-xs text-muted-foreground">{STYLE_PRESETS[id].description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">멘션된 문서</span>
        {mentionedNodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">@ 를 입력해 KB 문서를 멘션해보세요.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {mentionedNodes.map((node) => (
              <Badge key={node.id} variant="secondary" className="gap-1">
                {node.name}
                <button type="button" aria-label={`${node.name} 멘션 해제`} onClick={() => onRemoveMention(node.id)}>
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div ref={chatLogRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">AI에게 말을 걸어보세요 — 본문을 이어 써달라고 하거나, 인물/장소 같은 설정을 같이 정해달라고 요청할 수 있어요.</p>
        ) : (
          messages.map((message, index) => {
            if (message.role === 'user') {
              return (
                <div key={message.id} className="self-end max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
                  {message.text}
                </div>
              );
            }
            const isLast = index === messages.length - 1;
            return (
              <ChatMessageBubble
                key={message.id}
                text={message.text}
                draft={message.draft ?? null}
                proposal={message.proposal ?? null}
                savedNodeId={message.savedNodeId}
                wasCapped={Boolean(message.wasCapped)}
                interactive={isLast}
                isBusy={isGenerating || savingProposalId === message.id}
                onInsertDraft={() => message.draft && onInsertText(message.draft)}
                onSaveProposal={() => handleSaveProposal(message)}
                onRegenerate={handleRegenerate}
                onReject={handleReject}
              />
            );
          })
        )}
        {isGenerating && <p className="text-xs text-muted-foreground">AI가 응답을 생성하고 있어요...</p>}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder="AI에게 메시지 보내기"
          disabled={isGenerating}
          className="flex-1"
        />
        <Button type="button" size="sm" disabled={isGenerating || !chatInput.trim()} onClick={handleSend}>
          보내기
        </Button>
      </div>
    </aside>
  );
}
