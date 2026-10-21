'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  INITIAL_PANEL_STATE,
  panelGlyphs,
  panelLabels,
  panelReducer,
  presentPanels,
  type PanelSide,
  type StudioSurface,
} from '@/lib/studio/panel-controller';

/**
 * Shared studio shell. The provider shares only collapse state and resourceKey/hasAi metadata.
 * Editor/AI ReactNodes are rendered by StudioEditorPanels at a fixed position in each page's own
 * tree, so collapsing only changes visibility and React keeps the existing instances alive.
 */
interface StudioPanelContextValue {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  toggle: (side: PanelSide) => void;
  meta: { resourceKey: string | null; hasAi: boolean };
  setMeta: (meta: { resourceKey: string | null; hasAi: boolean }) => void;
  /** Extension contract for the Phase 16 mobile adapter (no tab UI here). */
  mobileNavigation: ReactNode;
  setMobileNavigation: (node: ReactNode) => void;
  activeSurface: StudioSurface;
  setActiveSurface: (surface: StudioSurface) => void;
}

const StudioPanelContext = createContext<StudioPanelContextValue | null>(null);

export function useStudioPanels(): StudioPanelContextValue {
  const ctx = useContext(StudioPanelContext);
  if (!ctx) throw new Error('useStudioPanels must be used inside StudioPanelProvider');
  return ctx;
}

export function StudioPanelProvider({ children }: { children: ReactNode }) {
  const [panels, dispatch] = useReducer(panelReducer, INITIAL_PANEL_STATE);
  const [meta, setMetaState] = useState<{ resourceKey: string | null; hasAi: boolean }>({
    resourceKey: null,
    hasAi: false,
  });
  const [mobileNavigation, setMobileNavigation] = useState<ReactNode>(null);
  const [activeSurface, setActiveSurface] = useState<StudioSurface>('editor');

  const toggle = useCallback((side: PanelSide) => dispatch({ type: 'toggle', side }), []);
  const setMeta = useCallback(
    (next: { resourceKey: string | null; hasAi: boolean }) =>
      setMetaState((prev) =>
        prev.resourceKey === next.resourceKey && prev.hasAi === next.hasAi ? prev : next
      ),
    []
  );

  const value = useMemo<StudioPanelContextValue>(
    () => ({
      leftCollapsed: panels.leftCollapsed,
      rightCollapsed: panels.rightCollapsed,
      toggle,
      meta,
      setMeta,
      mobileNavigation,
      setMobileNavigation,
      activeSurface,
      setActiveSurface,
    }),
    [panels, toggle, meta, setMeta, mobileNavigation, activeSurface]
  );

  return <StudioPanelContext.Provider value={value}>{children}</StudioPanelContext.Provider>;
}

const LEFT_PANEL_ID = 'studio-left-panel';
const RIGHT_PANEL_ID = 'studio-right-panel';

/** Small button that collapses/expands one side. Copy and glyphs come from the pure controller. */
function PanelToggleButton({
  side,
  mode,
  expanded,
  controls,
  onClick,
  buttonRef,
}: {
  side: PanelSide;
  mode: 'collapse' | 'expand';
  expanded: boolean;
  controls: string;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={panelLabels(side)[mode]}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <span aria-hidden="true">{panelGlyphs(side)[mode]}</span>
    </button>
  );
}

/** Left document-tree sidebar. Desktop only collapses (lg+); smaller screens keep existing layout. */
export function StudioSidebar({ children }: { children: ReactNode }) {
  const { leftCollapsed, toggle, meta } = useStudioPanels();
  const view = presentPanels({ leftCollapsed, rightCollapsed: false }, meta).left;
  const stripButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const first = useRef(true);

  // Move focus to the button that is still on screen after a toggle (not on first mount).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    (leftCollapsed ? stripButton.current : collapseButton.current)?.focus();
  }, [leftCollapsed]);

  return (
    <>
      <div
        id={LEFT_PANEL_ID}
        className={`hidden shrink-0 border-r bg-secondary md:block ${view.visible ? 'w-64' : 'w-64 lg:hidden'}`}
      >
        <div className="hidden justify-end px-2 pt-2 lg:flex">
          <PanelToggleButton
            side="left"
            mode="collapse"
            expanded={view.ariaExpanded}
            controls={LEFT_PANEL_ID}
            onClick={() => toggle('left')}
            buttonRef={collapseButton}
          />
        </div>
        <ScrollArea className="w-full">{children}</ScrollArea>
      </div>
      <div
        className={`hidden w-9 shrink-0 flex-col items-center border-r bg-secondary pt-2 ${
          view.showStrip ? 'lg:flex' : ''
        }`}
      >
        <PanelToggleButton
          side="left"
          mode="expand"
          expanded={view.ariaExpanded}
          controls={LEFT_PANEL_ID}
          onClick={() => toggle('left')}
          buttonRef={stripButton}
        />
      </div>
    </>
  );
}

/**
 * Editor + optional AI slots. `editor`/`ai` are rendered right here at fixed child positions;
 * the AI slot is never conditionally unmounted by collapse, only hidden. No `ai` => no strip.
 */
export function StudioEditorPanels({
  editor,
  ai,
  toolbar,
  resourceKey,
}: {
  editor: ReactNode;
  ai?: ReactNode;
  toolbar?: ReactNode;
  resourceKey: string;
}) {
  const { rightCollapsed, leftCollapsed, toggle, setMeta } = useStudioPanels();
  const hasAi = ai !== undefined && ai !== null && ai !== false;

  useEffect(() => {
    setMeta({ resourceKey, hasAi });
    return () => setMeta({ resourceKey: null, hasAi: false });
  }, [resourceKey, hasAi, setMeta]);

  const view = presentPanels(
    { leftCollapsed, rightCollapsed },
    { resourceKey, hasAi }
  ).right;
  const stripButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    (rightCollapsed ? stripButton.current : collapseButton.current)?.focus();
  }, [rightCollapsed]);

  const collapsed = view !== null && !view.visible;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>{toolbar}</div>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">{editor}</div>
        <div
          id={RIGHT_PANEL_ID}
          className={`${hasAi ? '' : 'hidden'} ${collapsed ? 'lg:hidden' : ''} min-w-0`}
        >
          <div className="mb-1 hidden justify-start lg:flex">
            <PanelToggleButton
              side="right"
              mode="collapse"
              expanded={view?.ariaExpanded ?? true}
              controls={RIGHT_PANEL_ID}
              onClick={() => toggle('right')}
              buttonRef={collapseButton}
            />
          </div>
          {ai}
        </div>
        <div
          className={`hidden w-9 shrink-0 flex-col items-center pt-0 ${collapsed ? 'lg:flex' : ''}`}
        >
          <PanelToggleButton
            side="right"
            mode="expand"
            expanded={view?.ariaExpanded ?? false}
            controls={RIGHT_PANEL_ID}
            onClick={() => toggle('right')}
            buttonRef={stripButton}
          />
        </div>
      </div>
    </div>
  );
}
