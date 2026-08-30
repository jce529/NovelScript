/** Korean-locale compact notation for large counts (feed/detail view+like counts).
 * e.g. formatKoreanCount(12000) -> "1.2만", formatKoreanCount(850) -> "850" */
export function formatKoreanCount(n: number): string {
  if (n < 10000) return String(n);
  const man = n / 10000;
  return `${man % 1 === 0 ? man.toFixed(0) : man.toFixed(1)}만`;
}
