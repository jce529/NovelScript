'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FILTER_RESET_FOCUS_EVENT } from '@/components/reader/work-grid';
import { cn } from '@/lib/utils';

export interface ListFilterOption {
  value: string;
  label: string;
}

export interface ListFilterBarDefaults {
  sort: string;
  genre?: string;
  status?: string;
}

export interface ListFilterBarParamNames {
  genre?: string;
  sort?: string;
  status?: string;
}

export interface ListFilterBarProps {
  genres: readonly string[];
  sortOptions: readonly ListFilterOption[];
  statusOptions?: readonly ListFilterOption[];
  defaults: ListFilterBarDefaults;
  paramNames?: ListFilterBarParamNames;
  resetKeys?: readonly string[];
  scrollToTop?: boolean;
}

interface FilterResetBridgeGlobal {
  __readerFilterResetPending?: boolean;
  __readerFocusAllGenreChip?: (() => void) | null;
}

const focusRingClass =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const selectTriggerClass = cn(
  'min-h-11 min-w-11 data-[size=default]:h-11 text-sm leading-[1.5] motion-reduce:transition-none',
  focusRingClass,
);

export function ListFilterBar({
  genres,
  sortOptions,
  statusOptions,
  defaults,
  paramNames,
  resetKeys,
  scrollToTop = false,
}: ListFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const chipRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const genreParam = paramNames?.genre ?? 'genre';
  const sortParam = paramNames?.sort ?? 'sort';
  const statusParam = paramNames?.status ?? 'status';

  const defaultGenre = defaults.genre ?? '전체';
  const defaultSort = defaults.sort;
  const defaultStatus = defaults.status ?? statusOptions?.[0]?.value ?? 'all';

  const chipGenres = React.useMemo(
    () => (genres[0] === defaultGenre ? [...genres] : [defaultGenre, ...genres]),
    [genres, defaultGenre],
  );

  const effectiveResetKeys = React.useMemo(
    () =>
      resetKeys && resetKeys.length > 0
        ? Array.from(new Set(['page', ...resetKeys]))
        : ['page'],
    [resetKeys],
  );

  const rawGenre = searchParams.get(genreParam);
  const currentGenre =
    rawGenre && chipGenres.includes(rawGenre) ? rawGenre : defaultGenre;

  const rawSort = searchParams.get(sortParam);
  const currentSort =
    rawSort && sortOptions.some((opt) => opt.value === rawSort)
      ? rawSort
      : defaultSort;
  const currentSortLabel =
    sortOptions.find((opt) => opt.value === currentSort)?.label ?? currentSort;

  const nonDefaultStatusValues = React.useMemo(
    () =>
      new Set(
        (statusOptions ?? [])
          .map((opt) => opt.value)
          .filter((val) => val !== defaultStatus),
      ),
    [statusOptions, defaultStatus],
  );

  const rawStatus = searchParams.get(statusParam);
  const currentStatus =
    rawStatus && nonDefaultStatusValues.has(rawStatus) ? rawStatus : defaultStatus;
  const currentStatusLabel =
    statusOptions?.find((opt) => opt.value === currentStatus)?.label ?? currentStatus;

  React.useEffect(() => {
    const g = globalThis as unknown as FilterResetBridgeGlobal;
    const focusFirstChip = () => {
      chipRefs.current[0]?.focus();
    };
    g.__readerFocusAllGenreChip = focusFirstChip;

    if (g.__readerFilterResetPending) {
      g.__readerFilterResetPending = false;
      focusFirstChip();
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const onResetEvent = () => {
        g.__readerFilterResetPending = false;
        focusFirstChip();
      };
      window.addEventListener(FILTER_RESET_FOCUS_EVENT, onResetEvent);
      return () => {
        window.removeEventListener(FILTER_RESET_FOCUS_EVENT, onResetEvent);
        if (g.__readerFocusAllGenreChip === focusFirstChip) {
          g.__readerFocusAllGenreChip = null;
        }
      };
    }

    return () => {
      if (g.__readerFocusAllGenreChip === focusFirstChip) {
        g.__readerFocusAllGenreChip = null;
      }
    };
  }, [searchParams]);

  function pushParams(params: URLSearchParams) {
    const query = params.toString();
    const nextHref = query ? `${pathname}?${query}` : pathname;
    router.push(nextHref, { scroll: scrollToTop });
  }

  function handleGenreSelect(nextGenre: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!nextGenre || nextGenre === defaultGenre) {
      params.delete(genreParam);
    } else {
      params.set(genreParam, nextGenre);
    }
    for (const key of effectiveResetKeys) {
      if (key !== genreParam && key !== sortParam) {
        params.delete(key);
      }
    }
    pushParams(params);
  }

  function handleSortChange(nextSort: string | null) {
    const resolved = nextSort ?? defaultSort;
    const params = new URLSearchParams(searchParams.toString());
    if (!resolved || resolved === defaultSort) {
      params.delete(sortParam);
    } else {
      params.set(sortParam, resolved);
    }
    for (const key of effectiveResetKeys) {
      if (key !== sortParam) {
        params.delete(key);
      }
    }
    pushParams(params);
  }

  function handleStatusChange(nextStatus: string | null) {
    const resolved = nextStatus ?? defaultStatus;
    const params = new URLSearchParams(searchParams.toString());
    const beforeValue = params.get(statusParam);

    if (!resolved || resolved === defaultStatus) {
      if (beforeValue !== null && nonDefaultStatusValues.has(beforeValue)) {
        params.delete(statusParam);
      } else {
        return;
      }
    } else {
      if (beforeValue === resolved) {
        return;
      }
      params.set(statusParam, resolved);
    }

    const afterValue = params.get(statusParam);
    if (afterValue !== beforeValue) {
      for (const key of effectiveResetKeys) {
        if (key !== statusParam) {
          params.delete(key);
        }
      }
      params.delete(sortParam);
      pushParams(params);
    }
  }

  function handleChipKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const count = chipGenres.length;
    if (count === 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % count;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + count) % count;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = count - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const target = chipRefs.current[nextIndex];
      target?.focus();
      target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }

  const hasStatusSelect = Boolean(statusOptions && statusOptions.length > 0);

  return (
    <div
      data-slot="list-filter-bar"
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div
        role="group"
        aria-label="장르"
        data-slot="list-filter-genres"
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {chipGenres.map((genreLabel, index) => {
          const isSelected = currentGenre === genreLabel;
          return (
            <button
              key={genreLabel}
              ref={(el) => {
                chipRefs.current[index] = el;
              }}
              type="button"
              aria-pressed={isSelected}
              data-slot="genre-chip"
              data-genre-chip={genreLabel}
              onClick={() => handleGenreSelect(genreLabel)}
              onKeyDown={(e) => handleChipKeyDown(e, index)}
              onFocus={(e) => {
                e.currentTarget?.scrollIntoView?.({
                  block: 'nearest',
                  inline: 'nearest',
                });
              }}
              className={cn(
                'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border px-3.5 py-2 text-xs leading-[1.5] whitespace-nowrap transition-colors motion-reduce:transition-none',
                focusRingClass,
                isSelected
                  ? 'border-foreground bg-foreground font-semibold text-background'
                  : 'border-border bg-secondary font-normal text-muted-foreground hover:text-foreground',
              )}
            >
              {genreLabel}
            </button>
          );
        })}
      </div>

      <div
        data-slot="list-filter-controls"
        className="flex shrink-0 items-center justify-end gap-2"
      >
        <Select value={currentSort} onValueChange={handleSortChange}>
          <SelectTrigger aria-label="정렬" className={selectTriggerClass}>
            <SelectValue>{() => currentSortLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasStatusSelect ? (
          <Select value={currentStatus} onValueChange={handleStatusChange}>
            <SelectTrigger aria-label="상태" className={selectTriggerClass}>
              <SelectValue>{() => currentStatusLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {statusOptions!.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
    </div>
  );
}
