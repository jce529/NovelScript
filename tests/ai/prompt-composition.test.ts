import { describe, it, expect } from 'vitest';
import {
  composeSystemInstruction, assembleUserContent, chatHistoryTurnContent, BASELINE_SYSTEM_PROMPT,
  RESPONSE_PROTOCOL_INSTRUCTIONS, PRESET_INSTRUCTIONS, STYLE_PRESETS, DEFAULT_STYLE_PRESET,
} from '../../lib/ai/prompt';

describe('lib/ai/prompt.ts — composeSystemInstruction (this session: unified chat, no 생성하기 button)', () => {
  it('always includes the D-14 baseline guardrail block, regardless of preset level', () => {
    for (const presetLevel of ['beginner', 'intermediate', 'freeform'] as const) {
      const result = composeSystemInstruction({ presetLevel, styleId: DEFAULT_STYLE_PRESET, genre: '판타지' });
      expect(result).toContain(BASELINE_SYSTEM_PROMPT);
    }
  });

  it('always includes the REPLY/DRAFT/DOCUMENT response protocol — the AI decides per-turn, no separate call shape', () => {
    const result = composeSystemInstruction({ presetLevel: 'intermediate', styleId: DEFAULT_STYLE_PRESET, genre: '판타지' });
    expect(result).toContain(RESPONSE_PROTOCOL_INSTRUCTIONS);
  });

  it('three preset levels differ ONLY in their instruction text — same baseline, same protocol', () => {
    const results = (['beginner', 'intermediate', 'freeform'] as const).map(
      (presetLevel) => composeSystemInstruction({ presetLevel, styleId: DEFAULT_STYLE_PRESET, genre: '판타지' })
    );
    expect(new Set(results).size).toBe(3); // all three distinct...
    for (const [level, text] of Object.entries(PRESET_INSTRUCTIONS)) {
      expect(results.find((r) => r.includes(text))).toBeDefined(); // ...but each differs by exactly its own instruction line
      void level;
    }
  });

  it('applies the 문체 프리셋 (D-15) regardless of AI-지시 프리셋 level — it is a separate, always-on control', () => {
    const result = composeSystemInstruction({ presetLevel: 'beginner', styleId: 'lyrical-kimhoon', genre: '판타지' });
    expect(result).toContain(STYLE_PRESETS['lyrical-kimhoon'].instruction);
  });

  it('reflects the active genre in the composed instruction (D-07)', () => {
    const result = composeSystemInstruction({ presetLevel: 'intermediate', styleId: DEFAULT_STYLE_PRESET, genre: '로맨스' });
    expect(result).toContain('로맨스');
  });

  it('STYLE_PRESETS has exactly the 4 UI-SPEC options, correct default', () => {
    expect(Object.keys(STYLE_PRESETS)).toHaveLength(4);
    for (const preset of Object.values(STYLE_PRESETS)) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
      expect(preset.instruction.length).toBeGreaterThan(0);
    }
    expect(DEFAULT_STYLE_PRESET).toBe('concise-hemingway');
    expect(STYLE_PRESETS[DEFAULT_STYLE_PRESET].name).toBe('간결체 · 헤밍웨이풍');
  });
});

// 04-07 (Reopen 2026-10-12): 04-03/04-05 SUMMARY and 04-VERIFICATION claimed the 자유형
// instruction was reflected in the composed prompt, but composeSystemInstruction had no
// customInstruction/workSystemInstruction input at all. These cases reproduce that gap.
describe('lib/ai/prompt.ts — 자유형 customInstruction / workSystemInstruction (04-07 gap closure)', () => {
  const base = { styleId: DEFAULT_STYLE_PRESET, genre: '판타지' } as const;
  const levels = ['beginner', 'intermediate', 'freeform'] as const;
  const countOf = (s: string, sub: string) => s.split(sub).length - 1;

  it('freeform + customInstruction puts the literal instruction into the composed prompt', () => {
    const result = composeSystemInstruction({ ...base, presetLevel: 'freeform', customInstruction: '용을 등장시켜줘' });
    expect(result).toContain('용을 등장시켜줘');
  });

  it('freeform with null/undefined/blank customInstruction keeps PRESET_INSTRUCTIONS.freeform', () => {
    for (const customInstruction of [null, undefined, '', '   \n ']) {
      const result = composeSystemInstruction({ ...base, presetLevel: 'freeform', customInstruction });
      expect(result).toContain(PRESET_INSTRUCTIONS.freeform);
    }
  });

  it('customInstruction is not applied for beginner/intermediate', () => {
    for (const presetLevel of ['beginner', 'intermediate'] as const) {
      const result = composeSystemInstruction({ ...base, presetLevel, customInstruction: '용을 등장시켜줘' });
      expect(result).not.toContain('용을 등장시켜줘');
      expect(result).toContain(PRESET_INSTRUCTIONS[presetLevel]);
    }
  });

  it('workSystemInstruction sits right after the baseline for intermediate/freeform', () => {
    for (const presetLevel of ['intermediate', 'freeform'] as const) {
      const result = composeSystemInstruction({ ...base, presetLevel, workSystemInstruction: '주인공은 항상 존댓말을 쓴다.' });
      expect(result.startsWith(`${BASELINE_SYSTEM_PROMPT}\n\n`)).toBe(true);
      const rest = result.slice(BASELINE_SYSTEM_PROMPT.length + 2);
      expect(rest).toContain('작품 추가 지시');
      expect(rest.indexOf('주인공은 항상 존댓말을 쓴다.')).toBeGreaterThan(-1);
      expect(rest.indexOf('주인공은 항상 존댓말을 쓴다.')).toBeLessThan(rest.indexOf('장르는'));
    }
  });

  it('workSystemInstruction is not applied for beginner, and plan/protocol are kept', () => {
    const documentPlan = { category: '인물' as const, folderPath: '인물', templateName: 't', templateContent: '# 이름', purpose: 'p' };
    const result = composeSystemInstruction({ ...base, presetLevel: 'beginner', workSystemInstruction: '주인공은 항상 존댓말을 쓴다.', documentPlan });
    expect(result).not.toContain('주인공은 항상 존댓말을 쓴다.');
    expect(result).toContain('작업: 설정 문서 생성');
    expect(result).toContain(RESPONSE_PROTOCOL_INSTRUCTIONS);
  });

  it('every preset starts with the baseline and carries baseline/protocol exactly once, with plan/style/genre', () => {
    const documentPlan = { category: '인물' as const, folderPath: '인물', templateName: 't', templateContent: '# 이름', purpose: 'p' };
    for (const presetLevel of levels) {
      const result = composeSystemInstruction({
        presetLevel, styleId: 'lyrical-kimhoon', genre: '로맨스', documentPlan,
        customInstruction: '용을 등장시켜줘', workSystemInstruction: '작품 지시 본문',
      });
      expect(result.startsWith(BASELINE_SYSTEM_PROMPT)).toBe(true);
      expect(countOf(result, BASELINE_SYSTEM_PROMPT)).toBe(1);
      expect(countOf(result, RESPONSE_PROTOCOL_INSTRUCTIONS)).toBe(1);
      expect(result).toContain(STYLE_PRESETS['lyrical-kimhoon'].instruction);
      expect(result).toContain('로맨스');
      expect(result).toContain('작업: 설정 문서 생성');
      expect(result.endsWith(RESPONSE_PROTOCOL_INSTRUCTIONS)).toBe(true);
    }
  });

  it('without the new fields the output is byte-for-byte the legacy composition', () => {
    for (const presetLevel of levels) {
      const legacy = [
        BASELINE_SYSTEM_PROMPT,
        `이 작품의 장르는 '판타지'입니다. 장르 관습과 독자 기대에 맞게 작성하세요.`,
        STYLE_PRESETS[DEFAULT_STYLE_PRESET].instruction,
        PRESET_INSTRUCTIONS[presetLevel],
        RESPONSE_PROTOCOL_INSTRUCTIONS,
      ].join('\n\n');
      expect(composeSystemInstruction({ ...base, presetLevel })).toBe(legacy);
      expect(composeSystemInstruction({ ...base, presetLevel, customInstruction: null, workSystemInstruction: null })).toBe(legacy);
    }
  });
});

describe('lib/ai/prompt.ts — assembleUserContent', () => {
  it('includes mentioned document names/content and the preceding text', () => {
    const result = assembleUserContent({
      mentionedDocs: [{ name: '아서', category: '인물', content: '용감한 기사.' }],
      precedingText: '어느 날...',
      chatHistory: [{ role: 'user', content: '이어서 써줘' }],
    });
    expect(result).toContain('아서');
    expect(result).toContain('용감한 기사.');
    expect(result).toContain('어느 날...');
  });

  it('omits the KB-section wrapper entirely when no documents are mentioned', () => {
    const result = assembleUserContent({ mentionedDocs: [], precedingText: '본문만 있음', chatHistory: [{ role: 'user', content: '계속' }] });
    expect(result).not.toContain('참고할 설정집');
    expect(result).toContain('본문만 있음');
  });

  it('folds the whole chat session (including the newest user message) into the contents', () => {
    const result = assembleUserContent({
      mentionedDocs: [],
      precedingText: '어느 날...',
      chatHistory: [
        { role: 'user', content: '더 짧게' },
        { role: 'assistant', content: '이전 응답' },
        { role: 'user', content: '이번엔 더 긴장감 있게' },
      ],
    });
    expect(result).toContain('더 짧게');
    expect(result).toContain('이전 응답');
    expect(result).toContain('이번엔 더 긴장감 있게');
  });

  it('omits the chat-history section entirely when chatHistory is empty', () => {
    const result = assembleUserContent({ mentionedDocs: [], precedingText: '본문', chatHistory: [] });
    expect(result).not.toContain('지금까지 나눈 대화');
  });
});

describe('lib/ai/prompt.ts — chatHistoryTurnContent', () => {
  it('returns a user turn\'s text verbatim', () => {
    expect(chatHistoryTurnContent({ role: 'user', text: '이어서 써줘' })).toBe('이어서 써줘');
  });

  it('folds an assistant turn\'s draft into the turn content, so the AI remembers what it already offered', () => {
    const result = chatHistoryTurnContent({ role: 'assistant', text: '이렇게 이어봤어요.', draft: '태준이 손을 내밀었다.' });
    expect(result).toContain('이렇게 이어봤어요.');
    expect(result).toContain('태준이 손을 내밀었다.');
  });

  it('folds an assistant turn\'s document proposal into the turn content', () => {
    const result = chatHistoryTurnContent({
      role: 'assistant', text: '이런 인물은 어떨까요?',
      proposal: { category: '인물', name: '오수진', content: '다정한 동료.' },
    });
    expect(result).toContain('오수진');
    expect(result).toContain('다정한 동료.');
  });
});
