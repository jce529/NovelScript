import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

const DIALOG_PATH = 'app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog.tsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('sonner', () => ({ toast: { success: () => {}, error: () => {}, warning: () => {} } }));
vi.mock('@/app/studio/[workId]/chapters/[chapterId]/actions', () => ({
  importFilesAction: async () => ({ ok: false, error: '' }),
  listCategoryFoldersAction: async () => ({ ok: false }),
  classifyUploadFilesAction: async () => ({ ok: false, error: '' }),
  importClassifiedFilesAction: async () => ({ ok: false, error: '' }),
  loadPlacementTreeAction: async () => null,
}));
vi.mock('@/app/studio/[workId]/chapters/[chapterId]/ai-panel/PlacementTree', () => ({ PlacementTree: () => null }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? createElement('div', null, children) : null),
  DialogContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogHeader: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement('h2', null, children),
  DialogFooter: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value }: { children: ReactNode; value: unknown }) =>
    createElement('div', { 'data-select-value': value === null ? 'null' : value === undefined ? 'undefined' : String(value) }, children),
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement('button', null, children),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  SelectItem: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));

import { UploadFilesDialog } from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog';

function render() {
  return renderToStaticMarkup(createElement(UploadFilesDialog, {
    workId: 'w1', open: true, onOpenChange: () => {}, attachedCount: 0, onAttach: () => {},
  }));
}

const fileInputs = (html: string) => html.match(/<input[^>]*type="file"[^>]*>/g) ?? [];

describe('UploadFilesDialog 파일 입력', () => {
  it('파일/폴더 네이티브 입력은 모두 sr-only라 기본 문구가 보이지 않는다', () => {
    const inputs = fileInputs(render());
    expect(inputs).toHaveLength(2);
    for (const input of inputs) expect(input).toMatch(/class="[^"]*\bsr-only\b/);
    expect(inputs.some((input) => input.includes('webkitdirectory'))).toBe(true);
  });

  it('입력마다 접근 가능한 이름이 있고 탭 순서에서는 버튼만 노출된다', () => {
    for (const input of fileInputs(render())) {
      expect(input).toMatch(/aria-label="[^"]+"/);
      expect(input).toMatch(/tabindex="-1"/i);
    }
  });

  it('별도 type=button 버튼 두 개가 선택창을 연다', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>\s*파일 선택/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>\s*폴더째 선택/);
    const src = readFileSync(DIALOG_PATH, 'utf8');
    expect(src).toMatch(/fileInputRef\.current\?\.click\(\)/);
    expect(src).toMatch(/folderInputRef\.current\?\.click\(\)/);
  });

  it('기존 검증 경로와 같은 파일 재선택용 초기화를 유지한다', () => {
    const src = readFileSync(DIALOG_PATH, 'utf8');
    expect(src.match(/void pickFiles\(e\.target\.files\); e\.target\.value = ''/g)).toHaveLength(2);
    expect(src).toContain('MAX_IMPORT_FILES');
    expect(src).toContain('MAX_ATTACHMENTS');
    expect(src).toContain('isAcceptedTextFile');
    expect(src).toContain('accept=".md,.markdown,.txt,text/plain,text/markdown"');
  });

  it('첨부 모드가 아니면 폴더 선택을 제공한다 (기본 모드)', () => {
    expect(render()).toContain('폴더째 선택');
  });
});

describe('UploadFilesDialog 사이드바 단독 사용', () => {
  it('onAttach가 없으면 대화 첨부 방식을 숨기고 저장·자동 분류만 보인다', () => {
    const html = renderToStaticMarkup(createElement(UploadFilesDialog, { workId: 'w1', open: true, onOpenChange: () => {} }));
    expect(html).toContain('설정 문서로 저장');
    expect(html).toContain('AI 자동 분류');
    expect(html).not.toContain('이번 대화에만 첨부');
  });

  it('onAttach가 있으면 첨부 방식도 보인다', () => {
    expect(render()).toContain('이번 대화에만 첨부');
  });

  it('사이드바 진입점이 같은 다이얼로그를 onAttach 없이 쓴다', () => {
    const entry = readFileSync('components/studio/template-sidebar-entry.tsx', 'utf8');
    expect(entry).toContain('파일 올리기');
    expect(entry).toContain('<UploadFilesDialog workId={workId} open={uploadOpen} onOpenChange={setUploadOpen} />');
  });
});

describe('UploadFilesDialog Select 제어 상태 (G2 회귀)', () => {
  it('폴더 로드 전에도 저장 폴더 Select value는 null로 제어형이다', () => {
    const values = [...render().matchAll(/data-select-value="([^"]*)"/g)].map((m) => m[1]);
    expect(values).toContain('null');
    expect(values).not.toContain('undefined');
    expect(values).toContain('인물');
  });

  it('소스가 selectedFolderId ?? null 을 유지한다', () => {
    expect(readFileSync(DIALOG_PATH, 'utf8')).toContain('value={folderState.selectedFolderId ?? null}');
  });
});
