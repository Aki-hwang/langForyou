"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SCENES, type ConvLine, type Speaker } from "@/data/conversations";
import { speakAsync, stopSpeaking, ttsAvailable, type TtsLang } from "@/lib/tts";
import {
  abortListening,
  listenOnce,
  primeMicrophone,
  sttAvailable,
} from "@/lib/stt";
import { playEarcon, unlockEarcons } from "@/lib/earcon";
import {
  answerScore,
  detectCommand,
  PASS_SCORE,
} from "@/lib/speechMatch";
import { acquireWakeLock, releaseWakeLock } from "@/lib/wakeLock";
import { useHydrated } from "@/lib/storage";
import ProgressBar from "@/components/ProgressBar";

/**
 * 운전 모드 — 시작 버튼 한 번 이후로는 손을 쓰지 않는 회화 연습.
 * 장면마다: 소개 → 전체 대화 듣기 → 따라 말하기(한국어 → 🎤 → 일본어) → 틀린 문장 복습 → 역할극(B).
 * - 대답하지 않아도 정답을 들려주고 자동으로 넘어간다 (음성 입력은 선택).
 * - 마이크는 신호음 뒤 "말할 차례"에만 켠다 (TTS 소리를 인식하지 않도록).
 * - 음성 명령(일본어): もう一回 · つぎ · ゆっくり · ふつう · ストップ / スタート
 * - 화면 어디든 탭하면 일시정지·재개.
 * 취소는 ListenClient와 같이 tokenRef 증가로 진행 중 async 루프를 무효화한다.
 */

const STAGES = ["intro", "dialog", "drill", "review", "role"] as const;
type Stage = (typeof STAGES)[number];
type Pos = { scene: number; stage: Stage; line: number };

const STAGE_LABEL: Record<Stage, string> = {
  intro: "장면 소개",
  dialog: "전체 대화 듣기",
  drill: "듣고 말하기",
  review: "틀린 문장 복습",
  role: "역할극 · B 역할",
};

const RATE_NORMAL = 0.85;
const RATE_SLOW = 0.65;
const KO_RATE = 1.0;
/** 화자 구분용 음높이 */
const PITCH: Record<Speaker, number> = { A: 0.9, B: 1.25 };

const PROGRESS_KEY = "lfy:drive:v1";

/** 마이크를 쓸 수 없게 만드는 오류 — 이후는 자동 진행 */
const FATAL_MIC_ERRORS = ["not-allowed", "service-not-allowed", "audio-capture", "unsupported"];

const CANCEL = Symbol("cancel");
type Guard = () => void;

type Mode = "setup" | "running" | "paused" | "done";
type Activity = "speaking" | "listening" | "waiting" | "idle";
type MicState = "unknown" | "ok" | "off";

type View = {
  scene: number;
  stage: Stage;
  line: number;
  total: number;
  ko: string;
  ja: string;
  reveal: boolean;
  heard: string;
  result: "ok" | "miss" | null;
};

const EMPTY_VIEW: View = {
  scene: 0,
  stage: "intro",
  line: 0,
  total: 0,
  ko: "",
  ja: "",
  reveal: false,
  heard: "",
  result: null,
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadSavedScene(): number {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const n = raw ? (JSON.parse(raw) as { scene?: number }).scene : 0;
    return typeof n === "number" && n >= 0 && n < SCENES.length ? n : 0;
  } catch {
    return 0;
  }
}

function saveScene(scene: number): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ scene }));
  } catch {
    // 저장 불가 환경 — 무시
  }
}

function isIosStandalone(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function DriveClient() {
  const hydrated = useHydrated();
  const [mode, setMode] = useState<Mode>("setup");
  const [view, setViewState] = useState<View>(EMPTY_VIEW);
  const [activity, setActivity] = useState<Activity>("idle");
  const [mic, setMic] = useState<MicState>("unknown");
  const [slow, setSlow] = useState(false);
  const [voicePaused, setVoicePaused] = useState(false);
  const [stats, setStats] = useState({ ok: 0, tried: 0 });
  const [pick, setPick] = useState<number | null>(null);

  const tokenRef = useRef(0);
  const posRef = useRef<Pos>({ scene: 0, stage: "intro", line: 0 });
  const rateRef = useRef(RATE_NORMAL);
  const missesRef = useRef<number[]>([]);
  const micOkRef = useRef(false);
  const micReadyRef = useRef<Promise<boolean> | null>(null);

  // 화면을 떠나면 모두 중지
  useEffect(() => {
    const token = tokenRef;
    return () => {
      token.current += 1;
      stopSpeaking();
      abortListening();
      void releaseWakeLock();
    };
  }, []);

  const savedScene = hydrated ? loadSavedScene() : 0;
  const startScene = pick ?? savedScene;
  const sttOk = hydrated && sttAvailable();

  function setView(patch: Partial<View>) {
    setViewState((v) => ({ ...v, ...patch }));
  }

  // ───────── 재생 · 듣기 기본 동작 ─────────

  async function say(
    text: string,
    lang: TtsLang,
    guard: Guard,
    rate = lang === "ja-JP" ? rateRef.current : KO_RATE,
    pitch = 1
  ) {
    guard();
    setActivity("speaking");
    await speakAsync(text, lang, rate, pitch);
    guard();
  }

  async function wait(ms: number, guard: Guard) {
    setActivity("idle");
    await delay(ms);
    guard();
  }

  /** 신호음 → 마이크로 한 번 듣기. 마이크를 못 쓰면 말할 시간만 준다 */
  async function listen(line: ConvLine, guard: Guard): Promise<string[]> {
    guard();
    if (micReadyRef.current) {
      await micReadyRef.current;
      guard();
    }
    setView({ heard: "" });

    if (!micOkRef.current) {
      await playEarcon("listen");
      guard();
      setActivity("waiting");
      await delay(Math.min(6000, 2500 + line.kana.length * 120));
      guard();
      return [];
    }

    await playEarcon("listen");
    guard();
    setActivity("listening");
    const r = await listenOnce("ja-JP", {
      maxMs: Math.min(9000, 4000 + line.kana.length * 180),
    });
    guard();
    setActivity("idle");

    if (r.error && FATAL_MIC_ERRORS.includes(r.error)) {
      micOkRef.current = false;
      setMic("off");
      await say("마이크를 쓸 수 없어서 자동 진행으로 바꿀게요.", "ko-KR", guard);
      return [];
    }
    setView({ heard: r.transcripts[0] ?? "" });
    // iOS: 인식 직후 오디오 경로가 재생용으로 돌아올 시간을 준다
    await wait(250, guard);
    return r.transcripts;
  }

  /** 대답 판정 + 음성 명령 처리 */
  async function judge(
    line: ConvLine,
    heard: string[],
    guard: Guard
  ): Promise<"ok" | "miss" | "repeat" | "skip"> {
    const targets = [line.ja, line.kana, ...(line.alt ?? [])];
    if (heard.length && answerScore(heard, targets) >= PASS_SCORE) {
      setView({ reveal: true, result: "ok" });
      setStats((s) => ({ ok: s.ok + 1, tried: s.tried + 1 }));
      await playEarcon("ok");
      await say("좋아요!", "ko-KR", guard);
      return "ok";
    }

    switch (detectCommand(heard)) {
      case "repeat":
        return "repeat";
      case "next":
        await say("다음으로 넘어갈게요.", "ko-KR", guard);
        return "skip";
      case "slow":
        rateRef.current = RATE_SLOW;
        setSlow(true);
        await say("천천히 할게요.", "ko-KR", guard);
        return "repeat";
      case "normal":
        rateRef.current = RATE_NORMAL;
        setSlow(false);
        await say("보통 속도로 할게요.", "ko-KR", guard);
        return "repeat";
      case "stop":
        pauseByVoice();
        throw CANCEL;
    }

    setView({ reveal: true, result: "miss" });
    setStats((s) => ({ ok: s.ok, tried: s.tried + 1 }));
    await playEarcon("miss");
    guard();
    return "miss";
  }

  // ───────── 단계별 진행 ─────────

  /** 한국어 → 🎤 → 일본어. 틀리면 정답 2회(보통·느리게) + 따라 말할 시간 */
  async function drillLine(line: ConvLine, guard: Guard) {
    for (;;) {
      setView({ ko: line.ko, ja: line.ja, reveal: false, heard: "", result: null });
      await say(line.ko, "ko-KR", guard);
      const heard = await listen(line, guard);
      const outcome = await judge(line, heard, guard);
      if (outcome === "repeat") continue;
      if (outcome === "skip") return "skip";
      if (outcome === "ok") {
        await say(line.ja, "ja-JP", guard);
        await wait(500, guard);
        return "ok";
      }
      setView({ reveal: true });
      await say(line.ja, "ja-JP", guard);
      await wait(300, guard);
      await say(line.ja, "ja-JP", guard, RATE_SLOW);
      // 따라 말하기(쉐도잉) 시간
      await wait(1500 + line.kana.length * 120, guard);
      return "miss";
    }
  }

  async function runStage(s: number, stage: Stage, line0: number, guard: Guard) {
    const scene = SCENES[s];
    const lines = scene.lines;
    posRef.current = { scene: s, stage, line: line0 };
    setView({ scene: s, stage, line: line0, total: lines.length, heard: "", result: null });

    switch (stage) {
      case "intro": {
        setView({ ko: `${scene.emoji} ${scene.title}`, ja: scene.titleJa, reveal: true, total: 0 });
        await say(`장면 ${s + 1}. ${scene.title}.`, "ko-KR", guard);
        await say(scene.titleJa, "ja-JP", guard);
        await wait(400, guard);
        return;
      }

      case "dialog": {
        if (line0 === 0) await say("먼저 전체 대화를 들어 볼게요.", "ko-KR", guard);
        for (let i = line0; i < lines.length; i++) {
          const l = lines[i];
          posRef.current = { scene: s, stage, line: i };
          setView({ line: i, ko: l.ko, ja: l.ja, reveal: true });
          await say(l.ja, "ja-JP", guard, rateRef.current, PITCH[l.speaker]);
          await wait(450, guard);
        }
        return;
      }

      case "drill": {
        if (line0 === 0) {
          missesRef.current = [];
          await say("이제 한국어를 듣고, 삐 소리가 나면 일본어로 말해 보세요.", "ko-KR", guard);
        }
        for (let i = line0; i < lines.length; i++) {
          posRef.current = { scene: s, stage, line: i };
          setView({ line: i });
          const r = await drillLine(lines[i], guard);
          if (r === "miss") missesRef.current.push(i);
        }
        return;
      }

      case "review": {
        const misses = missesRef.current;
        if (misses.length === 0) return;
        setView({ total: misses.length });
        if (line0 === 0) await say("틀린 문장을 한 번 더 연습해요.", "ko-KR", guard);
        for (let k = line0; k < misses.length; k++) {
          posRef.current = { scene: s, stage, line: k };
          setView({ line: k });
          await drillLine(lines[misses[k]], guard);
        }
        return;
      }

      case "role": {
        if (line0 === 0) {
          await say("마지막으로 역할극이에요. 삐 소리가 나면 B 역할로 대답하세요.", "ko-KR", guard);
        }
        for (let i = line0; i < lines.length; i++) {
          const l = lines[i];
          posRef.current = { scene: s, stage, line: i };
          setView({ line: i, ko: l.ko, ja: l.ja, heard: "", result: null });
          if (l.speaker === "A") {
            setView({ reveal: true });
            await say(l.ja, "ja-JP", guard, rateRef.current, PITCH.A);
            await wait(300, guard);
            continue;
          }
          for (;;) {
            setView({ reveal: false, heard: "", result: null });
            const heard = await listen(l, guard);
            const outcome = await judge(l, heard, guard);
            if (outcome === "repeat") {
              // 직전 상대방 대사부터 다시
              const prev = lines[i - 1];
              if (prev?.speaker === "A") {
                await say(prev.ja, "ja-JP", guard, rateRef.current, PITCH.A);
              }
              continue;
            }
            if (outcome !== "skip") {
              setView({ reveal: true });
              await say(l.ja, "ja-JP", guard, rateRef.current, PITCH.B);
              await wait(400, guard);
            }
            break;
          }
        }
        return;
      }
    }
  }

  async function run(start: Pos, greeting?: string) {
    const token = ++tokenRef.current;
    const guard: Guard = () => {
      if (tokenRef.current !== token) throw CANCEL;
    };
    setMode("running");
    setVoicePaused(false);
    void acquireWakeLock();

    try {
      // 첫 발화는 탭 핸들러 안에서 동기적으로 시작되어야 iOS에서 소리가 난다
      if (greeting) await say(greeting, "ko-KR", guard);
      for (let s = start.scene; s < SCENES.length; s++) {
        saveScene(s);
        const first = s === start.scene;
        const st0 = first ? STAGES.indexOf(start.stage) : 0;
        for (let st = st0; st < STAGES.length; st++) {
          await runStage(s, STAGES[st], first && st === st0 ? start.line : 0, guard);
        }
      }
      saveScene(0);
      setActivity("idle");
      setMode("done");
      await say("모든 장면을 마쳤어요. 수고하셨어요!", "ko-KR", guard);
      setActivity("idle");
      void releaseWakeLock();
    } catch (e) {
      if (e !== CANCEL) throw e;
    }
  }

  // ───────── 사용자 조작 ─────────

  function start() {
    unlockEarcons();
    setStats({ ok: 0, tried: 0 });
    missesRef.current = [];
    if (sttAvailable()) {
      micOkRef.current = true;
      micReadyRef.current = primeMicrophone().then((ok) => {
        micOkRef.current = ok;
        setMic(ok ? "ok" : "off");
        return ok;
      });
    } else {
      micOkRef.current = false;
      micReadyRef.current = null;
      setMic("off");
    }
    void run(
      { scene: startScene, stage: "intro", line: 0 },
      "운전 모드를 시작합니다. 화면을 탭하면 멈출 수 있어요."
    );
  }

  function halt() {
    tokenRef.current++;
    stopSpeaking();
    abortListening();
    setActivity("idle");
  }

  function pauseByTap() {
    halt();
    setVoicePaused(false);
    setMode("paused");
    void releaseWakeLock();
  }

  function resume() {
    unlockEarcons();
    void run(posRef.current);
  }

  /** 「ストップ」 — 멈춘 뒤 「スタート」를 기다리며 계속 듣는다 */
  function pauseByVoice() {
    halt();
    const token = tokenRef.current;
    setVoicePaused(true);
    setMode("paused");
    void (async () => {
      setActivity("speaking");
      await speakAsync("멈췄어요. 다시 하려면 스타토라고 말하세요.", "ko-KR", KO_RATE);
      while (tokenRef.current === token) {
        setActivity("listening");
        const r = await listenOnce("ja-JP", { maxMs: 8000 });
        if (tokenRef.current !== token) return;
        if (r.error && FATAL_MIC_ERRORS.includes(r.error)) {
          setActivity("idle");
          setVoicePaused(false);
          return;
        }
        if (detectCommand(r.transcripts, ["start"])) {
          void run(posRef.current);
          return;
        }
        await delay(r.error ? 1000 : 300);
      }
    })();
  }

  function exit() {
    halt();
    setMode("setup");
    void releaseWakeLock();
  }

  // ───────── 화면 ─────────

  if (mode === "setup") {
    return (
      <div className="animate-pop-in space-y-5">
        <header className="flex items-center gap-3 pt-1">
          <Link
            href="/"
            aria-label="뒤로"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-muted"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold">🚗 운전 모드</h1>
            <p className="text-xs text-muted">손 대지 않고 듣고 말하는 회화 연습</p>
          </div>
        </header>

        {hydrated && !ttsAvailable() && (
          <p className="rounded-2xl bg-rose-500/10 p-3 text-center text-xs text-rose-700 dark:text-rose-400">
            이 브라우저는 음성 재생을 지원하지 않아요.
          </p>
        )}
        {hydrated && !sttOk && (
          <p className="rounded-2xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            이 브라우저는 음성 인식을 지원하지 않아요. 대답을 듣지 않고, 말할 시간만 준 뒤 자동으로 넘어가요.
          </p>
        )}
        {hydrated && isIosStandalone() && (
          <p className="rounded-2xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            홈 화면 앱에서는 음성 인식이 잘 안 될 수 있어요. 안 되면 Safari에서 열어 주세요.
          </p>
        )}

        <section className="rounded-2xl border border-border-soft bg-card p-4">
          <p className="text-sm font-semibold">진행 방식</p>
          <ol className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
            <li>1. 장면의 전체 대화를 먼저 들어요</li>
            <li>2. 한국어를 듣고 <b className="text-foreground">삐</b> 소리가 나면 일본어로 말해요</li>
            <li>3. 맞으면 띵동, 아니면 정답을 두 번 들려줘요</li>
            <li>4. 틀린 문장 복습 → B 역할로 역할극</li>
          </ol>
          <p className="mt-2 text-xs text-muted">대답하지 않아도 자동으로 넘어가요.</p>
        </section>

        <section className="rounded-2xl border border-border-soft bg-card p-4">
          <p className="text-sm font-semibold">음성 명령 (삐 소리 뒤에)</p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <CommandRow ja="もう一回" read="모우 잇카이" ko="다시" />
            <CommandRow ja="つぎ" read="츠기" ko="건너뛰기" />
            <CommandRow ja="ゆっくり" read="윳쿠리" ko="천천히" />
            <CommandRow ja="ふつう" read="후츠-" ko="보통 속도" />
            <CommandRow ja="ストップ" read="스톱푸" ko="일시정지" />
            <CommandRow ja="スタート" read="스타-토" ko="다시 시작" />
          </div>
        </section>

        <section className="rounded-2xl bg-indigo-500/5 p-4 text-xs leading-relaxed text-muted">
          <p className="font-semibold text-indigo-600 dark:text-indigo-400">📱 아이폰 사용 팁</p>
          <ul className="mt-1.5 space-y-1">
            <li>• 처음 시작할 때 마이크 권한을 <b>허용</b>해 주세요</li>
            <li>• 화면을 켠 채로 거치대에 두세요 — 화면이 꺼지거나 다른 앱으로 가면 멈춰요</li>
            <li>• 무음 모드를 끄면 신호음이 잘 들려요</li>
            <li>• 운전 중엔 화면을 보지 말고 소리만 따라가세요</li>
          </ul>
        </section>

        <section>
          <p className="mb-2 text-sm font-semibold">시작할 장면</p>
          <div className="space-y-2">
            {SCENES.map((sc, i) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => setPick(i)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                  startScene === i
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-border-soft bg-card"
                }`}
              >
                <span className="text-2xl">{sc.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {i + 1}. {sc.title}
                  </span>
                  <span className="font-ja block text-xs text-muted">
                    {sc.titleJa} · {sc.lines.length}문장
                  </span>
                </span>
                {hydrated && savedScene === i && savedScene > 0 && (
                  <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                    이어서
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={start}
          className="sticky bottom-24 w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 py-5 text-lg font-bold text-white shadow-lg shadow-indigo-500/30 transition active:scale-[0.98]"
        >
          ▶ 시작하기
        </button>
      </div>
    );
  }

  const scene = SCENES[view.scene];
  const paused = mode === "paused";
  const done = mode === "done";
  const pct = ((view.scene + (done ? 1 : 0)) / SCENES.length) * 100;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {scene.emoji} {view.scene + 1}. {scene.title}
          </p>
          <div className="mt-1.5">
            <ProgressBar value={pct} barClassName="bg-indigo-500" />
          </div>
        </div>
        <button
          type="button"
          onClick={exit}
          className="rounded-full bg-foreground/5 px-3.5 py-2 text-xs font-medium text-muted transition active:scale-95"
        >
          ■ 종료
        </button>
      </div>

      {/* 화면 전체가 일시정지/재개 버튼 */}
      <button
        type="button"
        onClick={done ? undefined : paused ? resume : pauseByTap}
        aria-label={paused ? "계속하기" : "일시정지"}
        className={`mt-4 flex flex-1 flex-col items-center justify-center rounded-3xl border p-6 text-center transition active:scale-[0.99] ${
          paused ? "border-amber-400 bg-amber-500/5" : "border-border-soft bg-card"
        }`}
      >
        <span className="rounded-full bg-foreground/5 px-3 py-1 text-xs font-medium text-muted">
          {STAGE_LABEL[view.stage]}
          {view.total > 0 && ` · ${view.line + 1}/${view.total}`}
        </span>

        <ActivityBadge activity={paused || done ? "paused" : activity} />

        <p className="mt-2 text-2xl font-bold leading-snug">{view.ko}</p>
        <p
          className={`font-ja mt-3 text-xl leading-relaxed ${
            view.reveal ? "text-indigo-600 dark:text-indigo-400" : "text-muted/40"
          }`}
        >
          {view.reveal ? view.ja : "・・・"}
        </p>

        <div className="mt-4 min-h-[2.5rem]">
          {view.heard && (
            <p className="font-ja text-sm text-muted">🗣 {view.heard}</p>
          )}
          {view.result === "ok" && (
            <p className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">✅ 잘했어요</p>
          )}
          {view.result === "miss" && (
            <p className="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-400">🔁 정답을 따라 말해 보세요</p>
          )}
        </div>

        <p className="mt-4 text-xs text-muted">
          {done
            ? "🌸 모든 장면을 마쳤어요"
            : paused
              ? voicePaused
                ? "⏸ 일시정지 · 탭하거나 「スタート」라고 말하면 계속"
                : "⏸ 일시정지 · 탭하면 계속"
              : "화면 아무 곳이나 탭하면 일시정지"}
        </p>
      </button>

      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
        <span>
          맞힘 <b className="text-foreground">{stats.ok}</b>/{stats.tried}
        </span>
        <span className="h-3 w-px bg-border-soft" aria-hidden />
        <span>{slow ? "🐢 천천히" : "보통 속도"}</span>
        <span className="h-3 w-px bg-border-soft" aria-hidden />
        <span>{mic === "off" ? "🔇 자동 진행" : "🎤 음성 대답"}</span>
      </div>

      {done && (
        <button
          type="button"
          onClick={() => setMode("setup")}
          className="mt-3 w-full rounded-2xl bg-indigo-500 py-4 font-semibold text-white transition active:scale-[0.98]"
        >
          처음으로
        </button>
      )}
    </div>
  );
}

function CommandRow({ ja, read, ko }: { ja: string; read: string; ko: string }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className="font-ja font-semibold">{ja}</span>
      <span className="text-[11px] text-muted">{read}</span>
      <span className="ml-auto text-muted">{ko}</span>
    </p>
  );
}

function ActivityBadge({ activity }: { activity: Activity | "paused" }) {
  if (activity === "listening") {
    return (
      <span className="mt-6 flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-rose-500 text-4xl text-white shadow-lg shadow-rose-500/40">
        🎤
      </span>
    );
  }
  if (activity === "waiting") {
    return (
      <span className="mt-6 flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-amber-500 text-4xl text-white">
        🗣
      </span>
    );
  }
  if (activity === "speaking") {
    return (
      <span className="mt-6 flex h-24 w-24 items-center justify-center rounded-full bg-indigo-500/15 text-4xl">
        🔊
      </span>
    );
  }
  return (
    <span className="mt-6 flex h-24 w-24 items-center justify-center rounded-full bg-foreground/5 text-4xl">
      {activity === "paused" ? "⏸" : "🚗"}
    </span>
  );
}
