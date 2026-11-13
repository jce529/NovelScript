import { WorkGrid } from '@/components/reader/work-grid';

export default function SeriesLoading() {
  return (
    <main
      aria-busy="true"
      data-slot="series-loading"
      className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-4 pt-6 pb-12"
    >
      <div className="flex flex-col gap-2">
        <div className="h-5 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-11 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <WorkGrid total={0} shown={0} loading />
    </main>
  );
}
