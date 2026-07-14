"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/authStore";
import { fullSync, noteChange, setSyncEnabled } from "@/lib/sync";

/**
 * 앱 전역 인증/동기화 부트스트랩 (렌더링 없음).
 * - 로그인 상태 확인(useAuth 내부에서 1회 fetch)
 * - 학습 이벤트(lfy:graded)를 받아 서버에 변경분 push
 * - 로그인 감지 시 전체 동기화(서버↔로컬 병합)
 */
export default function AuthBoot() {
  const { user } = useAuth();

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { wordId: string; day: string };
      if (d?.wordId && d?.day) noteChange(d.wordId, d.day);
    };
    window.addEventListener("lfy:graded", handler);
    return () => window.removeEventListener("lfy:graded", handler);
  }, []);

  useEffect(() => {
    setSyncEnabled(Boolean(user));
    if (user) void fullSync();
  }, [user]);

  return null;
}
