import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorldTreeView } from '@/components/world-tree/world-tree-view';
import { WorldTreeList } from '@/components/world-tree/world-tree-list';
import { buildWorldTreeEntries } from '@/components/world-tree/world-tree-detail';
import { buildWorldTreeLayout } from '@/lib/world-tree/layout';
import type { ReaderWorldTreeProjection, WorldTreeResponse } from '@/lib/world-tree/types';
import {
  EXPAND_TITLE,
  IF_TITLE,
  ROOT_TITLE,
  ids,
  ownerTree,
  readerConsecutiveStubTree,
  readerNormalTree,
  readerPrivateRootTree,
  readerRepublishedTree,
} from './fixtures';

const note = { kind: 'feed-proxy-v1' as const, temporary: true as const, authorViewsExcludedSince: '2026-10-01T00:00:00Z', limitations: ['임시 점수예요.'] };
const metrics = (scores: Record<string, number>) => ({ ok: true as const, scores, note });

function render(projection: WorldTreeResponse | null, opts: Partial<React.ComponentProps<typeof WorldTreeView>> = {}) {
  return renderToStaticMarkup(
    React.createElement(WorldTreeView, { projection, metricResult: null, mode: 'reader', ...opts }),
  );
}

describe('WorldTreeView states', () => {
  it('shows a skeleton while loading', () => {
    expect(render(null)).toContain('data-part="skeleton"');
  });

  it('shows the failure copy with retry when the projection is unavailable', () => {
    const html = render({ status: 'unavailable' }, { onRetry: () => undefined });
    expect(html).toContain('세계수를 불러오지 못했어요. 다시 시도해 주세요.');
    expect(html).toContain('다시 불러오기');
  });

  it('shows the empty copy and hides private titles when nothing is published', () => {
    const empty: ReaderWorldTreeProjection = { ...readerNormalTree, nodes: [], eras: [], header: { title: '세계수' } };
    const html = render(empty);
    expect(html).toContain('아직 발행된 작품이 없어요.');
    expect(html).not.toContain(ROOT_TITLE);
  });

  it('draws one SVG with a button per public fruit and the temporary-formula legend', () => {
    const html = render(readerNormalTree, { metricResult: metrics({ n0: 80, n1: 40, n2: 10 }) });
    expect(html).toContain(`${ROOT_TITLE} 세계수`);
    expect(html.match(/<svg/g)?.length).toBe(1);
    expect(html.match(/data-node-type="work"/g)?.length).toBe(3);
    expect(html).toContain('산식은 임시안');
    expect(html).toContain('굵기 = 본가지와의 근접도 · 열매 크기 = 인기 · 초록 = 확장 가지');
    expect(html).toContain('기준 시각 2026-10-01부터 작가 본인 조회를 제외해요.');
    expect(html).toContain('트리 보기');
    expect(html).toContain('목록 보기');
  });

  it('uses 44px touch targets regardless of visual fruit size', () => {
    const html = render(readerNormalTree, { metricResult: metrics({ n0: 0, n1: 0, n2: 0 }) });
    const widths = [...html.matchAll(/<button[^>]*style="[^"]*?width:([\d.]+)px[^"]*"[^>]*data-node-type="work"/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(3);
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(44);
  });

  it('notes a failed metric load instead of inventing popularity', () => {
    const html = render(readerNormalTree, { metricResult: { ok: false, reason: 'unavailable' } as never });
    expect(html).toContain('data-part="metric-failed"');
    expect(html).toContain('불러오지 못했어요');
  });

  it('single fruit world shows the no-branch notice', () => {
    const single: ReaderWorldTreeProjection = { ...readerNormalTree, nodes: [readerNormalTree.nodes[0]] };
    expect(render(single)).toContain('아직 갈라진 가지가 없어요');
  });
});

describe('broken branch stub', () => {
  it('renders an unnamed stub button and a connected published child with no leaked parent identity', () => {
    const html = render(readerPrivateRootTree);
    expect(html).toContain('aria-label="비공개된 본작 자리"');
    expect(html).toContain('부러진 가지');
    expect(html).toContain('data-broken="true"');
    expect(html).toContain(IF_TITLE);
    expect(html).not.toContain(ROOT_TITLE);
    expect(html).not.toContain(ids.rootWork);
    expect(html).not.toContain(ids.rootBranch);
    expect(html).toContain('세계수');
  });

  it('shows only the generic copy when the stub is selected and links nowhere', () => {
    // Selecting through the detail model: stub entry has no title/workId/metrics.
    const entries = buildWorldTreeEntries(readerPrivateRootTree, { n1: 50 });
    const stub = entries.byKey.n0;
    expect(stub).toMatchObject({ type: 'broken', title: null, workId: null, score: null, kind: null });
    const html = render({ ...readerPrivateRootTree, focusNodeKey: 'n0' });
    expect(html).toContain('비공개된 가지');
    expect(html).toContain('원래 본작이 있었던 자리예요. 이어진 작품은 계속 볼 수 있어요.');
    expect(html).not.toContain('data-selected-type="work"');
    expect(html).not.toContain(`/works/${ids.rootWork}`);
  });

  it('list view puts the generic note before the child and keeps stub as one line without ids', () => {
    const entries = buildWorldTreeEntries(readerConsecutiveStubTree, null);
    const layout = buildWorldTreeLayout(readerConsecutiveStubTree, { eraWidth: 200, nodeGap: 64 });
    const html = renderToStaticMarkup(
      React.createElement(WorldTreeList, { order: layout.listOrder, entries, selectedKey: null, onSelect: () => undefined }),
    );
    expect(html.match(/<li/g)?.length).toBe(3);
    expect(html.match(/aria-label="비공개된 본작 자리"/g)?.length).toBe(2);
    expect(html).toContain('원래 본작이 있었던 자리예요.');
    expect(html).not.toMatch(/data-parent|parent-id|parentNodeKey/);
  });

  it('republished parent restores a normal fruit', () => {
    const html = render(readerRepublishedTree);
    expect(html).not.toContain('비공개된 본작 자리');
    expect(html).toContain(ROOT_TITLE);
  });
});

describe('list alternative', () => {
  it('lists every public fruit in layout order with work links', () => {
    const entries = buildWorldTreeEntries(readerNormalTree, null);
    const layout = buildWorldTreeLayout(readerNormalTree, { eraWidth: 200, nodeGap: 64 });
    const html = renderToStaticMarkup(
      React.createElement(WorldTreeList, { order: layout.listOrder, entries, selectedKey: 'n1', onSelect: () => undefined }),
    );
    for (const title of [ROOT_TITLE, IF_TITLE, EXPAND_TITLE]) expect(html).toContain(title);
    expect(html).toContain(`/works/${ids.ifWork}`);
    expect(html).toContain('aria-pressed="true"');
  });
});

describe('owner view', () => {
  it('shows all works with an unpublished chip and owner actions only for the owner', () => {
    const html = render(ownerTree, {
      mode: 'owner',
      studioLinks: { timelineHref: '/studio/x/world', branchHref: '/studio/x/world/branch' },
      onReaderPreview: async () => ({ projection: readerNormalTree, metricResult: null }),
    });
    expect(html).toContain('미발행');
    expect(html).toContain('연표 편집');
    expect(html).toContain('이 세계관에서 가지 치기');
    expect(html).toContain('독자 보기');
    // The reader surface never gets those buttons.
    const reader = render(readerNormalTree, { studioLinks: { timelineHref: '/a', branchHref: '/b' } });
    expect(reader).not.toContain('연표 편집');
    expect(reader).not.toContain('독자 보기');
  });

  it('fails closed when a reader surface receives an owner projection', () => {
    const html = render(ownerTree, { mode: 'reader' });
    expect(html).toContain('세계수를 불러오지 못했어요');
    expect(html).not.toContain(ROOT_TITLE + '</');
    expect(html).not.toContain('미발행');
  });
});
