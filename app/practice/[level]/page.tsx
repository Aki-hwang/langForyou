import { notFound } from "next/navigation";
import type { JlptLevel } from "@/lib/types";
import { JLPT_LEVELS } from "@/lib/types";
import PracticeClient from "./PracticeClient";

export function generateStaticParams() {
  return JLPT_LEVELS.map((l) => ({ level: l.toLowerCase() }));
}

export default async function PracticePage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  const { level } = await params;
  const upper = level.toUpperCase() as JlptLevel;
  if (!JLPT_LEVELS.includes(upper)) notFound();
  return <PracticeClient level={upper} />;
}
