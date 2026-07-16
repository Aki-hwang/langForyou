import { NextResponse } from "next/server";
import { dbConfigured, query } from "@/lib/server/db";
import { getSessionUser } from "@/lib/server/auth";
import type { CardState } from "@/lib/types";

export const runtime = "nodejs";

interface DayRow {
  day: string;
  reviews: number;
  correct: number;
}

const MAX_BATCH = 3000;
const CHUNK = 200;

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return [...map.values()];
}

function validCard(c: unknown): c is CardState {
  if (typeof c !== "object" || c === null) return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.wordId === "string" &&
    /^n[1-5]-\d{3}$/.test(o.wordId) &&
    typeof o.streak === "number" &&
    typeof o.intervalDays === "number" &&
    typeof o.ease === "number" &&
    typeof o.dueAt === "number" &&
    typeof o.lastReviewedAt === "number" &&
    typeof o.reps === "number" &&
    typeof o.lapses === "number"
  );
}

function validDay(d: unknown): d is DayRow {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  return (
    typeof o.day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(o.day) &&
    typeof o.reviews === "number" &&
    typeof o.correct === "number"
  );
}

/** 로그인 사용자의 전체 진도 조회 */
export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cardsQ = await query<{
    word_id: string;
    streak: number;
    interval_days: number;
    ease: number;
    due_at: string;
    last_reviewed_at: string;
    reps: number;
    lapses: number;
  }>(
    `SELECT word_id, streak, interval_days, ease, due_at, last_reviewed_at, reps, lapses
     FROM progress_cards WHERE user_id = $1`,
    [user.id]
  );
  const daysQ = await query<DayRow>(
    "SELECT day, reviews, correct FROM progress_days WHERE user_id = $1",
    [user.id]
  );

  const cards: CardState[] = cardsQ.rows.map((r) => ({
    wordId: r.word_id,
    streak: r.streak,
    intervalDays: r.interval_days,
    ease: r.ease,
    dueAt: Number(r.due_at),
    lastReviewedAt: Number(r.last_reviewed_at),
    reps: r.reps,
    lapses: r.lapses,
  }));

  return NextResponse.json({ cards, days: daysQ.rows });
}

/**
 * 진도 업서트(병합).
 * - 카드: 서버 기록보다 reps가 크거나, 같으면 lastReviewedAt이 최신일 때만 갱신
 * - 일별 기록: reviews/correct 각각 큰 값 유지
 */
export async function PUT(req: Request) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { cards?: unknown[]; days?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // ON CONFLICT는 같은 키가 한 INSERT에 두 번 오면 에러 — 키 기준 중복 제거
  const cards = dedupeBy(
    (body.cards ?? []).filter(validCard).slice(0, MAX_BATCH),
    (c) => c.wordId
  );
  const days = dedupeBy(
    (body.days ?? []).filter(validDay).slice(0, MAX_BATCH),
    (d) => d.day
  );

  for (let i = 0; i < cards.length; i += CHUNK) {
    const chunk = cards.slice(i, i + CHUNK);
    const params: unknown[] = [user.id];
    const rows = chunk.map((c) => {
      const base = params.length;
      params.push(
        c.wordId,
        c.streak,
        c.intervalDays,
        c.ease,
        c.dueAt,
        c.lastReviewedAt,
        c.reps,
        c.lapses
      );
      return `($1,$${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
    });
    await query(
      `INSERT INTO progress_cards
         (user_id, word_id, streak, interval_days, ease, due_at, last_reviewed_at, reps, lapses)
       VALUES ${rows.join(",")}
       ON CONFLICT (user_id, word_id) DO UPDATE SET
         streak = EXCLUDED.streak,
         interval_days = EXCLUDED.interval_days,
         ease = EXCLUDED.ease,
         due_at = EXCLUDED.due_at,
         last_reviewed_at = EXCLUDED.last_reviewed_at,
         reps = EXCLUDED.reps,
         lapses = EXCLUDED.lapses
       WHERE EXCLUDED.reps > progress_cards.reps
          OR (EXCLUDED.reps = progress_cards.reps
              AND EXCLUDED.last_reviewed_at >= progress_cards.last_reviewed_at)`,
      params
    );
  }

  for (let i = 0; i < days.length; i += CHUNK) {
    const chunk = days.slice(i, i + CHUNK);
    const params: unknown[] = [user.id];
    const rows = chunk.map((d) => {
      const base = params.length;
      params.push(d.day, d.reviews, d.correct);
      return `($1,$${base + 1},$${base + 2},$${base + 3})`;
    });
    await query(
      `INSERT INTO progress_days (user_id, day, reviews, correct)
       VALUES ${rows.join(",")}
       ON CONFLICT (user_id, day) DO UPDATE SET
         reviews = GREATEST(progress_days.reviews, EXCLUDED.reviews),
         correct = GREATEST(progress_days.correct, EXCLUDED.correct)`,
      params
    );
  }

  return NextResponse.json({ ok: true, cards: cards.length, days: days.length });
}
