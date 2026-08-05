"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Slot = { start: string; label: string };
type SlotsByDate = Record<string, Slot[]>;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 브라우저 로컬 시간과 무관하게 KST 기준으로 표시하기 위한 포매터 */
const kstParts = (iso: string) => {
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "full",
    timeStyle: "short",
  });
  return f.format(new Date(iso));
};

export default function BookingCalendar({ siteKey }: { siteKey: string }) {
  const [slots, setSlots] = useState<SlotsByDate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => startOfMonthKst(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/slots")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => setSlots(d.slots as SlotsByDate))
      .catch(() => setLoadError("빈 시간을 불러오지 못했습니다. 잠시 후 새로고침해 주세요."));
  }, []);

  const openDates = useMemo(() => new Set(Object.keys(slots ?? {})), [slots]);
  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);

  if (done) {
    return (
      <section className="card center">
        <h2>요청이 접수되었습니다</h2>
        <p className="muted">
          확인 후 확정 안내를 메일로 보내드리겠습니다.
          <br />
          접수 확인 메일이 방금 발송되었으니 받은편지함을 확인해 주세요.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="calendar-head">
        <button
          type="button"
          className="nav"
          onClick={() => setCursor(addMonths(cursor, -1))}
          disabled={isSameMonth(cursor, startOfMonthKst(new Date()))}
          aria-label="이전 달"
        >
          ‹
        </button>
        <strong>
          {cursor.getUTCFullYear()}년 {cursor.getUTCMonth() + 1}월
        </strong>
        <button
          type="button"
          className="nav"
          onClick={() => setCursor(addMonths(cursor, 1))}
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="weekdays">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>
            {w}
          </span>
        ))}
      </div>

      <div className="grid">
        {grid.map((cell, i) =>
          cell === null ? (
            <span key={`empty-${i}`} />
          ) : (
            <button
              key={cell.key}
              type="button"
              className={`day${cell.key === selectedDate ? " selected" : ""}`}
              disabled={!openDates.has(cell.key)}
              onClick={() => {
                setSelectedDate(cell.key);
                setSelectedSlot(null);
              }}
            >
              {cell.day}
              {openDates.has(cell.key) && <i className="dot" />}
            </button>
          )
        )}
      </div>

      {!slots && !loadError && <p className="muted small center">빈 시간을 불러오는 중…</p>}
      {loadError && <p className="error">{loadError}</p>}

      {selectedDate && (
        <div className="times">
          <h3>{formatDateKey(selectedDate)}</h3>
          <div className="time-list">
            {(slots?.[selectedDate] ?? []).map((s) => (
              <button
                key={s.start}
                type="button"
                className={`time${selectedSlot?.start === s.start ? " selected" : ""}`}
                onClick={() => setSelectedSlot(s)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSlot && (
        <RequestForm
          slot={selectedSlot}
          siteKey={siteKey}
          onDone={() => setDone(true)}
          onConflict={(msg) => {
            setLoadError(msg);
            setSelectedSlot(null);
            // 충돌이 났으면 최신 상태로 다시 불러옵니다.
            fetch("/api/slots")
              .then((r) => r.json())
              .then((d) => setSlots(d.slots as SlotsByDate))
              .catch(() => {});
          }}
        />
      )}
    </section>
  );
}

function RequestForm({
  slot,
  siteKey,
  onDone,
  onConflict,
}: {
  slot: Slot;
  siteKey: string;
  onDone: () => void;
  onConflict: (msg: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string>("");

  // Turnstile 위젯 로드 (사이트 키가 없으면 건너뜁니다 — 로컬 개발용)
  useEffect(() => {
    if (!siteKey || !captchaRef.current) return;
    const el = captchaRef.current;

    const render = () => {
      const ts = (window as any).turnstile;
      if (!ts || el.childElementCount > 0) return;
      ts.render(el, { sitekey: siteKey, callback: (t: string) => (tokenRef.current = t) });
    };

    if ((window as any).turnstile) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [siteKey]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: slot.start,
        name: fd.get("name"),
        email: fd.get("email"),
        contact: fd.get("contact"),
        message: fd.get("message"),
        turnstileToken: tokenRef.current,
      }),
    }).catch(() => null);

    setSubmitting(false);

    if (!res) return setError("네트워크 오류가 발생했습니다.");
    if (res.ok) return onDone();

    const data = await res.json().catch(() => ({ error: "요청에 실패했습니다." }));
    if (res.status === 409) return onConflict(data.error);
    setError(data.error ?? "요청에 실패했습니다.");
    // 캡차는 1회용이라 실패 후 다시 받아야 합니다.
    (window as any).turnstile?.reset();
  }

  return (
    <form className="form" onSubmit={submit}>
      <p className="chosen">{kstParts(slot.start)}</p>

      <label>
        이름 <span className="req">*</span>
        <input name="name" required maxLength={40} autoComplete="name" />
      </label>
      <label>
        메일 <span className="req">*</span>
        <input name="email" type="email" required maxLength={120} autoComplete="email" />
      </label>
      <label>
        연락처 <span className="opt">선택</span>
        <input name="contact" maxLength={80} placeholder="전화번호 또는 카카오톡 ID" />
      </label>
      <label>
        어떤 이야기를 나눌까요? <span className="req">*</span>
        <textarea name="message" required maxLength={500} rows={4} />
      </label>

      <div ref={captchaRef} className="captcha" />
      {error && <p className="error">{error}</p>}

      <button type="submit" className="primary wide" disabled={submitting}>
        {submitting ? "보내는 중…" : "약속 요청 보내기"}
      </button>
    </form>
  );
}

/* ── 달력 계산 (KST 기준) ─────────────────────────────────── */

function startOfMonthKst(d: Date): Date {
  const kstNow = new Date(d.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

type Cell = { key: string; day: number } | null;

function buildMonthGrid(monthStart: Date): Cell[] {
  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: Cell[] = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      key: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
    });
  }
  return cells;
}

function formatDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}
