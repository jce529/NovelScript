'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen } from 'lucide-react';

export function ChaptersNavLink({ workId }: { workId: string }) {
  const pathname = usePathname();
  const isActive = pathname?.startsWith(`/studio/${workId}/chapters`) ?? false;

  return (
    <Link
      href={`/studio/${workId}/chapters`}
      className={`flex items-center gap-1 h-8 px-2 text-sm border-b ${
        isActive ? 'text-primary font-medium border-l-2 border-primary pl-1' : ''
      }`}
    >
      <BookOpen size={16} className={isActive ? 'text-primary' : undefined} />
      <span>회차</span>
    </Link>
  );
}
