'use client';

import { useEffect, useTransition } from 'react';

/** Fires exactly once per mount (chapter open) — no per-user dedup (D-09). */
export function ViewTracker({ onOpen }: { onOpen: () => Promise<void> }) {
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      onOpen();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
