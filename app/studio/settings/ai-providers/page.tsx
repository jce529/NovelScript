import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/layout/site-header';
import { isAccountActive } from '@/lib/auth/account';
import { PROVIDER_MODELS } from '@/lib/ai/providers/catalog';
import { getDefaultProviderModel, setDefaultProviderModel } from '@/lib/ai/providers/settings';
import type { ProviderId } from '@/lib/ai/providers/types';
import { createClient } from '@/lib/supabase/server';

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

  const current = await getDefaultProviderModel(supabase, user.id);
  const status = await searchParams;

  async function saveDefault(formData: FormData) {
    'use server';
    const actionClient = await createClient();
    const { data: { user: actionUser } } = await actionClient.auth.getUser();
    if (!actionUser) redirect('/login');
    const { data: actionProfile } = await actionClient.from('profiles')
      .select('role, deleted_at').eq('id', actionUser.id).maybeSingle();
    if (!actionProfile || !isAccountActive(actionProfile) || actionProfile.role !== 'writer') {
      redirect('/studio');
    }

    const selection = formData.get('providerModel');
    if (typeof selection !== 'string') redirect('/studio/settings/ai-providers?error=1');
    const separator = selection.indexOf(':');
    const result = await setDefaultProviderModel(actionClient, actionUser.id, {
      providerId: selection.slice(0, separator) as ProviderId,
      model: selection.slice(separator + 1),
    });
    if (!result.ok) redirect('/studio/settings/ai-providers?error=1');
    revalidatePath('/studio/settings/ai-providers');
    redirect('/studio/settings/ai-providers?saved=1');
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold">AI 제공자 설정</h1>
          <p className="mt-2 text-sm text-muted-foreground">집필에 사용할 계정 기본 모델을 선택하세요.</p>
        </div>
        <section className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-medium">계정 기본값</h2>
          <p className="mt-1 text-sm text-muted-foreground">AI 패널에서 다른 모델을 고르면 해당 전송에만 적용돼요.</p>
          <form action={saveDefault} className="mt-5 flex flex-col gap-4">
            <label htmlFor="providerModel" className="text-sm font-medium">제공자와 모델</label>
            <select
              id="providerModel" name="providerModel"
              defaultValue={`${current.providerId}:${current.model}`}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {(Object.keys(PROVIDER_MODELS) as ProviderId[]).map((providerId) => (
                <optgroup key={providerId} label={`${providerId.toUpperCase()} · ${PROVIDER_MODELS[providerId].length}개`}>
                  {PROVIDER_MODELS[providerId].map((model) => (
                    <option key={model.id} value={`${providerId}:${model.id}`}>
                      {model.displayName} — {model.description}
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
      </main>
    </>
  );
}
