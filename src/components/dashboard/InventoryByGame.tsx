import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { LayersIcon } from "@/components/dashboard/icons";
import type { GameSlice } from "@/lib/dashboard-metrics";

/** Donut chart of item counts per game — legend percentages come from the same slices. */
export function InventoryByGame({ slices, total }: { slices: GameSlice[]; total: number }) {
  return (
    <DashboardCard title="Inventory by Game" tone="sky" icon={<LayersIcon className="h-4 w-4" />}>
      {slices.length === 0 ? (
        <p className="py-4 text-sm text-slate-500 dark:text-slate-400">
          Add items to see your mix here.
        </p>
      ) : (
        <div className="flex min-w-0 items-center gap-4">
          <Donut slices={slices} total={total} />
          <ul className="min-w-0 flex-1 space-y-1.5">
            {slices.slice(0, 6).map((s) => {
              const color = SLICE_COLORS[slices.indexOf(s) % SLICE_COLORS.length];
              return (
                <li key={s.label} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="truncate font-medium dark:text-slate-200">{s.label}</span>
                  <span className="ml-auto shrink-0 font-bold dark:text-slate-100">{s.count}</span>
                  <span className="w-9 shrink-0 text-right text-slate-400 dark:text-slate-500">
                    {(s.share * 100).toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </DashboardCard>
  );
}

const SLICE_COLORS = [
  "#2563eb", // blue-600
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#0ea5e9", // sky-500
  "#8b5cf6", // violet-500
  "#f43f5e", // rose-500
  "#64748b", // slate-500
];

function Donut({ slices, total }: { slices: GameSlice[]; total: number }) {
  const R = 38;
  const SW = 13;
  const CIRC = 2 * Math.PI * R;
  const GAP = 2; // visual separation between slices

  let acc = 0;
  const arcs = slices.map((s, i) => {
    const seg = s.share * CIRC;
    const visible = Math.max(seg - GAP, 0.5);
    const arc = {
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      dash: `${visible} ${CIRC - visible}`,
      offset: -acc,
    };
    acc += seg;
    return arc;
  });

  return (
    <svg
      viewBox="0 0 96 96"
      className="h-24 w-24 shrink-0"
      role="img"
      aria-label={`Item counts by game: ${slices.map((s) => `${s.label} ${s.count}`).join(", ")}`}
    >
      <circle
        cx="48"
        cy="48"
        r={R}
        fill="none"
        strokeWidth={SW}
        className="stroke-slate-200 dark:stroke-slate-800"
      />
      {arcs.map((a, i) => (
        <circle
          key={i}
          cx="48"
          cy="48"
          r={R}
          fill="none"
          stroke={a.color}
          strokeWidth={SW}
          strokeDasharray={a.dash}
          strokeDashoffset={a.offset}
          transform="rotate(-90 48 48)"
        />
      ))}
      <text
        x="48"
        y="46"
        textAnchor="middle"
        fontSize="17"
        fontWeight="800"
        className="fill-slate-800 dark:fill-slate-100"
      >
        {total}
      </text>
      <text
        x="48"
        y="60"
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        className="fill-slate-400 dark:fill-slate-500"
      >
        items
      </text>
    </svg>
  );
}
