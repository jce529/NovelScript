import type { ReactNode } from 'react';
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

