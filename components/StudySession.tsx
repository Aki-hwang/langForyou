"use client";

import { useState } from "react";
import Link from "next/link";
import type { Grade, Word } from "@/lib/types";
import { useCards } from "@/lib/storage";
import { speakJa } from "@/lib/tts";
import AudioButton from "@/components/AudioButton";
import ProgressBar from "@/components/ProgressBar";

const GRADE_BUTTONS: {
  grade: Grade;
  label: string;
  cls: string;
}[] = [
  { grade: "again", label: "다시", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  { grade: "hard", label: "어려움", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { grade: "good", label: "알맞음", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { grade: "easy", label: "쉬움", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
];

/**
 * 플래시카드 학습 세션.
 * - 카드를 탭하면 뒤집혀 읽기/뜻/예문 공개
 * - "다시"를 누르면 세션 마지막에 다시 등장
 * - words prop은 마운트 시점의 값만 사용한다 (이후 변경 무시)
 */
export default function StudySession({
  words,
  title,
  backHref,
  emptyMessage,
}: {
  words: Word[];
  title: string;
  backHref: string;
  emptyMessage: string;
}) {
  const { grade } = useCards();
  const [queue, setQueue] = useState<Word[]>(words);
  const [total] = useState(words.length);
  const [flipped, setFlipped] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const current = queue[0];

  function handleGrade(g: Grade) {
    if (!current) return;
    grade(current.id, g);
    setFlipped(false);
    if (g === "again") {
      // 세션 뒤로 보내 다시 학습
      setQueue((q) => [...q.slice(1), q[0]]);
    } else {
      setDoneCount((n) => n + 1);
      setQueue((q) => q.slice(1));
    }
  }

  function reveal() {
    setFlipped(true);
    if (current) speakJa(current.kana);
  }

  if (total === 0) {
    return (
      <EmptyOrDone title={title} message={emptyMessage} backHref={backHref} emoji="🎉" />
    );
  }

  if (!current) {
    return (
      <EmptyOrDone
        title={title}
        message={`${total}개 단어 학습 완료! 잊어버릴 때쯤 복습 탭에 다시 나타나요.`}
        backHref={backHref}
        emoji="🌸"
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          aria-label="뒤로"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-muted"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <div className="mt-1.5">
            <ProgressBar value={(doneCount / total) * 100} />
          </div>
        </div>
        <span className="text-xs font-medium text-muted">
          {doneCount}/{total}
        </span>
      </div>

      {/* 카드 */}
      <div className="perspective mt-5 flex-1">
        {/* 발음 버튼이 내부에 있어 <button> 중첩을 피하려고 div 사용 */}
        <div
          role="button"
          tabIndex={0}
          aria-label={flipped ? undefined : "탭해서 뜻 확인"}
          onClick={() => {
            if (!flipped) reveal();
          }}
          onKeyDown={(e) => {
            if (!flipped && (e.key === "Enter" || e.key === " ")) reveal();
          }}
          className="preserve-3d relative block h-full min-h-[380px] w-full cursor-pointer text-left transition-transform duration-500"
          style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
        >
          {/* 앞면: 한자 */}
          <div className="backface-hidden absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-border-soft bg-card p-6 shadow-sm">
            <span className="rounded-full bg-foreground/5 px-3 py-1 text-xs font-medium text-muted">
              {current.pos}
            </span>
            <p className="font-ja mt-6 text-center text-6xl font-bold leading-tight">
              {current.kanji}
            </p>
            <p className="mt-10 text-sm text-muted">탭해서 뜻 확인</p>
          </div>

          {/* 뒷면: 읽기 + 뜻 + 예문 */}
          <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col rounded-3xl border border-border-soft bg-card p-6 shadow-sm">
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="font-ja text-lg text-indigo-600 dark:text-indigo-400">
                    {current.kana}
                  </p>
                  <p className="font-ja text-4xl font-bold">{current.kanji}</p>
                </div>
                <AudioButton text={current.kana} />
              </div>
              <p className="mt-4 text-2xl font-semibold">{current.meaning}</p>
            </div>
            <div className="mt-4 rounded-2xl bg-foreground/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-ja text-[15px] leading-relaxed">
                  {current.example.ja}
                </p>
                <AudioButton text={current.example.ja} size="sm" />
              </div>
              <p className="mt-1.5 text-sm text-muted">{current.example.ko}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 평가 버튼 */}
      <div className="mt-5">
        {flipped ? (
          <div className="grid grid-cols-4 gap-2">
            {GRADE_BUTTONS.map((b) => (
              <button
                key={b.grade}
                type="button"
                onClick={() => handleGrade(b.grade)}
                className={`rounded-2xl py-3.5 text-sm font-semibold transition active:scale-95 ${b.cls}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={reveal}
            className="w-full rounded-2xl bg-indigo-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition active:scale-[0.98]"
          >
            정답 보기
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyOrDone({
  title,
  message,
  backHref,
  emoji,
}: {
  title: string;
  message: string;
  backHref: string;
  emoji: string;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col items-center justify-center text-center">
      <span className="text-5xl">{emoji}</span>
      <h1 className="mt-4 text-lg font-bold">{title}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{message}</p>
      <Link
        href={backHref}
        className="mt-6 rounded-full bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95"
      >
        돌아가기
      </Link>
    </div>
  );
}
