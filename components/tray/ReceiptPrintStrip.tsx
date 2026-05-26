"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";
import type { SquareState, TimelineEntry } from "@/lib/computeSquares";
import { computeSquares } from "@/lib/computeSquares";
import { SquaresGrid } from "./SquaresGrid";
import { ReceiptHeader } from "./ReceiptHeader";
import {
  ReceiptPrintReveal,
  RECEIPT_CUT_ANIM_MS,
  RECEIPT_CUT_DELAY_MS,
} from "./ReceiptPrintReveal";

const RECEIPT_BG = "bg-[color:var(--color-receipt)]";

import {
  MOOD_PHOTO_RENDER_H,
  MOOD_PHOTO_RENDER_W,
} from "@/lib/halftone";

function MoodPhoto({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Mood snapshot"
      width={MOOD_PHOTO_RENDER_W}
      height={MOOD_PHOTO_RENDER_H}
      className="block w-full h-auto"
      style={{ imageRendering: "crisp-edges" }}
    />
  );
}

/**
 * The live-printed receipt body — grid strip shared by printer slot, cut state,
 * and stacked task receipts. Header + photo sit above the grid as one block.
 */
export function ReceiptPrintStrip({
  taskStartedAt,
  timeline,
  upToTs,
  squares: squaresProp,
  feedFromPrinter = false,
  animate = false,
  showTearTop = false,
  showCutLine = false,
  photoDataUrl = null,
  printRevealPhoto = false,
  taskTitle,
  printedAt,
  onCutComplete,
  className = "",
}: {
  taskStartedAt: number;
  timeline: TimelineEntry[];
  upToTs: number;
  squares?: SquareState[];
  feedFromPrinter?: boolean;
  animate?: boolean;
  showTearTop?: boolean;
  showCutLine?: boolean;
  photoDataUrl?: string | null;
  printRevealPhoto?: boolean;
  taskTitle?: string;
  printedAt?: number;
  onCutComplete?: () => void;
  className?: string;
}) {
  const squares = squaresProp ?? computeSquares(taskStartedAt, timeline, upToTs);
  const hasPhoto = Boolean(photoDataUrl);
  const hasHeader = Boolean(taskTitle && printedAt != null);
  const showHeaderSection = hasHeader;
  const paperFeed = printRevealPhoto && showHeaderSection;

  const [feedDone, setFeedDone] = useState(!paperFeed);
  const [cutReady, setCutReady] = useState(!paperFeed);

  useLayoutEffect(() => {
    setFeedDone(!paperFeed);
    setCutReady(!paperFeed);
  }, [paperFeed, photoDataUrl, showHeaderSection]);

  useEffect(() => {
    if (!paperFeed || !feedDone) return;
    const t = window.setTimeout(() => setCutReady(true), RECEIPT_CUT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [paperFeed, feedDone]);

  const cutLine = showCutLine && (!paperFeed || cutReady) ? (
    <motion.div
      aria-hidden
      className="absolute top-0 inset-x-0 h-px bg-[color:var(--color-receipt-ink)]/25 origin-left z-10"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: RECEIPT_CUT_ANIM_MS / 1000, ease: "easeOut" }}
      onAnimationComplete={onCutComplete}
    />
  ) : null;

  const headerBlock = (
    <div className="relative">
      {cutLine}
      {hasHeader ? (
        <ReceiptHeader taskTitle={taskTitle!} printedAt={printedAt!} />
      ) : null}
      {showHeaderSection ? (
        <div className="pb-3 mb-3 border-b border-dashed border-[color:var(--color-receipt-ink)]/30">
          {hasPhoto ? <MoodPhoto src={photoDataUrl!} /> : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className={`relative w-[380px] text-[color:var(--color-receipt-ink)] font-mono ${
        paperFeed && !feedDone ? "" : RECEIPT_BG
      } ${className}`}
    >
      {showTearTop && (!paperFeed || cutReady) && (
        <div className={`receipt-tear-top h-[6px] ${RECEIPT_BG} -mb-px`} />
      )}

      {showHeaderSection && paperFeed && !feedDone ? (
        <ReceiptPrintReveal
          active
          className="px-5 pt-4"
          onFeedComplete={() => setFeedDone(true)}
        >
          {headerBlock}
        </ReceiptPrintReveal>
      ) : null}

      {showHeaderSection && (!paperFeed || feedDone) ? (
        <div className="relative px-5 pt-4">{headerBlock}</div>
      ) : null}

      <div
        className={`${RECEIPT_BG} relative px-5 pb-6 ${showHeaderSection ? "pt-0" : "pt-4"}`}
      >
        {!showHeaderSection && cutLine}
        <SquaresGrid
          squares={squares}
          taskStartedAt={taskStartedAt}
          animate={animate}
          feedFromPrinter={feedFromPrinter}
          showPartialRowStats={!animate}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[#d8d8d8]"
      />
    </div>
  );
}
