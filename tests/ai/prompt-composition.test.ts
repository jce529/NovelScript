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
