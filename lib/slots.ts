import {
  WEEKLY_WINDOWS,
  SLOT_MINUTES,
  SLOT_STEP_MINUTES,
  BUFFER_MINUTES,
  MIN_NOTICE_HOURS,
  HORIZON_DAYS,
  BLOCKED_DATES,
} from "@/config/availability";
import { fetchBusy, type BusyInterval } from "./google";
import { kst, toKstParts, toKstDateKey, toKstTimeLabel } from "./time";

const MS_MIN = 60_000;

export type Slot = { start: string; label: string }; // start = ISO(UTC)
export type SlotsByDate = Record<string, Slot[]>;    // "2026-08-07" → 슬롯 목록

/** 예약 가능한 모든 슬롯을 날짜별로 묶어서 반환 */
export async function getOpenSlots(): Promise<SlotsByDate> {
  const now = new Date();
  const rangeStart = new Date(now.getTime() + MIN_NOTICE_HOURS * 60 * MS_MIN);
  const rangeEnd = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * MS_MIN);

  // 버퍼 계산 때문에 앞뒤로 조금 넓게 조회
  const busy = await fetchBusy(
    new Date(rangeStart.getTime() - 12 * 60 * MS_MIN),
    new Date(rangeEnd.getTime() + 12 * 60 * MS_MIN)
  );

  const result: SlotsByDate = {};

  for (const candidate of generateCandidates(rangeStart, rangeEnd)) {
    if (isBlocked(candidate, busy)) continue;
    const key = toKstDateKey(candidate);
    (result[key] ??= []).push({
      start: candidate.toISOString(),
      label: toKstTimeLabel(candidate),
    });
  }

  return result;
}

/** 설정된 요일/시간대에서 후보 슬롯을 순서대로 생성 */
function* generateCandidates(from: Date, to: Date): Generator<Date> {
  const cursor = toKstParts(from);
  let day = kst(cursor.year, cursor.month, cursor.day);

  while (day <= to) {
    const p = toKstParts(day);
    const dateKey = toKstDateKey(day);
    const windows = WEEKLY_WINDOWS[p.weekday] ?? [];

    if (!BLOCKED_DATES.includes(dateKey)) {
      for (const [startHour, endHour] of windows) {
        const windowStart = kst(p.year, p.month, p.day, startHour);
        const windowEnd = kst(p.year, p.month, p.day, endHour);

        for (
          let t = windowStart.getTime();
          t + SLOT_MINUTES * MS_MIN <= windowEnd.getTime();
          t += SLOT_STEP_MINUTES * MS_MIN
        ) {
          const slot = new Date(t);
          if (slot >= from && slot <= to) yield slot;
        }
      }
    }

    day = new Date(day.getTime() + 24 * 60 * MS_MIN);
  }
}

/** 기존 일정과 (버퍼 포함) 겹치면 true */
function isBlocked(slotStart: Date, busy: BusyInterval[]): boolean {
  const start = slotStart.getTime() - BUFFER_MINUTES * MS_MIN;
  const end = slotStart.getTime() + (SLOT_MINUTES + BUFFER_MINUTES) * MS_MIN;
  return busy.some((b) => b.start.getTime() < end && b.end.getTime() > start);
}

/**
 * 요청받은 시각이 지금도 진짜 예약 가능한지 서버에서 다시 확인.
 * 클라이언트가 보낸 값을 믿으면 안 되고, 조회~신청 사이에 일정이 생겼을 수도 있습니다.
 */
export async function isStillOpen(startIso: string): Promise<boolean> {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return false;

  const slots = await getOpenSlots();
  const key = toKstDateKey(start);
  return (slots[key] ?? []).some((s) => s.start === start.toISOString());
}
