'use client';

import type { ReactElement } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ReportDialog } from '@/components/reader/report-dialog';
import {
  FONT_SIZES,
  LINE_HEIGHTS,
  PADDINGS,
  serializeViewerPreferences,
  type ViewerPreferences,
} from '@/lib/reader/viewer-preferences';

type ReportInput = { workId: string; chapterId: string | null; reasonCategory: string; detail: string | null };
type ReportResult = Promise<{ ok: boolean; error?: string }>;

const FONT_OPTIONS: { value: ViewerPreferences['font']; label: string }[] = [
  { value: 'gothic', label: '고딕' },
  { value: 'serif', label: '명조' },
];
const MODE_OPTIONS: { value: ViewerPreferences['mode']; label: string }[] = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'system', label: '시스템' },
];
const PADDING_LABEL: Record<number, string> = { 16: '좁게', 24: '보통', 32: '넓게' };
const LH_LABEL: Record<number, string> = { 1.6: '좁게', 1.9: '보통', 2.2: '넓게' };

/** Persists via the whitelisted cookie codec (client-side, non-sensitive). */
export function persistViewerPreferences(preferences: ViewerPreferences) {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  document.cookie = serializeViewerPreferences(preferences, { secure });
}

function Segmented<T extends string | number>({
  label, options, value, onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onSelect: (next: T) => void;
}) {
  return (
    <div className="flex items-center justify-between" role="group" aria-label={label}>
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1">
        {options.map((o) => (
          <Button
            key={String(o.value)}
            type="button"
            variant={value === o.value ? 'default' : 'outline'}
            size="sm"
            aria-pressed={value === o.value}
            onClick={() => onSelect(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Stepper<T extends number>({
  label, steps, value, format, onSelect,
}: {
  label: string;
  steps: readonly T[];
  value: T;
  format: (v: T) => string;
  onSelect: (next: T) => void;
}) {
  const i = steps.indexOf(value);
  return (
    <div className="flex items-center justify-between" role="group" aria-label={label}>
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon-sm" aria-label={`${label} 줄이기`} disabled={i <= 0} onClick={() => onSelect(steps[i - 1])}>−</Button>
        <span className="w-12 text-center text-sm">{format(value)}</span>
        <Button type="button" variant="outline" size="icon-sm" aria-label={`${label} 늘리기`} disabled={i >= steps.length - 1} onClick={() => onSelect(steps[i + 1])}>+</Button>
      </div>
    </div>
  );
}

export function ViewerSettingsPanel({
  preferences, onPreferencesChange, workId, chapterId, loggedIn, onSubmitReport,
}: {
  preferences: ViewerPreferences;
  onPreferencesChange: (next: ViewerPreferences) => void;
  workId: string;
  chapterId: string;
  loggedIn: boolean;
  onSubmitReport: (input: ReportInput) => ReportResult;
}) {
  const update = (patch: Partial<ViewerPreferences>) => {
    const next = { ...preferences, ...patch };
    persistViewerPreferences(next);
    onPreferencesChange(next);
  };
  return (
    <div className="flex flex-col gap-3" data-viewer-settings="">
      <Segmented label="글꼴" options={FONT_OPTIONS} value={preferences.font} onSelect={(font) => update({ font })} />
      <Segmented label="뷰어 모드" options={MODE_OPTIONS} value={preferences.mode} onSelect={(mode) => update({ mode })} />
      <Stepper label="글자 크기" steps={FONT_SIZES} value={preferences.fontSize} format={(v) => `${v}px`} onSelect={(fontSize) => update({ fontSize })} />
      <Stepper label="여백" steps={PADDINGS} value={preferences.padding} format={(v) => PADDING_LABEL[v]} onSelect={(padding) => update({ padding })} />
      <Stepper label="줄간격" steps={LINE_HEIGHTS} value={preferences.lineHeight} format={(v) => LH_LABEL[v]} onSelect={(lineHeight) => update({ lineHeight })} />
      <ReportDialog workId={workId} chapterId={chapterId} loggedIn={loggedIn} onSubmit={onSubmitReport} />
    </div>
  );
}

export function ViewerSettingsPopover({
  open, onOpenChange, preferences, onPreferencesChange, trigger,
  workId, chapterId, loggedIn, onSubmitReport,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  preferences: ViewerPreferences;
  onPreferencesChange: (next: ViewerPreferences) => void;
  /** Rendered as the popover trigger (composed into the top toolbar). */
  trigger: ReactElement<Record<string, unknown>>;
  workId: string;
  chapterId: string;
  loggedIn: boolean;
  onSubmitReport: (input: ReportInput) => ReportResult;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="end" className="w-80 gap-3 p-4">
        <PopoverTitle>보기 설정</PopoverTitle>
        <ViewerSettingsPanel
          preferences={preferences}
          onPreferencesChange={onPreferencesChange}
          workId={workId}
          chapterId={chapterId}
          loggedIn={loggedIn}
          onSubmitReport={onSubmitReport}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ---- Legacy adapter: kept until 03-16 switches viewer-shell to the popover. ---- */
type LegacyTheme = 'light' | 'sepia' | 'dark';
const LEGACY_THEMES: { value: LegacyTheme; label: string }[] = [
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
  theme: LegacyTheme;
  onThemeChange: (theme: LegacyTheme) => void;
  workId: string;
  chapterId: string;
  loggedIn: boolean;
  onSubmitReport: (input: ReportInput) => ReportResult;
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
              {LEGACY_THEMES.map((option) => (
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
