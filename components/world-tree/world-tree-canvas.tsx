'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVisibleEraWindow, type WorldTreeLayoutResult } from '@/lib/world-tree/layout';
import { METRIC_COEFFICIENTS } from '@/lib/world-tree/metrics';
import {
  BROKEN_BRANCH_LABEL,
  STUB_LABEL,
  columnLabels,
  entryAriaLabel,
  type WorldTreeEntries,
} from '@/components/world-tree/world-tree-detail';
import styles from '@/components/world-tree/world-tree.module.css';

const FRUIT_COLORS = 8;
const LABEL_ROW = 34;

export interface WorldTreeCanvasProps {
  layout: WorldTreeLayoutResult;
  entries: WorldTreeEntries;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

function fruitColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return `var(--tree-fruit-${(hash % FRUIT_COLORS) + 1})`;
}

function pathClass(kind: string | null, broken: boolean): string {
  if (broken) return styles.pathBroken;
  if (kind === 'expand') return styles.pathExpand;
  if (kind === 'if') return styles.pathIf;
  return styles.pathTrunk;
}

/**
 * One SVG for branches plus native buttons for fruits/stubs on the same coordinate system and the
 * same scroll container. Past is left, latest is right; concurrent works sit above/below.
 * Color is never the only carrier of meaning: every button has an aria-label with name+kind+era.
 */
export function WorldTreeCanvas({ layout, entries, selectedKey, onSelect }: WorldTreeCanvasProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ x: 0, width: 1000 });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setViewport((prev) =>
      prev.x === el.scrollLeft && prev.width === el.clientWidth ? prev : { x: el.scrollLeft, width: el.clientWidth || prev.width },
    );
  }, []);

  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const win = useMemo(
    () => getVisibleEraWindow(layout, viewport, { selectedKey, overscan: 1 }),
    [layout, viewport, selectedKey],
  );

  // Keep the selected node reachable after a selection change (not on every scroll).
  const focus = win.focusTarget;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !focus || typeof el.scrollTo !== 'function') return;
    if (focus.x < el.scrollLeft + 24 || focus.x > el.scrollLeft + el.clientWidth - 24) {
      el.scrollTo({ left: Math.max(0, focus.x - el.clientWidth / 2), behavior: 'auto' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const labels = useMemo(() => columnLabels(entries, layout.nodeColumns), [entries, layout.nodeColumns]);
  const height = win.extent.height + LABEL_ROW + METRIC_COEFFICIENTS.touchTargetPx;

  if (layout.status !== 'ok') return null;

  return (
    <div className={styles.scroller} ref={scrollerRef} onScroll={measure} data-part="tree-scroller" data-window-mode={win.mode}>
      <div className={styles.canvas} style={{ width: win.extent.width, height }}>
        <svg className={styles.svg} width={win.extent.width} height={height} viewBox={`0 0 ${win.extent.width} ${height}`} aria-hidden="true" focusable="false">
          {win.paths.map((path) => {
            const child = entries.byKey[path.toKey];
            const selected = selectedKey === path.toKey;
            return (
              <path
                key={`${path.fromKey}>${path.toKey}`}
                d={path.d}
                className={`${styles.path} ${pathClass(child?.kind ?? null, path.broken)} ${selected ? styles.pathSelected : ''}`}
                strokeWidth={path.broken ? 2 : (child?.stroke ?? 2)}
                data-broken={path.broken ? 'true' : undefined}
                onClick={() => onSelect(path.toKey)}
              />
            );
          })}
        </svg>

        {win.nodes.map((node) => {
          const entry = entries.byKey[node.nodeKey];
          if (!entry) return null;
          const selected = selectedKey === node.nodeKey;
          const size = Math.max(METRIC_COEFFICIENTS.touchTargetPx, entry.type === 'broken' ? 44 : entry.diameter);
          const base = {
            left: node.x - size / 2,
            top: node.y - size / 2,
            width: size,
            height: size,
          };
          if (entry.type === 'broken') {
            return (
              <button
                key={node.nodeKey}
                type="button"
                className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}
                style={base}
                aria-label={STUB_LABEL}
                aria-pressed={selected}
                data-node-key={node.nodeKey}
                data-node-type="broken"
                onClick={() => onSelect(node.nodeKey)}
              >
                <span className={styles.stub}>
                  <span aria-hidden="true">?</span>
                </span>
                <span className={`${styles.nodeLabel} ${styles.nodeLabelTop}`} aria-hidden="true">
                  {BROKEN_BRANCH_LABEL}
                </span>
                <span className={`${styles.nodeLabel} ${styles.nodeLabelBottom}`} aria-hidden="true">
                  {STUB_LABEL}
                </span>
              </button>
            );
          }
          return (
            <button
              key={node.nodeKey}
              type="button"
              className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}
              style={base}
              aria-label={entryAriaLabel(entry)}
              aria-pressed={selected}
              data-node-key={node.nodeKey}
              data-node-type="work"
              data-kind={entry.kind ?? undefined}
              onClick={() => onSelect(node.nodeKey)}
            >
              <span
                className={`${styles.fruit} ${entry.publish === 'unpublished' ? styles.fruitUnpublished : ''}`}
                style={{ width: entry.diameter, height: entry.diameter, background: fruitColor(node.nodeKey) }}
                aria-hidden="true"
              >
                {entry.diameter >= 30 ? (entry.title ?? '').slice(0, 2) : ''}
              </span>
            </button>
          );
        })}

        {Object.entries(labels).map(([col, name]) => {
          const c = Number(col);
          if (win.mode === 'windowed' && (c < win.firstColumn || c > win.lastColumn)) return null;
          return (
            <span key={col} className={styles.scale} style={{ left: layout.originX + c * layout.columnWidth }} data-part="era-scale">
              {name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
