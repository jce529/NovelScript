import { isSettingDocument } from '@/lib/kb/setting-document';

export interface WorkHomeChapter {
  is_published: boolean;
}

export interface WorkHomeKbNode {
  node_type: string;
  category: string;
}

export type WorkHomeGuideStepId = 'work' | 'settings' | 'chapter' | 'publish';

export interface WorkHomeGuideStep {
  id: WorkHomeGuideStepId;
  title: string;
  complete: boolean;
}

export interface WorkHomeShortcut {
  id: 'chapters' | 'world' | 'timeline' | 'branching';
  title: string;
  href: string;
}

export interface WorkHomeState {
  chapterCounts: {
    total: number;
    published: number;
    unpublished: number;
  };
  settingDocumentCount: number;
  guide: {
    steps: WorkHomeGuideStep[];
    completedCount: number;
    totalSteps: 4;
    currentStepId: WorkHomeGuideStepId | null;
    isComplete: boolean;
  };
}

/** The four fixed destinations shown after the first-serialization guide. */
export const WORK_HOME_SHORTCUTS: readonly WorkHomeShortcut[] = [
  { id: 'chapters', title: '회차 목록', href: 'chapters' },
  { id: 'world', title: '세계관 설정', href: 'world' },
  { id: 'timeline', title: '타임라인', href: 'world/timeline' },
  { id: 'branching', title: '가지 치기', href: 'world#world-branching' },
];

/**
 * Turns already-authorized work data into the work-home display state.
 * This deliberately performs no database access so its caller controls the
 * ownership gate before any work-specific data is requested.
 */
export function buildWorkHomeState(
  chapters: readonly WorkHomeChapter[],
  kbNodes: readonly WorkHomeKbNode[],
): WorkHomeState {
  const published = chapters.filter((chapter) => chapter.is_published).length;
  const settingDocumentCount = kbNodes.filter(isSettingDocument).length;
  const steps: WorkHomeGuideStep[] = [
    { id: 'work', title: '작품 만들기', complete: true },
    { id: 'settings', title: '세계관 설정 문서 추가', complete: settingDocumentCount > 0 },
    { id: 'chapter', title: '첫 회차 쓰기', complete: chapters.length > 0 },
    { id: 'publish', title: '첫 회차 공개하기', complete: published > 0 },
  ];
  const completedCount = steps.filter((step) => step.complete).length;

  return {
    chapterCounts: {
      total: chapters.length,
      published,
      unpublished: chapters.length - published,
    },
    settingDocumentCount,
    guide: {
      steps,
      completedCount,
      totalSteps: 4,
      currentStepId: steps.find((step) => !step.complete)?.id ?? null,
      isComplete: completedCount === steps.length,
    },
  };
}
