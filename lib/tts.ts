"use client";

/**
 * 일본어·한국어 TTS — 브라우저 내장 Web Speech API 사용 (서버·API 키 불필요).
 * 음성 품질은 기기에 설치된 음성에 좌우되므로:
 * - 자동 선택은 고급(Enhanced/Premium/Neural) > Google > 유명 보이스 순으로 랭킹
 * - 사용자가 직접 고른 음성(localStorage)이 있으면 항상 그것을 우선
 */

export type TtsLang = "ja-JP" | "ko-KR";

const PREF_KEYS: Record<TtsLang, string> = {
  "ja-JP": "lfy:voice:ja:v1",
  "ko-KR": "lfy:voice:ko:v1",
};

const picked: Partial<Record<TtsLang, SpeechSynthesisVoice | null>> = {};

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function voiceScore(v: SpeechSynthesisVoice, lang: TtsLang): number {
  let s = 0;
  const name = v.name;
  // 고품질 음성 우선
  if (/enhanced|premium|neural|natural|拡張|プレミアム|고급/i.test(name)) s += 100;
  if (/google/i.test(name)) s += 90;
  if (/siri/i.test(name)) s += 50;
  if (lang === "ja-JP" && /kyoko|otoya|o-?ren|hattori/i.test(name)) s += 40;
  if (lang === "ko-KR" && /yuna|sora|suhyun|유나|소라/i.test(name)) s += 40;
  // "compact"는 저품질
  if (/compact/i.test(name)) s -= 60;
  if (v.localService) s += 10;
  return s;
}

/** 해당 언어의 음성 목록 (품질 점수 순 정렬) */
export function listVoices(lang: TtsLang): SpeechSynthesisVoice[] {
  if (!ttsAvailable()) return [];
  const prefix = lang.slice(0, 2);
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(prefix))
    .sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang));
}

export function getPreferredVoiceURI(lang: TtsLang): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(PREF_KEYS[lang]);
  } catch {
    return null;
  }
}

/** 사용자 음성 선택 저장 (null이면 자동 선택으로 복귀) */
export function setPreferredVoice(lang: TtsLang, voiceURI: string | null): void {
  try {
    if (voiceURI) localStorage.setItem(PREF_KEYS[lang], voiceURI);
    else localStorage.removeItem(PREF_KEYS[lang]);
  } catch {
    // 저장 불가 환경 — 세션 동안만 적용
  }
  picked[lang] = undefined; // 캐시 무효화
}

function pickVoice(lang: TtsLang): SpeechSynthesisVoice | null {
  const cached = picked[lang];
  if (cached !== undefined) return cached;
  const voices = listVoices(lang);
  if (voices.length === 0) return null; // 아직 로드 전이면 캐시하지 않음
  const prefURI = getPreferredVoiceURI(lang);
  const chosen =
    (prefURI && voices.find((v) => v.voiceURI === prefURI)) || voices[0];
  picked[lang] = chosen ?? null;
  return chosen ?? null;
}

function makeUtterance(
  text: string,
  lang: TtsLang,
  rate: number
): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  return u;
}

/** 일본어 발음 재생 (단발성, 이전 발화는 취소). 학습용이라 기본 속도를 느리게 */
export function speakJa(text: string, rate = 0.75): void {
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

/** 특정 음성으로 미리듣기 (음성 선택 화면용) */
export function previewVoice(voice: SpeechSynthesisVoice, lang: TtsLang): void {
  if (!ttsAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const sample =
    lang === "ja-JP" ? "こんにちは。日本語の発音テストです。" : "안녕하세요. 음성 테스트입니다.";
  const u = new SpeechSynthesisUtterance(sample);
  u.lang = lang;
  u.voice = voice;
  u.rate = 0.9;
  synth.speak(u);
}

/**
 * Promise 기반 발화 — 재생이 끝나면 resolve.
 * 연속듣기처럼 여러 발화를 순서대로 이어 붙일 때 사용한다.
 */
export function speakAsync(
  text: string,
  lang: TtsLang,
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
