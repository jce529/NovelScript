/** Client-safe chat send lifecycle (COST-01) + ChatResult -> notice mapping (UI-SPEC §1-2). */
import { CHAT_COPY, type ChatFailureKind, type ChatResult } from '@/lib/ai/chat-result';
import { REFUSAL_REASON_CODES, type RefusalReasonCode } from '@/lib/ai/providers/types';
import type { ProviderId } from '@/lib/ai/providers/types';
import type { KeySource } from '@/lib/ai/providers/selection';
import { PROVIDER_MODELS } from '@/lib/ai/providers/catalog';

export interface SendAttempt<P> {
  readonly idempotencyKey: string;
  readonly payload: Readonly<P>;
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
}

/** One writer send = one frozen attempt. Retry reuses the same object; a new send creates a new one. */
export function createSendAttempt<P>(
  payload: P,
  newKey: () => string = () => crypto.randomUUID(),
): SendAttempt<P> {
  const snapshot = structuredClone(payload);
  deepFreeze(snapshot);
  return Object.freeze({ idempotencyKey: newKey(), payload: snapshot });
}

export interface SendLock {
  tryAcquire(): boolean;
  release(): void;
  readonly locked: boolean;
}

/** Synchronous lock: a second acquire in the same event turn (double click / Enter) is rejected. */
export function createSendLock(): SendLock {
  let locked = false;
  return {
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    get locked() {
      return locked;
    },
  };
}

export const REFUSAL_REASON_DESCRIPTIONS: Record<RefusalReasonCode, string> = {
  SAFETY: '유해할 수 있는 내용으로 판단됐어요.',
  PROHIBITED_CONTENT: '제공자가 금지한 유형의 내용으로 판단됐어요.',
  BLOCKLIST: '차단 목록에 있는 표현이 포함됐어요.',
  SPII: '민감한 개인정보가 포함된 것으로 판단됐어요.',
  RECITATION: '기존 저작물을 그대로 옮길 가능성이 있어 중단됐어요.',
  IMAGE_SAFETY: '제공자 이미지 정책에 따라 차단됐어요.',
  IMAGE_PROHIBITED_CONTENT: '제공자 이미지 정책에 따라 차단됐어요.',
  IMAGE_RECITATION: '제공자 이미지 정책에 따라 차단됐어요.',
  OTHER: '제공자 정책에 따라 차단됐어요.',
};

export type NoticeVariant = 'refusal' | 'processed' | 'error';

export interface ChatNotice {
  variant: NoticeVariant;
  title: string;
  body: string | null;
  meta: string | null;
  reasonLine: string | null;
  retryable: boolean;
  removeUserTurn: boolean;
  restoreInput: boolean;
  refreshBalance: boolean;
  /** Explicit next action for safe BYOK outcomes; absent for legacy service notices. */
  byokAction?:
    | { kind: 'invalid_key'; settingsHref: '/studio/settings/ai-providers' }
    | { kind: 'retry'; providerId: ProviderId }
    | { kind: 'replacement'; selection: { providerId: ProviderId; model: string; keySource: 'service' }; original: { providerId: ProviderId; model: string } };
}

export type ChatOutcome =
  | { kind: 'success'; refreshBalance: boolean }
  | { kind: 'notice'; notice: ChatNotice };

/** Derive a new frozen attempt for explicit service-key consent, preserving identity and content. */
export function createReplacementAttempt<P extends { providerId: ProviderId; model: string; keySource: KeySource }>(
  attempt: SendAttempt<P>, selection: { providerId: ProviderId; model: string; keySource: 'service' },
): SendAttempt<P & { replacementConsent: true; replacementSelection: typeof selection }> {
  const payload = structuredClone(attempt.payload) as P & { replacementConsent: true; replacementSelection: typeof selection };
  Object.assign(payload, { replacementConsent: true, replacementSelection: { ...selection } });
  deepFreeze(payload);
  return Object.freeze({ idempotencyKey: attempt.idempotencyKey, payload });
}

export function formatTokens(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function formatRefusalMeta(debitAmount: number, balance: number | undefined): string | null {
  const usagePart = debitAmount > 0 ? `${formatTokens(debitAmount)}토큰 사용` : '차감된 토큰 없음';
  const balancePart = balance === undefined ? null : `보유 토큰 ${formatTokens(balance)}`;
  return balancePart === null ? usagePart : `${usagePart} · ${balancePart}`;
}

function normalizeReasonCode(raw: string): RefusalReasonCode {
  return (REFUSAL_REASON_CODES as readonly string[]).includes(raw) ? (raw as RefusalReasonCode) : 'OTHER';
}

const RETRYABLE_KINDS: ReadonlySet<ChatFailureKind> = new Set<ChatFailureKind>([
  'rate_limited',
  'credit_exhausted',
  'unavailable',
  'config',
  'settlement',
  'generation_in_progress',
  'unknown',
]);

const COPY_TITLE_KINDS: ReadonlySet<ChatFailureKind> = new Set<ChatFailureKind>([
  'rate_limited',
  'unavailable',
  'config',
  'settlement',
  'insufficient_balance',
  'generation_in_progress',
]);

const BYOK_PROVIDER_LABEL: Record<ProviderId, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini' };

export function resolveChatOutcome(result: ChatResult, providerId?: ProviderId): ChatOutcome {
  if (result.ok) {
    return { kind: 'success', refreshBalance: result.remainingBalance !== undefined };
  }

  if (result.status === 'refused' && result.refusal) {
    const code = normalizeReasonCode(result.refusal.reasonCode);
    const stageLabel = result.refusal.stage === 'input' ? '입력 차단' : '생성 중 차단';
    return {
      kind: 'notice',
      notice: {
        variant: 'refusal',
        title: CHAT_COPY.refusedTitle,
        body: CHAT_COPY.refusedBody,
        meta: formatRefusalMeta(result.refusal.debitAmount, result.remainingBalance),
        reasonLine: `${stageLabel} · ${code} · ${REFUSAL_REASON_DESCRIPTIONS[code]}`,
        retryable: false,
        removeUserTurn: true,
        restoreInput: true,
        refreshBalance: true,
      },
    };
  }

  if (result.status === 'already_processed') {
    return {
      kind: 'notice',
      notice: {
        variant: 'processed',
        title: CHAT_COPY.processedTitle,
        body: CHAT_COPY.processedBody,
        meta: result.remainingBalance === undefined ? null : `보유 토큰 ${formatTokens(result.remainingBalance)}`,
        reasonLine: null,
        retryable: false,
        removeUserTurn: true,
        restoreInput: true,
        refreshBalance: true,
      },
    };
  }

  if (result.kind === 'replacement_required' && result.replacement && result.original) {
    const label = BYOK_PROVIDER_LABEL[result.original.providerId];
    const modelName = PROVIDER_MODELS[result.original.providerId].find((model) => model.id === result.original!.model)?.displayName ?? result.original.model;
    const replacementName = PROVIDER_MODELS[result.replacement.providerId].find((model) => model.id === result.replacement!.model)?.displayName ?? result.replacement.model;
    const sameModel = result.original.providerId === result.replacement.providerId && result.original.model === result.replacement.model;
    return { kind: 'notice', notice: {
      variant: 'error', title: `선택한 ${label} 키를 사용할 수 없어요`,
      body: sameModel
        ? `${modelName} [서비스 키]로 대신 보낼 수 있어요. 이 경우 지갑 토큰이 차감돼요.`
        : `${modelName}은 서비스 키로 제공되지 않아요. ${replacementName} [서비스 키]로 대신 보낼 수 있고, 이 경우 지갑 토큰이 차감돼요.`,
      meta: null, reasonLine: null, retryable: false, removeUserTurn: true, restoreInput: true,
      refreshBalance: false,
      byokAction: { kind: 'replacement', selection: result.replacement, original: result.original },
    } };
  }

  const kind: ChatFailureKind = result.failureKind ?? 'unknown';
  if (providerId && (kind === 'invalid_key' || kind === 'rate_limited' || kind === 'credit_exhausted' || kind === 'unavailable')) {
    const label = BYOK_PROVIDER_LABEL[providerId];
    const copy = {
      invalid_key: { title: `${label} 키를 사용할 수 없어요`, body: '키가 유효하지 않거나 폐기됐어요. 설정에서 키를 확인하고 다시 등록해 주세요. 이 키는 검증 실패로 표시했어요.' },
      rate_limited: { title: `${label} 요청 한도에 도달했어요`, body: '잠시 뒤 다시 시도해 주세요. 키 상태는 그대로예요.' },
      credit_exhausted: { title: `${label} 크레딧이 부족해요`, body: `${label}에서 크레딧을 충전한 뒤 다시 시도해 주세요. 키 상태는 그대로예요.` },
      unavailable: { title: `${label}에 연결할 수 없어요`, body: '잠시 뒤 다시 시도해 주세요. 키 상태는 그대로예요.' },
    }[kind];
    const invalid = kind === 'invalid_key';
    return { kind: 'notice', notice: {
      variant: 'error', title: copy.title, body: copy.body, meta: null, reasonLine: null,
      retryable: !invalid, removeUserTurn: invalid, restoreInput: invalid, refreshBalance: false,
      byokAction: invalid ? { kind: 'invalid_key', settingsHref: '/studio/settings/ai-providers' } : { kind: 'retry', providerId },
    } };
  }
  const retryable = RETRYABLE_KINDS.has(kind);
  const title = COPY_TITLE_KINDS.has(kind)
    ? CHAT_COPY[kind as keyof typeof CHAT_COPY]
    : (result.error ?? CHAT_COPY.unknown);
  return {
    kind: 'notice',
    notice: {
      variant: 'error',
      title,
      body: null,
      meta: null,
      reasonLine: null,
      retryable,
      removeUserTurn: !retryable,
      restoreInput: !retryable,
      refreshBalance: false,
    },
  };
}

/** Notice for a chatAction call that threw (network / server crash). */
export function thrownChatNotice(): ChatNotice {
  return {
    variant: 'error',
    title: CHAT_COPY.unavailable,
    body: null,
    meta: null,
    reasonLine: null,
    retryable: true,
    removeUserTurn: false,
    restoreInput: false,
    refreshBalance: false,
  };
}
