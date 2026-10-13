"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatCents,
  formatInt,
  parseMoneyCents,
  parseIntDraft,
  sanitizeIntDraft,
  sanitizeMoneyDraft,
} from "@/lib/number-input";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white dark:bg-slate-900 shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost -mr-2 px-2 py-1 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * Money input backed by a raw TEXT draft: digits, Backspace/Delete, selection
 * and intermediates ("12.", "12.5") behave like a normal text field, cents are
 * parsed on each keystroke via lib/number-input, and the 2-decimal format is
 * re-applied only on blur. Prop changes (autofill, prefills, derived prices)
 * replace the draft; our own emissions never do — that echo suppression is
 * what fixes digits "coming back" (see git history for the old
 * format-on-every-render version).
 */
export function NumberDollars({
  valueCents,
  onChange,
  placeholder,
  className,
}: {
  valueCents: number | null | undefined;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => formatCents(valueCents));
  const lastEmitted = useRef<number | null>(valueCents ?? null);

  useEffect(() => {
    const incoming = valueCents ?? null;
    const ownEcho =
      incoming === lastEmitted.current ||
      // consumers that coerce an empty field to 0 (BundleBuilder target price)
      (lastEmitted.current === null && incoming === 0);
    if (!ownEcho) setDraft(formatCents(valueCents));
  }, [valueCents]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        className="input pl-7"
        placeholder={placeholder ?? "0.00"}
        value={draft}
        onChange={(e) => {
          const next = sanitizeMoneyDraft(e.target.value);
          setDraft(next);
          const cents = parseMoneyCents(next);
          lastEmitted.current = cents;
          onChange(cents);
        }}
        onBlur={() => {
          const cents = parseMoneyCents(draft);
          setDraft(formatCents(cents));
          lastEmitted.current = cents;
          onChange(cents);
        }}
      />
    </div>
  );
}

/**
 * Integer counterpart of NumberDollars (quantity fields, signed deltas): same
 * raw-text draft — the field can be cleared and refilled — with `min`
 * normalizing an empty blur (unsigned) and `signed` keeping a leading minus
 * reachable (no inputMode, so mobile keyboards show the "-" key).
 */
export function NumberInt({
  value,
  onChange,
  min = 0,
  signed = false,
  placeholder,
  className,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  min?: number;
  signed?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => formatInt(value));
  const lastEmitted = useRef<number | null>(value ?? null);

  useEffect(() => {
    const incoming = value ?? null;
    if (incoming !== lastEmitted.current) setDraft(formatInt(value));
  }, [value]);

  function commit(text: string) {
    const parsed = parseIntDraft(text, signed);
    const normalized =
      parsed == null ? String(min) : signed ? String(parsed) : String(Math.max(min, parsed));
    setDraft(normalized);
    const n = parseIntDraft(normalized, signed);
    lastEmitted.current = n;
    onChange(n);
  }

  return (
    <input
      type="text"
      inputMode={signed ? undefined : "numeric"}
      className={className ? `input ${className}` : "input"}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        const next = sanitizeIntDraft(e.target.value, signed);
        setDraft(next);
        const n = parseIntDraft(next, signed);
        lastEmitted.current = n;
        onChange(n);
      }}
      onBlur={() => commit(draft)}
    />
  );
}