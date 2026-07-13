"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CardState, Grade } from "./types";
import { gradeCard, initialCardState } from "./srs";

const CARDS_KEY = "lfy:cards:v1";
const DAYS_KEY = "lfy:days:v1";

export type CardMap = Record<string, CardState>;
/** 날짜(YYYY-MM-DD)별 학습 기록 */
export type DayStats = Record<string, { reviews: number; correct: number }>;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadCards(): CardMap {
  if (typeof window === "undefined") return {};
  return safeParse<CardMap>(localStorage.getItem(CARDS_KEY), {});
}

export function loadDayStats(): DayStats {
  if (typeof window === "undefined") return {};
  return safeParse<DayStats>(localStorage.getItem(DAYS_KEY), {});
}

export function todayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ------------------------------------------------------------------ */
/* 외부 스토어(useSyncExternalStore) — localStorage를 단일 소스로 사용  */
/* ------------------------------------------------------------------ */

const CHANGE_EVENT = "lfy:data-changed";

let cardsCache: CardMap | null = null;
let daysCache: DayStats | null = null;

const EMPTY_CARDS: CardMap = {};
const EMPTY_DAYS: DayStats = {};

function emitChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(cb: () => void): () => void {
  const handler = () => {
    cardsCache = null;
    daysCache = null;
    cb();
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function getCardsSnapshot(): CardMap {
  if (cardsCache === null) cardsCache = loadCards();
  return cardsCache;
}

function getDaysSnapshot(): DayStats {
  if (daysCache === null) daysCache = loadDayStats();
  return daysCache;
}

const noopSubscribe = () => () => {};

/** 클라이언트 데이터가 준비됐는지 (SSR/하이드레이션 안전) */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

function recordDay(correct: boolean) {
  const days = loadDayStats();
  const key = todayKey(new Date());
  const cur = days[key] ?? { reviews: 0, correct: 0 };
  days[key] = {
    reviews: cur.reviews + 1,
    correct: cur.correct + (correct ? 1 : 0),
  };
  localStorage.setItem(DAYS_KEY, JSON.stringify(days));
}

/** SRS 카드 상태 훅 — localStorage 기반, 컴포넌트 간 실시간 동기화 */
export function useCards() {
  const cards = useSyncExternalStore(
    subscribe,
    getCardsSnapshot,
    () => EMPTY_CARDS
  );
  const loaded = useHydrated();

  const grade = useCallback((wordId: string, g: Grade) => {
    const all = { ...loadCards() };
    const cur = all[wordId] ?? initialCardState(wordId);
    all[wordId] = gradeCard(cur, g);
    localStorage.setItem(CARDS_KEY, JSON.stringify(all));
    recordDay(g !== "again");
    emitChange();
  }, []);

  return { cards, loaded, grade };
}

/** 일별 학습 기록 훅 */
export function useDayStats(): DayStats {
  return useSyncExternalStore(subscribe, getDaysSnapshot, () => EMPTY_DAYS);
}

/** 연속 학습일 계산 (오늘 포함, 어제까지 이어진 기록) */
export function calcStreakDays(days: DayStats, now: Date): number {
  let streak = 0;
  const d = new Date(now);
  // 오늘 기록이 없으면 어제부터 계산
  if (!days[todayKey(d)]) d.setDate(d.getDate() - 1);
  while (days[todayKey(d)]) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
