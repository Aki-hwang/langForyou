import type { CardState, Grade } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

/** 새 카드의 초기 상태 */
export function initialCardState(wordId: string, now = Date.now()): CardState {
  return {
    wordId,
    streak: 0,
    intervalDays: 0,
    ease: 2.5,
    dueAt: now,
    lastReviewedAt: 0,
    reps: 0,
    lapses: 0,
  };
}

/**
 * SM-2 간소화 알고리즘.
 * - again: 10분 뒤 다시 (streak 리셋)
 * - hard:  간격 소폭 증가, ease 감소
 * - good:  1일 → ease 배수로 증가
 * - easy:  더 큰 간격, ease 증가
 */
export function gradeCard(card: CardState, grade: Grade, now = Date.now()): CardState {
  const next: CardState = { ...card, reps: card.reps + 1, lastReviewedAt: now };

  switch (grade) {
    case "again":
      next.streak = 0;
      next.lapses = card.lapses + 1;
      next.ease = Math.max(MIN_EASE, card.ease - 0.2);
      next.intervalDays = 0;
      next.dueAt = now + 10 * 60 * 1000; // 10분 뒤
      break;
    case "hard":
      next.streak = card.streak;
      next.ease = Math.max(MIN_EASE, card.ease - 0.15);
      next.intervalDays = Math.max(1, Math.round(card.intervalDays * 1.2)) || 1;
      next.dueAt = now + next.intervalDays * DAY_MS;
      break;
    case "good":
      next.streak = card.streak + 1;
      next.intervalDays =
        card.intervalDays === 0 ? 1 : Math.round(card.intervalDays * card.ease);
      next.dueAt = now + next.intervalDays * DAY_MS;
      break;
    case "easy":
      next.streak = card.streak + 1;
      next.ease = Math.min(MAX_EASE, card.ease + 0.15);
      next.intervalDays =
        card.intervalDays === 0
          ? 3
          : Math.round(card.intervalDays * card.ease * 1.4);
      next.dueAt = now + next.intervalDays * DAY_MS;
      break;
  }
  return next;
}

/** 복습이 필요한 카드인지 */
export function isDue(card: CardState, now = Date.now()): boolean {
  return card.dueAt <= now;
}

/**
 * 카드 숙련도 0~100.
 * 간격이 21일 이상이면 마스터(100)로 간주.
 */
export function masteryOf(card: CardState | undefined): number {
  if (!card || card.reps === 0) return 0;
  const byInterval = Math.min(1, card.intervalDays / 21);
  return Math.round(byInterval * 100);
}

export function isMastered(card: CardState | undefined): boolean {
  return masteryOf(card) >= 100;
}
