import type { ModelTier } from './types';

/** D-06: Gemini-family only, never a multi-vendor picker. gemini-2.5-flash/pro
 * were retired for new API keys (404 "no longer available to new users") after
 * 04-RESEARCH.md was written, so both tiers now map to gemini-3.5-flash — the
 * cheapest GA (non-preview) model that still works on a free-tier key. 프로
 * should move to gemini-3.1-pro-preview once billing is enabled on the project
 * (same key, no new key needed) — it 404s on a fresh key without billing and
 * 429s (quota) on the free tier even once reachable. */
export const MODEL_TIER_TO_ID: Record<ModelTier, string> = {
  lite: 'gemini-3.5-flash',
  pro: 'gemini-3.5-flash',
};
