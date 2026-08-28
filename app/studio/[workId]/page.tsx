import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getWork } from '@/lib/works/actions';

export default async function WorkHomePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const work = user ? await getWork(supabase, { ownerId: user.id, workId }) : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{work?.title}</h1>
      <p className="text-muted-foreground">{work?.synopsis || ''}</p>
      <Link href={`/studio/${workId}/chapters`} className="underline w-fit">회차 목록으로 이동</Link>
    </div>
  );
}
