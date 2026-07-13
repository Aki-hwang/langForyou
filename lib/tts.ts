"use client";

/**
 * 일본어·한국어 TTS — 브라우저 내장 Web Speech API 사용 (서버·API 키 불필요).
 */

let jaVoice: SpeechSynthesisVoice | null = null;
let koVoice: SpeechSynthesisVoice | null = null;

function pickVoice(langPrefix: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const matches = voices.filter((v) =>
    v.lang.replace("_", "-").toLowerCase().startsWith(langPrefix)
  );
  if (matches.length === 0) return null;
  return (
    matches.find((v) => /google/i.test(v.name)) ??
    matches.find((v) => v.localService) ??
    matches[0]
  );
}

function getJaVoice(): SpeechSynthesisVoice | null {
  if (!jaVoice) jaVoice = pickVoice("ja");
  return jaVoice;
}

function getKoVoice(): SpeechSynthesisVoice | null {
  if (!koVoice) koVoice = pickVoice("ko");
  return koVoice;
}

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function makeUtterance(
  text: string,
  lang: "ja-JP" | "ko-KR",
  rate: number
): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const voice = lang === "ja-JP" ? getJaVoice() : getKoVoice();
  if (voice) u.voice = voice;
  return u;
}

/** 일본어 발음 재생 (단발성, 이전 발화는 취소) */
export function speakJa(text: string, rate = 0.85): void {
  if (!ttsAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();

  const go = () => synth.speak(makeUtterance(text, "ja-JP", rate));

  if (synth.getVoices().length === 0) {
    synth.addEventListener("voiceschanged", go, { once: true });
    setTimeout(() => {
      if (!synth.speaking && !synth.pending) go();
    }, 300);
  } else {
    go();
  }
}

/** 한국어 발음 재생 (단발성) */
export function speakKo(text: string, rate = 0.95): void {
  if (!ttsAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  synth.speak(makeUtterance(text, "ko-KR", rate));
}

/**
 * Promise 기반 발화 — 재생이 끝나면 resolve.
 * 연속듣기처럼 여러 발화를 순서대로 이어 붙일 때 사용한다.
 * 이전 큐를 지우지 않으므로(cancel 안 함) 호출부에서 순차 await 할 것.
 */
export function speakAsync(
  text: string,
  lang: "ja-JP" | "ko-KR",
  rate = 0.85
): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsAvailable()) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    const u = makeUtterance(text, lang, rate);
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    u.onend = finish;
    u.onerror = finish;
    // 일부 브라우저는 긴 발화에서 onend가 누락되므로 안전 타이머
    const guardMs = 2000 + text.length * 120;
    setTimeout(finish, guardMs / Math.max(0.5, rate));
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  if (ttsAvailable()) window.speechSynthesis.cancel();
}
