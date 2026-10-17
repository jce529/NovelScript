import { describe, expect, it } from 'vitest';
import {
  DESKTOP_MEDIA_MAX_WIDTH,
  createInitialPaneState,
  getPanePresentation,
  isSameDocumentActivation,
  studioPaneReducer,
  type StudioPaneId,
} from '@/components/studio/workspace/mobile-pane-state';

const PANES: StudioPaneId[] = ['tree', 'write', 'ai'];

describe('studioPaneReducer', () => {
  it('starts on write with the initial pathname', () => {
    expect(createInitialPaneState('/studio/w/chapters/1')).toEqual({ activePane: 'write', pathname: '/studio/w/chapters/1' });
  });

  it.each(PANES)('select(%s) changes only the active pane', (pane) => {
    const s = createInitialPaneState('/a');
    expect(studioPaneReducer(s, { type: 'select', pane })).toEqual({ activePane: pane, pathname: '/a' });
  });

  it('a different pathname returns to write', () => {
    const s = studioPaneReducer(createInitialPaneState('/a'), { type: 'select', pane: 'tree' });
    expect(studioPaneReducer(s, { type: 'navigate', pathname: '/b' })).toEqual({ activePane: 'write', pathname: '/b' });
  });

  it('the same pathname (refresh/initial sync) keeps ai/tree and the same state object', () => {
    const s = studioPaneReducer(createInitialPaneState('/a'), { type: 'select', pane: 'ai' });
    expect(studioPaneReducer(s, { type: 'navigate', pathname: '/a' })).toBe(s);
  });

  it('insert moves to write', () => {
    const s = studioPaneReducer(createInitialPaneState('/a'), { type: 'select', pane: 'ai' });
    expect(studioPaneReducer(s, { type: 'insert' }).activePane).toBe('write');
  });

  it('selecting the already-active pane returns the same state', () => {
    const s = createInitialPaneState('/a');
    expect(studioPaneReducer(s, { type: 'select', pane: 'write' })).toBe(s);
  });
});

describe('getPanePresentation', () => {
  it('mobile: only the active pane is visible and interactive', () => {
    for (const active of PANES) {
      for (const pane of PANES) {
        const p = getPanePresentation(pane, active, true);
        if (pane === active) {
          expect(p).toMatchObject({ inert: false, ariaHidden: undefined });
          expect(p.className).not.toContain('invisible');
        } else {
          expect(p).toMatchObject({ inert: true, ariaHidden: true });
          expect(p.className).toContain('max-lg:invisible');
          expect(p.className).toContain('max-lg:absolute');
          expect(p.className).toContain('max-lg:pointer-events-none');
        }
      }
    }
  });

  it('desktop: every pane is accessible regardless of the active pane', () => {
    for (const active of PANES) {
      for (const pane of PANES) {
        expect(getPanePresentation(pane, active, false)).toMatchObject({ inert: false, ariaHidden: undefined });
      }
    }
  });

  it('visibility classes are limited to the max-lg prefix', () => {
    const cls = getPanePresentation('ai', 'write', true).className.split(' ');
    for (const c of cls) expect(c.startsWith('max-lg:')).toBe(true);
  });

  it('uses the 1023/1024 boundary', () => {
    expect(DESKTOP_MEDIA_MAX_WIDTH).toBe(1023);
  });
});

describe('isSameDocumentActivation', () => {
  const base = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    anchorPathname: '/studio/w/c/1', anchorTarget: null as string | null, currentPathname: '/studio/w/c/1', insideMenu: false };
  it('accepts a plain click on the current document anchor', () => {
    expect(isSameDocumentActivation(base)).toBe(true);
  });
  it.each([
    ['defaultPrevented', { defaultPrevented: true }],
    ['middle button', { button: 1 }],
    ['meta', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['new tab target', { anchorTarget: '_blank' }],
    ['menu', { insideMenu: true }],
    ['other document', { anchorPathname: '/studio/w/c/2' }],
    ['no anchor', { anchorPathname: null }],
  ])('rejects %s', (_n, patch) => {
    expect(isSameDocumentActivation({ ...base, ...patch })).toBe(false);
  });
});
