import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listWorks } from '@/lib/works/actions';

export default async function WorkListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const works = user ? await listWorks(supabase, { ownerId: user.id }) : [];

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">작품 목록</h1>
        <Link href="/studio/works/new" className="bg-primary text-primary-foreground rounded px-4 py-2">
          새 작품 만들기
        </Link>
      </div>
      {works.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <h2 className="text-2xl font-semibold">아직 만든 작품이 없어요</h2>
          <p className="text-muted-foreground">새 작품을 만들고 집필을 시작해보세요.</p>
          <Link href="/studio/works/new" className="bg-primary text-primary-foreground rounded px-4 py-2">
            새 작품 만들기
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4">
          {works.map((work) => (
            <li key={work.id} className="rounded border p-4 bg-secondary">
              <Link href={`/studio/${work.id}`} className="font-medium">{work.title}</Link>
              <p className="text-sm text-muted-foreground">{work.synopsis || ''}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
