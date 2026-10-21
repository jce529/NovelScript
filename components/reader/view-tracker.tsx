'use client';

import { useEffect, useRef, useTransition } from 'react';

/** One visit = one chapter, one per-visit session id and one readability state. Readability is
 * part of the key so a purchase (unreadable -> readable) starts a new bootstrap. */
export function chapterVisitKey({ chapterId, sessionId, readable }: { chapterId: string; sessionId: string; readable: boolean }): string {
  return `${chapterId}:${sessionId}:${readable ? 'readable' : 'locked'}`;
}

/**
 * Effect body, exported so the once-per-visit rule is testable without a DOM.
 * The guard ref survives StrictMode's cleanup + re-run, so the same visit opens once; a new key
 * opens again. Cleanup deliberately does not reset the guard (that would re-open on re-run).
 */
export function visitOpenEffect(
  guard: { current: string | null },
  visitKey: string,
  onOpen: () => Promise<void>,
  start: (fn: () => void) => void,
): () => void {
  if (guard.current !== visitKey) {
    guard.current = visitKey;
    start(() => {
      // Bookkeeping never breaks reading: a rejected open is swallowed here.
      onOpen().catch(() => {});
    });
  }
  return () => {};
}

/** Fires once per visit (chapter open) — no per-user dedup (D-09), so anonymous view counts
 * still happen on every real visit. Without `visitKey` it fires once per mount.
 * `onOpen` is the consumer callback (the shell/hook keeps the returned snapshot). */
export function ViewTracker({ onOpen, visitKey = 'mount' }: { onOpen: () => Promise<void>; visitKey?: string }) {
  const [, startTransition] = useTransition();
  const guard = useRef<string | null>(null);
  const latestOnOpen = useRef(onOpen);

  useEffect(() => {
    latestOnOpen.current = onOpen;
  });

  useEffect(
    () => visitOpenEffect(guard, visitKey, () => latestOnOpen.current(), startTransition),
    [visitKey, startTransition],
  );

  return null;
}
