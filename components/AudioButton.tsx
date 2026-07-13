"use client";

import { speakJa } from "@/lib/tts";

export default function AudioButton({
  text,
  size = "md",
  className = "",
}: {
  text: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims =
    size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const icon = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type="button"
      aria-label="발음 듣기"
      onClick={(e) => {
        e.stopPropagation();
        speakJa(text);
      }}
      className={`inline-flex items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 transition active:scale-90 dark:text-indigo-400 ${dims} ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={icon}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"
        />
      </svg>
    </button>
  );
}
