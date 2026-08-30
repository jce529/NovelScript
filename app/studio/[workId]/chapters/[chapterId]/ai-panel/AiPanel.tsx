'use client';

import { useState } from 'react';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Settings2 } from 'lucide-react';
import { GENRES } from '@/lib/works/genres';
import { STYLE_PRESETS, DEFAULT_STYLE_PRESET, type StylePresetId, type PresetLevel } from '@/lib/ai/prompt';
import type { ModelTier } from '@/lib/ai/gemini';

export interface MentionedNode {
  id: string;
  name: string;
  category: string;
}

export interface AiPanelProps {
  workId: string;
  chapterId: string;
  /** Current chapter textarea content — used as precedingText for cost estimate + generation. */
  content: string;
  /** Work's own genre (Phase 2 D-04) — D-07's default. null falls back to GENRES[0]. */
  defaultGenre: string | null;
  mentionedNodes: MentionedNode[];
  onRemoveMention: (id: string) => void;
  /** D-10 accept: caller (page.tsx, Plan 04-06) inserts `text` at the textarea's cursor. */
  onInsertText: (text: string) => void;
}

const PRESET_LEVEL_META: Record<PresetLevel, { label: string; description: string }> = {
  beginner: { label: '초보자', description: 'AI가 알아서 다음 전개에 맞는 지시를 구성해요. 설정 없이 바로 생성.' },
  intermediate: { label: '중급자', description: '표준 지시에 약간의 재량을 더해 생성해요.' },
  freeform: { label: '자유형', description: '직접 지시사항을 입력해 AI를 세밀하게 제어해요. 선택하면 아래 커스텀 지시사항 입력창이 열려요.' },
};

const PRESET_LEVELS: PresetLevel[] = ['beginner', 'intermediate', 'freeform'];
const STYLE_IDS = Object.keys(STYLE_PRESETS) as StylePresetId[];

export function AiPanel({ workId, chapterId, content, defaultGenre, mentionedNodes, onRemoveMention, onInsertText }: AiPanelProps) {
  const [modelTier, setModelTier] = useState<ModelTier>('lite');
  const [genre, setGenre] = useState<string>(defaultGenre ?? GENRES[0]);
  const [presetLevel, setPresetLevel] = useState<PresetLevel>('intermediate');
  const [customInstruction, setCustomInstruction] = useState('');
  const [styleId, setStyleId] = useState<StylePresetId>(DEFAULT_STYLE_PRESET);

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-6 rounded-lg border border-border bg-background p-6">
      <h2 className="text-xl font-semibold">AI 어시스턴트</h2>

      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs text-muted-foreground">AI 모델</label>
            <Select value={modelTier} onValueChange={(value) => setModelTier(value as ModelTier)}>
              <SelectTrigger className="w-full"><SelectValue>{(value: string) => (value === 'lite' ? '라이트' : '프로')}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="lite">라이트</SelectItem>
                <SelectItem value="pro">프로</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs text-muted-foreground">장르</label>
            <Select value={genre} onValueChange={(value) => setGenre(value ?? GENRES[0])}>
              <SelectTrigger className="w-full"><SelectValue>{(value: string) => value}</SelectValue></SelectTrigger>
              <SelectContent>
                {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button" variant="outline" size="icon"
                  aria-label="AI 지시 프리셋 설정"
                  title={`AI 지시 프리셋: ${PRESET_LEVEL_META[presetLevel].label}`}
                  className="size-8 shrink-0"
                >
                  <Settings2 className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>AI 지시 프리셋</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={presetLevel} onValueChange={(value) => setPresetLevel(value as PresetLevel)}>
                {PRESET_LEVELS.map((level) => (
                  <DropdownMenuRadioItem key={level} value={level} className="flex-col items-start gap-0.5">
                    <span className="font-medium">{PRESET_LEVEL_META[level].label}</span>
                    <span className="text-xs text-muted-foreground">{PRESET_LEVEL_META[level].description}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">문체 프리셋</label>
          <Select value={styleId} onValueChange={(value) => setStyleId(value as StylePresetId)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {() => (
                  <span className="flex flex-col items-start text-left">
                    <span>{STYLE_PRESETS[styleId].name}</span>
                    <span className="text-xs text-muted-foreground">{STYLE_PRESETS[styleId].description}</span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STYLE_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  <span className="flex flex-col items-start">
                    <span>{STYLE_PRESETS[id].name}</span>
                    <span className="text-xs text-muted-foreground">{STYLE_PRESETS[id].description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {presetLevel === 'freeform' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">커스텀 지시사항</label>
            <Textarea
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="원하는 스타일이나 요청사항을 입력하세요."
              className="min-h-24 text-sm"
            />
          </div>
        )}
      </div>

      {/* Task 3 adds: mentioned-documents chip list, cost estimate, generate button, GenerationPreview */}
    </aside>
  );
}
