"use client";

import Link from "next/link";
import { JLPT_LEVELS } from "@/lib/types";
import { LEVEL_META, WORDS_BY_LEVEL, ALL_WORDS } from "@/data";
import { useCards, useDayStats, calcStreakDays } from "@/lib/storage";
import { sessionNow } from "@/lib/now";
import { isDue, masteryOf } from "@/lib/srs";
import ProgressBar from "@/components/ProgressBar";

export default function HomePage() {
  const { cards, loaded } = useCards();
  const days = useDayStats();

  const now = sessionNow();
  const streak = calcStreakDays(days, new Date(now));
  const dueCount = ALL_WORDS.filter((w) => {
    const c = cards[w.id];
    return c && c.reps > 0 && isDue(c, now);
  }).length;
  const learnedCount = Object.values(cards).filter((c) => c.reps > 0).length;

  return (
    <div className="animate-pop-in space-y-6">
      <header className="pt-2">
        <p className="text-sm font-medium text-muted">こんにちは 👋</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          오늘도 일본어 한 걸음
        </h1>
      </header>

      {/* 요약 카드 */}
      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border-soft bg-card p-3.5">
          <p className="text-xs text-muted">연속 학습</p>
          <p className="mt-1 text-xl font-bold">
            {streak}
            <span className="ml-0.5 text-sm font-medium text-muted">일</span>
          </p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-card p-3.5">
          <p className="text-xs text-muted">배운 단어</p>
          <p className="mt-1 text-xl font-bold">
            {loaded ? learnedCount : "–"}
            <span className="ml-0.5 text-sm font-medium text-muted">개</span>
          </p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-card p-3.5">
          <p className="text-xs text-muted">복습 대기</p>
          <p className="mt-1 text-xl font-bold text-indigo-600 dark:text-indigo-400">
            {loaded ? dueCount : "–"}
            <span className="ml-0.5 text-sm font-medium text-muted">개</span>
          </p>
        </div>
      </section>

      {/* 복습 CTA */}
      {dueCount > 0 && (
        <Link
          href="/review"
          className="block rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 p-4 text-white shadow-lg shadow-indigo-500/25 transition active:scale-[0.98]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">복습할 시간이에요</p>
              <p className="mt-0.5 text-sm text-white/80">
                {dueCount}개 단어가 기다리고 있어요
              </p>
            </div>
            <span className="text-2xl">⏰</span>
          </div>
        </Link>
      )}

      {/* JLPT 레벨 */}
      <section>
        <h2 className="mb-3 text-base font-semibold">JLPT 레벨별 학습</h2>
        <div className="space-y-3">
          {JLPT_LEVELS.map((level) => {
            const meta = LEVEL_META[level];
            const words = WORDS_BY_LEVEL[level];
            const mastered = words.filter(
              (w) => masteryOf(cards[w.id]) >= 100
            ).length;
            const started = words.filter(
              (w) => (cards[w.id]?.reps ?? 0) > 0
            ).length;
            const pct = words.length ? (mastered / words.length) * 100 : 0;

            return (
              <Link
                key={level}
                href={`/level/${level.toLowerCase()}`}
                className="block rounded-2xl border border-border-soft bg-card p-4 transition active:scale-[0.98]"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-bold text-white ${meta.gradient}`}
                  >
                    {level}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between">
                      <p className="font-semibold">{meta.title}</p>
                      <p className="text-xs text-muted">
                        {mastered}/{words.length}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {meta.desc}
                      {started > 0 && ` · 학습 중 ${started}개`}
                    </p>
                    <div className="mt-2">
                      <ProgressBar value={pct} barClassName={meta.accentBg} />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
