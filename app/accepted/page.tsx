export const dynamic = "force-dynamic";

export default function AcceptedPage({
  searchParams,
}: {
  searchParams: { state?: string };
}) {
  const duplicate = searchParams.state === "duplicate";

  return (
    <main className="page narrow">
      <h1>{duplicate ? "이미 수락한 요청입니다" : "등록되었습니다"}</h1>
      <p className="muted">
        {duplicate
          ? "캘린더에 이미 있는 일정이라 중복 등록하지 않았습니다."
          : "캘린더에 일정이 추가되었고, 신청자에게 확정 안내 메일을 보냈습니다."}
      </p>
    </main>
  );
}
