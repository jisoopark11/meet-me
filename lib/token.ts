import crypto from "node:crypto";

export type BookingPayload = {
  /** 슬롯 시작 시각 (ISO UTC) */
  s: string;
  /** 신청자 이름 */
  n: string;
  /** 신청자 메일 */
  e: string;
  /** 연락처 (선택) */
  c?: string;
  /** 용건 */
  m: string;
  /** 발급 시각 (epoch seconds) */
  iat: number;
};

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 수락 링크는 30일간 유효

function secret(): Buffer {
  const s = process.env.TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error("TOKEN_SECRET 환경변수가 없거나 너무 짧습니다 (32자 이상 권장).");
  }
  return Buffer.from(s, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** payload를 서명해 URL-safe 토큰으로 인코딩. DB 없이 상태를 링크에 담습니다. */
export function sign(payload: BookingPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const mac = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  return `${body}.${mac}`;
}

export function verify(token: string): BookingPayload | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const expected = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  // 타이밍 공격 방지를 위해 상수 시간 비교
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as BookingPayload;
    if (Math.floor(Date.now() / 1000) - payload.iat > MAX_AGE_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * 토큰으로부터 결정적인 Google Calendar 이벤트 ID를 만듭니다.
 * 수락 링크를 두 번 눌러도 같은 ID → Google이 409로 거절 → 중복 등록 없음.
 * (Calendar API의 ID 규칙: base32hex 문자셋 a-v, 0-9)
 */
export function eventIdFor(token: string): string {
  const hash = crypto.createHash("sha256").update(token).digest();
  const alphabet = "abcdefghijklmnopqrstuv0123456789";
  let id = "";
  for (const byte of hash.subarray(0, 20)) id += alphabet[byte % 32];
  return `meetme${id}`;
}
