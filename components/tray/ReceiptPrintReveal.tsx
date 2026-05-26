"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/** Paper feed speed — receipts scroll out of the printer at a constant rate
 *  regardless of length, so a long session summary takes proportionally longer
 *  than a short task receipt. */
const PX_PER_MS = 0.35;
/** Step size for the chunky printer feed cadence */
const SEGMENT_PX = 30;
const MIN_SEGMENTS = 8;
/** Small tail so the last segment settles before completing */
const TAIL_MS = 180;

/** Reference duration for a "typical" task receipt height (~500px). Kept as a
 *  legacy export for the 3D renderers and demo timers that need a single
 *  scrubber value. The actual DOM reveal is speed-based — see `printDurationMs`. */
export const RECEIPT_PRINT_REVEAL_MS = Math.round(500 / PX_PER_MS) + TAIL_MS;

/** Alias — single combined feed */
export const RECEIPT_PRINT_TOTAL_MS = RECEIPT_PRINT_REVEAL_MS;

/** Compute the actual reveal duration for a given receipt height. */
export function printDurationMs(heightPx: number) {
  return Math.round(heightPx / PX_PER_MS) + TAIL_MS;
}

/** Wait for feed + cut line before stacking */
export const RECEIPT_CUT_DELAY_MS = 480;
export const RECEIPT_CUT_ANIM_MS = 220;
export const RECEIPT_STACK_DELAY_MS =
  RECEIPT_PRINT_REVEAL_MS + RECEIPT_CUT_DELAY_MS + RECEIPT_CUT_ANIM_MS + 380;

type Phase = "idle" | "feed" | "done";

/**
 * Feeds receipt paper out of the printer slot — white background and content
 * reveal bottom-to-top (anchored at the bottom, height grows upward).
 */
export function ReceiptPrintReveal({
  children,
  active,
  className = "",
  onFeedComplete,
}: {
  children: React.ReactNode;
  active: boolean;
  className?: string;
  onFeedComplete?: () => void;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [targetHeight, setTargetHeight] = useState(0);

  useLayoutEffect(() => {
    if (!active) {
      setPhase("idle");
      setTargetHeight(0);
      return;
    }
    if (!measureRef.current) return;
    const h = measureRef.current.offsetHeight;
    setTargetHeight(h);
    setPhase("feed");
  }, [active, children]);

  if (!active) {
    return <div className={className}>{children}</div>;
  }

  const segmentCount =
    targetHeight > 0
      ? Math.max(MIN_SEGMENTS, Math.round(targetHeight / SEGMENT_PX))
      : MIN_SEGMENTS;
  const duration = printDurationMs(targetHeight) / 1000;
  const heightSteps =
    targetHeight > 0
      ? Array.from(
          { length: segmentCount + 1 },
          (_, i) => (i / segmentCount) * targetHeight,
        )
      : [0];
  const times = heightSteps.map((_, i) => i / segmentCount);

  return (
    <>
      <div
        aria-hidden
        className="fixed left-[-9999px] top-0 w-[340px] opacity-0 pointer-events-none invisible"
      >
        <div ref={measureRef} className={className}>
          {children}
        </div>
      </div>

      {phase === "done" && (
        <div className={`bg-[color:var(--color-receipt)] ${className}`}>
          {children}
        </div>
      )}

      {phase === "feed" && (
        <motion.div
          className="flex flex-col justify-end overflow-hidden bg-[color:var(--color-receipt)]"
          style={{ transformOrigin: "bottom center" }}
          initial={{ height: 0 }}
          animate={{ height: targetHeight > 0 ? heightSteps : 0 }}
          transition={
            targetHeight > 0
              ? { duration, times, ease: "linear" }
              : { duration: 0 }
          }
          onAnimationComplete={() => {
            if (targetHeight > 0) {
              setPhase("done");
              onFeedComplete?.();
            }
          }}
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </>
  );
}
