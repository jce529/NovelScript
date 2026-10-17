'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { BookOpen, PenLine, Sparkles } from 'lucide-react';
import {
  MOBILE_MEDIA_QUERY,
  createInitialPaneState,
  studioPaneReducer,
  type StudioPaneId,
} from './mobile-pane-state';

/**
 * Mobile tab adapter for the studio shell. Owns only the active tab; the panel content, desktop
 * collapse state and AI chat state stay where they are (Phase 2 shell / AiPanel).
 */
interface StudioWorkspaceValue {
  activePane: StudioPaneId;
  isMobile: boolean;
  setActivePane: (pane: StudioPaneId) => void;
  /** Call after a draft is inserted into the document so the writer sees it. */
  notifyInsert: () => void;
  /** Current pathname, used by the tree pane to recognize a same-document click. */
  pathname: string;
}

const StudioWorkspaceContext = createContext<StudioWorkspaceValue | null>(null);

export function useStudioWorkspace(): StudioWorkspaceValue {
  const ctx = useContext(StudioWorkspaceContext);
  if (!ctx) throw new Error('useStudioWorkspace must be used inside StudioWorkspace');
  return ctx;
}

function subscribeMobile(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const getMobileSnapshot = () => window.matchMedia(MOBILE_MEDIA_QUERY).matches;
// SSR / first hydration render: desktop, so no pane is inert before the media query is known.
const getMobileServerSnapshot = () => false;

export function StudioWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const [state, dispatch] = useReducer(studioPaneReducer, pathname, createInitialPaneState);
  const isMobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, getMobileServerSnapshot);

  useEffect(() => {
    dispatch({ type: 'navigate', pathname });
  }, [pathname]);

  const setActivePane = useCallback((pane: StudioPaneId) => dispatch({ type: 'select', pane }), []);
  const notifyInsert = useCallback(() => dispatch({ type: 'insert' }), []);

  const value = useMemo<StudioWorkspaceValue>(
    () => ({ activePane: state.activePane, isMobile, setActivePane, notifyInsert, pathname: state.pathname }),
    [state.activePane, state.pathname, isMobile, setActivePane, notifyInsert]
  );

  return <StudioWorkspaceContext.Provider value={value}>{children}</StudioWorkspaceContext.Provider>;
}

export const studioPaneDomId = (pane: StudioPaneId) => `studio-pane-${pane}`;
export const studioNavDomId = (pane: StudioPaneId) => `studio-nav-${pane}`;

export const STUDIO_TABS: ReadonlyArray<{ pane: StudioPaneId; label: string; Icon: typeof BookOpen }> = [
  { pane: 'tree', label: '설정집·회차', Icon: BookOpen },
  { pane: 'write', label: '집필', Icon: PenLine },
  { pane: 'ai', label: 'AI', Icon: Sparkles },
];

/** Bottom navigation, in-flow (60px + safe area). Hidden from lg up. */
export function StudioMobileNavigation() {
  const { activePane, setActivePane } = useStudioWorkspace();
  return (
    <nav
      aria-label="스튜디오 화면 전환"
      className="flex h-[calc(60px+env(safe-area-inset-bottom,0px))] shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
    >
      {STUDIO_TABS.map(({ pane, label, Icon }) => {
        const active = pane === activePane;
        return (
          <button
            key={pane}
            id={studioNavDomId(pane)}
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-controls={studioPaneDomId(pane)}
            onClick={() => setActivePane(pane)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
              active ? 'font-semibold text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Icon aria-hidden="true" className="size-5" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
