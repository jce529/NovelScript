export type PresetLevel = 'beginner' | 'intermediate' | 'freeform';

/** D-14: every generation call carries this baseline, independent of preset —
 * (1) content-policy guardrails, (2) style continuity with preceding canvas text,
 * (3) non-contradiction with mentioned KB documents' established facts. */
export const BASELINE_SYSTEM_PROMPT = `당신은 한국어 웹소설 작가를 돕는 AI 공동 집필 도구입니다.
- 선정적이거나 폭력적인 묘사, 혐오 표현, 미성년자에 대한 성적 대상화 등 플랫폼 콘텐츠 정책에 위배되는 내용을 생성하지 마세요.
- 작가가 직전까지 써온 본문의 문체, 어조, 시제와 자연스럽게 이어지도록 작성하세요. 갑작스러운 문체 변화는 피하세요.
- 아래에 제공된 KB(설정집) 문서에 명시된 인물의 특성, 사건, 설정과 모순되는 내용을 생성하지 마세요.`;

/** D-08rev: "AI 지시 프리셋" — controls how much system-level guidance the
 * generation call applies, NOT literary tone (that's the separate D-15 문체
 * 프리셋 below). 초보자 = fully AI-decided, 중급자 = standard + some latitude,
 * 자유형 = writer's own instruction (composeSystemInstruction handles that case
 * separately, using this intermediate text only as its own empty-input fallback). */
export const PRESET_INSTRUCTIONS: Record<'beginner' | 'intermediate', string> = {
  beginner: '작가가 별도의 지시를 주지 않았습니다. 앞선 본문과 KB 설정을 참고해, 다음 전개로 자연스럽게 이어지는 내용을 AI가 스스로 판단해 작성하세요.',
  intermediate: '표준적인 전개 지시를 따르되, 세부 표현과 전개 방향에는 어느 정도 재량을 발휘해 자연스럽게 이어 쓰세요.',
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
    instruction: '짧고 절제된 문장으로, 군더더기 없이 묘사하는 문체로 작성하세요.',
  },
  'maximalist-dostoevsky': {
    name: '만연체 · 도스토옙스키풍',
    description: '길고 유장한 문장, 인물의 내면 심리를 깊게 파고듦',
    instruction: '길고 유장한 문장으로, 인물의 내면 심리를 깊이 파고드는 문체로 작성하세요.',
  },
  'lyrical-kimhoon': {
    name: '서정체 · 김훈풍',
    description: '감각적이고 시적인 묘사, 정적이고 여백이 있는 문장',
    instruction: '감각적이고 시적인 묘사와, 정적이며 여백이 있는 문장으로 작성하세요.',
  },
  'colloquial-kimyounha': {
    name: '구어체 · 김영하풍',
    description: '담백하고 현대적인 대화 중심, 리듬감 있는 문장',
    instruction: '담백하고 현대적인 대화 중심으로, 리듬감 있는 문장으로 작성하세요.',
  },
};

export const DEFAULT_STYLE_PRESET: StylePresetId = 'concise-hemingway';

export interface ComposeSystemInstructionInput {
  presetLevel: PresetLevel;
  customInstruction: string | null;
  styleId: StylePresetId;
  /** D-07: the active genre for this generation — defaults to the work's own
   * genre but is overridable per-generation. Always a plain string (one of
   * lib/works/genres.ts's GENRES), never absent. */
  genre: string;
  /** D-10rev: the permission-prompt card's free-text row. Present only on a
   * regeneration triggered by typed feedback — folded in as an ADDITIONAL
   * instruction line, never replacing the active preset's instruction. */
  regenerationFeedback?: string | null;
}

/** Assembles the full Gemini `systemInstruction` string: baseline (always) +
 * genre (always) + 문체 프리셋 (always) + AI-지시 프리셋 instruction (varies) +
 * optional regeneration feedback (additive). */
export function composeSystemInstruction({
  presetLevel, customInstruction, styleId, genre, regenerationFeedback,
}: ComposeSystemInstructionInput): string {
  const genreInstruction = `이 작품의 장르는 '${genre}'입니다. 장르 관습과 독자 기대에 맞게 작성하세요.`;
  const styleInstruction = STYLE_PRESETS[styleId].instruction;
  const presetInstruction = presetLevel === 'freeform'
    ? (customInstruction?.trim() || PRESET_INSTRUCTIONS.intermediate)
    : PRESET_INSTRUCTIONS[presetLevel];

  const parts = [BASELINE_SYSTEM_PROMPT, genreInstruction, styleInstruction, presetInstruction];
  const trimmedFeedback = regenerationFeedback?.trim();
  if (trimmedFeedback) {
    parts.push(`추가 요청사항: ${trimmedFeedback}`);
  }
  return parts.join('\n\n');
}

export interface AssembleUserContentInput {
  mentionedDocs: { name: string; category: string; content: string }[];
  precedingText: string;
}

/** Assembles the Gemini `contents` string: mentioned KB doc content (if any) +
 * the preceding canvas text. Per 02-CONTEXT.md D-13, `content` is injected
 * verbatim — wiki-link `[[ ]]` syntax is inert plain text, never resolved here. */
export function assembleUserContent({ mentionedDocs, precedingText }: AssembleUserContentInput): string {
  const sections: string[] = [];
  if (mentionedDocs.length > 0) {
    const kbContext = mentionedDocs
      .map((doc) => `### [${doc.category}] ${doc.name}\n${doc.content}`)
      .join('\n\n');
    sections.push(`다음은 참고할 설정집(KB) 문서입니다:\n\n${kbContext}`);
  }
  sections.push(`다음은 이전까지 작성된 본문입니다:\n\n${precedingText}`);
  sections.push('위 내용을 바탕으로 이어질 내용을 자연스럽게 작성하세요.');
  return sections.join('\n\n---\n\n');
}
