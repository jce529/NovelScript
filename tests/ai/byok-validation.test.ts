import { describe, expect, it, vi } from 'vitest';
import { byokFailureMessage } from '@/lib/ai/providers/byok-copy';
import { checkKeyFormat, validateByokKey } from '@/lib/ai/providers/byok-validate';

const validKey = 'sk-test-validation-key';
const collect = (ids: string[]) => async function* () { yield* ids; };
const failure = (status?: number) => Object.assign(new Error('provider detail sentinel'), status ? { status } : {});

describe('BYOK API key format', () => {
  it('trims surrounding whitespace and returns the normalized key', () => expect(checkKeyFormat(`  ${validKey}  `)).toEqual({ ok: true, key: validKey }));
  it.each(['', '     '])('rejects empty input %j', (key) => expect(checkKeyFormat(key)).toEqual({ ok: false }));
  it.each(['key with spaces 123456', 'key\nwith-control-123456'])('rejects internal whitespace and control characters', (key) => expect(checkKeyFormat(key)).toEqual({ ok: false }));
  it('rejects keys shorter than 16 and longer than 512 characters', () => {
    expect(checkKeyFormat('short')).toEqual({ ok: false });
    expect(checkKeyFormat('x'.repeat(513))).toEqual({ ok: false });
  });
});

describe('BYOK key validation', () => {
  it('does not call the provider when the key format is invalid', async () => {
    const lister = vi.fn(collect(['gpt-4o-mini']));
    expect(await validateByokKey('openai', 'bad', { lister })).toEqual({ ok: false, reason: 'format' });
    expect(lister).not.toHaveBeenCalled();
  });
  it.each([
    ['gemini', ['gemini-3.5-flash', 'not-in-catalog'], ['gemini-3.5-flash']],
    ['openai', ['gpt-4o-mini', 'not-in-catalog'], ['gpt-4o-mini']],
    ['anthropic', ['claude-haiku-4-5', 'not-in-catalog'], ['claude-haiku-4-5']],
  ] as const)('intersects %s provider models with the exact catalog', async (provider, ids, expected) => {
    expect(await validateByokKey(provider, validKey, { lister: collect([...ids]) })).toEqual({ ok: true, modelIds: [...expected] });
  });
  it('strips a single Gemini models/ prefix', async () => {
    expect(await validateByokKey('gemini', validKey, { lister: collect(['models/gemini-3.5-flash']) })).toEqual({ ok: true, modelIds: ['gemini-3.5-flash'] });
  });
  it('keeps an empty catalog intersection as a successful validation', async () => {
    expect(await validateByokKey('openai', validKey, { lister: collect(['future-model']) })).toEqual({ ok: true, modelIds: [] });
  });
  it.each([[401, 'invalid'], [403, 'forbidden'], [429, 'rate_limited'], [500, 'unavailable']] as const)('maps provider status %i to %s', async (status, reason) => {
    const lister = async function* () { throw failure(status); };
    expect(await validateByokKey('openai', validKey, { lister })).toEqual({ ok: false, reason });
  });
  it('maps Gemini 400 invalid-key responses to invalid', async () => {
    const lister = async function* () { throw failure(400); };
    expect(await validateByokKey('gemini', validKey, { lister })).toEqual({ ok: false, reason: 'invalid' });
  });
  it('maps statusless errors and timeouts to unavailable', async () => {
    const lister = async function* () { throw failure(); };
    expect(await validateByokKey('openai', validKey, { lister })).toEqual({ ok: false, reason: 'unavailable' });
    const timeoutLister = async function* (_key: string, { signal }: { signal: AbortSignal }) { await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })); };
    expect(await validateByokKey('openai', validKey, { lister: timeoutLister, timeoutMs: 1 })).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('fails closed when maxModels is reached before all catalog candidates are discovered', async () => {
    expect(await validateByokKey('openai', validKey, { lister: collect(['gpt-4o-mini', 'gpt-5.6-terra']), maxModels: 1 })).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('stops after finding all catalog candidates and never returns or throws the key', async () => {
    const sentinel = `sk-test-${crypto.randomUUID()}`;
    let iterated = 0;
    const lister = async function* () { iterated++; yield 'gpt-4o-mini'; iterated++; yield 'gpt-5.6-terra'; iterated++; yield 'late-model'; };
    const caught = await validateByokKey('openai', sentinel, { lister }).then((value: unknown) => value, (error: unknown) => error);
    expect(caught).toEqual({ ok: true, modelIds: ['gpt-4o-mini', 'gpt-5.6-terra'] });
    expect(iterated).toBe(2);
    expect(JSON.stringify(caught)).not.toContain(sentinel);
  });
});

describe('BYOK validation messages', () => {
  it.each([
    ['format', '키 형식을 확인해 주세요. OpenAI에서 발급한 API 키를 다시 입력하세요.'],
    ['invalid', '유효하지 않은 키예요. OpenAI에서 키를 확인하고 다시 입력하세요.'],
    ['forbidden', '이 키로 모델 목록을 볼 권한이 없어요. OpenAI 계정의 권한을 확인하세요.'],
    ['rate_limited', '제공자의 요청 한도에 도달했어요. 잠시 뒤 다시 시도하세요.'],
    ['unavailable', '지금 OpenAI에 연결할 수 없어요. 잠시 뒤 다시 시도하세요.'],
  ] as const)('renders the %s UI-SPEC message exactly', (reason, expected) => expect(byokFailureMessage(reason, 'OpenAI')).toBe(expected));
});
