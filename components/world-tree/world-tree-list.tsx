'use client';

import Link from 'next/link';
import {
  KIND_LABEL,
  STUB_BODY_PLACE,
  STUB_LABEL,
  entryAriaLabel,
  publishChip,
  type WorldTreeEntries,
} from '@/components/world-tree/world-tree-detail';
import styles from '@/components/world-tree/world-tree.module.css';

export interface WorldTreeListProps {
  /** layout.listOrder: era order -> placement order -> key. Never windowed. */
  order: readonly string[];
  entries: WorldTreeEntries;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

/**
 * Keyboard/low-vision alternative to the SVG tree. Same entries and selection as the canvas; every
 * public fruit is reachable without the tree. A stub is a single line, links nowhere and carries
 * no parent identity in the DOM.
 */
export function WorldTreeList({ order, entries, selectedKey, onSelect }: WorldTreeListProps) {
  return (
    <ol className={styles.list} aria-label="세계수 목록 보기" data-part="tree-list">
      {order.map((key) => {
        const entry = entries.byKey[key];
        if (!entry) return null;
        const selected = selectedKey === key;
        const parent = entry.parentKey ? entries.byKey[entry.parentKey] : null;
        const followsStub = entry.type === 'work' && parent?.type === 'broken';
        const buttonClass = `${styles.listSelect} ${selected ? styles.listSelected : ''}`;
        if (entry.type === 'broken') {
          return (
            <li key={key} className={styles.listItem}>
              <button type="button" className={buttonClass} aria-pressed={selected} aria-label={STUB_LABEL} onClick={() => onSelect(key)}>
                <span>{STUB_LABEL}</span>
              </button>
            </li>
          );
        }
        return (
          <li key={key} className={styles.listItem}>
            {followsStub ? <p className={styles.listNote}>{STUB_BODY_PLACE}</p> : null}
            <button
              type="button"
              className={buttonClass}
              aria-pressed={selected}
              aria-label={entryAriaLabel(entry)}
              onClick={() => onSelect(key)}
              data-node-type="work"
            >
              <span className="font-semibold">{entry.title}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{entry.kind ? KIND_LABEL[entry.kind] : ''}</span>
                {entry.eraName ? <span>· {entry.eraName}</span> : null}
                {entry.concurrent ? <span>· 동시 진행</span> : null}
                {publishChip(entry)}
              </span>
            </button>
            {entry.workId ? (
              <Link
                href={`/works/${entry.workId}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted"
              >
                작품 보러 가기
              </Link>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
