'use client';

import { useSyncExternalStore } from 'react';
import type { ViewerPreferences } from '@/lib/reader/viewer-preferences';

const QUERY = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/** The server cannot know the OS theme; the first client render matches it, then the store re-syncs. */
function getServerSnapshot() {
  return false;
}

/** Pure rule: the effective dark state for a viewer mode and the OS preference. */
export function resolveViewerDark(mode: ViewerPreferences['mode'], osDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && osDark);
}

/**
 * Whether the viewer chrome (bars, popovers) should use the `.dark` design tokens.
 * Tailwind's `dark` variant is class based, so `system` needs the OS preference resolved in JS;
 * the body color alone is handled by viewer.module.css via prefers-color-scheme.
 */
export function useViewerDark(mode: ViewerPreferences['mode']): boolean {
  const osDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return resolveViewerDark(mode, osDark);
}
