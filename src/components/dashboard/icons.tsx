/** Inline feather-style icons for the dashboard (no icon dependency). */
type IconProps = { className?: string };

const base = {
  fill: "none",
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Accent chip colors for card icons / count circles. */
export const TONE_CHIP: Record<string, string> = {
  blue: "bg-blue-600",
  sky: "bg-sky-600",
  amber: "bg-amber-500",
  emerald: "bg-emerald-600",
  red: "bg-red-500",
  slate: "bg-slate-500",
  violet: "bg-violet-600",
};

export const TONE_COUNT: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  slate: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};

export function BoxIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

export function TagIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

export function GiftIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5h-15a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

export function DollarIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 1.5v21M16.75 5.75H9.75a3.25 3.25 0 000 6.5h4.5a3.25 3.25 0 010 6.5H7" />
    </svg>
  );
}

export function BellIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

export function CalendarIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

export function TrendIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

export function ActivityIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export function LayersIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 2.25L2.25 7.008 12 11.75l9.75-4.742L12 2.25zM2.25 16.5l9.75 4.742 9.75-4.742M2.25 12l9.75 4.742L21.75 12" />
    </svg>
  );
}

export function ReceiptIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 14.25l6-6m0 0l6 6m-6-6v7.25m6-10.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75z" />
    </svg>
  );
}

export function ChevronIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

export function ArrowIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

export function PhotoIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
    </svg>
  );
}
