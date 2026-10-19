import { redirect } from 'next/navigation';
import { isAccountActive } from '@/lib/auth/account';
import { PROVIDER_MODELS } from '@/lib/ai/providers/catalog';
import { listByokKeys } from '@/lib/ai/providers/byok';
import { loadConnectedByokModels } from '@/lib/ai/providers/byok-models';
import { buildModelChoices, encodeSelection, resolveDeleteReplacement } from '@/lib/ai/providers/selection';
import { getDefaultProviderModel } from '@/lib/ai/providers/settings';
import { getServiceAvailability } from '@/lib/ai/providers/service-availability';
import { loadMonthlyByokUsage } from '@/lib/ai/usage';
import type { ProviderId } from '@/lib/ai/providers/types';
import { createClient } from '@/lib/supabase/server';
import { saveDefaultAction } from './actions';
import ByokKeyCards from './ByokKeyCards';
import { BYOK_COPY, PROVIDER_LABEL } from '@/lib/ai/providers/byok-copy';

export default async function AiProvidersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles')
    .select('role, deleted_at').eq('id', user.id).maybeSingle();
  if (!profile || !isAccountActive(profile)) redirect('/login');
  if (profile.role !== 'writer') redirect('/studio');

  const [connectedModels, keys, monthlyUsage] = await Promise.all([
    loadConnectedByokModels(supabase, user.id),
    listByokKeys(supabase, user.id),
    loadMonthlyByokUsage(supabase, user.id),
  ]);
  const current = await getDefaultProviderModel(supabase, user.id, connectedModels);
  const serviceAvailability = getServiceAvailability();
  const choices = buildModelChoices(connectedModels, serviceAvailability);
  const unavailableProviders = (Object.keys(PROVIDER_MODELS) as ProviderId[]).filter((providerId) => !serviceAvailability[providerId]);
  const cards = (['openai', 'anthropic', 'gemini'] as ProviderId[]).map((providerId) => {
    const key = keys.find((item) => item.provider === providerId);
    const replacement = resolveDeleteReplacement(current, providerId);
    const replacementModel = replacement.next;
    const replacementInfo = PROVIDER_MODELS[replacementModel.providerId].find(({ id }) => id === replacementModel.model);
    return {
      providerId,
      label: PROVIDER_LABEL[providerId],
      registered: key ? {
        maskedHint: key.maskedHint,
        status: key.status,
        registeredAtLabel: new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(key.createdAt)),
        modelCount: connectedModels[providerId]?.length ?? 0,
      } : null,
      usage: key ? monthlyUsage.ok
        ? (() => {
            const total = monthlyUsage.providers.find((item) => item.provider === providerId);
            return total ? {
              status: 'ready' as const,
              total: { calls: total.calls, inputTokens: total.inputTokens, outputTokens: total.outputTokens },
              models: total.models.map(({ model, calls, inputTokens, outputTokens }) => ({ model, calls, inputTokens, outputTokens })),
            } : { status: 'empty' as const };
          })()
        : { status: 'error' as const } : undefined,
      deleteImpact: {
        modelCount: connectedModels[providerId]?.length ?? 0,
        defaultReplacementLabel: replacement.replaced ? `${replacementInfo?.displayName ?? replacementModel.model} [서비스 키]` : null,
      },
    };
  });
  const status = await searchParams;

  return (
    <>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-semibold">AI 제공자 설정</h1>
          <p className="mt-2 text-sm text-muted-foreground">집필에 사용할 계정 기본 모델을 선택하세요.</p>
        </div>
        <section className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-medium">계정 기본값</h2>
          <p className="mt-1 text-sm text-muted-foreground">AI 패널에서 다른 모델을 고르면 그 대화가 끝날 때까지만 적용돼요.</p>
          <form action={saveDefaultAction} className="mt-5 flex flex-col gap-4">
            <label htmlFor="providerModel" className="text-sm font-medium">제공자와 모델</label>
            <select
              id="providerModel" name="providerModel"
              defaultValue={encodeSelection(current)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {(Object.keys(PROVIDER_MODELS) as ProviderId[]).map((providerId) => (
                <optgroup key={providerId} label={`${PROVIDER_LABEL[providerId]} · ${PROVIDER_MODELS[providerId].length}개`}>
                  {choices.filter((choice) => choice.providerId === providerId).map((choice) => (
                    <option key={choice.value} value={choice.value} disabled={choice.disabled || undefined}>
                      {choice.displayName} [{choice.badge}] · {choice.description}{choice.disabled ? ` · 사용할 수 없어요 (${choice.unavailableReason})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {unavailableProviders.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground" aria-label="사용할 수 없는 서비스 키 모델">
                {unavailableProviders.map((providerId) => (
                  <li key={providerId}>{PROVIDER_LABEL[providerId]} [서비스 키] 모델은 선택할 수 없어요. 아래에서 내 API 키를 등록하면 [BYOK] 모델로 사용할 수 있어요.</li>
                ))}
              </ul>
            )}
            <button type="submit" className="self-start rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
              기본값 저장
            </button>
          </form>
          {status.saved === '1' && <p role="status" className="mt-3 text-sm">기본값을 저장했어요.</p>}
          {status.error === '1' && <p role="alert" className="mt-3 text-sm text-destructive">저장하지 못했어요. 모델을 확인하고 다시 시도해 주세요.</p>}
        </section>
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-medium">{BYOK_COPY.sectionHeading}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{BYOK_COPY.sectionBody}</p>
          </div>
          <ByokKeyCards cards={cards} />
        </section>
      </main>
    </>
  );
}
