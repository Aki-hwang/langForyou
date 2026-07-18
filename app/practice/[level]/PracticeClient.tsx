"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { JlptLevel, Word } from "@/lib/types";
import { WORDS_BY_LEVEL, LEVEL_META } from "@/data";
import { useCards } from "@/lib/storage";
import { mulberry32, shuffleWith } from "@/lib/random";
import { sessionNow } from "@/lib/now";
import { speakJa } from "@/lib/tts";
import AudioButton from "@/components/AudioButton";
import ProgressBar from "@/components/ProgressBar";

type Mode = "meaning" | "reading" | "listening";

interface Question {
  mode: Mode;
  word: Word;
  /** 보기 텍스트 4개 (정답 포함, 섞인 상태) */
  options: string[];
  /** options 안에서 정답 인덱스 */
  answer: number;
}

type Phase = "setup" | "playing" | "roundEnd" | "done";

const SIZE_OPTIONS = [10, 20, 30];

const MODE_LABEL: Record<Mode, string> = {
  meaning: "뜻 고르기",
  reading: "읽기 고르기",
  listening: "듣고 고르기",
};

/** 주어진 단어 풀을 섞어 문제로 만든다 (보기는 레벨 전체 단어에서 뽑음) */
function buildQuestions(pool: Word[], all: Word[], seed: number): Question[] {
  const rnd = mulberry32(seed);
  const picked = shuffleWith(pool, rnd);

  return picked.map((word, i) => {
    // 모드 순환: 뜻 → 읽기 → 듣기
    let mode: Mode = (["meaning", "reading", "listening"] as Mode[])[i % 3];
    // 한자 표기가 없는 단어는 읽기 문제가 성립하지 않음
    if (mode === "reading" && word.kanji === word.kana) mode = "meaning";

    const others = shuffleWith(
      all.filter((w) => w.id !== word.id),
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

/**
 * 집중연습: 레벨 단어가 무작위로 출제되고,
 * 틀린 단어만 다시 모아 다음 라운드로 — 전부 맞힐 때까지 반복한다.
 */
export default function PracticeClient({ level }: { level: JlptLevel }) {
  const meta = LEVEL_META[level];
  const words = WORDS_BY_LEVEL[level];
  const { grade } = useCards();

  const [phase, setPhase] = useState<Phase>("setup");
  const [round, setRound] = useState(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [wrong, setWrong] = useState<Word[]>([]);
  const [sessionSize, setSessionSize] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  // 시드 카운터 — 시작/라운드마다 다른 순서가 나오도록
  const seedRef = useRef(0);

  const q = phase === "playing" ? questions[index] : undefined;

  // 듣기 문제는 자동 재생
  useEffect(() => {
    if (q && q.mode === "listening" && selected === null) {
      speakJa(q.word.kana);
    }
  }, [q, selected]);

  function nextSeed(): number {
    seedRef.current += 1;
    return sessionNow() + seedRef.current * 7919;
  }

  function start(size: number) {
    const seed = nextSeed();
    const pool = shuffleWith(words, mulberry32(seed)).slice(0, size);
    setQuestions(buildQuestions(pool, words, seed + 1));
    setSessionSize(pool.length);
    setRound(1);
    setIndex(0);
    setSelected(null);
    setWrong([]);
    setTotalAnswered(0);
    setPhase("playing");
  }

  function choose(i: number) {
    if (!q || selected !== null) return;
    setSelected(i);
    setTotalAnswered((n) => n + 1);
    const ok = i === q.answer;
    grade(q.word.id, ok ? "good" : "again");
    if (!ok) setWrong((w) => [...w, q.word]);
    if (q.mode !== "listening") speakJa(q.word.kana);
  }

  function next() {
    if (index + 1 >= questions.length) {
      setPhase(wrong.length === 0 ? "done" : "roundEnd");
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
    }
  }

  function nextRound() {
    setQuestions(buildQuestions(wrong, words, nextSeed()));
    setWrong([]);
    setRound((r) => r + 1);
    setIndex(0);
    setSelected(null);
    setPhase("playing");
  }

  /* ---------------------------- 시작 화면 ---------------------------- */
  if (phase === "setup") {
    const sizes = SIZE_OPTIONS.filter((n) => n < words.length);
    return (
      <div className="animate-pop-in flex min-h-[calc(100dvh-8rem)] flex-col">
        <Header level={level} title={`${meta.title} 집중연습`} />

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="text-5xl">🎯</span>
          <h1 className="mt-4 text-xl font-bold">집중연습</h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
            단어가 무작위 순서로 출제돼요.
            <br />
            틀린 단어는 다시 모아서, 전부 맞힐 때까지 반복해요.
          </p>
        </div>

        <div className="mt-6 space-y-2.5">
          <p className="text-center text-xs font-medium text-muted">
            연습할 단어 수를 골라주세요
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {sizes.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => start(n)}
                className="rounded-2xl border border-border-soft bg-card py-3.5 text-sm font-semibold transition active:scale-[0.98]"
              >
                {n}개
              </button>
            ))}
            <button
              type="button"
              onClick={() => start(words.length)}
              className={`rounded-2xl bg-gradient-to-br py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] ${
                sizes.length % 2 === 0 ? "col-span-2" : ""
              } ${meta.gradient}`}
            >
              전체 {words.length}개
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------- 라운드 결과 화면 ------------------------- */
  if (phase === "roundEnd") {
    const correct = questions.length - wrong.length;
    return (
      <div className="animate-pop-in flex min-h-[calc(100dvh-8rem)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="text-5xl">💪</span>
          <h1 className="mt-4 text-xl font-bold">{round}라운드 완료</h1>
          <p className="mt-1 text-sm text-muted">
            {questions.length}개 중 {correct}개 정답 · 틀린 {wrong.length}개만
            다시 나와요
          </p>
        </div>

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">틀린 단어</h2>
          <div className="max-h-64 overflow-y-auto rounded-2xl border border-border-soft bg-card">
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

        <div className="mt-6">
          <button
            type="button"
            onClick={nextRound}
            className="w-full rounded-2xl bg-indigo-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition active:scale-[0.98]"
          >
            틀린 {wrong.length}개 다시 풀기 →
          </button>
        </div>
      </div>
    );
  }

  /* ---------------------------- 완료 화면 ---------------------------- */
  if (phase === "done") {
    return (
      <div className="animate-pop-in flex min-h-[calc(100dvh-8rem)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="text-5xl">🏆</span>
          <h1 className="mt-4 text-xl font-bold">전부 맞혔어요!</h1>
          <p className="mt-1 text-sm text-muted">
            단어 {sessionSize}개 · {round}라운드 · 총 {totalAnswered}문제
          </p>
          <p className="mt-3 text-sm text-muted">
            {round === 1
              ? "한 번에 클리어! 완벽해요 ✨"
              : "끝까지 반복해서 모두 익혔어요."}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPhase("setup")}
            className="rounded-2xl bg-indigo-500 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            다시 하기
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

  if (!q) return null;

  /* ---------------------------- 문제 화면 ---------------------------- */
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
          <p className="text-sm font-semibold">
            {meta.title} 집중연습
            {round > 1 && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                {round}라운드
              </span>
            )}
          </p>
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
            {index + 1 >= questions.length
              ? wrong.length === 0
                ? "결과 보기"
                : "라운드 결과 보기"
              : "다음 문제"}
          </button>
        )}
      </div>
    </div>
  );
}

function Header({ level, title }: { level: JlptLevel; title: string }) {
  return (
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
      <p className="text-sm font-semibold">{title}</p>
    </div>
  );
}
