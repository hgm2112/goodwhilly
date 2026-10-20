import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { CalendarIcon } from "@/components/dashboard/icons";
import { ReleaseImage } from "@/components/dashboard/ReleaseImage";
import type { UpcomingRelease } from "@/lib/releases";
import { truncated } from "@/lib/utils";

/**
 * Upcoming releases with a featured panel (first DATED release) that shows
 * best-effort Scryfall artwork when `artwork` resolved, else a styled
 * gradient panel — never a guessed image.
 */
export function UpcomingReleases({
  releases,
  errors,
  artwork,
}: {
  releases: UpcomingRelease[];
  errors: string[];
  artwork: string | null;
}) {
  const featured = releases.find((r) => r.date) ?? releases[0] ?? null;
  const rest = featured ? releases.filter((r) => r !== featured).slice(0, 6) : [];

  return (
    <DashboardCard title="Upcoming Releases" tone="blue" icon={<CalendarIcon className="h-4 w-4" />}>
      {releases.length === 0 ? (
        <p className="py-4 text-sm text-slate-500 dark:text-slate-400">
          {errors.length
            ? "Couldn't load the release calendars right now."
            : "No upcoming releases listed yet."}
        </p>
      ) : (
        <>
          <FeaturedRelease release={featured} artwork={artwork} />

          {rest.length > 0 && (
            <>
              <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Coming up
              </p>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {rest.map((r) => (
                  <li key={`${r.game}-${r.name}`} className="flex items-center gap-3 py-2">
                    <span className="w-14 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {r.date ? shortReleaseDate(r.date) : "TBA"}
                    </span>
                    {r.imageUrl && (
                      <ReleaseImage
                        src={r.imageUrl}
                        label={r.label}
                        className="h-10 w-10 shrink-0 rounded-md"
                      />
                    )}
                    <a
                      href={r.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {truncated(r.name, 48)}
                    </a>
                    <span className={releaseBadge(r)}>{r.label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {errors.length > 0 && (
            <p className="mt-3 border-t border-slate-100 pt-2 hint dark:border-slate-800">
              One of the release calendars didn&apos;t load — showing partial results.
            </p>
          )}
        </>
      )}
    </DashboardCard>
  );
}

function FeaturedRelease({
  release,
  artwork,
}: {
  release: UpcomingRelease | null;
  artwork: string | null;
}) {
  if (!release) return null;
  return (
    <div className="flex min-w-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
      <ReleaseImage
        src={artwork}
        label={release.label}
        className="h-24 w-32 shrink-0 rounded-lg sm:w-40"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {release.date && (
          <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {daysAwayLabel(release.date)}
          </span>
        )}
        <a
          href={release.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-sm font-bold text-slate-800 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
        >
          {release.name}
        </a>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {release.date ? fullReleaseDate(release.date) : "Date TBA"}
        </p>
        <span className={releaseBadge(release)}>{release.label}</span>
      </div>
    </div>
  );
}

/** "in 18 days" / "Tomorrow" / "Today" from a YYYY-MM-DD date (UTC calendar days). */
function daysAwayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(y, m - 1, d);
  const days = Math.round((target - today) / 86_400_000);
  if (days <= 0) return "Out now";
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

const RELEASE_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "Oct 2" from a YYYY-MM-DD string. Parses the parts directly — `new Date(iso)`
 * would read UTC midnight and show the previous day in US timezones.
 * Shows the year when it isn't the current one.
 */
function shortReleaseDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const label = `${RELEASE_MONTHS[m - 1]} ${d}`;
  return y === new Date().getFullYear() ? label : `${label} ${y}`;
}

/** "Wednesday, October 22, 2026" — compared on the UTC calendar. */
function fullReleaseDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function releaseBadge(r: UpcomingRelease): string {
  if (r.label === "Secret Lair") return "badge badge-purple";
  if (r.game === "pokemon") return "badge badge-amber";
  return "badge badge-blue";
}
