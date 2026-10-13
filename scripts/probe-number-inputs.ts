import {
  MAX_INT,
  formatCents,
  formatInt,
  parseMoneyCents,
  parseIntDraft,
  sanitizeIntDraft,
  sanitizeMoneyDraft,
} from "@/lib/number-input";

/**
 * Regression tests for the raw-text draft helpers behind NumberDollars /
 * NumberInt (src/components/ui/Modal.tsx). The old inputs re-formatted from
 * cents on every keystroke, so Backspace restored digits — these assertions
 * pin down the draft/parse behavior that fixes it (intermediates, locale
 * comma, exact rounding, clamping, signed integers).
 *
 * Usage: npx tsx scripts/probe-number-inputs.ts
 */

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
  // --- money: format ---
  eq(formatCents(1250), "12.50", "formats cents with 2 decimals");
  eq(formatCents(null), "", "null formats to empty");
  eq(formatCents(undefined), "", "undefined formats to empty");
  eq(formatCents(0), "0.00", "zero formats to 0.00");

  // --- money: sanitizing drafts ---
  eq(sanitizeMoneyDraft("12.50"), "12.50", "keeps a valid draft");
  eq(sanitizeMoneyDraft("12,50"), "12.50", "locale decimal comma becomes a dot");
  eq(sanitizeMoneyDraft("12,3"), "12.3", "single-digit comma group is decimal");
  eq(sanitizeMoneyDraft("1,234.56"), "1234.56", "thousands comma dropped when a dot exists");
  eq(sanitizeMoneyDraft("1,234"), "1234", "3-digit comma group is a thousands separator");
  eq(sanitizeMoneyDraft("1.2.3"), "1.23", "extra dots collapse to the first");
  eq(sanitizeMoneyDraft("$12.50abc"), "12.50", "pasted junk is stripped");
  eq(sanitizeMoneyDraft("12."), "12.", "trailing dot intermediate survives");
  eq(sanitizeMoneyDraft(""), "", "empty stays empty");
  eq(sanitizeMoneyDraft("1,2,3"), "1.23", "stray commas normalize deterministically");

  // --- money: parsing (exact integer math, no float round-trip) ---
  eq(parseMoneyCents("12.50"), 1250, "parses 12.50");
  eq(parseMoneyCents("12.5"), 1250, "parses 12.5");
  eq(parseMoneyCents("12."), 1200, "parses the 12. intermediate");
  eq(parseMoneyCents(""), null, "empty parses to null");
  eq(parseMoneyCents("."), null, "lone dot parses to null");
  eq(parseMoneyCents("0"), 0, "typed 0 parses to 0 (not null)");
  eq(parseMoneyCents("10.29"), 1029, "10.29 exact (no float error)");
  eq(parseMoneyCents("12.505"), 1251, "third decimal rounds half-up");
  eq(parseMoneyCents("12.995"), 1300, "rounding carries into whole dollars");
  eq(parseMoneyCents("999999999999"), MAX_INT, "absurd input clamps to int4 max");

  // --- money: the deletion chain that used to resurrect digits ---
  // Old input: backspace "12.50" → "12.5" parsed to the same 1250 cents, the
  // controlled value re-rendered .toFixed(2) and the 0 came back. The draft
  // now keeps "12.5" verbatim; every step must still parse cleanly.
  const chain = ["12.50", "12.5", "12.", "12", "1", ""];
  const chainCents = chain.map(parseMoneyCents);
  expect(
    JSON.stringify(chainCents) === JSON.stringify([1250, 1250, 1200, 1200, 100, null]),
    `deletion chain parses at every step — got ${JSON.stringify(chainCents)}`,
  );
  eq(formatCents(parseMoneyCents("12.5")), "12.50", "blur normalizes 12.5 → 12.50");
  eq(formatCents(parseMoneyCents("12.")), "12.00", "blur normalizes 12. → 12.00");
  eq(formatCents(parseMoneyCents("")), "", "blur keeps an empty field empty");

  // --- integers: sanitizing drafts ---
  eq(sanitizeIntDraft("-5", true), "-5", "signed keeps a leading minus");
  eq(sanitizeIntDraft("-5", false), "5", "unsigned drops the minus");
  eq(sanitizeIntDraft("--5", true), "-5", "only one minus survives");
  eq(sanitizeIntDraft("5-", true), "5", "trailing minus dropped");
  eq(sanitizeIntDraft("-", true), "-", "lone minus intermediate survives when signed");
  eq(sanitizeIntDraft("-", false), "", "lone minus dropped when unsigned");
  eq(sanitizeIntDraft("007"), "007", "leading zeros kept while typing");
  eq(sanitizeIntDraft("a1b2"), "12", "junk stripped");
  eq(sanitizeIntDraft("12345678901", true), "123456789", "digits capped at 9 (int4-safe)");

  // --- integers: parsing ---
  eq(parseIntDraft(""), null, "empty integer parses to null");
  eq(parseIntDraft("-"), null, "lone minus parses to null");
  eq(parseIntDraft("007"), 7, "leading zeros parse to 7");
  eq(parseIntDraft("-12", true), -12, "signed parses a negative");
  eq(parseIntDraft("-12", false), null, "unsigned rejects a negative");
  eq(parseIntDraft("9999999999"), MAX_INT, "integer parse clamps to int4 max");
  eq(parseIntDraft("-9999999999", true), -MAX_INT, "signed parse clamps to -int4 max");
  eq(formatInt(7), "7", "formats an integer");
  eq(formatInt(null), "", "null integer formats to empty");

  if (failed > 0) {
    console.error(`\n${failed} failures`);
    process.exit(1);
  }
  console.log("\nAll number-input regression tests passed.");
}

run();
