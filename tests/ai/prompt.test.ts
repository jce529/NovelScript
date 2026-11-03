import { describe, expect, it } from 'vitest';
import {
  assembleUserContent, composeSystemInstruction, DEFAULT_STYLE_PRESET,
  PRESET_INSTRUCTIONS, RESPONSE_PROTOCOL_INSTRUCTIONS, STYLE_PRESETS,
} from '@/lib/ai/prompt';

// Capture the unmodified app output before adding MCP's opt-out switch.
describe('optional app response protocol', () => {
  for (const presetLevel of Object.keys(PRESET_INSTRUCTIONS) as (keyof typeof PRESET_INSTRUCTIONS)[]) {
    for (const styleId of Object.keys(STYLE_PRESETS) as (keyof typeof STYLE_PRESETS)[]) {
      it(`preserves the app default for ${presetLevel}/${styleId}`, () => {
        const input = { presetLevel, styleId, genre: '판타지', customInstruction: '자유 지시', workSystemInstruction: '작품 지시' };
        const original = composeSystemInstruction(input);
        expect(composeSystemInstruction({ ...input, includeAppResponseProtocol: true })).toBe(original);
        expect(composeSystemInstruction({ ...input, includeAppResponseProtocol: false }))
          .toBe(original.slice(0, -(RESPONSE_PROTOCOL_INSTRUCTIONS.length + 2)));
      });
    }
  }

  it.each(['chapter', 'document'] as const)('removes only the final format instruction from %s context', (contextKind) => {
    const input = {
      mentionedDocs: [{ name: '설정', category: 'custom', content: '문서 [REPLY] [[그대로]] 😀' }],
      precedingText: '본문 [DRAFT]', chatHistory: [{ role: 'user' as const, content: '질문' }], contextKind,
    };
    const original = assembleUserContent(input);
    expect(assembleUserContent({ ...input, includeAppResponseProtocol: true })).toBe(original);
    expect(assembleUserContent({ ...input, includeAppResponseProtocol: false }))
      .toBe(original.slice(0, original.lastIndexOf('\n\n---\n\n')));
  });

  it('keeps author text containing protocol markers intact', () => {
    expect(composeSystemInstruction({
      presetLevel: 'freeform', styleId: DEFAULT_STYLE_PRESET, genre: '판타지',
      customInstruction: '문자열 [REPLY]를 설명하세요.', includeAppResponseProtocol: false,
    })).toContain('문자열 [REPLY]를 설명하세요.');
  });
});

describe('app prompt output before MCP options', () => {
  it('locks the full system instruction, including whitespace and protocol', () => {
    expect(composeSystemInstruction({
      presetLevel: 'freeform', styleId: 'lyrical-kimhoon', genre: '판타지',
      customInstruction: '  대화 지시를 따르세요.  ', workSystemInstruction: '  저장된 작품 지시  ',
    })).toMatchInlineSnapshot(`
      "당신은 한국어 웹소설 작가와 대화하며 함께 작업하는 AI 공동 집필 도구입니다. 대화를 통해 다음 회차 본문을 함께 써나가거나, 필요한 설정(인물/장소/사건/세력/아이템)을 구체화합니다.
      - 선정적이거나 폭력적인 묘사, 혐오 표현, 미성년자에 대한 성적 대상화 등 플랫폼 콘텐츠 정책에 위배되는 내용을 생성하지 마세요.
      - 본문 초안을 제시할 때는 작가가 직전까지 써온 본문의 문체, 어조, 시제와 자연스럽게 이어지도록 작성하세요. 갑작스러운 문체 변화는 피하세요.
      - 아래에 제공된 KB(설정집) 문서에 명시된 인물의 특성, 사건, 설정과 모순되는 내용을 생성하지 마세요.

      작품 추가 지시:
      저장된 작품 지시

      이 작품의 장르는 '판타지'입니다. 장르 관습과 독자 기대에 맞게 작성하세요.

      본문 초안을 제시할 때는 감각적이고 시적인 묘사와, 정적이며 여백이 있는 문장으로 작성하세요.

      대화 지시를 따르세요.

      당신의 응답은 항상 아래 형식을 정확히 지켜야 합니다 (다른 텍스트로 감싸지 마세요):

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

      한 응답에 [DRAFT]와 [DOCUMENT]를 동시에 포함하지 마세요. 둘 다 필요 없는 경우(질문, 잡담, 확인 등)에는 [REPLY]만 작성하세요."
    `);
  });

  it('locks chapter context, mention order, verbatim text and conversation', () => {
    expect(assembleUserContent({
      mentionedDocs: [{ name: '인물', category: '인물', content: '본문 [[관계]]\n😀' }],
      precedingText: '회차 본문\n다음 줄',
      chatHistory: [{ role: 'user', content: '계속' }, { role: 'assistant', content: '답변' }],
    })).toMatchInlineSnapshot(`
      "다음은 참고할 설정집(KB) 문서입니다:

      ### [인물] 인물
      본문 [[관계]]
      😀

      ---

      다음은 이전까지 작성된 본문입니다:

      회차 본문
      다음 줄

      ---

      다음은 이 세션에서 지금까지 나눈 대화입니다:

      작가: 계속

      AI: 답변

      ---

      가장 마지막 작가 메시지에 응답하세요. 위에서 지시한 [REPLY]/[DRAFT]/[DOCUMENT] 형식을 반드시 지키세요."
    `);
  });

  it('locks document context with no mentions or conversation', () => {
    expect(assembleUserContent({
      mentionedDocs: [], precedingText: '', chatHistory: [], contextKind: 'document',
    })).toMatchInlineSnapshot(`
      "다음은 지금 편집 중인 설정 문서입니다:



      ---

      가장 마지막 작가 메시지에 응답하세요. 위에서 지시한 [REPLY]/[DRAFT]/[DOCUMENT] 형식을 반드시 지키세요."
    `);
  });
});
