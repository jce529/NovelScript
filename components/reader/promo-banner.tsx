export function PromoBanner() {
  return (
    <div className="rounded-lg border border-border bg-secondary p-6">
      <span className="inline-flex h-5 w-fit items-center rounded-4xl bg-primary px-2 text-xs font-medium text-primary-foreground">NEW</span>
      <h2 className="mt-2 text-xl font-semibold text-foreground">신작 프리미어 위크</h2>
      <p className="mt-1 text-sm text-muted-foreground">이번 주 새로 연재를 시작한 작품들을 가장 먼저 만나보세요.</p>
    </div>
  );
}
