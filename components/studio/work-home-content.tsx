import Link from 'next/link';
import { BookOpen, ChevronRight, Clock3, GitBranch, Globe2 } from 'lucide-react';
import { WORK_HOME_SHORTCUTS, type WorkHomeGuideStepId, type WorkHomeState } from '@/lib/works/work-home';

interface WorkHomeContentProps {
  workId: string;
  title: string;
  synopsis: string | null;
  state: WorkHomeState;
}

const stepCopy: Record<Exclude<WorkHomeGuideStepId, 'work'>, { href: string; label: string }> = {
  settings: { href: 'world', label: '세계관 보기' },
  chapter: { href: 'chapters', label: '회차 목록' },
  publish: { href: 'chapters', label: '열기 →' },
};

const shortcutCopy = {
  chapters: { icon: BookOpen, description: '새 회차 쓰기' },
  world: { icon: Globe2, description: '설정 문서와 공개 범위' },
  timeline: { icon: Clock3, description: '사건 순서 정리' },
  branching: { icon: GitBranch, description: '이 세계관에서 새 작품' },
} as const;

const focusClass = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function WorkHomeContent({ workId, title, synopsis, state }: WorkHomeContentProps) {
  const { chapterCounts, guide } = state;
  const baseHref = `/studio/${workId}`;
  const shortcutGrid = (
    <div className="grid min-w-0 grid-cols-1 gap-2 md:gap-4 lg:max-w-[640px] lg:grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))]">
      {WORK_HOME_SHORTCUTS.map((shortcut) => {
        const { icon: Icon, description } = shortcutCopy[shortcut.id];
        const status = shortcut.id === 'chapters'
          ? chapterCounts.total === 0 ? '아직 회차가 없어요' : `회차 ${chapterCounts.total}개 · ${description}`
          : description;
        return (
          <Link key={shortcut.id} href={`${baseHref}/${shortcut.href}`}
            className={`group flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 hover:border-primary/40 ${focusClass} lg:min-h-28 lg:flex-col lg:items-start lg:justify-start lg:p-4`}>
            <Icon aria-hidden="true" className="hidden size-5 shrink-0 text-muted-foreground lg:block" />
            <span className="min-w-0 break-words text-sm font-semibold group-hover:text-primary lg:text-base">{shortcut.title}</span>
            <span className="flex min-w-0 items-center gap-1 break-words text-right text-xs text-muted-foreground lg:text-left">
              {status}<ChevronRight aria-hidden="true" className="size-4 shrink-0 lg:hidden" />
            </span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="flex w-full min-w-0 max-w-[960px] flex-col gap-6">
      <header className="min-w-0 space-y-1">
        <h1 className="min-w-0 break-words text-xl font-bold md:text-2xl">{title}</h1>
        {synopsis && <p className="line-clamp-2 min-w-0 break-words text-sm text-muted-foreground">{synopsis}</p>}
      </header>

      {chapterCounts.total > 0 && (
        <dl aria-label="회차 현황" className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3">
          {([
            ['전체 회차', chapterCounts.total], ['공개', chapterCounts.published], ['미공개', chapterCounts.unpublished],
          ] as const).map(([label, value], index) => (
            <div key={label} className={`min-w-0 rounded-xl border bg-card px-4 py-3 ${index === 2 ? 'col-span-2 lg:col-span-1' : ''}`}>
              <dt className="break-words text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {!guide.isComplete && (
        <section aria-labelledby="work-home-guide-heading" className={`min-w-0 rounded-xl border border-primary/20 bg-card p-4 ${chapterCounts.total === 0 ? 'md:p-8' : 'md:p-5'}`}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 id="work-home-guide-heading" className="min-w-0 break-words text-base font-semibold">연재 시작 가이드</h2>
            <span className="shrink-0 text-xs text-muted-foreground">{guide.completedCount} / 4 완료</span>
          </div>
          <div role="progressbar" aria-label="연재 시작 가이드 진행" aria-valuemin={0} aria-valuemax={4}
            aria-valuenow={guide.completedCount} className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${guide.completedCount * 25}%` }} />
          </div>
          <ol className="mt-3 space-y-1">
            {guide.steps.map((step, index) => {
              const current = guide.currentStepId === step.id;
              const action = step.id === 'work' ? null : stepCopy[step.id];
              return (
                <li key={step.id} aria-current={current ? 'step' : undefined} className={`min-w-0 rounded-lg px-3 py-3 ${current ? 'bg-primary/10' : ''}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${step.complete ? 'border-primary bg-primary text-primary-foreground' : current ? 'border-primary text-primary' : 'border-muted-foreground/60 text-muted-foreground'}`}>
                      {step.complete ? '✓' : index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className={`break-words text-sm ${step.complete ? 'text-muted-foreground line-through' : current ? 'font-semibold' : 'text-muted-foreground'}`}>{step.title}</span>
                      {step.complete && <span className="sr-only"> 완료</span>}
                      {current && step.id === 'settings' && <p className="mt-1 break-words text-xs text-muted-foreground">인물·장소를 적어 두면 AI가 설정에 맞게 도와줘요</p>}
                    </div>
                  </div>
                  {current && action && (
                    <Link href={`${baseHref}/${action.href}`} className={`mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground ${focusClass} lg:ml-auto lg:mt-0 lg:w-fit`}>
                      {action.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {guide.isComplete ? (
        <section aria-labelledby="work-home-shortcuts-heading" className="min-w-0 space-y-3">
          <h2 id="work-home-shortcuts-heading" className="text-base font-semibold">작업 화면</h2>
          {shortcutGrid}
        </section>
      ) : (
        <details className="group min-w-0 rounded-xl border bg-card">
          <summary className={`flex min-h-11 cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold ${focusClass}`}>
            작업 화면 4개 <span aria-hidden="true" className="text-xs text-primary group-open:hidden">펼치기 ▾</span><span aria-hidden="true" className="hidden text-xs text-primary group-open:inline">접기 ▴</span>
          </summary>
          <div className="px-4 pb-4">{shortcutGrid}</div>
        </details>
      )}
    </div>
  );
}
