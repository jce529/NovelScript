/** Preserves approximate queue geometry while data loads. */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중</span>
      <div className="h-8 w-40 rounded-md bg-muted" />
      <div className="h-11 w-64 rounded-md bg-muted" />
      <ul className="flex flex-col" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex gap-3 border-b border-border py-4">
            <span className="h-12 w-8 shrink-0 rounded-sm bg-muted" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="h-4 w-3/5 rounded bg-muted" />
              <span className="h-4 w-2/5 rounded bg-muted" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
