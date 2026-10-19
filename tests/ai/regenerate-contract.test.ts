import { describe, expect, it } from 'vitest';
import { buildRegeneratePayload, regenerateSchema } from '@/lib/ai/regenerate-contract';
import { KB_CATEGORIES } from '@/lib/kb/categories';

const base = {
  workId: '11111111-1111-4111-8111-111111111111',
  proposal: { category: KB_CATEGORIES[0], name: '문서', content: '본문' },
  templateId: '9f729765-f02c-42c0-9c17-3be486200003',
  targetFolderId: 'd4cc4c1a-f02c-42c0-9c17-3be486200001',
  folderVersion: 'root-v1', providerId: 'anthropic' as const, model: 'claude-sonnet-5', keySource: 'byok' as const,
  presetLevel: 'intermediate' as const, styleId: 'concise-hemingway' as const, genre: '판타지',
};

describe('document regeneration UI payload contract', () => {
  it('parses the modal payload with the server regenerate schema', () => {
    const payload = buildRegeneratePayload({ ...base, idempotencyKey: '22222222-2222-4222-8222-222222222222' });
    expect(regenerateSchema.safeParse(payload).success).toBe(true);
  });

  it('parses the explicitly consented service replacement payload', () => {
    const payload = buildRegeneratePayload({
      ...base, idempotencyKey: '22222222-2222-4222-8222-222222222222', replacementConsent: true,
      replacementSelection: { providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service' },
    });
    expect(regenerateSchema.safeParse(payload).success).toBe(true);
  });

  it.each([
    ['text', 'CUSTOM: 현재형'],
    ['4000 chars', 'a'.repeat(4000)],
    ['null', null],
  ])('04-09: preserves an optional customInstruction (%s)', (_label, customInstruction) => {
    const payload = buildRegeneratePayload({ ...base, idempotencyKey: '22222222-2222-4222-8222-222222222222', presetLevel: 'freeform', customInstruction });
    expect(payload.customInstruction).toBe(customInstruction);
    const parsed = regenerateSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.customInstruction).toBe(customInstruction);
  });

  it.each([
    ['4001 chars', 'a'.repeat(4001)],
    ['number', 7],
  ])('04-09: rejects customInstruction %s', (_label, customInstruction) => {
    const payload = { ...base, idempotencyKey: '22222222-2222-4222-8222-222222222222', customInstruction };
    expect(regenerateSchema.safeParse(payload).success).toBe(false);
  });

  it('04-09: strips a client-sent workSystemInstruction/ownerId', () => {
    const parsed = regenerateSchema.safeParse({ ...base, idempotencyKey: '22222222-2222-4222-8222-222222222222', workSystemInstruction: 'FORGED', ownerId: 'attacker' });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('workSystemInstruction');
    expect(parsed.data).not.toHaveProperty('ownerId');
  });
});
