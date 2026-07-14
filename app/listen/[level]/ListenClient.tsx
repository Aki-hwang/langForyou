"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { JlptLevel } from "@/lib/types";
import { WORDS_BY_LEVEL, LEVEL_META } from "@/data";
import { speakAsync, stopSpeaking, ttsAvailable } from "@/lib/tts";
import { acquireWakeLock, releaseWakeLock } from "@/lib/wakeLock";
import { useHydrated } from "@/lib/storage";
import ProgressBar from "@/components/ProgressBar";
import VoiceSettings from "@/components/VoiceSettings";

const JA_REPEAT = 3; // 일본어 3번
const KO_REPEAT = 1; // 한국어 1번

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const SPEEDS = [
  { label: "느리게", rate: 0.6 },
  { label: "보통", rate: 0.75 },
  { label: "빠르게", rate: 0.95 },
];

/**
 * 연속듣기: 레벨의 단어를 순서대로 자동 재생한다.
 * 각 단어마다 일본어(읽기) 3회 → 한국어(뜻) 1회 재생 후 다음 단어로 넘어간다.
 * 손대지 않고 흘려들으며 반복 학습하는 모드.
 */
export default function ListenClient({ level }: { level: JlptLevel }) {
  const meta = LEVEL_META[level];
  const words = WORDS_BY_LEVEL[level];

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<{ lang: "ja" | "ko"; rep: number } | null>(
    null
  );
  const [finished, setFinished] = useState(false);
  const [rate, setRate] = useState(0.75);
  const [showVoices, setShowVoices] = useState(false);
  const hydrated = useHydrated();

  // 재생 세션 토큰 — 값이 바뀌면 진행 중인 루프가 스스로 종료된다
  const tokenRef = useRef(0);
  const indexRef = useRef(0);

  // 화면을 떠나면 재생 중지 (토큰을 무효화해 진행 중 루프를 종료)
  useEffect(() => {
    const token = tokenRef;
    return () => {
      token.current += 1;
      stopSpeaking();
      void releaseWakeLock();
    };
  }, []);

  async function run(startIndex: number, playRate: number) {
    const token = ++tokenRef.current;
    setPlaying(true);
    setFinished(false);
    void acquireWakeLock(); // 재생 중 화면 꺼짐 방지

    for (let i = startIndex; i < words.length; i++) {
      if (tokenRef.current !== token) return;
      setIndex(i);
      indexRef.current = i;
      const w = words[i];

      // 일본어(읽기) 3회
      for (let r = 0; r < JA_REPEAT; r++) {
        if (tokenRef.current !== token) return;
        setPhase({ lang: "ja", rep: r + 1 });
        await speakAsync(w.kana, "ja-JP", playRate);
        if (tokenRef.current !== token) return;
        await delay(250);
      }

      // 한국어(뜻) 1회
      for (let r = 0; r < KO_REPEAT; r++) {
        if (tokenRef.current !== token) return;
        setPhase({ lang: "ko", rep: r + 1 });
        await speakAsync(w.meaning, "ko-KR", Math.min(1, playRate + 0.1));
        if (tokenRef.current !== token) return;
        await delay(450);
      }
    }

    if (tokenRef.current === token) {
      setPlaying(false);
      setPhase(null);
      setFinished(true);
      void releaseWakeLock();
    }
  }

  function pause() {
    tokenRef.current++;
    stopSpeaking();
    setPlaying(false);
    setPhase(null);
    void releaseWakeLock();
  }

  function toggle() {
    if (playing) pause();
    else run(indexRef.current, rate);
  }

  function goto(i: number) {
    const clamped = Math.max(0, Math.min(words.length - 1, i));
    const wasPlaying = playing;
    tokenRef.current++;
    stopSpeaking();
    setIndex(clamped);
    indexRef.current = clamped;
    setPhase(null);
    setFinished(false);
    if (wasPlaying) run(clamped, rate);
  }

  function changeRate(newRate: number) {
    setRate(newRate);
    // 재생 중이면 현재 단어부터 새 속도로 이어서 재생
    if (playing) run(indexRef.current, newRate);
  }

  const current = words[index];
  const pct = ((index + (finished ? 1 : 0)) / words.length) * 100;

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
          <p className="text-sm font-semibold">{meta.title} 연속듣기</p>
          <div className="mt-1.5">
            <ProgressBar value={pct} barClassName={meta.accentBg} />
          </div>
        </div>
        <span className="text-xs font-medium text-muted">
          {index + 1}/{words.length}
        </span>
        <button
          type="button"
          aria-label="음성 설정"
          onClick={() => setShowVoices(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-muted transition active:scale-90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {showVoices && <VoiceSettings onClose={() => setShowVoices(false)} />}

      {hydrated && !ttsAvailable() && (
        <p className="mt-4 rounded-2xl bg-amber-500/10 p-3 text-center text-xs text-amber-700 dark:text-amber-400">
          이 브라우저는 음성 재생을 지원하지 않아요.
        </p>
      )}

      {/* 현재 단어 카드 */}
      <div className="mt-5 flex-1">
        <div className="flex min-h-[360px] flex-col rounded-3xl border border-border-soft bg-card p-6 shadow-sm">
          {/* 재생 단계 표시 */}
          <div className="flex items-center justify-center gap-4">
            <PhaseChip
              label="日本語"
              total={JA_REPEAT}
              active={phase?.lang === "ja" ? phase.rep : 0}
              color="bg-indigo-500"
            />
            <span className="text-muted">→</span>
            <PhaseChip
              label="한국어"
              total={KO_REPEAT}
              active={phase?.lang === "ko" ? phase.rep : 0}
              color="bg-emerald-500"
            />
          </div>

          <div className="flex flex-1 flex-col items-center justify-center">
            <p
              className={`font-ja text-lg transition-colors ${
                phase?.lang === "ja"
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-muted"
              }`}
            >
              {current.kana}
            </p>
            <p className="font-ja mt-1 text-5xl font-bold">{current.kanji}</p>
            <p
              className={`mt-4 text-2xl font-semibold transition-colors ${
                phase?.lang === "ko"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : ""
              }`}
            >
              {current.meaning}
            </p>
            <span className="mt-2 rounded-full bg-foreground/5 px-3 py-1 text-xs text-muted">
              {current.pos}
            </span>
          </div>

          <div className="rounded-2xl bg-foreground/5 p-3.5">
            <p className="font-ja text-sm leading-relaxed">{current.example.ja}</p>
            <p className="mt-1 text-xs text-muted">{current.example.ko}</p>
          </div>
        </div>
      </div>

      {/* 속도 */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {SPEEDS.map((s) => (
          <button
            key={s.rate}
            type="button"
            onClick={() => changeRate(s.rate)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              rate === s.rate
                ? "bg-indigo-500 text-white"
                : "bg-foreground/5 text-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 컨트롤 */}
      <div className="mt-4 flex items-center justify-center gap-6">
        <button
          type="button"
          aria-label="이전 단어"
          onClick={() => goto(index - 1)}
          disabled={index === 0}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5 text-foreground transition active:scale-90 disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M6 5h2v14H6zM20 5 9 12l11 7z" />
          </svg>
        </button>

        <button
          type="button"
          aria-label={playing ? "일시정지" : "재생"}
          onClick={toggle}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 transition active:scale-95"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-7 w-7">
              <path d="M7 5l12 7-12 7z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          aria-label="다음 단어"
          onClick={() => goto(index + 1)}
          disabled={index >= words.length - 1}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5 text-foreground transition active:scale-90 disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M16 5h2v14h-2zM4 5l11 7-11 7z" />
          </svg>
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        {finished
          ? "🌸 마지막 단어까지 들었어요"
          : playing
            ? "자동으로 다음 단어로 넘어가요 · 재생 중엔 화면이 꺼지지 않아요"
            : "재생 버튼을 누르면 일본어 3회 · 한국어 1회 반복해서 들려줘요"}
      </p>
    </div>
  );
}

function PhaseChip({
  label,
  total,
  active,
  color,
}: {
  label: string;
  total: number;
  active: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-ja text-xs text-muted">{label}</span>
      <span className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full transition-colors ${
              i < active ? color : "bg-foreground/15"
            }`}
          />
        ))}
      </span>
    </div>
  );
}
