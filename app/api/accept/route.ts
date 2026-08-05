import { NextResponse } from "next/server";
import { verify, eventIdFor } from "@/lib/token";
import { insertEvent } from "@/lib/google";
import { sendMail, esc, layout, row } from "@/lib/mail";
import { toKstFullLabel, toRfc3339Kst } from "@/lib/time";
import { SLOT_MINUTES, SITE } from "@/config/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const token = String(form.get("token") ?? "");

    const payload = verify(token);
    if (!payload) {
      return NextResponse.json({ error: "링크가 유효하지 않거나 만료되었습니다." }, { status: 400 });
    }

    const start = new Date(payload.s);
    const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
    const when = toKstFullLabel(start);

    const result = await insertEvent({
      id: eventIdFor(token),
      summary: `약속 — ${payload.n}`,
      description: [
        `이름: ${payload.n}`,
        `메일: ${payload.e}`,
        payload.c ? `연락처: ${payload.c}` : null,
        "",
        "용건:",
        payload.m,
      ]
        .filter((l) => l !== null)
        .join("\n"),
      startRfc3339: toRfc3339Kst(start),
      endRfc3339: toRfc3339Kst(end),
    });

    // 이미 수락한 요청이면 확정 메일을 다시 보내지 않습니다.
    if (result === "created") {
      const kakao = process.env.KAKAO_OPENCHAT_URL;
      await sendMail({
        to: payload.e,
        replyTo: process.env.OWNER_EMAIL!,
        subject: `약속이 확정되었습니다 — ${when}`,
        html: layout(
          "약속이 확정되었습니다",
          `<p style="margin:0 0 20px;color:#44403c;font-size:14px;line-height:1.7;">
            ${esc(payload.n)}님, 아래 일정으로 확정되었습니다. 캘린더에 등록해 두세요.
          </p>
          <table style="border-collapse:collapse;margin-bottom:24px;">
            ${row("일시", `${when} (${SITE.durationLabel})`)}
            ${row("용건", payload.m)}
          </table>
          ${
            kakao
              ? `<a href="${esc(kakao)}" style="display:inline-block;background:#FEE500;color:#1c1917;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">카카오톡으로 이야기 나누기</a>
                 <p style="margin:20px 0 0;color:#78716c;font-size:13px;line-height:1.6;">
                   당일 변경이나 문의는 위 오픈채팅으로 남겨주시면 가장 빠릅니다.
                 </p>`
              : `<p style="margin:0;color:#78716c;font-size:13px;">변경이나 문의는 이 메일에 답장해 주세요.</p>`
          }`
        ),
      });
    }

    const url = new URL("/accepted", req.url);
    url.searchParams.set("state", result);
    return NextResponse.redirect(url, 303);
  } catch (err) {
    console.error("[accept]", err);
    return NextResponse.json({ error: "처리 중 문제가 발생했습니다." }, { status: 500 });
  }
}
