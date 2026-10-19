'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildWorldTreeLayout } from '@/lib/world-tree/layout';
import type { WorldTreePopularityResult } from '@/lib/world-tree/metric-adapter';
import type { WorldTreeResponse } from '@/lib/world-tree/types';
import { WorldTreeCanvas } from '@/components/world-tree/world-tree-canvas';
import {
  WorldTreeDetail,
  buildWorldTreeEntries,
  type WorldTreeStudioLinks,
} from '@/components/world-tree/world-tree-detail';
import { WorldTreeList } from '@/components/world-tree/world-tree-list';
import styles from '@/components/world-tree/world-tree.module.css';

export const WORLD_TREE_ERA_WIDTH = 200;
export const WORLD_TREE_NODE_GAP = 64;

export const COPY = {
  help: '가지 = 설정 흐름 · 열매 = 작품 · 오른쪽 끝일수록 세계관 내 최신 · 같은 시점에 함께 벌어진 작품은 가지 위·아래에 나란히 매달려요',
  legend: '굵기 = 본가지와의 근접도 · 열매 크기 = 인기 · 초록 = 확장 가지',
  formulaChip: '산식은 임시안',
  scrollHint: '좌우로 밀어 보기 →',
  error: '세계수를 불러오지 못했어요. 다시 시도해 주세요.',
  retry: '다시 불러오기',
  emptyPublished: '아직 발행된 작품이 없어요.',
  singleFruit: '아직 갈라진 가지가 없어요',
  preview: '독자에게 어떻게 보이는지 확인해요.',
  listFallback: '작품이 많아서 목록으로 먼저 보여드려요.',
  metricsFailed: '인기 지표를 불러오지 못해 열매 크기를 기본값으로 보여요.',
} as const;

export interface WorldTreePreviewResult {
  projection: WorldTreeResponse;
  metricResult: WorldTreePopularityResult | null;
}

export interface WorldTreeViewProps {
  /** null = loading. */
  projection: WorldTreeResponse | null;
  /** Scores keyed like the projection nodes (reader nodeKey / owner workId). */
  metricResult: WorldTreePopularityResult | null;
  mode: 'reader' | 'owner';
  onRetry?: () => void;
  /** Re-fetches the server's reader projection (18-07 getReaderPreviewAction). Owner mode only. */
  onReaderPreview?: () => Promise<WorldTreePreviewResult>;
  studioLinks?: WorldTreeStudioLinks;
}

type PreviewState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: WorldTreePreviewResult };

function Message({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-sm">
      <p>{text}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
          {COPY.retry}
        </Button>
      ) : null}
    </div>
  );
}

function titleOf(projection: WorldTreeResponse): string {
  if (projection.status !== 'ok') return '세계수';
  const t = projection.header.title.trim();
  return t === '' || t === '세계수' ? '세계수' : `${t} 세계수`;
}

export function WorldTreeView({ projection, metricResult, mode, onRetry, onReaderPreview, studioLinks }: WorldTreeViewProps) {
  const [preview, setPreview] = useState<PreviewState>({ status: 'off' });
  const [selected, setSelected] = useState<string | null>(null);
  const [viewPref, setViewPref] = useState<'tree' | 'list' | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const focusPending = useRef(false);

  const previewing = preview.status !== 'off';
  const source: { projection: WorldTreeResponse | null; metricResult: WorldTreePopularityResult | null } =
    preview.status === 'ready'
      ? preview.data
      : preview.status === 'loading' || preview.status === 'error'
        ? { projection: null, metricResult: null }
        : { projection, metricResult };

  const active = source.projection;
  // Fail closed: a reader surface never renders an owner/admin projection.
  const mismatched = active?.status === 'ok' && (mode === 'reader' || previewing) && active.audience !== 'reader';
  const ok = active && active.status === 'ok' && !mismatched ? active : null;
  const audience: 'reader' | 'owner' = ok && ok.audience !== 'reader' ? 'owner' : 'reader';

  const scores = source.metricResult && source.metricResult.ok ? source.metricResult.scores : null;
  const entries = useMemo(() => (ok ? buildWorldTreeEntries(ok, scores) : null), [ok, scores]);
  const layout = useMemo(
    () => (ok ? buildWorldTreeLayout(ok, { eraWidth: WORLD_TREE_ERA_WIDTH, nodeGap: WORLD_TREE_NODE_GAP }) : null),
    [ok],
  );

  const effectiveKey = entries && selected && entries.byKey[selected] ? selected : (entries?.defaultKey ?? null);
  const selectedEntry = entries && effectiveKey ? entries.byKey[effectiveKey] : null;

  const select = useCallback((key: string) => {
    setSelected(key);
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches) {
      focusPending.current = true;
    }
  }, []);

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    titleRef.current?.focus();
  }, [effectiveKey]);

  const togglePreview = useCallback(
    async (on: boolean) => {
      setSelected(null);
      if (!on) {
        setPreview({ status: 'off' });
        return;
      }
      if (!onReaderPreview) return;
      setPreview({ status: 'loading' });
      try {
        const data = await onReaderPreview();
        setPreview({ status: 'ready', data });
      } catch {
        setPreview({ status: 'error' });
      }
    },
    [onReaderPreview],
  );

  const retry = previewing ? () => void togglePreview(true) : onRetry;

  let body: ReactNode;
  if (preview.status === 'error') {
    body = <Message text={COPY.error} onRetry={retry} />;
  } else if (active === null) {
    body = <div className={styles.skeleton} role="status" aria-label="세계수를 불러오는 중" data-part="skeleton" />;
  } else if (active.status !== 'ok' || mismatched) {
    body = <Message text={COPY.error} onRetry={retry} />;
  } else if (ok && layout && entries) {
    if (layout.status === 'invalid' && layout.reason === 'empty') {
      body = <p className="rounded-xl border border-border p-4 text-sm">{COPY.emptyPublished}</p>;
    } else if (layout.status === 'invalid') {
      body = <Message text={COPY.error} onRetry={retry} />;
    } else {
      const view = layout.status === 'fallback' ? 'list' : (viewPref ?? 'tree');
      body = (
        <div className={styles.root} data-part="tree-root" data-audience={audience}>
          <div className={styles.stage}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="보기 방식" className="flex gap-1.5">
                <Button
                  type="button"
                  variant={view === 'tree' ? 'default' : 'outline'}
                  className="min-h-11"
                  aria-pressed={view === 'tree'}
                  disabled={layout.status === 'fallback'}
                  onClick={() => setViewPref('tree')}
                >
                  트리 보기
                </Button>
                <Button
                  type="button"
                  variant={view === 'list' ? 'default' : 'outline'}
                  className="min-h-11"
                  aria-pressed={view === 'list'}
                  onClick={() => setViewPref('list')}
                >
                  목록 보기
                </Button>
              </div>
              {layout.status === 'fallback' ? <p className="text-xs text-muted-foreground">{COPY.listFallback}</p> : null}
            </div>

            {entries.workCount === 1 && entries.stubCount === 0 ? (
              <p className="text-sm text-muted-foreground" data-part="single-fruit">
                {COPY.singleFruit}
              </p>
            ) : null}

            {view === 'tree' ? (
              <>
                <p className={styles.hint}>{COPY.scrollHint}</p>
                <WorldTreeCanvas layout={layout} entries={entries} selectedKey={effectiveKey} onSelect={select} />
              </>
            ) : (
              <WorldTreeList order={layout.listOrder} entries={entries} selectedKey={effectiveKey} onSelect={select} />
            )}

            <div className={styles.legend} data-part="legend">
              <span>{COPY.legend}</span>
              <Badge variant="secondary">{COPY.formulaChip}</Badge>
            </div>
            {source.metricResult && source.metricResult.ok ? (
              <details className="text-xs text-muted-foreground" data-part="metric-note">
                <summary className="cursor-pointer">인기 산식 안내</summary>
                <p>기준 시각 {source.metricResult.note.authorViewsExcludedSince.slice(0, 10)}부터 작가 본인 조회를 제외해요.</p>
                <ul className="list-disc pl-4">
                  {source.metricResult.note.limitations.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="text-xs text-muted-foreground" data-part="metric-failed">
                {COPY.metricsFailed}
              </p>
            )}
          </div>

          <WorldTreeDetail
            entry={selectedEntry}
            entries={entries}
            audience={audience}
            studioLinks={mode === 'owner' && !previewing ? studioLinks : undefined}
            titleRef={titleRef}
            popularityUnavailable={scores === null}
            className={styles.detail}
          />
        </div>
      );
    }
  } else {
    body = <Message text={COPY.error} onRetry={retry} />;
  }

  return (
    <section aria-label="세계수" className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{active ? titleOf(active) : '세계수'}</h2>
          {mode === 'owner' && onReaderPreview ? (
            <div role="group" aria-label="보기 대상" className="flex gap-1.5">
              <Button type="button" className="min-h-11" variant={previewing ? 'outline' : 'default'} aria-pressed={!previewing} onClick={() => void togglePreview(false)}>
                작가 보기
              </Button>
              <Button type="button" className="min-h-11" variant={previewing ? 'default' : 'outline'} aria-pressed={previewing} onClick={() => void togglePreview(true)}>
                독자 보기
              </Button>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{COPY.help}</p>
        {previewing ? (
          <p className="text-xs font-semibold" data-part="preview-banner">
            {COPY.preview}
          </p>
        ) : null}
      </header>
      {body}
    </section>
  );
}
