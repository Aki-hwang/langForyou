"use client";

import Link from "next/link";
import { useState } from "react";
import type { JlptLevel, Word } from "@/lib/types";
import { LEVEL_META, WORDS_BY_LEVEL } from "@/data";
import { useCards } from "@/lib/storage";
import { sessionNow } from "@/lib/now";
import { isDue, masteryOf } from "@/lib/srs";
import type { CardState } from "@/lib/types";
import AudioButton from "@/components/AudioButton";
import ProgressBar from "@/components/ProgressBar";

export default function LevelClient({ level }: { level: JlptLevel }) {
  const meta = LEVEL_META[level];
  const words = WORDS_BY_LEVEL[level];
  const { cards, loaded } = useCards();

  const now = sessionNow();
  const newCount = words.filter((w) => (cards[w.id]?.reps ?? 0) === 0).length;
  const dueCount = words.filter((w) => {
    const c = cards[w.id];
    return c && c.reps > 0 && isDue(c, now);
  }).length;
  const mastered = words.filter((w) => masteryOf(cards[w.id]) >= 100).length;

  return (
    <div className="animate-pop-in space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3 pt-1">
        <Link
          href="/"
          aria-label="뒤로"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-muted"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-base font-bold text-white ${meta.gradient}`}
        >
          {level}
        </div>
        <div className="flex-1">
          <h1 className="font-bold">{meta.title}</h1>
          <p className="text-xs text-muted">
            전체 {words.length}개 · 마스터 {mastered}개
          </p>
        </div>
      </div>

      <ProgressBar
        value={(mastered / words.length) * 100}
        barClassName={meta.accentBg}
      />

      {/* 액션 */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/learn/${level.toLowerCase()}`}
          className={`rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg transition active:scale-[0.98] ${meta.gradient}`}
        >
          <p className="text-lg">📖</p>
          <p className="mt-1.5 font-semibold">단어 학습</p>
          <p className="mt-0.5 text-xs text-white/80">
            {loaded
              ? dueCount > 0
                ? `복습 ${dueCount} + 새 단어`
                : `새 단어 ${Math.min(10, newCount)}개`
              : "플래시카드"}
          </p>
        </Link>
        <Link
          href={`/quiz/${level.toLowerCase()}`}
          className="rounded-2xl border border-border-soft bg-card p-4 transition active:scale-[0.98]"
        >
          <p className="text-lg">✏️</p>
          <p className="mt-1.5 font-semibold">퀴즈</p>
          <p className="mt-0.5 text-xs text-muted">뜻 · 읽기 · 듣기</p>
        </Link>
      </div>

      {/* 단어 목록 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">단어 목록</h2>
        <div className="overflow-hidden rounded-2xl border border-border-soft bg-card">
          {words.map((w, i) => (
            <WordRow
              key={w.id}
              word={w}
              card={cards[w.id]}
              last={i === words.length - 1}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function WordRow({
  word,
  card,
  last,
}: {
  word: Word;
  card: CardState | undefined;
  last: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mastery = masteryOf(card);
  const dot =
    mastery >= 100
      ? "bg-emerald-500"
      : (card?.reps ?? 0) > 0
        ? "bg-amber-400"
        : "bg-foreground/15";

  return (
    <div className={last ? "" : "border-b border-border-soft"}>
      <div className="flex w-full items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-ja font-semibold">{word.kanji}</span>
              <span className="font-ja truncate text-xs text-muted">
                {word.kana}
              </span>
            </div>
            <p className="truncate text-xs text-muted">{word.meaning}</p>
          </div>
        </button>
        <AudioButton text={word.kana} size="sm" />
      </div>
      {open && (
        <div className="bg-foreground/[0.03] px-4 py-3 pl-9">
          <div className="flex items-start justify-between gap-2">
            <p className="font-ja text-sm leading-relaxed">{word.example.ja}</p>
            <AudioButton text={word.example.ja} size="sm" />
          </div>
          <p className="mt-1 text-xs text-muted">{word.example.ko}</p>
          <p className="mt-2 text-[11px] text-muted">
            {word.pos}
            {card && card.reps > 0
              ? ` · 학습 ${card.reps}회 · 숙련도 ${mastery}%`
              : " · 아직 학습 전"}
          </p>
        </div>
      )}
    </div>
  );
}
