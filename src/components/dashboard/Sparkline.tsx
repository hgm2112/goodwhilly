/** Tiny dependency-free line sparkline for dashboard trends. */
export function Sparkline({
  values,
  className = "h-6 w-24",
  stroke = "#0080ff",
  fill = false,
}: {
  values: number[];
  className?: string;
  stroke?: string;
  fill?: boolean;
}) {
  if (values.length < 2) return null;

  const w = 100;
  const h = 28;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const coords = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = range === 0 ? h / 2 : pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" preserveAspectRatio="none">
      {fill && (
        <polygon
          points={`${pad},${h - pad} ${coords.join(" ")} ${w - pad},${h - pad}`}
          fill={stroke}
          opacity={0.12}
        />
      )}
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
