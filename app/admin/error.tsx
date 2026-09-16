'use client';

import { Button } from '@/components/ui/button';

/** Generic load failure. Never renders the error message (may carry server details). */
export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4 py-8">
      <p>목록을 불러오지 못했습니다. 다시 시도해 주세요.</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => retry()}>
        다시 시도
      </Button>
    </div>
  );
}
