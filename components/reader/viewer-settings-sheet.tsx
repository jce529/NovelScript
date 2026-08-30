'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ReportDialog } from '@/components/reader/report-dialog';
import type { ViewerTheme } from '@/components/reader/viewer-shell';

const FONT_SIZES = [17, 19, 21, 24] as const;
const THEME_OPTIONS: { value: ViewerTheme; label: string }[] = [
  { value: 'light', label: '라이트' },
  { value: 'sepia', label: '세피아' },
  { value: 'dark', label: '다크' },
];

export function ViewerSettingsSheet({
  open, onOpenChange, fontSize, onFontSizeChange, theme, onThemeChange,
  workId, chapterId, loggedIn, onSubmitReport,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  theme: ViewerTheme;
  onThemeChange: (theme: ViewerTheme) => void;
  workId: string;
  chapterId: string;
  loggedIn: boolean;
  onSubmitReport: (input: { workId: string; chapterId: string | null; reasonCategory: string; detail: string | null }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const sizeIndex = FONT_SIZES.indexOf(fontSize as (typeof FONT_SIZES)[number]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader><SheetTitle>보기 설정</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">글자 크기</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" disabled={sizeIndex <= 0} onClick={() => onFontSizeChange(FONT_SIZES[sizeIndex - 1])}>가−</Button>
              <span className="w-12 text-center text-sm">{fontSize}px</span>
              <Button variant="outline" size="icon-sm" disabled={sizeIndex >= FONT_SIZES.length - 1} onClick={() => onFontSizeChange(FONT_SIZES[sizeIndex + 1])}>가+</Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">테마</span>
            <div className="flex items-center gap-1">
              {THEME_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={theme === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onThemeChange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <ReportDialog workId={workId} chapterId={chapterId} loggedIn={loggedIn} onSubmit={onSubmitReport} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
