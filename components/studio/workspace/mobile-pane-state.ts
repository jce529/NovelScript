/**
 * Pure, client-safe state for the mobile studio tabs (tree / write / ai).
 * No browser, DB or server imports. Desktop collapse state belongs to Phase 2's panel shell.
 */
export type StudioPaneId = 'tree' | 'write' | 'ai';

export interface StudioPaneState {
  activePane: StudioPaneId;
  pathname: string;
}

export type StudioPaneEvent =
  | { type: 'select'; pane: StudioPaneId }
  | { type: 'navigate'; pathname: string }
  | { type: 'insert' };

/** lg = 1024px: tab mode is active at 1023px and below. Keep in sync with the `max-lg:` classes. */
export const DESKTOP_MEDIA_MAX_WIDTH = 1023;
export const MOBILE_MEDIA_QUERY = `(max-width: ${DESKTOP_MEDIA_MAX_WIDTH}px)`;

export function createInitialPaneState(pathname: string): StudioPaneState {
  return { activePane: 'write', pathname };
}

export function studioPaneReducer(state: StudioPaneState, event: StudioPaneEvent): StudioPaneState {
  switch (event.type) {
    case 'select':
      return state.activePane === event.pane ? state : { ...state, activePane: event.pane };
    case 'navigate':
      // Same pathname (router.refresh, initial sync) must not reset a user-chosen ai/tree tab.
      return state.pathname === event.pathname ? state : { activePane: 'write', pathname: event.pathname };
    case 'insert':
      return state.activePane === 'write' ? state : { ...state, activePane: 'write' };
  }
}

export interface PanePresentation {
  className: string;
  inert: boolean;
  ariaHidden: true | undefined;
}

const INACTIVE_CLASS = 'max-lg:absolute max-lg:inset-0 max-lg:invisible max-lg:pointer-events-none';
const ACTIVE_CLASS = 'max-lg:relative max-lg:h-full';

export function getPanePresentation(pane: StudioPaneId, activePane: StudioPaneId, isMobile: boolean): PanePresentation {
  const active = pane === activePane;
  return {
    className: active ? ACTIVE_CLASS : INACTIVE_CLASS,
    inert: isMobile && !active,
    ariaHidden: isMobile && !active ? true : undefined,
  };
}

export interface ActivationInfo {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  anchorPathname: string | null;
  anchorTarget: string | null;
  currentPathname: string;
  insideMenu: boolean;
}

/** True only for a normal click on the anchor of the document that is already open. */
export function isSameDocumentActivation(i: ActivationInfo): boolean {
  if (i.defaultPrevented || i.insideMenu) return false;
  if (i.button !== 0 || i.metaKey || i.ctrlKey || i.shiftKey || i.altKey) return false;
  if (i.anchorTarget && i.anchorTarget !== '_self') return false;
  return i.anchorPathname !== null && i.anchorPathname === i.currentPathname;
}
