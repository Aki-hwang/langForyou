"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/",
    label: "홈",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />
      </svg>
    ),
  },
  {
    href: "/review",
    label: "복습",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 10a8 8 0 0 0-14.9-3M4 14a8 8 0 0 0 14.9 3" />
      </svg>
    ),
  },
  {
    href: "/stats",
    label: "통계",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" d="M5 20V10M12 20V4M19 20v-7" />
      </svg>
    ),
  },
  {
    href: "/account",
    label: "계정",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <circle cx="12" cy="8" r="4" />
        <path strokeLinecap="round" d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg border-t border-border-soft bg-card/90 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
      <div className="flex">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-indigo-600 dark:text-indigo-400" : "text-muted"
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
