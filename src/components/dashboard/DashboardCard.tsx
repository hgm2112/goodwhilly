import Link from "next/link";
import type { ReactNode } from "react";
import { TONE_CHIP } from "@/components/dashboard/icons";

/** Shared dashboard card shell: icon + bold title header, optional "View all" link. */
export function DashboardCard({
  title,
  icon,
  tone = "blue",
  action,
  children,
  className = "",
  headerExtra,
}: {
  title: string;
  icon?: ReactNode;
  tone?: keyof typeof TONE_CHIP | string;
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
  headerExtra?: ReactNode;
}) {
  return (
    <section className={`card p-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="flex min-w-0 items-center gap-2.5 text-sm font-bold dark:text-slate-100">
          {icon && (
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white ${TONE_CHIP[tone] ?? TONE_CHIP.blue}`}
            >
              {icon}
            </span>
          )}
          <span className="truncate">{title}</span>
        </h2>
        {headerExtra}
        {action && (
          <Link
            href={action.href}
            className="shrink-0 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            {action.label} →
          </Link>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
