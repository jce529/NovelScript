import { describe, expect, it } from 'vitest';
import { isSettingDocument } from '@/lib/kb/setting-document';
import { buildWorkHomeState, WORK_HOME_SHORTCUTS } from '@/lib/works/work-home';

describe('isSettingDocument', () => {
  it('counts only authored non-template files as setting documents', () => {
    expect(isSettingDocument({ node_type: 'file', category: 'character' })).toBe(true);
    expect(isSettingDocument({ node_type: 'file', category: 'template' })).toBe(false);
    expect(isSettingDocument({ node_type: 'folder', category: 'character' })).toBe(false);
  });
});

describe('buildWorkHomeState', () => {
  it('derives three chapter counts and guide progress from supplied results only', () => {
    const state = buildWorkHomeState(
      [{ is_published: true }, { is_published: false }, { is_published: false }],
      [
        { node_type: 'folder', category: 'character' },
        { node_type: 'file', category: 'template' },
        { node_type: 'file', category: 'place' },
      ],
    );

    expect(state.chapterCounts).toEqual({ total: 3, published: 1, unpublished: 2 });
    expect(state.settingDocumentCount).toBe(1);
    expect(state.guide).toMatchObject({ completedCount: 4, totalSteps: 4, currentStepId: null, isComplete: true });
  });

  it('makes the first incomplete required step current and keeps an empty work out of the overview', () => {
    const state = buildWorkHomeState([], []);

    expect(state.chapterCounts).toEqual({ total: 0, published: 0, unpublished: 0 });
    expect(state.guide).toMatchObject({ completedCount: 1, currentStepId: 'settings', isComplete: false });
    expect(state.guide.steps.map((step) => [step.id, step.complete])).toEqual([
      ['work', true], ['settings', false], ['chapter', false], ['publish', false],
    ]);
  });

  it('does not complete publication from a draft-only first chapter', () => {
    const state = buildWorkHomeState(
      [{ is_published: false }],
      [{ node_type: 'file', category: 'character' }],
    );

    expect(state.guide).toMatchObject({ completedCount: 3, currentStepId: 'publish', isComplete: false });
  });
});

describe('work home shortcuts', () => {
  it('keeps exactly the four revision-two destinations', () => {
    expect(WORK_HOME_SHORTCUTS).toEqual([
      { id: 'chapters', title: '회차 목록', href: 'chapters' },
      { id: 'world', title: '세계관 설정', href: 'world' },
      { id: 'timeline', title: '타임라인', href: 'world/timeline' },
      { id: 'branching', title: '가지 치기', href: 'world#world-branching' },
    ]);
    expect(WORK_HOME_SHORTCUTS.map((shortcut) => shortcut.id)).not.toContain('review');
    expect(WORK_HOME_SHORTCUTS.map((shortcut) => shortcut.id)).not.toContain('settings');
  });
});
