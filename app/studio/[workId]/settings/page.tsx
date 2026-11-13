import type { ReactNode } from 'react';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getWork } from '@/lib/works/actions';
import { SerialStatusField } from '@/components/studio/serial-status-field';
import {
  updateWorkSerialStatusAction,
  type SerialStatus,
} from '@/app/studio/[workId]/settings/actions';

export interface StudioSettingsSectionContext {
  workId: string;
  serialStatus: SerialStatus;
}

export interface StudioSettingsSection {
  key: string;
  render: (context: StudioSettingsSectionContext) => ReactNode;
}

// 섹션 순서: 연재 상태 → 태그 → 댓글 허용
// - 21-02: 연재 상태 (SerialStatusField)
// - Phase 27: 태그 섹션 컴포넌트를 이 배열에 한 줄로 추가
// - Phase 29: 댓글 허용 섹션 컴포넌트를 이 배열에 한 줄로 추가
export const SETTINGS_SECTIONS: ReadonlyArray<StudioSettingsSection> = [
  {
    key: 'serial-status',
    render: ({ workId, serialStatus }) => (
      <SerialStatusField
        workId={workId}
        initialStatus={serialStatus}
        saveAction={updateWorkSerialStatusAction}
      />
    ),
  },
];

async function resolveWorkSerialStatus(
  supabase: SupabaseClient,
  work: { id: string; serial_status?: unknown },
  ownerId: string,
): Promise<SerialStatus> {
  if (work.serial_status === 'completed' || work.serial_status === 'ongoing') {
    return work.serial_status;
  }
  try {
    const fromFn = (supabase as unknown as { from?: SupabaseClient['from'] }).from;
    if (typeof fromFn !== 'function') return 'ongoing';
    const { data } = await supabase
      .from('works')
      .select('serial_status')
      .eq('id', work.id)
      .eq('owner_id', ownerId)
      .is('deleted_at', null)
      .maybeSingle();
    return data?.serial_status === 'completed' ? 'completed' : 'ongoing';
  } catch {
    return 'ongoing';
  }
}

const focusRingClass =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export default async function WorkSettingsPage({
  params,
  children,
}: {
  params: Promise<{ workId: string }>;
  children?: ReactNode;
}) {
  const { workId } = await params;
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const work = user ? await getWork(supabase, { ownerId: user.id, workId }) : null;
  if (!user || !work || (work.owner_id && work.owner_id !== user.id)) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold leading-[1.2]">작품을 찾을 수 없어요</h1>
        <Link
          href="/studio"
          className={`inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-primary underline ${focusRingClass}`}
        >
          ← 작품 목록
        </Link>
      </div>
    );
  }

  const serialStatus = await resolveWorkSerialStatus(
    supabase,
    work as { id: string; serial_status?: unknown },
    user.id,
  );

  return (
    <div className="flex w-full min-w-0 max-w-[960px] flex-col gap-6">
      <header className="min-w-0 space-y-2">
        <Link
          href={`/studio/${workId}`}
          className={`inline-flex min-h-11 items-center rounded-md text-xs font-normal text-muted-foreground underline hover:text-foreground ${focusRingClass}`}
        >
          ← 작품 홈
        </Link>
        <h1 className="text-lg font-semibold leading-[1.2]">작품 설정</h1>
      </header>

      <section
        aria-label="작품 기본 정보"
        className="min-w-0 space-y-2 rounded-xl border bg-card p-4"
      >
        <h2 className=" min-w-0 break-words text-sm font-semibold leading-[1.2]">
          {work.title}
        </h2>
        {work.synopsis && (
          <p className="min-w-0 break-words text-xs font-normal leading-[1.5] text-muted-foreground">
            {work.synopsis}
          </p>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        {SETTINGS_SECTIONS.map((section) => (
          <div key={section.key} className="min-w-0">
            {section.render({ workId, serialStatus })}
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}
