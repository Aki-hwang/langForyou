"use client";

/**
 * 음성 인식(STT) — 브라우저 내장 Web Speech API(SpeechRecognition) 사용.
 * iOS Safari 14.5+ / 안드로이드 크롬 지원. 외부 API 없음.
 *
 * 운전 모드처럼 "말할 차례"에만 짧게 듣는 용도로 설계:
 * - listenOnce()는 한 번 듣고 결과(후보 문장들)로 resolve한다. 실패해도 reject하지 않는다.
 * - 말이 끝나고 silenceMs 동안 새 결과가 없으면 스스로 멈춘다(iOS는 final 결과가 늦게 오는 경우가 많음).
 * - 마이크 권한은 사용자 제스처 안에서 primeMicrophone()으로 미리 받아 둔다.
 */

type RecAlternative = { transcript: string };
type RecResult = { length: number; [i: number]: RecAlternative };
type RecEvent = { results: { length: number; [i: number]: RecResult } };
type RecErrorEvent = { error: string };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: RecErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttAvailable(): boolean {
  return getCtor() !== null;
}

export type ListenResult = {
  /** 인식 후보 문장 (첫 번째가 가장 유력). 아무 말도 없으면 빈 배열 */
  transcripts: string[];
  /** 권한 거부 등 치명적 오류 코드 (no-speech·aborted는 오류로 보지 않음) */
  error?: string;
};

let active: Recognition | null = null;

export function listenOnce(
  lang: string,
  { maxMs, silenceMs = 1200 }: { maxMs: number; silenceMs?: number }
): Promise<ListenResult> {
  return new Promise((resolve) => {
    const Ctor = getCtor();
    if (!Ctor) {
      resolve({ transcripts: [], error: "unsupported" });
      return;
    }
    abortListening();

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    active = rec;

    let transcripts: string[] = [];
    let error: string | undefined;
    let settled = false;
    let silenceTimer: ReturnType<typeof setTimeout> | undefined;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(silenceTimer);
      clearTimeout(safetyTimer);
      clearTimeout(maxTimer);
      if (active === rec) active = null;
      resolve({ transcripts, error });
    };

    // stop() 후 onend가 오지 않는 브라우저 대비
    const stopSoon = () => {
      try {
        rec.stop();
      } catch {
        // 이미 종료됨
      }
      clearTimeout(safetyTimer);
      safetyTimer = setTimeout(finish, 1500);
    };

    rec.onresult = (e) => {
      let head = "";
      for (let i = 0; i < e.results.length - 1; i++) {
        head += e.results[i][0]?.transcript ?? "";
      }
      const last = e.results[e.results.length - 1];
      const alts: string[] = [];
      for (let j = 0; j < last.length; j++) {
        const t = (head + last[j].transcript).trim();
        if (t && !alts.includes(t)) alts.push(t);
      }
      if (alts.length) transcripts = alts;
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(stopSoon, silenceMs);
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") error = e.error;
    };
    rec.onend = finish;

    const maxTimer = setTimeout(stopSoon, maxMs);

    try {
      rec.start();
    } catch {
      error = "start-failed";
      finish();
    }
  });
}

/** 진행 중인 인식을 즉시 중단 (결과는 버린다) */
export function abortListening(): void {
  const rec = active;
  active = null;
  try {
    rec?.abort();
  } catch {
    // 이미 종료됨
  }
}

/**
 * 마이크 권한을 미리 요청 — 반드시 탭 등 사용자 제스처 안에서 호출.
 * iOS는 제스처 밖에서 처음 마이크를 열면 거부될 수 있다.
 * 권한을 받으면 true. 스트림은 바로 닫는다.
 */
export async function primeMicrophone(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return sttAvailable();
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}
