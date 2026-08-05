import { NextResponse } from "next/server";
import { isStillOpen } from "@/lib/slots";
import { sign } from "@/lib/token";
import { sendMail, esc, layout, row } from "@/lib/mail";
import { verifyTurnstile } from "@/lib/turnstile";
import { allow } from "@/lib/ratelimit";
import { toKstFullLabel } from "@/lib/time";
import { SITE } from "@/config/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = { name: 40, email: 120, contact: 80, message: 500 };

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!allow(ip)) {
      return NextResponse.json(
        { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const start = String(body.start ?? "");
    const name = String(body.name ?? "").trim().slice(0, MAX.name);
    const email = String(body.email ?? "").trim().slice(0, MAX.email);
    const contact = String(body.contact ?? "").trim().slice(0, MAX.contact);
    const message = String(body.message ?? "").trim().slice(0, MAX.message);
    const turnstileToken = body.turnstileToken as string | undefined;

    if (!name || !email || !message || !start) {
      return NextResponse.json({ error: "필수 항목을 모두 입력해 주세요." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "메일 주소 형식을 확인해 주세요." }, { status: 400 });
    }
    if (!(await verifyTurnstile(turnstileToken, ip))) {
      return NextResponse.json({ error: "봇 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요." }, { status: 400 });
    }
    // 클라이언트가 보낸 시각을 그대로 믿지 않고 서버에서 재검증
    if (!(await isStillOpen(start))) {
      return NextResponse.json(
        { error: "방금 다른 일정이 잡혔거나 예약할 수 없는 시간입니다. 다시 선택해 주세요." },
        { status: 409 }
      );
    }

    const token = sign({
      s: new Date(start).toISOString(),
      n: name,
      e: email,
      c: contact || undefined,
      m: message,
      iat: Math.floor(Date.now() / 1000),
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const acceptUrl = `${siteUrl}/accept?token=${encodeURIComponent(token)}`;
    const when = toKstFullLabel(new Date(start));

    // 1) 나에게 알림 + 수락 링크
    await sendMail({
      to: process.env.OWNER_EMAIL!,
      replyTo: email,
      subject: `[약속 요청] ${name} — ${when}`,
      html: layout(
        "새 약속 요청이 도착했습니다",
        `<table style="border-collapse:collapse;margin-bottom:24px;">
          ${row("일시", `${when} (${SITE.durationLabel})`)}
          ${row("이름", name)}
          ${row("메일", email)}
          ${contact ? row("연락처", contact) : ""}
          ${row("용건", message)}
        </table>
        <a href="${esc(acceptUrl)}" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">수락하고 캘린더에 등록</a>
        <p style="margin:20px 0 0;color:#78716c;font-size:13px;line-height:1.6;">
          수락을 누르면 캘린더에 일정이 등록되고, 신청자에게 확정 안내와 카카오톡 링크가 자동 발송됩니다.<br>
          거절하려면 이 메일에 그냥 답장하시면 신청자에게 바로 갑니다.
        </p>`
      ),
    });

    // 2) 신청자에게 접수 확인
    await sendMail({
      to: email,
      replyTo: process.env.OWNER_EMAIL!,
      subject: `약속 요청이 접수되었습니다 — ${when}`,
      html: layout(
        "요청이 접수되었습니다",
        `<p style="margin:0 0 20px;color:#44403c;font-size:14px;line-height:1.7;">
          ${esc(name)}님, 아래 내용으로 요청을 받았습니다.<br>
          확인 후 확정 안내를 다시 보내드리겠습니다. <strong>아직 확정된 것은 아닙니다.</strong>
        </p>
        <table style="border-collapse:collapse;">
          ${row("일시", `${when} (${SITE.durationLabel})`)}
          ${row("용건", message)}
        </table>`
      ),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[request]", err);
    return NextResponse.json({ error: "요청 처리 중 문제가 발생했습니다." }, { status: 500 });
  }
}
