import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

vi.mock('@/components/reader/report-dialog', () => ({
  ReportDialog: (p: { workId: string; chapterId: string; loggedIn: boolean; onSubmit: unknown }) =>
    React.createElement('button', { 'data-report': `${p.workId}:${p.chapterId}:${p.loggedIn}:${typeof p.onSubmit}` }, '신고'),
}));

import { ViewerSettingsPanel, ViewerSettingsPopover } from '@/components/reader/viewer-settings-sheet';
import { DEFAULT_VIEWER_PREFERENCES as D } from '@/lib/reader/viewer-preferences';

const panel = (prefs = D) =>
  renderToStaticMarkup(
    React.createElement(ViewerSettingsPanel, {
      preferences: prefs, onPreferencesChange: vi.fn(), workId: 'w1', chapterId: 'c1', loggedIn: true, onSubmitReport: vi.fn(),
    }),
  );

describe('viewer settings popover', () => {
  it('shows the five controls and light/dark/system without sepia', () => {
    const html = panel();
    for (const l of ['글꼴', '뷰어 모드', '글자 크기', '여백', '줄간격']) expect(html).toContain(`aria-label="${l}"`);
    for (const l of ['라이트', '다크', '시스템']) expect(html).toContain(l);
    expect(html).not.toContain('세피아');
  });
  it('disables step buttons at range limits', () => {
    const tag = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))![0];
    const isDisabled = (t: string) => / disabled(=""| |>)/.test(t.replace(/class="[^"]*"/, ''));
    expect(isDisabled(tag(panel({ ...D, fontSize: 17 }), '글자 크기 줄이기'))).toBe(true);
    expect(isDisabled(tag(panel({ ...D, fontSize: 24 }), '글자 크기 늘리기'))).toBe(true);
    expect(isDisabled(tag(panel(), '글자 크기 줄이기'))).toBe(false);
    expect(isDisabled(tag(panel({ ...D, padding: 32 }), '여백 늘리기'))).toBe(true);
  });
  it('passes report props through', () => {
    expect(panel()).toContain('data-report="w1:c1:true:function"');
  });
  it('renders the supplied trigger with its accessible name', () => {
    const html = renderToStaticMarkup(
      React.createElement(ViewerSettingsPopover, {
        open: false, onOpenChange: vi.fn(), preferences: D, onPreferencesChange: vi.fn(),
        trigger: React.createElement('button', { 'aria-label': '보기 설정' }, 'Aa'),
        workId: 'w1', chapterId: 'c1', loggedIn: false, onSubmitReport: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="보기 설정"');
  });
  it('onChange adapter writes whitelisted cookie and notifies', async () => {
    const { persistViewerPreferences } = await import('@/components/reader/viewer-settings-sheet');
    const jar: string[] = [];
    vi.stubGlobal('document', { set cookie(v: string) { jar.push(v); } });
    persistViewerPreferences({ ...D, font: 'serif' });
    vi.unstubAllGlobals();
    expect(jar[0]).toMatch(/^ns_viewer=.*max-age=31536000/);
    expect(decodeURIComponent(jar[0].split(';')[0].slice(10))).toContain('"font":"serif"');
  });
});

describe('viewer.module.css scope', () => {
  const css = readFileSync('components/reader/viewer.module.css', 'utf8');
  it('is scoped to .viewer and defines vars/themes', () => {
    expect(css).toContain('--viewer-size');
    expect(css).toContain('--viewer-lh');
    expect(css).toContain('--viewer-pad');
    expect(css).toContain("data-viewer-theme='dark'");
    expect(css).toContain("data-viewer-font='serif'");
    expect(css).toContain('prefers-color-scheme: dark');
    expect(css).not.toMatch(/^\s*(body|html|:root)\b/m);
    expect(css).not.toContain('sepia');
  });
});
