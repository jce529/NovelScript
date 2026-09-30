import { redirect } from 'next/navigation';
import { isAccountActive } from '@/lib/auth/account';
import { PROVIDER_MODELS } from '@/lib/ai/providers/catalog';
import { listByokKeys } from '@/lib/ai/providers/byok';
import { loadConnectedByokModels } from '@/lib/ai/providers/byok-models';
import { buildModelChoices, encodeSelection, resolveDeleteReplacement } from '@/lib/ai/providers/selection';
import { getDefaultProviderModel } from '@/lib/ai/providers/settings';
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

  const [connectedModels, keys] = await Promise.all([
    loadConnectedByokModels(supabase, user.id),
    listByokKeys(supabase, user.id),
  ]);
  const current = await getDefaultProviderModel(supabase, user.id, connectedModels);
  const choices = buildModelChoices(connectedModels);
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
      deleteImpact: {
        modelCount: connectedModels[providerId]?.length ?? 0,
        defaultReplacementLabel: replacement.replaced ? `${replacementInfo?.displayName ?? replacementModel.model} [서비스 키]` : null,
      },
    };
  });
  const status = await searchParams;

  return (
    <>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold">AI 제공자 설정</h1>
          <p className="mt-2 text-sm text-muted-foreground">집필에 사용할 계정 기본 모델을 선택하세요.</p>
        </div>
        <section className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-medium">계정 기본값</h2>
          <p className="mt-1 text-sm text-muted-foreground">AI 패널에서 다른 모델을 고르면 해당 전송에만 적용돼요.</p>
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
                    <option key={choice.value} value={choice.value}>
                      {choice.displayName} [{choice.badge}] · {choice.description}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
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
