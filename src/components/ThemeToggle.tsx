"use client";

import { useEffect, useState } from "react";

/**
 * Light/dark switch for the whole app: flips the `.dark` class on <html>
 * (the class-based `dark` variant declared in globals.css) and persists the
 * choice to localStorage("gw_theme"), which the inline script in the root
 * layout reads before first paint. Renders nothing until mounted so the icon
 * can never mismatch the applied theme during SSR.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("gw_theme", next ? "dark" : "light");
    } catch {
      /* private mode — theme just won't persist */
    }
    setDark(next);
  }

  if (dark === null) return null;

  return (
    <button
      onClick={toggle}
      className="btn btn-ghost !px-2"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? MoonIcon() : SunIcon()}
    </button>
  );
}

function SunIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
      />
    </svg>
  );
}
