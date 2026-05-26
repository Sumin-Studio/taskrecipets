"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Full-screen boot loader. A small receipt sits below a printer slot and
 * continuously "prints" squares into its grid — same metaphor as a live work
 * receipt minute-by-minute, but used here as an indeterminate spinner. When
 * the app reports ready (and a minimum hold has elapsed so the user actually
 * sees the press at work) the receipt fades out.
 */

const SQUARE_FILL_MS = 70;
const SQUARES_COLS = 5;
const SQUARES_ROWS = 5;
const SQUARES_TOTAL = SQUARES_COLS * SQUARES_ROWS;
const POST_FULL_HOLD_MS = 220;
const MIN_HOLD_MS = 900;
const FADE_OUT_MS = 380;

export function LoadingScreen({
  ready,
  onComplete,
}: {
  ready: boolean;
  onComplete: () => void;
}) {
  const [fadingOut, setFadingOut] = useState(false);
  const startedAt = useRef<number>(0);

  if (startedAt.current === 0 && typeof performance !== "undefined") {
    startedAt.current = performance.now();
  }

  useEffect(() => {
    if (!ready || fadingOut) return;
    const elapsed = performance.now() - startedAt.current;
    const wait = Math.max(0, MIN_HOLD_MS - elapsed);
    const startId = window.setTimeout(() => {
      setFadingOut(true);
      window.setTimeout(onComplete, FADE_OUT_MS);
    }, wait);
    return () => window.clearTimeout(startId);
  }, [ready, onComplete, fadingOut]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[color:var(--color-ground)]"
      style={{
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${FADE_OUT_MS}ms ease-out`,
        pointerEvents: fadingOut ? "none" : "auto",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center select-none">
        <div className="text-[11px] tracking-[0.32em] uppercase text-[color:var(--color-ink)]/70 mb-6">
          Work Recipe
        </div>

        {/* Printer slot */}
        <div className="w-[280px]">
          <div className="printer-slot h-[10px] rounded-b-[4px]" />
        </div>

        {/* Receipt — fixed size, sits just below the slot. */}
        <div
          className="w-[260px]"
          style={{ filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.08))" }}
        >
          <div className="w-[260px] bg-[color:var(--color-receipt)] font-mono text-[color:var(--color-receipt-ink)] px-5 pt-4 pb-5">
            <div className="text-center text-[13px] font-semibold tracking-wider">
              WORK RECIPE
            </div>
            <div className="mt-1 text-center text-[9px] tracking-wider opacity-70">
              WARMING UP THE PRESS
            </div>
            <div className="mt-3 border-t border-dashed border-[color:var(--color-receipt-ink)]/30 pt-4 flex justify-center">
              <SquaresLoader paused={fadingOut} />
            </div>
            <div className="mt-3 text-center text-[9px] tracking-wider opacity-60">
              PRINTING…
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A 5x5 grid that fills one cell at a time, then resets and loops. Reads as
 * a continuous "press is running" indicator rather than a determinate bar.
 */
function SquaresLoader({ paused }: { paused: boolean }) {
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setFilled((f) => {
        if (f >= SQUARES_TOTAL) return -Math.ceil(POST_FULL_HOLD_MS / SQUARE_FILL_MS);
        if (f < 0) return f + 1;
        return f + 1;
      });
    }, SQUARE_FILL_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  const visibleFilled = Math.max(0, filled);

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${SQUARES_COLS}, 1fr)`,
        gap: "3px",
      }}
    >
      {Array.from({ length: SQUARES_TOTAL }).map((_, i) => {
        const on = i < visibleFilled;
        return (
          <div
            key={i}
            style={{
              width: 18,
              height: 18,
              background: on ? "var(--color-receipt-ink)" : "transparent",
              outline: on
                ? "none"
                : "1px solid rgba(42,42,42,0.18)",
              outlineOffset: "-1px",
            }}
          />
        );
      })}
    </div>
  );
}
