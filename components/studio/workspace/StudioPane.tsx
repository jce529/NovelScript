'use client';

import { useEffect, useRef, type MouseEvent, type ReactNode, type Ref } from 'react';
import { getPanePresentation, isSameDocumentActivation, type StudioPaneId } from './mobile-pane-state';
import { studioNavDomId, studioPaneDomId, useStudioWorkspace } from './mobile-tabs';

/**
 * Always-mounted pane wrapper. Children are never keyed/unmounted by the active tab; below lg an
 * inactive pane is only hidden (invisible + inert), so scroll, selection and chat state survive.
 */
export function StudioPane({
  pane,
  children,
  className,
  notice,
  ref,
}: {
  pane: StudioPaneId;
  children: ReactNode;
  className?: string;
  /** Optional guidance shown above children (e.g. AI pane on a page without a document). */
  notice?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  const { activePane, isMobile, setActivePane, pathname } = useStudioWorkspace();
  const view = getPanePresentation(pane, activePane, isMobile);
  const innerRef = useRef<HTMLDivElement | null>(null);

  // A pane that becomes hidden must not keep focus: hand it to the active nav button.
  useEffect(() => {
    if (!view.inert) return;
    const el = innerRef.current;
    if (el && document.activeElement && el.contains(document.activeElement)) {
      document.getElementById(studioNavDomId(activePane))?.focus();
    }
  }, [view.inert, activePane]);

  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
  };

  // Tree pane only: re-selecting the already-open document does not change the pathname, so
  // return to the writing tab on a plain click. Never prevents the Link's own navigation.
  const onClick =
    pane === 'tree'
      ? (e: MouseEvent<HTMLDivElement>) => {
          const target = e.target as Element;
          const anchor = target.closest?.('a[href]') as HTMLAnchorElement | null;
          let anchorPathname: string | null = null;
          if (anchor) {
            try {
              anchorPathname = new URL(anchor.href, window.location.href).pathname;
            } catch {
              anchorPathname = null;
            }
          }
          const same = isSameDocumentActivation({
            defaultPrevented: e.defaultPrevented,
            button: e.button,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            anchorPathname,
            anchorTarget: anchor?.getAttribute('target') ?? null,
            currentPathname: pathname,
            insideMenu: !!target.closest?.('[role="menu"],[role="menuitem"],[data-slot="dropdown-menu-content"]'),
          });
          if (same) setActivePane('write');
        }
      : undefined;

  const aiClass =
    pane === 'ai' ? 'max-lg:flex max-lg:flex-col max-lg:overflow-y-auto max-lg:[&_aside]:h-full max-lg:[&_aside]:max-h-full' : '';

  return (
    <div
      ref={setRefs}
      id={studioPaneDomId(pane)}
      aria-hidden={view.ariaHidden}
      inert={view.inert || undefined}
      onClick={onClick}
      className={[view.className, aiClass, className].filter(Boolean).join(' ')}
    >
      {notice}
      {children}
    </div>
  );
}
