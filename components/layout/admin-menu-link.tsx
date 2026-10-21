'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminMenuEligibilityAction } from '@/app/admin/menu-actions';

/** Pure presentation: the link exists only when eligibility is explicitly true. */
export function AdminMenuItem({ allowed }: { allowed: boolean }) {
  if (!allowed) return null;
  return (
    <Link
      href="/admin"
      className="flex min-h-11 items-center justify-center rounded-lg border text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      관리자
    </Link>
  );
}

/**
 * Mounted inside the profile Popover content, so it re-reads eligibility each time the
 * popover opens. Pending, false and error all render nothing. The flag only controls
 * display; /admin pages and actions keep their own fresh guard.
 */
export function AdminMenuLink() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    getAdminMenuEligibilityAction()
      .then((result) => {
        if (active) setAllowed(result.allowed === true);
      })
      .catch(() => {
        if (active) setAllowed(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return <AdminMenuItem allowed={allowed} />;
}
