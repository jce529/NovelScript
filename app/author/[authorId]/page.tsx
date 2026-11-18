import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAuthorProfile, normalizeAuthorWorksQuery } from '@/lib/author/queries';
import { SiteHeader } from '@/components/layout/site-header';
import { AuthorPage, AuthorRetry } from '@/components/author/author-page';
import { loadAuthorPageData } from './actions';

type Props = {
  params: Promise<{ authorId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const publicProfile = cache(async (authorId: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorId)) return null;
  try {
    const result = await getAuthorProfile(await createClient(), authorId);
    return result.ok ? result.profile : null;
  } catch { return null; }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await publicProfile((await params).authorId);
  return { title: { absolute: profile ? `${profile.penName} · 작가 페이지 - NovelScript` : '작가 페이지 - NovelScript' } };
}

export default async function Page({ params, searchParams }: Props) {
  const { authorId } = await params;
  const query = normalizeAuthorWorksQuery(await searchParams);
  const data = await loadAuthorPageData(authorId, query);
  if (data.kind === 'not_found') notFound();
  return (
    <>
      <SiteHeader />
      {data.kind === 'ready' ? <AuthorPage key={authorId} {...data} query={query} /> : <AuthorRetry />}
    </>
  );
}
