"use client";

/**
 * 일본어·한국어 TTS — 브라우저 내장 Web Speech API 사용 (서버·API 키 불필요).
 * 음성 품질은 기기에 설치된 음성에 좌우되므로:
 * - 자동 선택은 고급(Enhanced/Premium/Neural) > Google > 유명 보이스 순으로 랭킹
 * - 사용자가 직접 고른 음성(localStorage)이 있으면 항상 그것을 우선
 *
 * iOS Safari는 일부 음성(특히 프리미엄·Siri 계열)을 목록에는 보여 주지만 재생하면
 * 소리가 나지 않는다. 그래서 지정 음성이 일정 시간 안에 재생을 시작하지 못하면
 * "재생 불가"로 기록하고 기본 음성으로 한 번 다시 재생한다.
 */

export type TtsLang = "ja-JP" | "ko-KR";

const PREF_KEYS: Record<TtsLang, string> = {
  "ja-JP": "lfy:voice:ja:v1",
  "ko-KR": "lfy:voice:ko:v1",
};
const BROKEN_KEY = "lfy:voice:broken:v1";

/** 지정 음성이 이 시간 안에 재생을 시작하지 않으면 재생 불가로 본다 */
const START_TIMEOUT_MS = 1500;

const picked: Partial<Record<TtsLang, SpeechSynthesisVoice | null>> = {};

/** 취소 세대 — 취소된 발화의 콜백이 재시도를 일으키지 않도록 */
let generation = 0;

let brokenCache: Set<string> | null = null;

function brokenSet(): Set<string> {
  if (brokenCache) return brokenCache;
  try {
    const raw = localStorage.getItem(BROKEN_KEY);
    brokenCache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    brokenCache = new Set();
  }
  return brokenCache;
}

function saveBroken(): void {
  try {
    localStorage.setItem(BROKEN_KEY, JSON.stringify([...brokenSet()]));
  } catch {
    // 저장 불가 환경 — 세션 동안만 기억
  }
}

function markBroken(voice: SpeechSynthesisVoice): void {
  brokenSet().add(voice.voiceURI);
  saveBroken();
  picked["ja-JP"] = undefined;
  picked["ko-KR"] = undefined;
}

/** 이 기기에서 재생에 실패한 적 있는 음성인지 */
export function isVoiceBroken(voiceURI: string): boolean {
  return brokenSet().has(voiceURI);
}

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export type VoiceQuality = "premium" | "enhanced" | "compact" | null;

/**
 * 음성 품질 등급 — iOS는 이름이 같아도(Kyoko 두 개 등) voiceURI에 등급이 들어 있다.
 * 예: com.apple.voice.compact.ja-JP.Kyoko / com.apple.voice.enhanced.ja-JP.Kyoko
 */
export function voiceQuality(v: SpeechSynthesisVoice): VoiceQuality {
  const id = `${v.voiceURI} ${v.name}`;
  if (/premium|プレミアム|프리미엄/i.test(id)) return "premium";
  if (/enhanced|拡張|고급|향상/i.test(id)) return "enhanced";
  if (/compact/i.test(id)) return "compact";
  return null;
}

function voiceScore(v: SpeechSynthesisVoice, lang: TtsLang): number {
  let s = 0;
  const name = v.name;
  const q = voiceQuality(v);
  // 고품질 음성 우선
  if (q === "premium" || q === "enhanced" || /neural|natural/i.test(name)) s += 100;
  if (q === "premium") s += 10;
  if (/google/i.test(name)) s += 90;
  if (/siri/i.test(name)) s += 50;
  if (lang === "ja-JP" && /kyoko|otoya|o-?ren|hattori/i.test(name)) s += 40;
  if (lang === "ko-KR" && /yuna|sora|suhyun|유나|소라/i.test(name)) s += 40;
  // "compact"는 저품질
  if (q === "compact") s -= 60;
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

/** 사용자 음성 선택 저장 (null이면 자동 선택으로 복귀). 직접 고르면 재생 불가 기록을 지우고 다시 시도 */
export function setPreferredVoice(lang: TtsLang, voiceURI: string | null): void {
  try {
    if (voiceURI) localStorage.setItem(PREF_KEYS[lang], voiceURI);
    else localStorage.removeItem(PREF_KEYS[lang]);
  } catch {
    // 저장 불가 환경 — 세션 동안만 적용
  }
  if (voiceURI && brokenSet().delete(voiceURI)) saveBroken();
  picked[lang] = undefined; // 캐시 무효화
}

function pickVoice(lang: TtsLang): SpeechSynthesisVoice | null {
  const cached = picked[lang];
  if (cached !== undefined) return cached;
  const all = listVoices(lang);
  if (all.length === 0) return null; // 아직 로드 전이면 캐시하지 않음
  const voices = all.filter((v) => !isVoiceBroken(v.voiceURI));
  const prefURI = getPreferredVoiceURI(lang);
  const chosen =
    (prefURI && voices.find((v) => v.voiceURI === prefURI)) || voices[0];
  picked[lang] = chosen ?? null;
  return chosen ?? null;
}

/**
 * 발화 하나를 재생하고 끝나면 onDone(재생 성공 여부).
 * fallback이면 지정 음성이 재생을 시작하지 못할 때 다음 순위 음성으로 다시 재생한다.
 */
function speakOne(
  text: string,
  lang: TtsLang,
  rate: number,
  pitch: number,
  voice: SpeechSynthesisVoice | null,
  fallback: boolean,
  onDone: (played: boolean) => void
): void {
  const synth = window.speechSynthesis;
  const gen = generation;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  u.pitch = pitch;
  if (voice) u.voice = voice;

  const startedAt = Date.now();
  let started = false;
  let finished = false;

  const finish = (played: boolean) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    onDone(played);
  };

  // 지정 음성이 소리를 내지 못함 → 기록하고 기본 음성으로 재시도
  const failVoice = () => {
    if (finished) return;
    if (gen !== generation || !voice) {
      finish(false);
      return;
    }
    finished = true;
    clearTimeout(timer);
    markBroken(voice);
    synth.cancel();
    // 재생 불가 음성을 뺀 다음 순위 음성으로 재시도 (모두 실패하면 언어만 지정한 기본 음성)
    if (fallback) speakOne(text, lang, rate, pitch, pickVoice(lang), true, onDone);
    else onDone(false);
  };

  u.onstart = () => {
    started = true;
  };
  u.onend = () => {
    // 시작 신호 없이 곧바로 끝나면 소리 없이 실패한 것
    if (!started && voice && Date.now() - startedAt < 250) failVoice();
    else finish(true);
  };
  u.onerror = (e) => {
    const err = (e as SpeechSynthesisErrorEvent).error;
    if (err === "interrupted" || err === "canceled" || gen !== generation) {
      finish(false);
    } else if (!started && voice) {
      failVoice();
    } else {
      finish(false);
    }
  };

  const timer = setTimeout(() => {
    if (!started && !synth.speaking && voice) failVoice();
  }, START_TIMEOUT_MS);

  synth.speak(u);
}

/** 이전 발화 취소 — 재생 중일 때만 (iOS는 cancel 직후 speak가 묻히는 경우가 있어 불필요한 cancel을 피한다) */
function cancelCurrent(): void {
  generation++;
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel();
}

/** 일본어 발음 재생 (단발성, 이전 발화는 취소). 학습용이라 기본 속도를 느리게 */
export function speakJa(text: string, rate = 0.75): void {
  if (!ttsAvailable()) return;
  const synth = window.speechSynthesis;
  cancelCurrent();

  const go = () =>
    speakOne(text, "ja-JP", rate, 1, pickVoice("ja-JP"), true, () => {});

  if (synth.getVoices().length === 0) {
    let fired = false;
    const once = () => {
      if (fired) return;
      fired = true;
      go();
    };
    synth.addEventListener("voiceschanged", once, { once: true });
    setTimeout(() => {
      if (!synth.speaking && !synth.pending) once();
    }, 300);
  } else {
    go();
  }
}

/** 한국어 발음 재생 (단발성) */
export function speakKo(text: string, rate = 0.95): void {
  if (!ttsAvailable()) return;
  cancelCurrent();
  speakOne(text, "ko-KR", rate, 1, pickVoice("ko-KR"), true, () => {});
}

/**
 * 특정 음성으로 미리듣기 (음성 선택 화면용).
 * 기본 음성으로 대신 재생하지 않고, 그 음성이 실제로 소리를 냈는지(true/false)를 돌려준다.
 */
export function previewVoice(
  voice: SpeechSynthesisVoice,
  lang: TtsLang
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ttsAvailable()) {
      resolve(false);
      return;
    }
    cancelCurrent();
    const sample =
      lang === "ja-JP" ? "こんにちは。日本語の発音テストです。" : "안녕하세요. 음성 테스트입니다.";
    speakOne(sample, lang, 0.9, 1, voice, false, resolve);
  });
}

/**
 * Promise 기반 발화 — 재생이 끝나면 resolve.
 * 연속듣기처럼 여러 발화를 순서대로 이어 붙일 때 사용한다.
 * pitch는 대화 장면에서 화자(A/B)를 구분할 때 사용.
 */
export function speakAsync(
  text: string,
  lang: TtsLang,
  rate = 0.85,
  pitch = 1
): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsAvailable()) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    // 일부 브라우저는 긴 발화에서 onend가 누락되므로 안전 타이머 (재시도 대기 시간 포함)
    const guardMs = 2000 + text.length * 120;
    setTimeout(finish, guardMs / Math.max(0.5, rate) + START_TIMEOUT_MS);
    speakOne(text, lang, rate, pitch, pickVoice(lang), true, finish);
  });
}

export function stopSpeaking(): void {
  if (!ttsAvailable()) return;
  generation++;
  window.speechSynthesis.cancel();
}
