import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/write-access', async () => ({
  ...(await vi.importActual<typeof import('@/lib/auth/write-access')>('@/lib/auth/write-access')),
  checkWriteAccess: async () => ({ ok: true }),
}));

import { publishChapter, VERIFICATION_REQUIRED_PAID_MESSAGE } from '../../lib/chapters/actions';

function fakeSupabase(updateError: { message: string } | null) {
  const owned = { eq: () => owned, is: () => owned, maybeSingle: async () => ({ data: { id: 'c1' } }) };
  return {
    from: () => ({
      select: () => owned,
      update: () => ({ eq: async () => ({ error: updateError }) }),
    }),
  } as never;
}

describe('publishChapter verification gate (0051)', () => {
  it('maps the DB gate error to a clear Korean message', async () => {
    const res = await publishChapter(fakeSupabase({ message: 'verification_required_for_paid' }), {
      ownerId: 'o', chapterId: 'c1', priceTier: 30,
    });
    expect(res).toEqual({ ok: false, error: VERIFICATION_REQUIRED_PAID_MESSAGE });
  });
});
