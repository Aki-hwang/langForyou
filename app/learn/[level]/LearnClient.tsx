"use client";

import { useMemo } from "react";
import type { JlptLevel } from "@/lib/types";
import { WORDS_BY_LEVEL, LEVEL_META } from "@/data";
import { useCards, type CardMap } from "@/lib/storage";
import { sessionNow } from "@/lib/now";
import { isDue } from "@/lib/srs";
import StudySession from "@/components/StudySession";

const SESSION_SIZE = 10;

function buildSession(level: JlptLevel, cards: CardMap) {
  const words = WORDS_BY_LEVEL[level];
  const now = sessionNow();

  // 복습 예정 카드 우선, 나머지는 새 단어로 채움
  const due = words.filter((w) => {
    const c = cards[w.id];
    return c && c.reps > 0 && isDue(c, now);
  });
  const fresh = words.filter((w) => (cards[w.id]?.reps ?? 0) === 0);

  return [...due, ...fresh].slice(0, SESSION_SIZE);
}

export default function LearnClient({ level }: { level: JlptLevel }) {
  const { cards, loaded } = useCards();

  // 세션 목록: StudySession은 마운트 시점의 words만 사용하므로
  // 이후 cards 변경으로 재계산되어도 진행 중인 세션에는 영향 없다.
  const session = useMemo(
    () => (loaded ? buildSession(level, cards) : null),
    [loaded, level, cards]
  );

  if (session === null) return null;

  return (
    <StudySession
      words={session}
      title={`${LEVEL_META[level].title} 학습`}
      backHref={`/level/${level.toLowerCase()}`}
      emptyMessage="이 레벨의 단어를 모두 학습했어요! 복습 탭에서 기억을 다져 보세요."
    />
  );
}
