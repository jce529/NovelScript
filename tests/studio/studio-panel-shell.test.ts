import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_PANEL_STATE,
  panelGlyphs,
  panelLabels,
  panelReducer,
  presentPanels,
  slotCommands,
} from '@/lib/studio/panel-controller';
import { saveStatusCopy } from '@/lib/studio/editor-state';

const meta = { resourceKey: 'chapter:a', hasAi: true };

describe('panel controller', () => {
  it('left and right toggle independently', () => {
    const l = panelReducer(INITIAL_PANEL_STATE, { type: 'toggle', side: 'left' });
    expect(l).toEqual({ leftCollapsed: true, rightCollapsed: false });
    const both = panelReducer(l, { type: 'toggle', side: 'right' });
    expect(both).toEqual({ leftCollapsed: true, rightCollapsed: true });
    const back = panelReducer(both, { type: 'toggle', side: 'left' });
    expect(back).toEqual({ leftCollapsed: false, rightCollapsed: true });
  });

  it('visible / ariaExpanded derive from the same state, strip only when collapsed', () => {
    const open = presentPanels(INITIAL_PANEL_STATE, meta);
    expect(open.left).toMatchObject({ visible: true, ariaExpanded: true, showStrip: false, mounted: true });
    const closed = presentPanels({ leftCollapsed: true, rightCollapsed: true }, meta);
    expect(closed.left).toMatchObject({ visible: false, ariaExpanded: false, showStrip: true, mounted: true });
    expect(closed.right).toMatchObject({ visible: false, ariaExpanded: false, showStrip: true, mounted: true });
  });

  it('collapse/expand keeps editor and AI descriptors by reference with no mount/unmount commands', () => {
    const open = presentPanels(INITIAL_PANEL_STATE, meta);
    let state = panelReducer(INITIAL_PANEL_STATE, { type: 'toggle', side: 'left' });
    state = panelReducer(state, { type: 'toggle', side: 'right' });
    const collapsed = presentPanels(state, meta);
    expect(collapsed.editor).toBe(open.editor);
    expect(collapsed.ai).toBe(open.ai);
    expect(slotCommands(open, collapsed)).toEqual([]);
    const reopened = presentPanels(INITIAL_PANEL_STATE, meta);
    expect(reopened.editor).toBe(open.editor);
    expect(reopened.ai).toBe(open.ai);
    expect(slotCommands(collapsed, reopened)).toEqual([]);
  });

  it('a resource change (not a toggle) is what produces slot commands', () => {
    const a = presentPanels(INITIAL_PANEL_STATE, meta);
    const b = presentPanels(INITIAL_PANEL_STATE, { resourceKey: 'chapter:b', hasAi: true });
    expect(slotCommands(a, b).map((c) => c.type)).toEqual(['unmount', 'mount', 'unmount', 'mount']);
  });

  it('no-AI mode has no right panel, no strip and no ai descriptor', () => {
    const p = presentPanels({ leftCollapsed: false, rightCollapsed: true }, { resourceKey: 'kb:x', hasAi: false });
    expect(p.right).toBeNull();
    expect(p.ai).toBeNull();
    expect(p.editor).not.toBeNull();
  });

  it('glyphs and labels point the right way', () => {
    expect(panelGlyphs('left')).toEqual({ collapse: '«', expand: '»' });
    expect(panelGlyphs('right')).toEqual({ collapse: '»', expand: '«' });
    expect(panelLabels('right').collapse).toContain('접기');
    expect(panelLabels('left').expand).toContain('펼치기');
  });
});

describe('save chip copy', () => {
  it('only a real pending save reads 저장 중, readOnly reads 읽기 전용', () => {
    expect(saveStatusCopy('saving')).toBe('저장 중');
    expect(saveStatusCopy('dirty')).not.toBe('저장 중');
    expect(saveStatusCopy('failed', true)).toBe('읽기 전용');
  });
});

describe('shell source wiring (static check, not a mount-count proof)', () => {
  const shell = readFileSync('components/studio/studio-panel-shell.tsx', 'utf8');
  const chip = readFileSync('components/studio/save-status-chip.tsx', 'utf8');
  const layout = readFileSync('app/studio/[workId]/layout.tsx', 'utf8');

  it('collapse only changes class/aria, no conditional unmount, collapse-based key or portal', () => {
    expect(shell).not.toMatch(/createPortal/);
    expect(shell).not.toMatch(/key=\{[^}]*(ollapsed|visible)/);
    // AI/editor slots are rendered unconditionally in place; hidden via class.
    expect(shell).toMatch(/\{editor\}/);
    expect(shell).toMatch(/\{ai\}/);
    expect(shell).not.toMatch(/(ollapsed|visible)\s*&&\s*[(<]?\s*\{?(ai|editor)\b/);
    expect(shell).toMatch(/lg:hidden/);
  });

  it('buttons carry aria-label, aria-expanded and aria-controls from the controller', () => {
    expect(shell).toMatch(/aria-label=\{panelLabels/);
    expect(shell).toMatch(/aria-expanded=\{expanded\}/);
    expect(shell).toMatch(/aria-controls=\{controls\}/);
    expect(shell).toMatch(/presentPanels\(/);
  });

  it('chip is a polite status region fed by editor state', () => {
    expect(chip).toMatch(/role="status"/);
    expect(chip).toMatch(/aria-live="polite"/);
    expect(chip).toMatch(/selectSaveStatus\(state\)/);
    expect(chip).not.toMatch(/isPending/);
  });

  it('layout mounts the provider and wraps the sidebar', () => {
    expect(layout).toMatch(/<StudioPanelProvider>/);
    expect(layout).toMatch(/<StudioSidebar>\{sidebar\}<\/StudioSidebar>/);
  });
});
