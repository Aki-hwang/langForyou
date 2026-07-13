"use client";

import { JLPT_LEVELS } from "@/lib/types";
import { LEVEL_META, WORDS_BY_LEVEL } from "@/data";
import {
  useCards,
  useDayStats,
  useHydrated,
  calcStreakDays,
  todayKey,
} from "@/lib/storage";
import { sessionNow } from "@/lib/now";
import { masteryOf } from "@/lib/srs";
import ProgressBar from "@/components/ProgressBar";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function StatsPage() {
  const { cards } = useCards();
  const days = useDayStats();
  const hydrated = useHydrated();

  // 프리렌더(빌드 시점)와 클라이언트의 날짜가 다르면 요일 라벨이
  // 하이드레이션 불일치를 일으키므로, 하이드레이션 전에는 고정 기준일 사용
  const base = new Date(hydrated ? sessionNow() : 0);
  const streak = calcStreakDays(days, base);
  const totalReviews = Object.values(days).reduce((s, d) => s + d.reviews, 0);
  const totalCorrect = Object.values(days).reduce((s, d) => s + d.correct, 0);
  const accuracy =
    totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0;

  // 최근 7일 활동
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() - (6 - i));
    const key = todayKey(d);
    return {
      label: DAY_LABELS[d.getDay()],
      isToday: i === 6,
      reviews: days[key]?.reviews ?? 0,
    };
  });
  const maxReviews = Math.max(1, ...last7.map((d) => d.reviews));

  return (
    <div className="animate-pop-in space-y-6">
      <header className="pt-2">
        <h1 className="text-2xl font-bold tracking-tight">학습 통계</h1>
        <p className="mt-1 text-sm text-muted">꾸준함이 실력입니다</p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border-soft bg-card p-3.5">
          <p className="text-xs text-muted">연속 학습</p>
          <p className="mt-1 text-xl font-bold">
            {streak}
            <span className="ml-0.5 text-sm font-medium text-muted">일</span>
          </p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-card p-3.5">
          <p className="text-xs text-muted">총 학습</p>
          <p className="mt-1 text-xl font-bold">
            {totalReviews}
            <span className="ml-0.5 text-sm font-medium text-muted">회</span>
          </p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-card p-3.5">
          <p className="text-xs text-muted">정답률</p>
          <p className="mt-1 text-xl font-bold">
            {accuracy}
            <span className="ml-0.5 text-sm font-medium text-muted">%</span>
          </p>
        </div>
      </section>

      {/* 주간 활동 */}
      <section className="rounded-2xl border border-border-soft bg-card p-4">
        <h2 className="text-sm font-semibold">최근 7일</h2>
        <div className="mt-4 flex h-28 items-end justify-between gap-2">
          {last7.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-20 w-full items-end">
                <div
                  className={`w-full rounded-md ${
                    d.reviews > 0 ? "bg-indigo-500" : "bg-foreground/10"
                  }`}
                  style={{
                    height: `${d.reviews > 0 ? Math.max(12, (d.reviews / maxReviews) * 100) : 6}%`,
                  }}
                />
              </div>
              <span
                className={`text-[11px] ${
                  d.isToday
                    ? "font-bold text-indigo-600 dark:text-indigo-400"
                    : "text-muted"
                }`}
              >
                {d.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 레벨별 진행 */}
      <section>
        <h2 className="mb-3 text-base font-semibold">레벨별 진행률</h2>
        <div className="space-y-3">
          {JLPT_LEVELS.map((level) => {
            const meta = LEVEL_META[level];
            const words = WORDS_BY_LEVEL[level];
            const learned = words.filter(
              (w) => (cards[w.id]?.reps ?? 0) > 0
            ).length;
            const mastered = words.filter(
              (w) => masteryOf(cards[w.id]) >= 100
            ).length;
            return (
              <div
                key={level}
                className="rounded-2xl border border-border-soft bg-card p-4"
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold">
                    <span className={meta.accentText}>{level}</span>{" "}
                    <span className="text-muted">
                      학습 {learned} · 마스터 {mastered}
                    </span>
                  </p>
                  <p className="text-xs text-muted">{words.length}개</p>
                </div>
                <div className="mt-2.5">
                  <ProgressBar
                    value={(mastered / words.length) * 100}
                    barClassName={meta.accentBg}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
