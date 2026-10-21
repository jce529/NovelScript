'use client';

import type { ReactNode } from 'react';
import { useStudioPanels } from '@/components/studio/studio-panel-shell';
import { StudioPane } from './StudioPane';
import { useStudioWorkspace } from './mobile-tabs';

/**
 * Route stage of the studio layout. `children` stays at one fixed position (never keyed by the
 * active tab). Editor pages bring their own write/ai panes; for pages without an AI panel the
 * stage shows a guidance pane for the ai tab and hides the page content there.
 */
export function StudioStage({ children }: { children: ReactNode }) {
  const { activePane, isMobile } = useStudioWorkspace();
  const { meta } = useStudioPanels();
  const hidden = activePane === 'tree' || (activePane === 'ai' && !meta.hasAi);
  const stateClass = hidden
    ? 'max-lg:invisible max-lg:absolute max-lg:inset-0 max-lg:pointer-events-none'
    : 'max-lg:relative max-lg:h-full max-lg:overflow-y-auto';

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <main
        aria-hidden={isMobile && hidden ? true : undefined}
        inert={(isMobile && hidden) || undefined}
        className={`min-w-0 p-4 md:p-8 ${stateClass}`}
      >
        {children}
      </main>
      <StudioPane
        pane="ai"
        domId={!meta.hasAi}
        className={meta.hasAi ? 'max-lg:hidden' : 'lg:hidden'}
        notice={
          <p className="p-6 text-center text-sm text-muted-foreground">
            문서를 열면 AI 도우미를 쓸 수 있어요. 읽기 전용 문서에서는 AI가 꺼져 있어요.
          </p>
        }
      >
        {null}
      </StudioPane>
    </div>
  );
}
