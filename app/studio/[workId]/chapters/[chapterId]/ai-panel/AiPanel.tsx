'use client';

import { useEffect, useState } from 'react';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { GENRES } from '@/lib/works/genres';
import { STYLE_PRESETS, DEFAULT_STYLE_PRESET, type StylePresetId, type PresetLevel } from '@/lib/ai/prompt';
import type { ModelTier } from '@/lib/ai/gemini';
import { estimateCostAction, generateAction } from '../actions';
import { GenerationPreview } from './GenerationPreview';

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
  const [estimatedTokens, setEstimatedTokens] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [preview, setPreview] = useState<{ text: string; wasCapped: boolean } | null>(null);

  const mentionedNodeIds = mentionedNodes.map((n) => n.id);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const result = await estimateCostAction({
        workId, modelTier, mentionedNodeIds, presetLevel,
        customInstruction: presetLevel === 'freeform' ? customInstruction : null,
        styleId, genre, precedingText: content,
      });
      if (result.ok) setEstimatedTokens(result.estimatedTokens ?? null);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, modelTier, genre, presetLevel, customInstruction, styleId, JSON.stringify(mentionedNodeIds), content]);

  async function runGenerate(regenerationFeedback?: string) {
    setIsGenerating(true);
    const result = await generateAction({
      workId, chapterId, modelTier, mentionedNodeIds, presetLevel,
      customInstruction: presetLevel === 'freeform' ? customInstruction : null,
      styleId, genre, precedingText: content, regenerationFeedback: regenerationFeedback ?? null,
    });
    setIsGenerating(false);

    if (!result.ok) {
      toast.error(result.error ?? '생성하지 못했어요. 잠시 후 다시 시도해주세요.');
      setPreview(null);
      return;
    }

    setPreview({ text: result.text ?? '', wasCapped: Boolean(result.wasCapped) });
    if (result.wasCapped) {
      toast('보유 토큰을 모두 사용해서 여기까지만 생성됐어요.');
    }
  }

  function handleAccept() {
    if (!preview) return;
    onInsertText(preview.text);
    setPreview(null);
  }

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

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">멘션된 문서</span>
        {mentionedNodes.length === 0 ? (
          <p className="text-xs text-muted-foreground">@ 를 입력해 KB 문서를 멘션해보세요.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {mentionedNodes.map((node) => (
              <Badge key={node.id} variant="secondary" className="gap-1">
                {node.name}
                <button type="button" aria-label={`${node.name} 멘션 해제`} onClick={() => onRemoveMention(node.id)}>
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-xs text-muted-foreground">예상 토큰</span>
        <span>{estimatedTokens === null ? '—' : `약 ${estimatedTokens.toLocaleString('ko-KR')} 토큰`}</span>
      </div>

      <Button
        type="button"
        variant={preview ? 'outline' : 'default'}
        disabled={isGenerating}
        onClick={() => runGenerate()}
        className="w-full"
      >
        생성하기
      </Button>

      {preview && (
        <GenerationPreview
          text={preview.text}
          wasCapped={preview.wasCapped}
          isRegenerating={isGenerating}
          onAccept={handleAccept}
          onRegenerate={(feedback) => runGenerate(feedback)}
          onReject={() => setPreview(null)}
        />
      )}
    </aside>
  );
}
