"use client";

import { useMemo } from "react";
import { ALL_WORDS } from "@/data";
import { useCards, type CardMap } from "@/lib/storage";
import { sessionNow } from "@/lib/now";
import { isDue } from "@/lib/srs";
import StudySession from "@/components/StudySession";

const SESSION_SIZE = 20;

function buildReviewSession(cards: CardMap) {
  const now = sessionNow();
  return (
    ALL_WORDS.filter((w) => {
      const c = cards[w.id];
      return c && c.reps > 0 && isDue(c, now);
    })
      // 가장 오래 기다린 카드부터
      .sort((a, b) => (cards[a.id]?.dueAt ?? 0) - (cards[b.id]?.dueAt ?? 0))
      .slice(0, SESSION_SIZE)
  );
}

/** 모든 레벨에서 복습 기한이 된 카드를 모아 복습한다. */
export default function ReviewPage() {
  const { cards, loaded } = useCards();

  const session = useMemo(
    () => (loaded ? buildReviewSession(cards) : null),
    [loaded, cards]
  );

  if (session === null) return null;

  return (
    <StudySession
      words={session}
      title="오늘의 복습"
      backHref="/"
      emptyMessage="지금은 복습할 카드가 없어요. 레벨을 골라 새 단어를 학습해 보세요!"
    />
  );
}
