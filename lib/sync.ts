"use client";

import { useSyncExternalStore } from "react";
import type { CardState } from "./types";
import { loadCards, loadDayStats, mergeServerData } from "./storage";

/**
 * 서버 진도 동기화.
 * - 로그인하면 setSyncEnabled(true) → 학습(grade)할 때마다 변경분을 모아
 *   1.5초 디바운스 후 서버에 PUT (실패 시 10초 뒤 재시도)
 * - fullSync(): 서버 기록을 내려받아 로컬과 병합 후, 병합 결과 전체를 다시 올림
 *   (앱 시작·로그인 시 호출 → 기기 간 수렴)
 */

export interface SyncInfo {
  lastSyncAt: number | null;
  error: string | null;
  syncing: boolean;
}

let info: SyncInfo = { lastSyncAt: null, error: null, syncing: false };
const SERVER_INFO: SyncInfo = { lastSyncAt: null, error: null, syncing: false };
const listeners = new Set<() => void>();

function setInfo(patch: Partial<SyncInfo>): void {
  info = { ...info, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSyncInfo(): SyncInfo {
  return useSyncExternalStore(subscribe, () => info, () => SERVER_INFO);
}

let enabled = false;
const changedWords = new Set<string>();
const changedDays = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

export function setSyncEnabled(on: boolean): void {
  enabled = on;
  if (!on) {
    changedWords.clear();
    changedDays.clear();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
}

export function noteChange(wordId: string, day: string): void {
  if (!enabled) return;
  changedWords.add(wordId);
  changedDays.add(day);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), 1500);
}

async function putProgress(
  cards: CardState[],
  days: { day: string; reviews: number; correct: number }[]
): Promise<boolean> {
  const r = await fetch("/api/progress", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cards, days }),
  });
  return r.ok;
}

async function flush(): Promise<void> {
  if (!enabled || flushing) return;
  if (changedWords.size === 0 && changedDays.size === 0) return;
  flushing = true;
  setInfo({ syncing: true });

  const allCards = loadCards();
  const allDays = loadDayStats();
  const cards = [...changedWords].map((id) => allCards[id]).filter(Boolean);
  const days = [...changedDays]
    .filter((d) => allDays[d])
    .map((d) => ({ day: d, ...allDays[d] }));
  const sentWords = [...changedWords];
  const sentDays = [...changedDays];
  changedWords.clear();
  changedDays.clear();

  try {
    const ok = await putProgress(cards, days);
    if (!ok) throw new Error("push_failed");
    setInfo({ lastSyncAt: Date.now(), error: null, syncing: false });
  } catch {
    // 실패분 복구 후 재시도 예약
    sentWords.forEach((w) => changedWords.add(w));
    sentDays.forEach((d) => changedDays.add(d));
    setInfo({ error: "push_failed", syncing: false });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), 10000);
  } finally {
    flushing = false;
  }
}

export async function fullSync(): Promise<boolean> {
  setInfo({ syncing: true });
  try {
    const r = await fetch("/api/progress");
    if (!r.ok) throw new Error("pull_failed");
    const j = (await r.json()) as {
      cards?: CardState[];
      days?: { day: string; reviews: number; correct: number }[];
    };
    mergeServerData(j.cards ?? [], j.days ?? []);

    // 병합된 로컬 전체를 서버로 (학습한 카드만 존재하므로 크기는 작음)
    const cards = Object.values(loadCards()).filter((c) => c.reps > 0);
    const days = Object.entries(loadDayStats()).map(([day, v]) => ({
      day,
      ...v,
    }));
    const ok = await putProgress(cards, days);
    if (!ok) throw new Error("push_failed");

    setInfo({ lastSyncAt: Date.now(), error: null, syncing: false });
    return true;
  } catch {
    setInfo({ error: "sync_failed", syncing: false });
    return false;
  }
}
