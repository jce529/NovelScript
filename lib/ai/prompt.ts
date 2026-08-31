import type { KbCategory } from '@/lib/kb/categories';

export type PresetLevel = 'beginner' | 'intermediate' | 'freeform';

/** D-14: every generation call carries this baseline, independent of preset —
 * (1) content-policy guardrails, (2) style continuity with preceding canvas text,
 * (3) non-contradiction with mentioned KB documents' established facts. */
export const BASELINE_SYSTEM_PROMPT = `당신은 한국어 웹소설 작가와 대화하며 함께 작업하는 AI 공동 집필 도구입니다. 대화를 통해 다음 회차 본문을 함께 써나가거나, 필요한 설정(인물/장소/사건/세력/아이템)을 구체화합니다.
- 선정적이거나 폭력적인 묘사, 혐오 표현, 미성년자에 대한 성적 대상화 등 플랫폼 콘텐츠 정책에 위배되는 내용을 생성하지 마세요.
- 본문 초안을 제시할 때는 작가가 직전까지 써온 본문의 문체, 어조, 시제와 자연스럽게 이어지도록 작성하세요. 갑작스러운 문체 변화는 피하세요.
- 아래에 제공된 KB(설정집) 문서에 명시된 인물의 특성, 사건, 설정과 모순되는 내용을 생성하지 마세요.`;

/** D-08rev: "AI 지시 프리셋" — this session's redesign: all three levels are
 * the SAME chat-driven generation, differing ONLY in this baseline instruction
 * text (never a different UI/interaction mode — see AiPanel, single chat, no
 * separate "생성하기" button). 초보자 = fully AI-decided, 중급자 = standard +
 * some latitude, 자유형 = no fixed instruction at all — defers entirely to
 * whatever the live chat conversation asks for. */
export const PRESET_INSTRUCTIONS: Record<PresetLevel, string> = {
  beginner: '작가가 별도의 지시를 주지 않았다면, 앞선 본문과 KB 설정을 참고해 다음 전개로 자연스럽게 이어지는 내용을 AI가 스스로 판단해 제시하세요.',
  intermediate: '표준적인 전개 지시를 따르되, 세부 표현과 전개 방향에는 어느 정도 재량을 발휘해 자연스럽게 이어 쓰세요.',
  freeform: '정해진 전개 지시가 없습니다. 작가와 나눈 대화 내용을 최우선으로 반영해, 틀에 얽매이지 않고 자유롭게 판단해 응답하세요.',
};

export type StylePresetId = 'concise-hemingway' | 'maximalist-dostoevsky' | 'lyrical-kimhoon' | 'colloquial-kimyounha';

/** D-15: 문체 프리셋 — a literary-style control, separate from and always applied
 * alongside whichever AI-지시 프리셋 level is active. `name`/`description` are the
 * exact UI-SPEC Copywriting Contract strings; `instruction` is the corresponding
 * line folded into the system prompt. */
export const STYLE_PRESETS: Record<StylePresetId, { name: string; description: string; instruction: string }> = {
  'concise-hemingway': {
    name: '간결체 · 헤밍웨이풍',
    description: '짧고 절제된 문장, 군더더기 없는 묘사',
    instruction: '본문 초안을 제시할 때는 짧고 절제된 문장으로, 군더더기 없이 묘사하는 문체로 작성하세요.',
  },
  'maximalist-dostoevsky': {
    name: '만연체 · 도스토옙스키풍',
    description: '길고 유장한 문장, 인물의 내면 심리를 깊게 파고듦',
    instruction: '본문 초안을 제시할 때는 길고 유장한 문장으로, 인물의 내면 심리를 깊이 파고드는 문체로 작성하세요.',
  },
  'lyrical-kimhoon': {
    name: '서정체 · 김훈풍',
    description: '감각적이고 시적인 묘사, 정적이고 여백이 있는 문장',
    instruction: '본문 초안을 제시할 때는 감각적이고 시적인 묘사와, 정적이며 여백이 있는 문장으로 작성하세요.',
  },
  'colloquial-kimyounha': {
    name: '구어체 · 김영하풍',
    description: '담백하고 현대적인 대화 중심, 리듬감 있는 문장',
    instruction: '본문 초안을 제시할 때는 담백하고 현대적인 대화 중심으로, 리듬감 있는 문장으로 작성하세요.',
  },
};

export const DEFAULT_STYLE_PRESET: StylePresetId = 'concise-hemingway';

/** This session's redesign: ONE chat, no separate "생성하기" button — every
 * turn, the AI decides for itself whether to just talk, propose a chapter-
 * prose draft, or propose a KB(설정집) document, and signals which via this
 * fixed, parseable format. lib/ai/chat.ts's parseChatResponse is the other
 * half of this contract. */
export const RESPONSE_PROTOCOL_INSTRUCTIONS = `당신의 응답은 항상 아래 형식을 정확히 지켜야 합니다 (다른 텍스트로 감싸지 마세요):

[REPLY]
(작가에게 보여줄 대화 응답 — 항상 작성)
[/REPLY]

작가가 다음 회차 본문을 이어 쓰길 원한다고 판단되면, [REPLY] 블록 뒤에 아래 블록을 추가해 본문 초안을 제시하세요:

[DRAFT]
(본문 뒤에 그대로 이어 붙일 초안 텍스트)
[/DRAFT]

작가가 인물/장소/사건/세력/아이템 같은 설정을 구체화하고 싶어한다고 판단되고, 대화만으로 충분히 구체화됐다면, [REPLY] 블록 뒤에 아래 블록을 추가해 설정집(KB) 문서를 제안하세요:

[DOCUMENT]
카테고리: 인물 | 장소 | 사건 | 세력 | 아이템 중 하나
이름: (문서 제목)
내용:
(문서 본문)
[/DOCUMENT]

한 응답에 [DRAFT]와 [DOCUMENT]를 동시에 포함하지 마세요. 둘 다 필요 없는 경우(질문, 잡담, 확인 등)에는 [REPLY]만 작성하세요.`;

export interface ComposeSystemInstructionInput {
  presetLevel: PresetLevel;
  styleId: StylePresetId;
  /** D-07: the active genre for this generation — defaults to the work's own
   * genre but is overridable per-generation. Always a plain string (one of
   * lib/works/genres.ts's GENRES), never absent. */
  genre: string;
}

/** Assembles the full Gemini `systemInstruction` string: baseline (always) +
 * genre (always) + 문체 프리셋 (always) + AI-지시 프리셋 instruction (varies) +
 * the REPLY/DRAFT/DOCUMENT response protocol (always). The per-turn user
 * message and prior conversation live in `contents` (assembleUserContent),
 * not here — this string is otherwise static for the whole chat session. */
export function composeSystemInstruction({ presetLevel, styleId, genre }: ComposeSystemInstructionInput): string {
  const genreInstruction = `이 작품의 장르는 '${genre}'입니다. 장르 관습과 독자 기대에 맞게 작성하세요.`;
  const styleInstruction = STYLE_PRESETS[styleId].instruction;
  const presetInstruction = PRESET_INSTRUCTIONS[presetLevel];

  return [BASELINE_SYSTEM_PROMPT, genreInstruction, styleInstruction, presetInstruction, RESPONSE_PROTOCOL_INSTRUCTIONS].join('\n\n');
}

/** One turn of the unified AI 패널 chat — browser-session-only (never
 * persisted). `content` is the turn's full text: for an assistant turn, the
 * [REPLY] text plus any [DRAFT]/[DOCUMENT] the AI produced (see
 * lib/ai/chat.ts's chatHistoryTurnContent), so context/continuity survives
 * across turns even though only [REPLY] text is shown as the bubble. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** A chat-proposed KB(설정집) document — see RESPONSE_PROTOCOL_INSTRUCTIONS'
 * [DOCUMENT] block and lib/ai/chat.ts's parseChatResponse. Lives here (not
 * lib/ai/chat.ts, which is server-only) so client components can reference
 * the shape without importing server-only code. */
export interface DocumentProposal {
  category: KbCategory;
  name: string;
  content: string;
}

/** What an assistant turn's ChatTurn.content should be when folded into a
 * LATER call's chat history — reply text plus whatever draft/document it
 * produced, so the AI keeps full memory of what it already offered, not
 * just what it said about it. Client-safe (AiPanel builds ChatTurn[] with
 * this before calling chatAction) and reused server-side by nothing else. */
export function chatHistoryTurnContent(message: { role: 'user' | 'assistant'; text: string; draft?: string | null; proposal?: DocumentProposal | null }): string {
  if (message.role === 'user') return message.text;
  const parts = [message.text];
  if (message.draft) parts.push(`(제시한 본문 초안)\n${message.draft}`);
  if (message.proposal) parts.push(`(제안한 설정 문서 — [${message.proposal.category}] ${message.proposal.name})\n${message.proposal.content}`);
  return parts.join('\n\n');
}

export interface AssembleUserContentInput {
  mentionedDocs: { name: string; category: string; content: string }[];
  precedingText: string;
  /** The full chat session so far, oldest first, INCLUDING the newest user
   * message as the last entry — the caller's responsibility to append it
   * before calling (see lib/ai/chat.ts). */
  chatHistory: ChatTurn[];
}

/** Assembles the Gemini `contents` string: mentioned KB doc content (if any) +
 * the chat session so far + the preceding canvas text. Per 02-CONTEXT.md
 * D-13, `content` is injected verbatim — wiki-link `[[ ]]` syntax is inert
 * plain text, never resolved here. */
export function assembleUserContent({ mentionedDocs, precedingText, chatHistory }: AssembleUserContentInput): string {
  const sections: string[] = [];
  if (mentionedDocs.length > 0) {
    const kbContext = mentionedDocs
      .map((doc) => `### [${doc.category}] ${doc.name}\n${doc.content}`)
      .join('\n\n');
    sections.push(`다음은 참고할 설정집(KB) 문서입니다:\n\n${kbContext}`);
  }
  sections.push(`다음은 이전까지 작성된 본문입니다:\n\n${precedingText}`);
  if (chatHistory.length > 0) {
    const history = chatHistory
      .map((turn) => `${turn.role === 'user' ? '작가' : 'AI'}: ${turn.content}`)
      .join('\n\n');
    sections.push(`다음은 이 세션에서 지금까지 나눈 대화입니다:\n\n${history}`);
  }
  sections.push('가장 마지막 작가 메시지에 응답하세요. 위에서 지시한 [REPLY]/[DRAFT]/[DOCUMENT] 형식을 반드시 지키세요.');
  return sections.join('\n\n---\n\n');
}
