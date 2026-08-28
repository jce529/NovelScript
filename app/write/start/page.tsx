import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { submitWriterUpgrade } from './actions';

export default async function WriteStartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-semibold mb-4">글쓰기 시작하기</h1>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <form action={submitWriterUpgrade} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span>필명 (2~20자, 필수, 플랫폼 내 고유해야 함)</span>
          <input name="penName" required minLength={2} maxLength={20} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span>소개글 (선택)</span>
          <textarea name="bio" className="border rounded px-3 py-2" />
        </label>
        <button type="submit" className="bg-black text-white rounded px-4 py-2">
          작가로 시작하기
        </button>
      </form>
    </main>
  );
}
