/**
 * 음성 인식 결과 판정 — 정답 문장과의 유사도 계산, 음성 명령 감지.
 * 발음 채점이 아니라 "대략 맞게 말했는가"를 너그럽게 본다.
 */

/** 비교용 정규화: 전각/반각 통일, 가타카나→히라가나, 공백·문장부호·장음 제거 */
export function normalizeJa(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    )
    .replace(/[\s、。，．,.！!？?「」『』・ー〜~…]/g, "");
}

function bigrams(s: string): string[] {
  if (s.length < 2) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** 바이그램 Dice 계수 (0~1) */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  const pool = new Map<string, number>();
  for (const g of B) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of A) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

/** 인식 후보들과 정답 표기들(한자·가나·대체 표기) 사이의 최고 유사도 */
export function answerScore(heard: string[], targets: string[]): number {
  let best = 0;
  for (const h of heard) {
    const nh = normalizeJa(h);
    for (const t of targets) best = Math.max(best, similarity(nh, normalizeJa(t)));
  }
  return best;
}

export const PASS_SCORE = 0.6;

export type VoiceCommand = "repeat" | "next" | "slow" | "normal" | "stop" | "start";

/** 운전 중 쓰는 짧은 일본어 명령 — 인식 언어가 ja-JP라서 명령도 일본어로 한다 */
export const COMMANDS: Record<VoiceCommand, string[]> = {
  repeat: ["もう一回", "もういっかい", "もう1回", "もう一度", "もういちど"],
  next: ["つぎ", "次", "次へ", "つぎへ", "スキップ", "ネクスト"],
  slow: ["ゆっくり", "ゆっくりで"],
  normal: ["ふつう", "普通"],
  stop: ["ストップ", "止めて", "とめて", "停止"],
  start: ["スタート", "はじめ", "始め", "再開", "さいかい"],
};

/**
 * 명령 감지 — 짧은 발화만 명령으로 본다.
 * (「次の電車は…」처럼 문장 속에 섞인 단어를 명령으로 오인하지 않도록)
 */
export function detectCommand(
  heard: string[],
  allowed: VoiceCommand[] = ["repeat", "next", "slow", "normal", "stop"]
): VoiceCommand | null {
  for (const h of heard) {
    const nh = normalizeJa(h);
    if (!nh) continue;
    for (const cmd of allowed) {
      for (const form of COMMANDS[cmd]) {
        const nf = normalizeJa(form);
        if (nh === nf || (nh.includes(nf) && nh.length <= nf.length + 3)) {
          return cmd;
        }
      }
    }
  }
  return null;
}
