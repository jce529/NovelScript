import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEWER_PREFERENCES as D,
  encodeViewerPreferences,
  parseViewerPreferences,
  serializeViewerPreferences,
} from '@/lib/reader/viewer-preferences';

const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));

describe('viewer preferences codec', () => {
  it('roundtrips all five keys', () => {
    const p = { font: 'serif', mode: 'dark', fontSize: 24, padding: 32, lineHeight: 2.2 } as const;
    expect(parseViewerPreferences(encodeViewerPreferences(p))).toEqual(p);
  });
  it('defaults when missing', () => {
    expect(parseViewerPreferences()).toEqual(D);
    expect(parseViewerPreferences('')).toEqual(D);
  });
  it('fills partial cookie with defaults', () => {
    expect(parseViewerPreferences(enc({ font: 'serif' }))).toEqual({ ...D, font: 'serif' });
  });
  it('survives malformed URI/JSON and non-objects', () => {
    expect(parseViewerPreferences('%E0%A4%A')).toEqual(D);
    expect(parseViewerPreferences('{oops')).toEqual(D);
    expect(parseViewerPreferences(enc([1, 2]))).toEqual(D);
    expect(parseViewerPreferences(enc(null))).toEqual(D);
  });
  it('drops unknown keys on serialize', () => {
    const parsed = parseViewerPreferences(enc({ ...D, evil: 'x' }));
    expect(Object.keys(parsed).sort()).toEqual(['font', 'fontSize', 'lineHeight', 'mode', 'padding']);
    const value = encodeViewerPreferences({ ...D, evil: 'x' } as never);
    expect(JSON.parse(decodeURIComponent(value))).not.toHaveProperty('evil');
  });
  it('maps sepia to light', () => {
    expect(parseViewerPreferences(enc({ ...D, mode: 'sepia' })).mode).toBe('light');
  });
  it('corrects out-of-range values', () => {
    expect(parseViewerPreferences(enc({ ...D, fontSize: 99, padding: '24', lineHeight: 5, font: 'comic', mode: 'x' }))).toEqual(D);
  });
  it('serializes with 1y max-age, Lax, Path and optional Secure', () => {
    const s = serializeViewerPreferences(D);
    expect(s).toMatch(/^ns_viewer=/);
    expect(s).toContain('max-age=31536000; SameSite=Lax; Path=/');
    expect(s).not.toContain('Secure');
    expect(serializeViewerPreferences(D, { secure: true })).toContain('; Secure');
  });
});
