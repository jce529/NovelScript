import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/layout/site-header';
import { WorldTreeReaderPanel, loadReaderWorldTree } from '@/components/world-tree/world-tree-tab';

/**
 * Standalone large world-tree view (18-11, UI-SPEC screen 1). Same reader projection as the work
 * detail lore tab. The metadata is generic so a private root title can never reach the document
 * title; the visible header comes from the reader projection (requested published work).
 */

export const metadata: Metadata = { title: '세계수' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WorkWorldTreePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  if (!UUID_RE.test(workId)) notFound();

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const load = await loadReaderWorldTree(supabase, workId);
  // Unpublished/draft/blinded/missing entries look like any unavailable work.
  if (load.status === 'unavailable') notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="flex h-11 items-center">
          <Link href={`/works/${workId}`} aria-label="작품으로 돌아가기" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="size-4" />
          </Link>
        </div>
        <WorldTreeReaderPanel workId={workId} load={load} expanded />
      </main>
    </>
  );
}
