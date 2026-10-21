import { describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/studio/w/chapters/1' }));

import { StudioWorkspace, StudioMobileNavigation } from '@/components/studio/workspace/mobile-tabs';
import { StudioPane } from '@/components/studio/workspace/StudioPane';

// createElement overloads reject a required children prop passed as an extra argument.
const Pane = StudioPane as unknown as ComponentType<Record<string, unknown>>;
const render = (node: ReactNode) => renderToStaticMarkup(createElement(StudioWorkspace, null, node));

describe('mobile workspace SSR markup', () => {
  it('renders exactly three nav buttons with labels, ids and aria-controls; write is current', () => {
    const html = render(createElement(StudioMobileNavigation));
    expect([...html.matchAll(/<button /g)]).toHaveLength(3);
    for (const label of ['설정집·회차', '집필', 'AI']) expect(html).toContain(`<span>${label}</span>`);
    for (const pane of ['tree', 'write', 'ai']) {
      expect(html).toContain(`id="studio-nav-${pane}"`);
      expect(html).toContain(`aria-controls="studio-pane-${pane}"`);
    }
    expect([...html.matchAll(/aria-current="page"/g)]).toHaveLength(1);
    const writeButton = html.match(/<button [^>]*id="studio-nav-write"[^>]*>/)?.[0] ?? '';
    expect(writeButton).toContain('aria-current="page"');
    expect(html).toContain('lg:hidden');
  });

  it('keeps every pane child rendered; SSR (desktop snapshot) leaves none inert or aria-hidden', () => {
    const html = render(
      createElement(
        'div',
        null,
        createElement(Pane, { pane: 'tree' }, createElement('p', null, 'TREE-CHILD')),
        createElement(Pane, { pane: 'write' }, createElement('p', null, 'WRITE-CHILD')),
        createElement(Pane, { pane: 'ai' }, createElement('p', null, 'AI-CHILD'))
      )
    );
    for (const t of ['TREE-CHILD', 'WRITE-CHILD', 'AI-CHILD']) expect(html).toContain(t);
    for (const pane of ['tree', 'write', 'ai']) expect(html).toContain(`id="studio-pane-${pane}"`);
    expect(html).not.toContain('inert');
    expect(html).not.toContain('aria-hidden="true"');
    const treeTag = html.match(/<div [^>]*id="studio-pane-tree"[^>]*>/)?.[0] ?? '';
    expect(treeTag).toContain('max-lg:invisible');
    // Hiding is limited to the max-lg prefix.
    expect(html).not.toMatch(/class="(?:[^"]* )?(?:invisible|hidden)[ "]/);
  });

  it('renders the optional ai notice slot', () => {
    const html = render(
      createElement(Pane, { pane: 'ai', notice: createElement('p', null, 'notice-text') }, createElement('i'))
    );
    expect(html).toContain('notice-text');
  });
});
