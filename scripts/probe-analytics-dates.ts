import {
  addDaysToIsoDate,
  buildTrafficReportDateRange,
  pacificDateISO,
} from "@/lib/ebay/analytics";

let failed = 0;

function expect(cond: boolean, label: string) {
  if (!cond) {
    console.error("FAIL:", label);
    failed++;
  } else {
    console.log("PASS:", label);
  }
}

function eq<T>(actual: T, expected: T, label: string) {
  expect(
    Object.is(actual, expected),
    `${label} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
  );
}

function run() {
  // Simulated "current" date: March 31, 2026 at noon UTC.
  const noonMar31 = new Date("2026-03-31T12:00:00Z");
  const pacific = pacificDateISO(noonMar31);
  eq(pacific, "2026-03-31", "Pacific date for noon UTC");

  const r1 = buildTrafficReportDateRange(noonMar31, 90);
  eq(r1.start, "20251231", "start on a month/year boundary");
  eq(r1.end, "20260330", "end is the previous completed day");
  expect(r1.start <= r1.end, "start <= end");
  expect(r1.end < pacific.replace(/-/g, ""), "end is not today or later");

  // Late-UTC date: America/Los_Angeles is still the previous calendar day.
  const lateUtc = new Date("2026-04-01T03:30:00Z");
  eq(pacificDateISO(lateUtc), "2026-03-31", "late UTC stays in prior Pacific day");
  const r2 = buildTrafficReportDateRange(lateUtc, 90);
  eq(r2.end, "20260330", "late UTC end uses Pacific completed day");
  eq(r2.start, "20251231", "late UTC start follows Pacific completed day");

  // Manual month/year edge: January 1, 2026 in Pacific.
  const jan1 = new Date("2026-01-01T20:00:00Z");
  const r3 = buildTrafficReportDateRange(jan1, 90);
  eq(r3.end, "20251231", "New Year Pacific end is Dec 31");
  eq(r3.start, "20251003", "New Year start rolls back past October");

  // Leap-year simulated current day.
  const leapDay = new Date("2028-02-29T12:00:00Z");
  const r4 = buildTrafficReportDateRange(leapDay, 90);
  eq(r4.end, "20280228", "leap-year end drops back to Feb 28");
  expect(r4.start <= r4.end, "leap-year range is ordered");

  // Day arithmetic is DST-safe through a spring boundary.
  eq(
    addDaysToIsoDate("2026-03-07", 5),
    "2026-03-12",
    "day arithmetic crosses month boundaries",
  );

  // Invalid window settings are rejected.
  for (const bad of [0, 91, 4.5]) {
    try {
      buildTrafficReportDateRange(noonMar31, bad as number);
      expect(false, `windowDays ${String(bad)} should throw`);
    } catch {
      expect(true, `windowDays ${String(bad)} is rejected`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} failures`);
    process.exit(1);
  }
  console.log("\nAll eBay analytics date-range tests passed.");
}

run();
