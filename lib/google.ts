import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

let cached: JWT | null = null;

function client(): JWT {
  if (cached) return cached;

  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY 환경변수가 설정되지 않았습니다."
    );
  }

  // Vercel 등에서는 개행이 리터럴 \n 으로 저장됩니다.
  const key = rawKey.replace(/\\n/g, "\n");

  cached = new JWT({ email, key, scopes: SCOPES });
  return cached;
}

async function authedFetch(url: string, init: RequestInit = {}) {
  const headers = await client().getRequestHeaders(url);
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  return res;
}

export type BusyInterval = { start: Date; end: Date };

/**
 * FreeBusy API — 일정의 제목·참석자·설명은 응답에 아예 포함되지 않습니다.
 * 바쁜 구간의 시작/끝만 돌아오므로 구조적으로 정보가 새지 않습니다.
 */
export async function fetchBusy(timeMin: Date, timeMax: Date): Promise<BusyInterval[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID 환경변수가 없습니다.");

  const res = await authedFetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: "Asia/Seoul",
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    throw new Error(`FreeBusy 조회 실패 (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown }>;
  };

  const entry = data.calendars?.[calendarId];
  if (!entry || entry.errors) {
    throw new Error(
      `캘린더에 접근할 수 없습니다. 서비스 계정에 캘린더를 공유했는지 확인하세요. ${JSON.stringify(entry?.errors)}`
    );
  }

  return (entry.busy ?? []).map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));
}

export type NewEvent = {
  /** 중복 등록 방지용 결정적 ID */
  id: string;
  summary: string;
  description: string;
  startRfc3339: string;
  endRfc3339: string;
};

/** @returns 'created' | 'duplicate' — duplicate는 이미 수락된 요청 */
export async function insertEvent(ev: NewEvent): Promise<"created" | "duplicate"> {
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!);

  const res = await authedFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        id: ev.id,
        summary: ev.summary,
        description: ev.description,
        start: { dateTime: ev.startRfc3339, timeZone: "Asia/Seoul" },
        end: { dateTime: ev.endRfc3339, timeZone: "Asia/Seoul" },
        // 주의: 서비스 계정은 도메인 전체 위임 없이 attendees를 추가할 수 없습니다.
        // 신청자 정보는 description에 넣고, 안내는 Resend 메일로 보냅니다.
      }),
    }
  );

  // 같은 id가 이미 있으면 409 — 수락 링크를 두 번 눌러도 중복 등록되지 않습니다.
  if (res.status === 409) return "duplicate";
  if (!res.ok) throw new Error(`일정 등록 실패 (${res.status}): ${await res.text()}`);
  return "created";
}
