"use client";

import { useEffect, useState } from "react";

/**
 * Release artwork with a branded fallback: shows the image until it fails
 * to load (`onError` — broken/expired URLs, hotlink blocks), then swaps to
 * the gradient placeholder. A new `src` resets the failure so cached
 * releases can populate later. Parent controls the box size (consistent
 * `object-cover` cropping, never distorted).
 */
export function ReleaseImage({
  src,
  alt = "",
  label,
  className = "h-24 w-32 shrink-0 rounded-lg sm:w-40",
}: {
  src: string | null;
  alt?: string;
  /** Game label ("MTG" / "Secret Lair" / "Pokémon") shown on the placeholder. */
  label: string;
  /** Box size + shape (rounded corners etc.) — this component fills it. */
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-blue-600 to-cyan-600 text-white ${className}`}
      >
        <svg
          className="h-5 w-5 opacity-80"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
          />
        </svg>
        <span className="px-1 text-center text-[10px] font-bold uppercase tracking-wide">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
