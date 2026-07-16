/**
 * 인메모리 고정 윈도우 rate limiter.
 * 단일 인스턴스(Railway) 배포 기준 — 인스턴스가 여러 개면 IP별 한도가
 * 인스턴스 수만큼 늘어나지만, 무차별 대입 방어 목적으로는 충분하다.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/** key에 대한 요청 1건을 기록하고, 한도 이내면 true를 반환 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

/** 프록시(Railway 등) 뒤에서 클라이언트 IP 추출 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
