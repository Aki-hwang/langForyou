import type { JlptLevel, Word } from "@/lib/types";
import { n5Words } from "./n5";
import { n4Words } from "./n4";
import { n3Words } from "./n3";
import { n2Words } from "./n2";
import { n1Words } from "./n1";

export const WORDS_BY_LEVEL: Record<JlptLevel, Word[]> = {
  N5: n5Words,
  N4: n4Words,
  N3: n3Words,
  N2: n2Words,
  N1: n1Words,
};

export const ALL_WORDS: Word[] = [
  ...n5Words,
  ...n4Words,
  ...n3Words,
  ...n2Words,
  ...n1Words,
];

const WORD_INDEX = new Map(ALL_WORDS.map((w) => [w.id, w]));

export function getWord(id: string): Word | undefined {
  return WORD_INDEX.get(id);
}

export function levelOfWordId(id: string): JlptLevel {
  return id.slice(0, 2).toUpperCase() as JlptLevel;
}

export interface LevelMeta {
  level: JlptLevel;
  title: string;
  desc: string;
  /** Tailwind 클래스 (정적 문자열이어야 함) */
  accentText: string;
  accentBg: string;
  accentSoftBg: string;
  gradient: string;
}

export const LEVEL_META: Record<JlptLevel, LevelMeta> = {
  N5: {
    level: "N5",
    title: "N5 · 입문",
    desc: "기초 인사와 일상 단어",
    accentText: "text-emerald-600 dark:text-emerald-400",
    accentBg: "bg-emerald-500",
    accentSoftBg: "bg-emerald-500/10",
    gradient: "from-emerald-500 to-teal-500",
  },
  N4: {
    level: "N4",
    title: "N4 · 초급",
    desc: "일상 회화의 핵심 어휘",
    accentText: "text-sky-600 dark:text-sky-400",
    accentBg: "bg-sky-500",
    accentSoftBg: "bg-sky-500/10",
    gradient: "from-sky-500 to-blue-500",
  },
  N3: {
    level: "N3",
    title: "N3 · 중급",
    desc: "뉴스·직장에서 쓰는 어휘",
    accentText: "text-violet-600 dark:text-violet-400",
    accentBg: "bg-violet-500",
    accentSoftBg: "bg-violet-500/10",
    gradient: "from-violet-500 to-purple-500",
  },
  N2: {
    level: "N2",
    title: "N2 · 중상급",
    desc: "비즈니스·시사 어휘",
    accentText: "text-amber-600 dark:text-amber-400",
    accentBg: "bg-amber-500",
    accentSoftBg: "bg-amber-500/10",
    gradient: "from-amber-500 to-orange-500",
  },
  N1: {
    level: "N1",
    title: "N1 · 고급",
    desc: "원어민 수준의 고급 어휘",
    accentText: "text-rose-600 dark:text-rose-400",
    accentBg: "bg-rose-500",
    accentSoftBg: "bg-rose-500/10",
    gradient: "from-rose-500 to-pink-500",
  },
};
