'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreateNodeDialog, CreateTemplateDialog, type TemplateArea } from '@/components/studio/kb-node-dialogs';
import { KB_CATEGORIES } from '@/lib/kb/categories';

/** Sidebar entry points: 새 문서 (템플릿에서) picks a category and opens the 02-09 create dialog;
 * 템플릿 만들기 opens the 02-09 CreateTemplateDialog with both template areas. Server layout passes
 * only serializable props. */
export function TemplateSidebarEntry({ workId, areas }: { workId: string; areas: TemplateArea[] }) {
  const router = useRouter();
  const [step, setStep] = useState<'pick' | 'create-document' | 'create-template' | null>(null);
  const [category, setCategory] = useState<string>(KB_CATEGORIES[0]);

  return (
    <div className="flex flex-col gap-1 px-4 py-2">
      <Button variant="outline" size="sm" className="justify-start" onClick={() => setStep('pick')}>
        <FileText size={14} /> 새 문서 (템플릿에서)
      </Button>
      <Button
        variant="ghost" size="sm" className="justify-start"
        disabled={areas.every((area) => area.folders.length === 0)}
        onClick={() => setStep('create-template')}
      >
        <FilePlus size={14} /> 템플릿 만들기
      </Button>
      {step === 'pick' && (
        <Dialog open onOpenChange={(v) => !v && setStep(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>어떤 종류의 문서를 만들까요?</DialogTitle></DialogHeader>
            <div className="flex flex-wrap gap-2">
              {KB_CATEGORIES.map((name) => (
                <Button key={name} variant="outline" onClick={() => { setCategory(name); setStep('create-document'); }}>
                  {name}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {step === 'create-document' && (
        <CreateNodeDialog
          open onOpenChange={(v) => !v && setStep(null)} workId={workId} parentId={null} category={category}
          onCreated={(newId) => { router.refresh(); if (newId) router.push(`/studio/${workId}/kb/${newId}`); }}
        />
      )}
      {step === 'create-template' && (
        <CreateTemplateDialog
          open onOpenChange={(v) => !v && setStep(null)} workId={workId} areas={areas}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}
