import { NextResponse } from "next/server";
import { getOpenSlots } from "@/lib/slots";
import { SITE } from "@/config/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const slots = await getOpenSlots();
    return NextResponse.json(
      { slots, duration: SITE.durationLabel },
      // 5분 캐시 — 캘린더 API 호출을 줄여 무료 한도 안에서 안전하게 운영
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (err) {
    console.error("[slots]", err);
    return NextResponse.json({ error: "빈 시간을 불러오지 못했습니다." }, { status: 500 });
  }
}
