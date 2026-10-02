import { describe, expect, it } from 'vitest';
import { documentNameFromFile, isAcceptedTextFile } from '@/lib/ai/attachments';
import { planCategoryOnly } from '@/lib/ai/decision/plan';
import type { DecisionClient } from '@/lib/ai/decision/types';

const clientReturning = (key: string, confidence: number): DecisionClient => ({
  provider: 'jev',
  decide: async () => ({ key, confidence, probabilities: {}, latencyMs: 1, modelVersion: 't' }),
});

describe('upload helpers', () => {
  it('accepts only text/markdown files', () => {
    expect(isAcceptedTextFile('a.MD')).toBe(true);
    expect(isAcceptedTextFile('a.txt')).toBe(true);
    expect(isAcceptedTextFile('a.docx')).toBe(false);
  });
  it('derives a document name without path or extension', () => {
    expect(documentNameFromFile('인물/아서.md')).toBe('아서');
    expect(documentNameFromFile(String.raw`C:\x\y.txt`)).toBe('y');
  });
});

describe('planCategoryOnly', () => {
  it('returns the category when confident', async () => {
    const plan = await planCategoryOnly(clientReturning('인물', 0.99), {});
    expect(plan).toMatchObject({ kind: 'category', category: '인물' });
  });
  it('clarifies on the clarify key', async () => {
    expect((await planCategoryOnly(clientReturning('clarify', 0.99), {})).kind).toBe('clarify');
  });
});
