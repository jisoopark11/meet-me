import { TZ_OFFSET_HOURS } from "@/config/availability";

const MS_HOUR = 3600_000;

/** KST의 "벽시계 시각"을 실제 UTC Date로 변환.
 *  한국은 DST가 없어 고정 오프셋으로 안전하게 계산됩니다. */
export function kst(
  y: number,
  m: number, // 1-12
  d: number,
  hh = 0,
  mm = 0
): Date {
  return new Date(Date.UTC(y, m - 1, d, hh - TZ_OFFSET_HOURS, mm, 0, 0));
}

/** Date → KST 기준 연/월/일/시/분/요일 */
export function toKstParts(date: Date) {
  const shifted = new Date(date.getTime() + TZ_OFFSET_HOURS * MS_HOUR);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Date → "2026-08-07" (KST 기준) */
export function toKstDateKey(date: Date): string {
  const p = toKstParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Date → "19:00" (KST 기준) */
export function toKstTimeLabel(date: Date): string {
  const p = toKstParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Date → "2026년 8월 7일 (금) 오후 7:00" */
export function toKstFullLabel(date: Date): string {
  const p = toKstParts(date);
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  const ampm = p.hour < 12 ? "오전" : "오후";
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${p.year}년 ${p.month}월 ${p.day}일 (${names[p.weekday]}) ${ampm} ${h12}:${pad(p.minute)}`;
}

/** RFC3339 with KST offset — Google Calendar에 넘길 때 사용 */
export function toRfc3339Kst(date: Date): string {
  const p = toKstParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00+09:00`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}
