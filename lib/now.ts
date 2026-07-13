/**
 * 렌더 중 Date.now() 직접 호출은 순수성 규칙에 어긋나므로,
 * 페이지 로드 시점의 타임스탬프를 한 번만 캡처해 재사용한다.
 * (복습 기한 비교 용도로는 이 정밀도면 충분하다)
 */
let sessionStart: number | null = null;

export function sessionNow(): number {
  if (sessionStart === null) sessionStart = Date.now();
  return sessionStart;
}
