/**
 * Pure helpers behind the NumberDollars / NumberInt inputs.
 *
 * The inputs keep a raw TEXT draft while the user types and only convert to
 * cents/integers here — currency formatting is never applied mid-keystroke
 * (format-on-every-render is what made digits "come back" before; see
 * Modal.tsx). Everything in this file is framework-free so
 * scripts/probe-number-inputs.ts can assert it directly.
 */

/** PG int4 ceiling — money and integer drafts never emit past it. */
export const MAX_INT = 2_147_483_647;

/** Format cents as the fixed 2-decimal display ("12.50"); null/undefined → "". */
export function formatCents(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

/**
 * Reduce pasted/typed text to a money draft: digits plus at most one dot.
 * Allows intermediate states ("", ".", "12.", "12.5") untouched.
 *
 * A comma is treated as a DECIMAL separator when there's no dot yet and the
 * group after it is 0–2 digits (mobile decimal pads emit "12,50"), otherwise
 * it's a thousands separator to drop ("1,234.56", "1,234").
 */
export function sanitizeMoneyDraft(input: string): string {
  let s = input.replace(/[^0-9.,]/g, "");
  if (s.includes(".")) {
    s = s.replace(/,/g, "");
  } else {
    const ci = s.lastIndexOf(",");
    if (ci !== -1) {
      const after = s.slice(ci + 1).replace(/,/g, "");
      s = after.length <= 2 ? s.replace(/,/g, ".") : s.replace(/,/g, "");
    }
  }
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  return s;
}

/**
 * Parse a money draft into integer cents (exact integer math — no float
 * round-trip). Half-up on the third decimal (12.505 → 1251, 12.995 → 1300
 * with natural carry). Empty or "." → null (no value). Clamped to int4.
 */
export function parseMoneyCents(raw: string): number | null {
  const t = raw.trim();
  if (!t || t === ".") return null;
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m) return null;
  const whole = Number(m[1] || "0");
  const frac = m[2] ?? "";
  let cents = Number((frac + "00").slice(0, 2));
  if (frac.length >= 3 && frac[2] >= "5") cents += 1;
  const total = whole * 100 + cents;
  if (!Number.isFinite(total)) return null;
  return Math.min(MAX_INT, Math.max(0, Math.round(total)));
}

/** Format an integer draft value; null/undefined → "". */
export function formatInt(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

/**
 * Reduce typed text to an integer draft: digits, plus a single LEADING minus
 * when `signed` (so "-" and "-1" survive; "5-" / "--5" collapse). Digits are
 * capped at 9 so the value can never overflow int4.
 */
export function sanitizeIntDraft(input: string, signed = false): string {
  const neg = signed && input.trimStart().startsWith("-");
  let digits = input.replace(/[^0-9]/g, "");
  if (digits.length > 9) digits = digits.slice(0, 9);
  return neg ? "-" + digits : digits;
}

/**
 * Parse an integer draft ("7", "007", "-12"): ""/"-" → null, otherwise the
 * number clamped to ±int4. Non-matching text → null (drafts are already
 * sanitized, so this only guards pasted garbage).
 */
export function parseIntDraft(text: string, signed = false): number | null {
  const t = text.trim();
  if (!t || t === "-" || t === "+") return null;
  if (!(signed ? /^-?\d+$/ : /^\d+$/).test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.max(-MAX_INT, Math.min(MAX_INT, n));
}
