/** Base UI `Select`는 제어 값이 프로그램으로 바뀐 뒤에도 같은 값으로 `onValueChange`를 한 번 더
 * 호출한다(`reason: 'none'`, 새 값 == 현재 값). 사용자의 실제 선택은 값이 바뀌므로, 값이
 * 달라졌을 때만 선택 변경으로 처리한다 — 그렇지 않으면 선택 변경 핸들러가 지우는 안내 배너가
 * 프로그램 갱신 직후에 함께 지워진다(Phase 15 BUG-08). */
export function isSelectionChange<T>(next: T, current: T): boolean {
  return next !== current;
}
