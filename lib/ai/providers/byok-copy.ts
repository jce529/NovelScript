import type { ProviderId } from './types';
import type { ByokFailureReason } from './byok-validate';

export const PROVIDER_LABEL: Record<ProviderId, string> = { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic' };
export function byokFailureMessage(reason: ByokFailureReason, providerLabel: string): string {
  const copy: Record<ByokFailureReason, string> = {
    format: `키 형식을 확인해 주세요. ${providerLabel}에서 발급한 API 키를 다시 입력하세요.`,
    invalid: `유효하지 않은 키예요. ${providerLabel}에서 키를 확인하고 다시 입력하세요.`,
    forbidden: `이 키로 모델 목록을 볼 권한이 없어요. ${providerLabel} 계정의 권한을 확인하세요.`,
    rate_limited: '제공자의 요청 한도에 도달했어요. 잠시 뒤 다시 시도하세요.',
    unavailable: `지금 ${providerLabel}에 연결할 수 없어요. 잠시 뒤 다시 시도하세요.`,
  };
  return copy[reason];
}
export const BYOK_COPY = {
  sectionHeading: '내 API 키',
  sectionBody: '제공자별로 키를 하나씩 등록할 수 있어요. 키 검증은 모델 목록 조회로 진행되며 생성 요금은 발생하지 않아요.',
  inputLabel: (provider: string) => `${provider} API 키`,
  inputPlaceholder: 'API 키를 붙여넣으세요',
  emptyHeading: '미등록',
  emptyBody: 'API 키를 등록하면 확인된 BYOK 모델이 모델 선택 목록에 나타나요.',
  loading: '키를 확인하는 중…',
  registrationSuccess: (provider: string, count: number) => `${provider} 키를 등록했어요. 사용 가능한 모델 ${count}개를 확인했어요.`,
  recheckSuccess: (provider: string, count: number) => `${provider} 키를 다시 확인했어요. 사용 가능한 모델 ${count}개를 확인했어요.`,
  noCatalogMatch: '키는 확인됐지만 현재 제공하는 모델은 없어요. 모델 목록이 업데이트되면 표시돼요.',
  deleteSuccess: (provider: string) => `${provider} 키를 삭제했어요.`,
  deleteReplacement: (model: string) => `기본 모델이 ${model} [서비스 키]로 바뀌었어요.`,
  replacementHelp: '키를 바꾸려면 기존 키를 삭제한 뒤 새 키를 등록하세요.',
  sendBoundary: 'BYOK 모델 호출은 아직 준비 중이에요. 지금 생성하려면 [서비스 키] 모델을 선택하세요.',
  internalError: '처리하지 못했어요. 잠시 뒤 다시 시도하세요.',
} as const;
