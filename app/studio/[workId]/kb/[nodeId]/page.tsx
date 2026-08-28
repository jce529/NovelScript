'use client';

import { useState, useTransition, useEffect, use } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { saveNodeContentAction, getNodeContentAction } from './actions';

export default function KbNodeEditorPage({
  params,
}: {
  params: Promise<{ workId: string; nodeId: string }>;
}) {
  const { workId, nodeId } = use(params);
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLoaded(false);
    getNodeContentAction(nodeId).then((result) => {
      if (result.ok) setContent(result.content);
      setLoaded(true);
    });
  }, [nodeId]);

  return (
    <div className="flex flex-col gap-4">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={!loaded}
        className="min-h-[60vh] font-mono text-sm leading-[1.7]"
      />
      <Button
        className="w-fit"
        disabled={isPending || !loaded}
        onClick={() => startTransition(async () => {
          const result = await saveNodeContentAction(workId, nodeId, content);
          if (result.ok) toast.success('저장했어요.');
          else toast.error(result.error ?? '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
        })}
      >
        문서 저장
      </Button>
    </div>
  );
}
