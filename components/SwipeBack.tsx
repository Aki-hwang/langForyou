"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * 오른쪽으로 스와이프하면 이전 화면으로 이동한다 (모바일 뒤로가기 제스처).
 * - 명확한 가로 방향 스와이프만 인식(세로 스크롤과 충돌 방지)
 * - 홈("/")에서는 뒤로 갈 곳이 없으므로 무시
 */
export default function SwipeBack() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = e.timeStamp;
      tracking = true;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = e.timeStamp - startT;

      const rightward = dx > 90; // 충분히 오른쪽으로
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.8; // 가로 우세
      const quick = dt < 800; // 너무 느린 드래그 제외

      if (rightward && horizontal && quick) {
        if (pathname !== "/" && window.history.length > 1) {
          router.back();
        }
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [router, pathname]);

  return null;
}
