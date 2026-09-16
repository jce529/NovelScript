import { requireAdminPage } from '@/lib/admin/auth';
import { SiteHeader } from '@/components/layout/site-header';

/**
 * Admin shell. Non-administrators get the standard 404 (D-03). This check is only the
 * first gate: every page loader and every Server Action re-authorizes on its own.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-6">{children}</main>
    </div>
  );
}
