'use client';

import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { PresetLevel } from '@/lib/ai/prompt';
import { CUSTOM_INSTRUCTION_MAX_LENGTH } from '@/lib/ai/regenerate-contract';

/** All three levels are the SAME chat-driven generation — they differ only in which
 * system-prompt instruction is active. */
export const PRESET_LEVEL_META: Record<PresetLevel, { label: string; description: string }> = {
  beginner: { label: '초보자', description: 'AI가 알아서 다음 전개를 판단해요. 별다른 지시 없이 대화를 시작해보세요.' },
  intermediate: { label: '중급자', description: '표준 지시에 약간의 재량을 더해 대화를 이어가요.' },
  freeform: { label: '자유형', description: '정해진 지시 없이, 대화 내용을 최우선으로 반영해요.' },
};

export const PRESET_LEVELS: PresetLevel[] = ['beginner', 'intermediate', 'freeform'];

export const CUSTOM_INSTRUCTION_LABEL = '커스텀 지시사항';
export const CUSTOM_INSTRUCTION_PLACEHOLDER = '원하는 스타일이나 요청사항을 입력하세요.';
export const SYSTEM_INSTRUCTION_BUTTON_LABEL = '작품 시스템 지시 설정';
export const SYSTEM_INSTRUCTION_BEGINNER_HINT = '초보자형에서는 작품 시스템 지시를 편집할 수 없어요.';
const BEGINNER_HINT_ID = 'ai-system-instruction-disabled-hint';

/** 04-10: the freeform instruction goes into a send payload only for a non-blank freeform input.
 * The text itself is kept across preset switches (state), only the payload drops it. */
export function customInstructionForPayload(presetLevel: PresetLevel, value: string): string | null {
  return presetLevel === 'freeform' && value.trim() ? value : null;
}

function isPresetLevel(value: unknown): value is PresetLevel {
  return typeof value === 'string' && (PRESET_LEVELS as string[]).includes(value);
}

export interface AiInstructionControlsProps {
  presetLevel: PresetLevel;
  onPresetChange: (level: PresetLevel) => void;
  customInstruction: string;
  onCustomInstructionChange: (value: string) => void;
  onOpenSystemInstruction: () => void;
  disabled?: boolean;
}

export function AiInstructionControls({
  presetLevel, onPresetChange, customInstruction, onCustomInstructionChange, onOpenSystemInstruction, disabled = false,
}: AiInstructionControlsProps) {
  const isBeginner = presetLevel === 'beginner';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="ai-preset-select" className="text-xs text-muted-foreground">AI 지시 프리셋</label>
          <Select value={presetLevel} onValueChange={(value) => { if (isPresetLevel(value)) onPresetChange(value); }}>
            <SelectTrigger id="ai-preset-select" className="w-full">
              <SelectValue>
                {() => (
                  <span className="flex flex-col items-start text-left">
                    <span>{PRESET_LEVEL_META[presetLevel].label}</span>
                    <span className="text-xs text-muted-foreground">{PRESET_LEVEL_META[presetLevel].description}</span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRESET_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{PRESET_LEVEL_META[level].label}</span>
                    <span className="text-xs text-muted-foreground">{PRESET_LEVEL_META[level].description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button" variant="outline" size="icon"
          aria-label={SYSTEM_INSTRUCTION_BUTTON_LABEL}
          title={isBeginner ? SYSTEM_INSTRUCTION_BEGINNER_HINT : SYSTEM_INSTRUCTION_BUTTON_LABEL}
          aria-describedby={isBeginner ? BEGINNER_HINT_ID : undefined}
          disabled={isBeginner || disabled}
          onClick={onOpenSystemInstruction}
          className="size-8 shrink-0"
        >
          <Settings2 className="size-4" />
        </Button>
      </div>
      {isBeginner && <p id={BEGINNER_HINT_ID} className="text-xs text-muted-foreground">{SYSTEM_INSTRUCTION_BEGINNER_HINT}</p>}
      {presetLevel === 'freeform' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-custom-instruction" className="text-xs text-muted-foreground">{CUSTOM_INSTRUCTION_LABEL}</label>
          <Textarea
            id="ai-custom-instruction"
            value={customInstruction}
            maxLength={CUSTOM_INSTRUCTION_MAX_LENGTH}
            placeholder={CUSTOM_INSTRUCTION_PLACEHOLDER}
            onChange={(event) => onCustomInstructionChange(event.target.value)}
            rows={3}
          />
        </div>
      )}
    </div>
  );
}
