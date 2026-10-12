"use client";

import { useState } from "react";

/**
 * Dashboard greeting: time-of-day salutation with the user's real name and
 * today's date in the BROWSER's timezone — the app's existing convention
 * (see `localToday()`); the server's clock is never authoritative for this.
 * Hydration mismatches between server and client dates are suppressed.
 */
export function Greeting({ name }: { name: string }) {
  const [now] = useState(() => new Date());

  const hour = now.getHours();
  const word = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const date = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h1
          className="truncate text-2xl font-extrabold tracking-tight dark:text-slate-50"
          suppressHydrationWarning
        >
          {word}, {name}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Here&apos;s what&apos;s happening with your inventory today.
        </p>
      </div>
      <p
        className="mt-1 flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500"
        suppressHydrationWarning
      >
        {date}
      </p>
    </div>
  );
}
