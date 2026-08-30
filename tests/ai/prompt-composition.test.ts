import { describe, it, expect } from 'vitest';
import {
  composeSystemInstruction, assembleUserContent, BASELINE_SYSTEM_PROMPT,
  PRESET_INSTRUCTIONS, STYLE_PRESETS, DEFAULT_STYLE_PRESET,
} from '../../lib/ai/prompt';

describe('lib/ai/prompt.ts — composeSystemInstruction (EDIT-03, D-07, D-14, D-15, D-10rev)', () => {
  it('always includes the D-14 baseline guardrail block, regardless of preset level', () => {
    for (const presetLevel of ['beginner', 'intermediate', 'freeform'] as const) {
      const result = composeSystemInstruction({ presetLevel, customInstruction: '아무 지시', styleId: DEFAULT_STYLE_PRESET, genre: '판타지' });
      expect(result).toContain(BASELINE_SYSTEM_PROMPT);
    }
  });

  it('자유형 (freeform) uses the writer\'s custom instruction verbatim', () => {
    const result = composeSystemInstruction({ presetLevel: 'freeform', customInstruction: '용을 등장시켜줘', styleId: DEFAULT_STYLE_PRESET, genre: '판타지' });
    expect(result).toContain('용을 등장시켜줘');
  });

  it('자유형 with no typed instruction falls back to a safe default instead of an empty/malformed prompt', () => {
    const result = composeSystemInstruction({ presetLevel: 'freeform', customInstruction: null, styleId: DEFAULT_STYLE_PRESET, genre: '판타지' });
    expect(result).toContain(PRESET_INSTRUCTIONS.intermediate);
  });

  it('applies the 문체 프리셋 (D-15) regardless of AI-지시 프리셋 level — it is a separate, always-on control', () => {
    const result = composeSystemInstruction({ presetLevel: 'beginner', customInstruction: null, styleId: 'lyrical-kimhoon', genre: '판타지' });
    expect(result).toContain(STYLE_PRESETS['lyrical-kimhoon'].instruction);
  });

  it('reflects the active genre in the composed instruction (D-07)', () => {
    const result = composeSystemInstruction({ presetLevel: 'intermediate', customInstruction: null, styleId: DEFAULT_STYLE_PRESET, genre: '로맨스' });
    expect(result).toContain('로맨스');
  });

  it('folds regeneration feedback in as an ADDITIONAL instruction, not a replacement of the active preset (D-10rev)', () => {
    const result = composeSystemInstruction({
      presetLevel: 'intermediate', customInstruction: null, styleId: DEFAULT_STYLE_PRESET, genre: '판타지', regenerationFeedback: '좀 더 긴장감 있게',
    });
    expect(result).toContain(PRESET_INSTRUCTIONS.intermediate);
    expect(result).toContain('좀 더 긴장감 있게');
  });

  it('omits any regeneration-feedback marker text on a normal (non-regeneration) call', () => {
    const result = composeSystemInstruction({ presetLevel: 'intermediate', customInstruction: null, styleId: DEFAULT_STYLE_PRESET, genre: '판타지' });
    expect(result).not.toContain('추가 요청사항');
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
    });
    expect(result).toContain('아서');
    expect(result).toContain('용감한 기사.');
    expect(result).toContain('어느 날...');
  });

  it('omits the KB-section wrapper entirely when no documents are mentioned', () => {
    const result = assembleUserContent({ mentionedDocs: [], precedingText: '본문만 있음' });
    expect(result).not.toContain('참고할 설정집');
    expect(result).toContain('본문만 있음');
  });
});
