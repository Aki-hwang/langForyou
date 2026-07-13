"use client";

/**
 * Screen Wake Lock — 재생 중 화면이 자동으로 꺼지지 않도록 유지한다.
 * (iOS 16.4+/최신 안드로이드 크롬 지원. 미지원 브라우저에서는 조용히 무시)
 *
 * 주의: 화면이 백그라운드로 가면 브라우저가 잠금을 자동 해제하므로,
 * 다시 보일 때(visibilitychange) 재요청한다. 손으로 화면을 끄거나 다른 앱으로
 * 나가면 OS가 음성 재생 자체를 멈추므로 이 방법으로는 막을 수 없다.
 */

type Sentinel = {
  release: () => Promise<void>;
  addEventListener?: (type: string, cb: () => void) => void;
};

let sentinel: Sentinel | null = null;
let wanted = false;
let hooked = false;

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

async function request(): Promise<void> {
  if (!wakeLockSupported() || !wanted || sentinel) return;
  try {
    const nav = navigator as unknown as {
      wakeLock: { request: (type: string) => Promise<Sentinel> };
    };
    const s = await nav.wakeLock.request("screen");
    sentinel = s;
    s.addEventListener?.("release", () => {
      sentinel = null;
    });
  } catch {
    // 사용자 제스처 없음/권한 거부 등 — 무시
  }
}

function onVisibility(): void {
  if (document.visibilityState === "visible") void request();
}

export async function acquireWakeLock(): Promise<void> {
  wanted = true;
  if (!hooked) {
    document.addEventListener("visibilitychange", onVisibility);
    hooked = true;
  }
  await request();
}

export async function releaseWakeLock(): Promise<void> {
  wanted = false;
  const s = sentinel;
  sentinel = null;
  try {
    await s?.release();
  } catch {
    // 이미 해제됨 — 무시
  }
}
