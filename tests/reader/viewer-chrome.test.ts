import { describe, expect, it } from 'vitest';
import {
  INITIAL_CHROME, chromeReducer, isInteractiveTarget, isTogglingTap, nextControl, prevControl,
  shouldCallToggleSubscription, hiddenBarAttrs, type ChromeState,
} from '@/lib/reader/viewer-chrome';

const tap = { movedPx: 2, hasSelection: false, interactive: false };

describe('viewer chrome', () => {
  it('starts hidden and a plain body tap shows it', () => {
    expect(INITIAL_CHROME.visible).toBe(false);
    expect(chromeReducer(INITIAL_CHROME, { type: 'tap', tap }).visible).toBe(true);
  });

  it.each([
    ['drag 10px', { ...tap, movedPx: 10 }],
    ['selection', { ...tap, hasSelection: true }],
    ['interactive', { ...tap, interactive: true }],
  ])('%s does not toggle', (_n, t) => {
    expect(isTogglingTap(t)).toBe(false);
    expect(chromeReducer(INITIAL_CHROME, { type: 'tap', tap: t })).toBe(INITIAL_CHROME);
  });

  it('detects interactive ancestors', () => {
    expect(isInteractiveTarget({ closest: () => ({}) })).toBe(true);
    expect(isInteractiveTarget({ closest: () => null })).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });

  it('overlay pins the bar: hide and tap are refused, closing keeps it', () => {
    let s: ChromeState = chromeReducer(INITIAL_CHROME, { type: 'open-overlay', overlay: 'settings' });
    expect(s.visible).toBe(true);
    expect(chromeReducer(s, { type: 'hide' }).visible).toBe(true);
    expect(chromeReducer(s, { type: 'tap', tap }).visible).toBe(true);
    s = chromeReducer(s, { type: 'close-overlay' });
    expect(s.overlay).toBeNull();
    expect(chromeReducer(s, { type: 'hide' }).visible).toBe(false);
  });

  it('first chapter disables prev; last chapter next opens the end dialog', () => {
    expect(prevControl(null).disabled).toBe(true);
    expect(prevControl({ id: 'a' }).disabled).toBe(false);
    expect(nextControl(null).kind).toBe('end-dialog');
    expect(nextControl({ id: 'b' }).kind).toBe('navigate');
  });

  it('sentinel end opens once per visit, duplicates are silent, next click reopens', () => {
    let s = chromeReducer(INITIAL_CHROME, { type: 'sentinel-end', isLast: true });
    expect(s.endDialogOpen).toBe(true);
    s = chromeReducer(s, { type: 'close-end' });
    expect(chromeReducer(s, { type: 'sentinel-end', isLast: true }).endDialogOpen).toBe(false);
    expect(chromeReducer(s, { type: 'next-click', isLast: true }).endDialogOpen).toBe(true);
  });

  it('non-last chapters never open the end dialog', () => {
    expect(chromeReducer(INITIAL_CHROME, { type: 'sentinel-end', isLast: false })).toBe(INITIAL_CHROME);
    expect(chromeReducer(INITIAL_CHROME, { type: 'next-click', isLast: false })).toBe(INITIAL_CHROME);
  });

  it('already subscribed or guest never calls toggle', () => {
    expect(shouldCallToggleSubscription({ loggedIn: true, subscribed: true })).toBe(false);
    expect(shouldCallToggleSubscription({ loggedIn: false, subscribed: false })).toBe(false);
    expect(shouldCallToggleSubscription({ loggedIn: true, subscribed: false })).toBe(true);
  });

  it('hidden bar is inert and aria-hidden', () => {
    expect(hiddenBarAttrs(false)).toEqual({ 'aria-hidden': true, inert: true });
    expect(hiddenBarAttrs(true)).toEqual({ 'aria-hidden': false, inert: false });
  });
});
