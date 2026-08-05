/**
 * 아주 단순한 인메모리 레이트 리밋.
 * 서버리스에서는 인스턴스마다 별도로 동작하므로 완벽하지 않습니다.
 * 실질적인 봇 차단은 Turnstile이 담당하고, 이건 보조 수단입니다.
 */
const hits = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000; // 1시간
const MAX_PER_WINDOW = 5;

export function allow(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
