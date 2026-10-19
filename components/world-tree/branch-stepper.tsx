import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRANCH_FLOW_STEPS, BRANCH_FLOW_STEP_LABELS, type BranchFlowStep } from '@/lib/world-tree/branch-flow';

/**
 * 5-step progress indicator for the self-branch flow (UI-SPEC §4, mockup board 42).
 * Purely presentational: the current step comes from the branch-flow state machine.
 * State is conveyed by number/check + text (aria-current, "완료" label), never by color only.
 */
export function BranchStepper({ current, className }: { current: BranchFlowStep; className?: string }) {
  const currentIndex = BRANCH_FLOW_STEPS.indexOf(current);
  return (
    <nav aria-label="가지 치기 단계" className={className}>
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {BRANCH_FLOW_STEPS.map((step, index) => {
          const done = index < currentIndex || current === 'complete';
          const on = index === currentIndex;
          return (
            <li
              key={step}
              aria-current={on ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 text-sm font-semibold',
                on ? 'text-foreground' : done ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                  on ? 'bg-primary text-primary-foreground' : done ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground',
                )}
              >
                {done && !on ? <CheckIcon className="size-3.5" /> : index + 1}
              </span>
              <span>
                {BRANCH_FLOW_STEP_LABELS[step]}
                {done && !on ? <span className="sr-only"> (완료)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
