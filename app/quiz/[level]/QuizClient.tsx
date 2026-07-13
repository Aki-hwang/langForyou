"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { JlptLevel, Word } from "@/lib/types";
import { WORDS_BY_LEVEL, LEVEL_META } from "@/data";
import { useCards, useHydrated } from "@/lib/storage";
import { mulberry32, shuffleWith } from "@/lib/random";
import { sessionNow } from "@/lib/now";
import { speakJa } from "@/lib/tts";
import AudioButton from "@/components/AudioButton";
import ProgressBar from "@/components/ProgressBar";

const QUIZ_SIZE = 10;

type Mode = "meaning" | "reading" | "listening";

interface Question {
  mode: Mode;
  word: Word;
  /** 보기 텍스트 4개 (정답 포함, 섞인 상태) */
  options: string[];
  /** options 안에서 정답 인덱스 */
  answer: number;
}

function buildQuestions(level: JlptLevel, seed: number): Question[] {
  const rnd = mulberry32(seed);
  const words = WORDS_BY_LEVEL[level];
  const picked = shuffleWith(words, rnd).slice(0, QUIZ_SIZE);

  return picked.map((word, i) => {
    // 모드 순환: 뜻 → 읽기 → 듣기
    let mode: Mode = (["meaning", "reading", "listening"] as Mode[])[i % 3];
    // 한자 표기가 없는 단어는 읽기 문제가 성립하지 않음
    if (mode === "reading" && word.kanji === word.kana) mode = "meaning";

    const others = shuffleWith(
      words.filter((w) => w.id !== word.id),
      rnd
    ).slice(0, 3);
    const texts =
      mode === "reading"
        ? [word.kana, ...others.map((w) => w.kana)]
        : [word.meaning, ...others.map((w) => w.meaning)];

    const options = shuffleWith(texts, rnd);
    return { mode, word, options, answer: options.indexOf(texts[0]) };
  });
}

const MODE_LABEL: Record<Mode, string> = {
  meaning: "뜻 고르기",
  reading: "읽기 고르기",
  listening: "듣고 고르기",
};

export default function QuizClient({ level }: { level: JlptLevel }) {
  const meta = LEVEL_META[level];
  const { grade } = useCards();
  const hydrated = useHydrated();

  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [wrong, setWrong] = useState<Word[]>([]);
  const [finished, setFinished] = useState(false);

  // 시드 기반이라 렌더 간 결과가 동일 (하이드레이션 후에만 생성)
  const questions = useMemo(
    () => (hydrated ? buildQuestions(level, sessionNow() + attempt * 7919) : null),
    [hydrated, level, attempt]
  );

  const q = questions?.[index];

  // 듣기 문제는 자동 재생
  useEffect(() => {
    if (q && q.mode === "listening" && selected === null) {
      speakJa(q.word.kana);
    }
  }, [q, selected]);

  if (!questions || !q) return null;

  function retry() {
    setAttempt((a) => a + 1);
    setIndex(0);
    setSelected(null);
    setWrong([]);
    setFinished(false);
  }

  function choose(i: number) {
    if (!q || selected !== null) return;
    setSelected(i);
    const ok = i === q.answer;
    grade(q.word.id, ok ? "good" : "again");
    if (!ok) setWrong((w) => [...w, q.word]);
    if (q.mode !== "listening") speakJa(q.word.kana);
  }

  function next() {
    if (!questions) return;
    if (index + 1 >= questions.length) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
    }
  }

  if (finished) {
    const score = questions.length - wrong.length;
    return (
      <div className="animate-pop-in flex min-h-[calc(100dvh-8rem)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="text-5xl">
            {score >= 8 ? "🏆" : score >= 5 ? "💪" : "🌱"}
          </span>
          <h1 className="mt-4 text-xl font-bold">
            {score} / {questions.length}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {score >= 8
              ? "훌륭해요! 거의 다 맞혔어요."
              : score >= 5
                ? "좋아요, 틀린 단어만 다시 보면 돼요."
                : "괜찮아요, 반복이 실력을 만들어요."}
          </p>
        </div>

        {wrong.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-muted">틀린 단어</h2>
            <div className="overflow-hidden rounded-2xl border border-border-soft bg-card">
              {wrong.map((w, i) => (
                <div
                  key={w.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i === wrong.length - 1 ? "" : "border-b border-border-soft"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-ja font-semibold">
                      {w.kanji}{" "}
                      <span className="text-xs font-normal text-muted">
                        {w.kana}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted">{w.meaning}</p>
                  </div>
                  <AudioButton text={w.kana} size="sm" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={retry}
            className="rounded-2xl bg-indigo-500 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            다시 도전
          </button>
          <Link
            href={`/level/${level.toLowerCase()}`}
            className="rounded-2xl border border-border-soft bg-card py-3.5 text-center text-sm font-semibold transition active:scale-[0.98]"
          >
            레벨로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-pop-in flex min-h-[calc(100dvh-8rem)] flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href={`/level/${level.toLowerCase()}`}
          aria-label="뒤로"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-muted"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="flex-1">
          <p className="text-sm font-semibold">{meta.title} 퀴즈</p>
          <div className="mt-1.5">
            <ProgressBar
              value={(index / questions.length) * 100}
              barClassName={meta.accentBg}
            />
          </div>
        </div>
        <span className="text-xs font-medium text-muted">
          {index + 1}/{questions.length}
        </span>
      </div>

      {/* 문제 */}
      <div className="mt-5 rounded-3xl border border-border-soft bg-card p-6 text-center">
        <span className="rounded-full bg-foreground/5 px-3 py-1 text-xs font-medium text-muted">
          {MODE_LABEL[q.mode]}
        </span>

        {q.mode === "listening" ? (
          <div className="mt-6 flex flex-col items-center gap-3 pb-2">
            <AudioButton text={q.word.kana} size="lg" />
            <p className="text-xs text-muted">버튼을 눌러 다시 들을 수 있어요</p>
            {selected !== null && (
              <p className="font-ja text-3xl font-bold">
                {q.word.kanji}{" "}
                <span className="text-base font-normal text-muted">
                  {q.word.kana}
                </span>
              </p>
            )}
          </div>
        ) : (
          <div className="mt-5 pb-1">
            <p className="font-ja text-5xl font-bold leading-tight">
              {q.word.kanji}
            </p>
            <p className="font-ja mt-2 min-h-5 text-sm text-muted">
              {selected !== null ? q.word.kana : ""}
            </p>
          </div>
        )}

        {/* 정답 후 예문 노출 */}
        {selected !== null && (
          <div className="mt-4 rounded-2xl bg-foreground/5 p-3.5 text-left">
            <div className="flex items-start justify-between gap-2">
              <p className="font-ja text-sm leading-relaxed">
                {q.word.example.ja}
              </p>
              <AudioButton text={q.word.example.ja} size="sm" />
            </div>
            <p className="mt-1 text-xs text-muted">{q.word.example.ko}</p>
          </div>
        )}
      </div>

      {/* 보기 */}
      <div className="mt-4 space-y-2.5">
        {q.options.map((opt, i) => {
          let cls = "border-border-soft bg-card active:scale-[0.98]";
          if (selected !== null) {
            if (i === q.answer)
              cls =
                "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
            else if (i === selected)
              cls =
                "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300";
            else cls = "border-border-soft bg-card opacity-50";
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              disabled={selected !== null}
              className={`w-full rounded-2xl border px-4 py-3.5 text-left text-[15px] font-medium transition ${
                q.mode === "reading" ? "font-ja" : ""
              } ${cls}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* 다음 */}
      <div className="mt-auto pt-4">
        {selected !== null && (
          <button
            type="button"
            onClick={next}
            className="w-full rounded-2xl bg-indigo-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition active:scale-[0.98]"
          >
            {index + 1 >= questions.length ? "결과 보기" : "다음 문제"}
          </button>
        )}
      </div>
    </div>
  );
}
