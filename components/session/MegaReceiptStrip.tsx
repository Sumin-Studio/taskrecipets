"use client";

import { useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";
import type { SquareState } from "@/lib/computeSquares";
import { formatDuration } from "@/lib/store";
import { SquaresGrid } from "@/components/tray/SquaresGrid";
import { ReceiptLogo } from "@/components/tray/ReceiptHeader";
import {
  ReceiptPrintReveal,
  RECEIPT_CUT_ANIM_MS,
} from "@/components/tray/ReceiptPrintReveal";

export type SessionStats = {
  tasksCompleted: number;
  totalActiveMs: number;
  totalBreakMs: number;
  totalMinutes: number;
  efficiencyPct: number;
  durationMs: number;
};

const RECEIPT_BG = "bg-[color:var(--color-receipt)]";

export function MegaReceiptStrip({
  squares,
  stats,
  startedAt,
  endedAt,
  printReveal = false,
  onPrintComplete,
  showTearTop = false,
  showCutLine = false,
  className = "",
}: {
  squares: SquareState[];
  stats: SessionStats;
  startedAt: number;
  endedAt: number;
  /** Feed the whole receipt out of the printer slot */
  printReveal?: boolean;
  onPrintComplete?: () => void;
  showTearTop?: boolean;
  showCutLine?: boolean;
  className?: string;
}) {
  const [feedDone, setFeedDone] = useState(!printReveal);

  useLayoutEffect(() => {
    setFeedDone(!printReveal);
  }, [printReveal, stats, endedAt, squares.length]);

  const ts = new Date(endedAt);
  const dateStr = ts.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = ts.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const cutLine = showCutLine ? (
    <motion.div
      aria-hidden
      className="absolute top-0 inset-x-0 h-px bg-[color:var(--color-receipt-ink)]/25 origin-left z-10"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: RECEIPT_CUT_ANIM_MS / 1000, ease: "easeOut" }}
    />
  ) : null;

  const body = (
    <>
      <div className="relative px-5 pt-4">
        {cutLine}
        <div className="flex justify-center pt-1">
          <ReceiptLogo className="h-[26px]" />
        </div>
        <div className="mt-3 text-center text-[14px] font-semibold tracking-wider">
          SESSION SUMMARY
        </div>
        <div className="mt-1 text-center text-[10px] tracking-wider">
          {dateStr} · {timeStr}
        </div>
        <div className="mt-4 border-t border-dashed border-[color:var(--color-receipt-ink)]/30 pt-3 pb-3 text-[10px] tracking-wider space-y-1.5">
          <RowKV label="Tasks done" value={String(stats.tasksCompleted)} />
          <RowKV label="Total focus" value={formatDuration(stats.totalActiveMs)} />
          <RowKV label="Total break" value={formatDuration(stats.totalBreakMs)} />
          <RowKV label="Session length" value={formatDuration(stats.durationMs)} />
          <RowKV label="On task" value={`${stats.efficiencyPct}%`} />
        </div>
      </div>

      <div className="relative px-5 pb-6 pt-4 border-t border-dashed border-[color:var(--color-receipt-ink)]/30">
        <SquaresGrid
          squares={squares}
          taskStartedAt={startedAt}
          animate={false}
          feedFromPrinter={false}
          showRowStats
          showPartialRowStats
        />
      </div>
    </>
  );

  if (printReveal && !feedDone) {
    return (
      <div
        className={`relative w-[380px] text-[color:var(--color-receipt-ink)] font-mono shadow-[0_4px_14px_rgba(0,0,0,0.08)] ${className}`}
      >
        <ReceiptPrintReveal
          active
          onFeedComplete={() => {
            setFeedDone(true);
            onPrintComplete?.();
          }}
        >
          {body}
        </ReceiptPrintReveal>
      </div>
    );
  }

  return (
    <div
      className={`relative w-[380px] text-[color:var(--color-receipt-ink)] font-mono ${RECEIPT_BG} shadow-[0_4px_14px_rgba(0,0,0,0.08)] ${className}`}
    >
      {showTearTop && (
        <div className={`receipt-tear-top h-[6px] ${RECEIPT_BG} -mb-px`} />
      )}
      {body}
    </div>
  );
}

function RowKV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="opacity-70 shrink-0">{label}</span>
      <span className="flex-1 border-b border-dotted border-[color:var(--color-receipt-ink)]/30 mx-2 translate-y-[-3px]" />
      <span className="tabular-nums shrink-0">{value}</span>
    </div>
  );
}
