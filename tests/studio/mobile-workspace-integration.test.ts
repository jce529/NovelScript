import { describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/studio/w/chapters/1' }));

import { StudioPanelProvider, StudioEditorPanels } from '@/components/studio/studio-panel-shell';
import { StudioWorkspace } from '@/components/studio/workspace/mobile-tabs';
import { StudioPane } from '@/components/studio/workspace/StudioPane';
import {
  createInitialPaneState,
  getPanePresentation,
  studioPaneReducer,
  type StudioPaneId,
  type StudioPaneState,
} from '@/components/studio/workspace/mobile-pane-state';

// 16-02: composes the real 16-01 adapter with the real 02-11 shell slots (SSR + pure state only).
// Real mount counts, scroll/cursor and in-flight responses are verified in the 16-03 browser UAT.

const Pane = StudioPane as unknown as ComponentType<Record<string, unknown>>;
const Panels = StudioEditorPanels as unknown as ComponentType<Record<string, unknown>>;

function page(resourceKey: string, withAi: boolean): string {
  const node: ReactNode = createElement(
    StudioPanelProvider,
    null,
    createElement(
      StudioWorkspace,
      null,
      createElement(Panels, {
        resourceKey,
        toolbar: createElement(Pane, { pane: 'write', domId: false }, createElement('i', null, 'TOOLBAR')),
        editor: createElement(Pane, { pane: 'write' }, createElement('p', null, 'EDITOR-' + resourceKey)),
        ai: withAi ? createElement(Pane, { pane: 'ai' }, createElement('p', null, 'AI-' + resourceKey)) : undefined,
      })
    )
  );
  return renderToStaticMarkup(node);
}

const apply = (s: StudioPaneState, ...events: Parameters<typeof studioPaneReducer>[1][]) =>
  events.reduce(studioPaneReducer, s);

describe('mobile adapter composed with the shared studio shell', () => {
  it('keeps editor and AI children mounted in the markup; domIds stay unique', () => {
    const html = page('chapter:w:1', true);
    expect(html).toContain('EDITOR-chapter:w:1');
    expect(html).toContain('AI-chapter:w:1');
    expect(html).toContain('TOOLBAR');
    expect([...html.matchAll(/id="studio-pane-write"/g)]).toHaveLength(1);
    expect([...html.matchAll(/id="studio-pane-ai"/g)]).toHaveLength(1);
    // SSR snapshot is desktop: nothing is inert or aria-hidden.
    expect(html).not.toContain('inert');
    expect(html.match(/<div [^>]*id="studio-pane-[^>]*>/g)?.join('') ?? '').not.toContain('aria-hidden');
  });

  it('does not show another document AI: no AI slot means no AI markup', () => {
    const html = page('kb:w:readonly', false);
    expect(html).toContain('EDITOR-kb:w:readonly');
    expect(html).not.toContain('AI-');
  });

  it('tree -> ai -> write on the same path leaves the document identity unchanged', () => {
    let s = createInitialPaneState('/studio/w/chapters/1');
    s = apply(s, { type: 'select', pane: 'tree' }, { type: 'select', pane: 'ai' });
    expect(s.activePane).toBe('ai');
    s = apply(s, { type: 'select', pane: 'write' });
    expect(s).toEqual({ activePane: 'write', pathname: '/studio/w/chapters/1' });
  });

  it('only a real pathname change returns to write; a same-path refresh keeps the selection', () => {
    const base = apply(createInitialPaneState('/a'), { type: 'select', pane: 'ai' });
    expect(apply(base, { type: 'navigate', pathname: '/a' }).activePane).toBe('ai');
    expect(apply(base, { type: 'navigate', pathname: '/b' })).toEqual({ activePane: 'write', pathname: '/b' });
  });

  it('an accepted insert returns to write from any tab', () => {
    for (const pane of ['tree', 'ai'] as StudioPaneId[]) {
      const s = apply(createInitialPaneState('/a'), { type: 'select', pane }, { type: 'insert' });
      expect(s.activePane).toBe('write');
    }
  });

  it('desktop clears inert/aria-hidden for every pane regardless of the selected tab', () => {
    for (const active of ['tree', 'write', 'ai'] as StudioPaneId[]) {
      for (const pane of ['tree', 'write', 'ai'] as StudioPaneId[]) {
        const d = getPanePresentation(pane, active, false);
        expect(d.inert).toBe(false);
        expect(d.ariaHidden).toBeUndefined();
        // Hiding classes are max-lg scoped so desktop collapse (lg) is untouched.
        expect(d.className).toMatch(/^(max-lg:\S+\s?)+$/);
      }
    }
    expect(getPanePresentation('ai', 'write', true)).toMatchObject({ inert: true, ariaHidden: true });
    expect(getPanePresentation('write', 'write', true)).toMatchObject({ inert: false });
  });
});
