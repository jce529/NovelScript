export type JosaKind = 'eul' | 'i' | 'euro';

// Digits are read by their Korean names (영 일 이 삼 사 오 육 칠 팔 구); true = ends in a final consonant.
const DIGIT_HAS_FINAL = [true, true, false, true, false, false, true, true, true, false];
// Digits whose reading ends in ㄹ (일 -> 1, 팔 -> 8), which takes 로 like a vowel ending.
const DIGIT_ENDS_IN_RIEUL = new Set([1, 8]);
const RIEUL_FINAL_INDEX = 8;

const NEUTRAL: Record<JosaKind, string> = { eul: '을(를)', i: '이(가)', euro: '(으)로' };

/** Picks the Korean particle by the final consonant of the last character of `word`. Words that end in
 * neither Hangul nor a digit (Latin text, symbols) get the neutral "을(를)" style form. */
export function josa(word: string, kind: JosaKind): string {
  const last = word.trimEnd().slice(-1);
  if (!last) return NEUTRAL[kind];

  let hasFinal: boolean;
  let rieul = false;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const finalIndex = (code - 0xac00) % 28;
    hasFinal = finalIndex !== 0;
    rieul = finalIndex === RIEUL_FINAL_INDEX;
  } else if (last >= '0' && last <= '9') {
    const digit = Number(last);
    hasFinal = DIGIT_HAS_FINAL[digit];
    rieul = DIGIT_ENDS_IN_RIEUL.has(digit);
  } else {
    return NEUTRAL[kind];
  }

  if (kind === 'eul') return hasFinal ? '을' : '를';
  if (kind === 'i') return hasFinal ? '이' : '가';
  return !hasFinal || rieul ? '로' : '으로';
}
