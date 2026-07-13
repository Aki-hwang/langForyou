export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

export const JLPT_LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

export interface Word {
  /** 고유 ID, 예: "n5-001" */
  id: string;
  /** 한자 표기 (한자가 없는 단어는 가나 표기와 동일) */
  kanji: string;
  /** 히라가나/가타카나 읽기 */
  kana: string;
  /** 한국어 뜻 */
  meaning: string;
  /** 품사: 명사, 동사, い형용사, な형용사, 부사, 표현 등 */
  pos: string;
  example: {
    /** 해당 단어가 포함된 일본어 예문 */
    ja: string;
    /** 예문의 한국어 번역 */
    ko: string;
  };
}

/** SRS(간격 반복) 카드 상태 — SM-2 간소화 버전 */
export interface CardState {
  wordId: string;
  /** 연속 정답 횟수 (틀리면 0으로 리셋) */
  streak: number;
  /** 복습 간격 (일) */
  intervalDays: number;
  /** 난이도 계수 (SM-2 ease factor) */
  ease: number;
  /** 다음 복습 시각 (epoch ms) */
  dueAt: number;
  /** 마지막 학습 시각 (epoch ms) */
  lastReviewedAt: number;
  /** 총 학습 횟수 */
  reps: number;
  /** 총 오답 횟수 */
  lapses: number;
}

export type Grade = "again" | "hard" | "good" | "easy";
