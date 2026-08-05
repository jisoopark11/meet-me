import { verify } from "@/lib/token";
import { toKstFullLabel } from "@/lib/time";
import { SITE } from "@/config/availability";

export const dynamic = "force-dynamic";

/**
 * 수락 확인 페이지.
 * 메일 클라이언트나 보안 스캐너가 링크를 미리 열어보는 경우가 있어서,
 * GET으로 바로 등록하지 않고 버튼을 한 번 더 누르게 합니다.
 */
export default function AcceptPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";
  const payload = verify(token);

  if (!payload) {
    return (
      <main className="page narrow">
        <h1>링크가 유효하지 않습니다</h1>
        <p className="muted">만료되었거나 잘못된 주소입니다.</p>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <h1>이 약속을 수락할까요?</h1>
      <dl className="detail">
        <dt>일시</dt>
        <dd>
          {toKstFullLabel(new Date(payload.s))} ({SITE.durationLabel})
        </dd>
        <dt>이름</dt>
        <dd>{payload.n}</dd>
        <dt>메일</dt>
        <dd>{payload.e}</dd>
        {payload.c && (
          <>
            <dt>연락처</dt>
            <dd>{payload.c}</dd>
          </>
        )}
        <dt>용건</dt>
        <dd style={{ whiteSpace: "pre-wrap" }}>{payload.m}</dd>
      </dl>

      <form action="/api/accept" method="post">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="primary wide">
          수락하고 캘린더에 등록
        </button>
      </form>
      <p className="muted small">
        신청자에게 확정 안내 메일이 자동 발송됩니다.
      </p>
    </main>
  );
}
