'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Native scroll-snap slider (no carousel dependency). Children should carry `snap-start`. */
export function HorizontalSlider({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ atStart: true, atEnd: true });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
  };

  const btn =
    'absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow disabled:pointer-events-none disabled:opacity-0 md:flex';

  return (
    <div className="relative min-w-0 max-w-full">
      <button type="button" aria-label="이전" disabled={edge.atStart} onClick={() => scrollByPage(-1)} className={`${btn} left-1`}>
        <ChevronLeft className="size-4" />
      </button>
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={update}
        className="flex max-w-full snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 motion-reduce:scroll-auto"
      >
        {children}
      </div>
      <button type="button" aria-label="다음" disabled={edge.atEnd} onClick={() => scrollByPage(1)} className={`${btn} right-1`}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
