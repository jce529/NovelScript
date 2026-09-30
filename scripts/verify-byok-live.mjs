// 실제 제공자 키로 validateByokKey(models-list) 경로를 실행하는 무과금 라이브 프로브.
// 생성 호출은 하지 않는다. 출력은 제공자·ok·교집합 모델 수·reason만이며 키는 어디에도 출력하지 않는다.
//
// 실행: npx tsx --conditions=react-server --env-file=.env.local scripts/verify-byok-live.mjs
// 환경변수(없으면 해당 제공자의 유효 키 검사는 건너뜀):
//   OPENAI_BYOK_TEST_KEY, ANTHROPIC_BYOK_TEST_KEY, GEMINI_BYOK_TEST_KEY
import { validateByokKey } from '../lib/ai/providers/byok-validate.ts';

const PROVIDERS = [
  { id: 'openai', envName: 'OPENAI_BYOK_TEST_KEY' },
  { id: 'anthropic', envName: 'ANTHROPIC_BYOK_TEST_KEY' },
  { id: 'gemini', envName: 'GEMINI_BYOK_TEST_KEY' },
];

function report(provider, label, result) {
  const detail = result.ok ? `models=${result.modelIds.length}` : `reason=${result.reason}`;
  console.log(`provider=${provider} case=${label} ok=${result.ok} ${detail}`);
}

let unexpected = 0;
for (const { id, envName } of PROVIDERS) {
  const key = process.env[envName];
  if (key) {
    const result = await validateByokKey(id, key);
    report(id, 'valid-key', result);
    if (!result.ok) unexpected++;
  } else {
    console.log(`provider=${id} case=valid-key skipped (${envName} not set)`);
  }
  // 형식은 통과하지만 제공자가 거부해야 하는 임의 문자열 키 — invalid/forbidden으로 분류되어야 한다.
  const bogus = `bogus-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const bad = await validateByokKey(id, bogus);
  report(id, 'bogus-key', bad);
  if (bad.ok || !['invalid', 'forbidden'].includes(bad.reason)) unexpected++;
}
console.log(unexpected === 0 ? 'RESULT=PASS' : `RESULT=UNEXPECTED(${unexpected})`);
process.exitCode = unexpected === 0 ? 0 : 1;
