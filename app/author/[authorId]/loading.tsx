import { SiteHeader } from '@/components/layout/site-header';

export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main aria-busy="true" aria-label="작가 페이지 불러오는 중" className="mx-auto flex w-full max-w-[1152px] flex-col gap-6 px-4 py-6">
        <div aria-hidden className="flex flex-col gap-6 motion-safe:animate-pulse">
          <div className="h-11 w-32 rounded-lg bg-muted" />
          <div className="flex flex-wrap items-center gap-4 rounded-lg border p-6">
            <div className="size-16 rounded-full bg-muted sm:size-[84px]" />
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="h-8 w-32 rounded-lg bg-muted" />
              <div className="h-4 w-full rounded-lg bg-muted" />
              <div className="flex flex-wrap gap-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-6 w-16 rounded-full bg-muted" />)}</div>
            </div>
            <div className="h-11 w-full rounded-lg bg-muted sm:w-40" />
          </div>
          <div className="h-11 w-full rounded-lg bg-muted" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex flex-col gap-4 rounded-lg border p-2">
              <div className="aspect-[3/4] rounded-lg bg-muted" /><div className="h-4 rounded-lg bg-muted" /><div className="h-4 w-16 rounded-lg bg-muted" />
            </div>)}
          </div>
        </div>
      </main>
    </>
  );
}
