import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const checkAdmin = vi.fn();
vi.mock('@/lib/admin/auth', () => ({ checkAdmin: (...a: unknown[]) => checkAdmin(...a) }));

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminMenuItem } from '../../components/layout/admin-menu-link';
import { getAdminMenuEligibilityAction } from '../../app/admin/menu-actions';

describe('getAdminMenuEligibilityAction', () => {
  beforeEach(() => checkAdmin.mockReset());

  it('allows active admins (reader and writer) and returns only a boolean', async () => {
    for (const isWriter of [false, true]) {
      checkAdmin.mockResolvedValueOnce({
        ok: true,
        actor: { userId: 'u1', isWriter },
        admin: { secret: 'client' },
      });
      const result = await getAdminMenuEligibilityAction();
      expect(result).toEqual({ allowed: true });
      expect(Object.keys(result)).toEqual(['allowed']);
    }
  });

  it('hides for anonymous, ordinary, revoked/deleted and lookup failure', async () => {
    for (const reason of ['unauthenticated', 'not_admin', 'unavailable']) {
      checkAdmin.mockResolvedValueOnce({ ok: false, reason });
      expect(await getAdminMenuEligibilityAction()).toEqual({ allowed: false });
    }
  });

  it('takes no input and calls checkAdmin with session defaults', async () => {
    checkAdmin.mockResolvedValueOnce({ ok: false, reason: 'not_admin' });
    expect(getAdminMenuEligibilityAction.length).toBe(0);
    await getAdminMenuEligibilityAction();
    expect(checkAdmin).toHaveBeenCalledWith();
  });
});

describe('AdminMenuItem', () => {
  it('renders the /admin link only when allowed', () => {
    const html = renderToStaticMarkup(createElement(AdminMenuItem, { allowed: true }));
    expect(html).toContain('href="/admin"');
    expect(html).toContain('관리자');
    expect(html).toContain('min-h-11');
  });

  it('renders nothing for false / pending state', () => {
    expect(renderToStaticMarkup(createElement(AdminMenuItem, { allowed: false }))).toBe('');
  });
});
