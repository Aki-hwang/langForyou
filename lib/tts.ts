"use client";

/**
 * 일본어 TTS — 브라우저 내장 Web Speech API 사용 (서버·API 키 불필요).
 * iOS/Android/데스크톱 대부분의 브라우저에서 일본어 음성을 지원한다.
 */

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickJaVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  const ja = voices.filter((v) => v.lang.replace("_", "-").startsWith("ja"));
  if (ja.length === 0) return null;
  // Google/Kyoko 등 자연스러운 보이스 우선
  cachedVoice =
    ja.find((v) => /google/i.test(v.name)) ??
    ja.find((v) => v.localService) ??
    ja[0];
  return cachedVoice;
}

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakJa(text: string, rate = 0.85): void {
  if (!ttsAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();

  const speak = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = rate;
    const voice = pickJaVoice();
    if (voice) u.voice = voice;
    synth.speak(u);
  };

  // 일부 브라우저는 getVoices()가 비동기 로드됨
  if (synth.getVoices().length === 0) {
    synth.addEventListener("voiceschanged", speak, { once: true });
    // voiceschanged가 안 오는 브라우저 대비
    setTimeout(() => {
      if (!synth.speaking && !synth.pending) speak();
    }, 300);
  } else {
    speak();
  }
}

export function stopSpeaking(): void {
  if (ttsAvailable()) window.speechSynthesis.cancel();
}
