"use client";

/**
 * 효과음(earcon) — 화면을 보지 않아도 "지금 말할 차례"·정답/오답을 알 수 있게 하는 짧은 신호음.
 * Web Audio API로 즉석 합성하므로 음원 파일이 필요 없다.
 * iOS는 AudioContext를 사용자 제스처 안에서 깨워야 하므로 unlockEarcons()를 탭 핸들러에서 호출한다.
 */

export type EarconKind = "listen" | "ok" | "miss";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** 탭 핸들러 안에서 호출 — 이후 비동기 코드에서도 소리가 나도록 오디오를 깨운다 */
export function unlockEarcons(): void {
  const c = getCtx();
  if (!c) return;
  void c.resume();
  // 무음 버퍼를 한 번 재생해 iOS 오디오 출력을 연다
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.start(0);
}

const TONES: Record<EarconKind, { freq: number; at: number; dur: number }[]> = {
  // 말할 차례: 높은 "삐" 한 번
  listen: [{ freq: 880, at: 0, dur: 0.12 }],
  // 정답: 올라가는 두 음
  ok: [
    { freq: 660, at: 0, dur: 0.1 },
    { freq: 990, at: 0.11, dur: 0.14 },
  ],
  // 오답/무응답: 낮은 음
  miss: [{ freq: 330, at: 0, dur: 0.18 }],
};

export function playEarcon(kind: EarconKind): Promise<void> {
  const c = getCtx();
  if (!c) return Promise.resolve();
  const now = c.currentTime + 0.02;
  let end = 0;
  for (const t of TONES[kind]) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = t.freq;
    gain.gain.setValueAtTime(0.0001, now + t.at);
    gain.gain.exponentialRampToValueAtTime(0.35, now + t.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t.at + t.dur);
    osc.connect(gain).connect(c.destination);
    osc.start(now + t.at);
    osc.stop(now + t.at + t.dur + 0.02);
    end = Math.max(end, t.at + t.dur);
  }
  return new Promise((r) => setTimeout(r, (end + 0.05) * 1000));
}
