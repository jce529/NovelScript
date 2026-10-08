import { z } from 'zod';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import type { KeySource } from '@/lib/ai/providers/selection';
import type { ProviderId } from '@/lib/ai/providers/types';
import type { PresetLevel, StylePresetId } from '@/lib/ai/prompt';

const proposalSchema = z.object({
  category: z.enum(KB_CATEGORIES), name: z.string().trim().min(1).max(100), content: z.string().max(20000),
  recommendedFolderId: z.string().uuid().optional(), recommendedFolderPath: z.string().max(500).optional(),
  recommendedFolderVersion: z.string().max(4000).optional(), recommendedTemplateId: z.string().uuid().nullable().optional(),
  recommendedTemplateName: z.string().max(200).optional(),
});

export const regenerateSchema = z.object({
  workId: z.string().uuid(), proposal: proposalSchema, templateId: z.string().uuid().nullable(),
  targetFolderId: z.string().uuid(), folderVersion: z.string().max(4000).optional(),
  providerId: z.enum(['gemini', 'openai', 'anthropic']), model: z.string(), keySource: z.enum(['service', 'byok']), idempotencyKey: z.string().uuid(),
  replacementConsent: z.boolean().optional().default(false),
  replacementSelection: z.object({ providerId: z.enum(['gemini', 'openai', 'anthropic']), model: z.string(), keySource: z.literal('service') }).optional(),
  presetLevel: z.enum(['beginner', 'intermediate', 'freeform']),
  styleId: z.enum(['concise-hemingway', 'maximalist-dostoevsky', 'lyrical-kimhoon', 'colloquial-kimyounha']),
  genre: z.string().max(100),
});

export type RegeneratePayload = {
  workId: string; proposal: z.infer<typeof proposalSchema>; templateId: string | null; targetFolderId: string;
  folderVersion?: string; providerId: ProviderId; model: string; keySource: KeySource; idempotencyKey: string;
  presetLevel: PresetLevel; styleId: StylePresetId; genre: string;
  replacementConsent?: true;
  replacementSelection?: { providerId: ProviderId; model: string; keySource: 'service' };
};

export function buildRegeneratePayload(payload: RegeneratePayload) { return { ...payload }; }
