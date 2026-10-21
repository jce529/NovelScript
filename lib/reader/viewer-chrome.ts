/**
 * READ-02/03/05/07 (03-16): pure chrome model for the viewer.
 * Initial chrome is hidden; a plain body tap toggles it. Overlays pin the bar. The last-chapter
 * notification dialog is one-shot per visit for sentinel firings; an explicit "next" click reopens it.
 */

export const TAP_MOVE_LIMIT_PX = 10;
export type ChromeOverlay = 'toc' | 'settings' | 'report';

export interface ChromeState {
  visible: boolean;
  overlay: ChromeOverlay | null;
  endDialogOpen: boolean;
  /** true once the sentinel opened the end dialog in this visit; observer re-fires stay silent. */
  endShown: boolean;
}

export const INITIAL_CHROME: ChromeState = { visible: false, overlay: null, endDialogOpen: false, endShown: false };

export interface TapInput {
  movedPx: number;
  hasSelection: boolean;
  /** pointer target is (inside) a link, button, input or other interactive element */
  interactive: boolean;
}

export function isInteractiveTarget(el: { closest?: (sel: string) => unknown } | null): boolean {
  return Boolean(el?.closest?.('a,button,input,select,textarea,summary,[role="button"],[role="link"],[contenteditable="true"]'));
}

/** Drag >= 10px, active text selection, or interactive ancestor never toggles the chrome. */
export function isTogglingTap(t: TapInput): boolean {
  return t.movedPx < TAP_MOVE_LIMIT_PX && !t.hasSelection && !t.interactive;
}

export type ChromeEvent =
  | { type: 'tap'; tap: TapInput }
  | { type: 'show' }
  | { type: 'hide' }
  | { type: 'open-overlay'; overlay: ChromeOverlay }
  | { type: 'close-overlay' }
  | { type: 'sentinel-end'; isLast: boolean }
  | { type: 'next-click'; isLast: boolean }
  | { type: 'close-end' };

export function chromeReducer(state: ChromeState, ev: ChromeEvent): ChromeState {
  switch (ev.type) {
    case 'tap':
      if (!isTogglingTap(ev.tap)) return state;
      if (state.overlay) return state; // overlay keeps the bar
      return { ...state, visible: !state.visible };
    case 'show':
      return state.visible ? state : { ...state, visible: true };
    case 'hide':
      return state.overlay || !state.visible ? state : { ...state, visible: false };
    case 'open-overlay':
      return { ...state, visible: true, overlay: ev.overlay };
    case 'close-overlay':
      return { ...state, overlay: null };
    case 'sentinel-end':
      if (!ev.isLast || state.endShown) return state;
      return { ...state, endDialogOpen: true, endShown: true };
    case 'next-click':
      if (!ev.isLast) return state;
      return { ...state, endDialogOpen: true, endShown: true };
    case 'close-end':
      return { ...state, endDialogOpen: false };
  }
}

export function prevControl(prev: { id: string } | null): { disabled: boolean } {
  return { disabled: prev === null };
}

/** Last chapter: "next" is a muted button that opens the subscribe dialog instead of navigating. */
export function nextControl(next: { id: string } | null): { kind: 'navigate' | 'end-dialog' } {
  return { kind: next ? 'navigate' : 'end-dialog' };
}

export const END_DIALOG_COPY = { title: '마지막 화예요', action: '새 회차 알림 켜기' } as const;

/** Never untoggles an existing subscription: already subscribed => no toggle call. */
export function shouldCallToggleSubscription({ loggedIn, subscribed }: { loggedIn: boolean; subscribed: boolean }): boolean {
  return loggedIn && !subscribed;
}

/** Hidden bar must be removed from tab order / AT tree without changing layout. */
export function hiddenBarAttrs(visible: boolean): { 'aria-hidden': boolean; inert: boolean } {
  return { 'aria-hidden': !visible, inert: !visible };
}
