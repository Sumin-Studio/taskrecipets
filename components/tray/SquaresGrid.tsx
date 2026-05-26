"use client";

import { motion } from "framer-motion";
import {
  SquareState,
  SQUARES_PER_ROW,
  efficiency,
  squareRows,
} from "@/lib/computeSquares";

/**
 * Minute grid for task receipts — 10 squares per row, 1 square = 1 minute.
 *
 * feedFromPrinter: newest rows at top; footer (start time + legend) at bottom.
 */
export function SquaresGrid({
  squares,
  taskStartedAt,
  showRowStats = true,
  showPartialRowStats = false,
  animate = false,
  showCaption = true,
  showStartAnchor = true,
  feedFromPrinter = false,
}: {
  squares: SquareState[];
  taskStartedAt: number;
  /** End-of-row time + % on task after each full row of 10 */
  showRowStats?: boolean;
  /** When true, the in-progress last row also shows stats (cut / stacked receipt) */
  showPartialRowStats?: boolean;
  animate?: boolean;
  showCaption?: boolean;
  showStartAnchor?: boolean;
  feedFromPrinter?: boolean;
}) {
  const rows = squareRows(squares);
  const newestSquareIdx = squares.length - 1;
  const displayRows = feedFromPrinter ? [...rows].reverse() : rows;

  const footer = (showStartAnchor || showCaption) && (
    <div className="flex items-center justify-between gap-3 text-[10px] tracking-wider pt-1">
      {showStartAnchor ? (
        <span>{fmtTime(taskStartedAt)} Start ---&gt;</span>
      ) : (
        <span />
      )}
      {showCaption ? <span>1 square = 1 mins</span> : null}
    </div>
  );

  const rowElements = displayRows.map((row, displayIdx) => {
    const rowIdx = feedFromPrinter ? rows.length - 1 - displayIdx : displayIdx;
    const rowStartMin = rowIdx * SQUARES_PER_ROW;
    const rowEndMin = rowStartMin + row.length;
    const rowEndTs = taskStartedAt + rowEndMin * 60_000;
    const pct = efficiency(row);
    const isFullRow = row.length === SQUARES_PER_ROW;
    const isNewestRow = rowIdx === rows.length - 1;
    const showStats =
      showRowStats &&
      row.length > 0 &&
      (isFullRow || (showPartialRowStats && isNewestRow));
    const RowTag = feedFromPrinter && animate ? motion.div : "div";

    return (
      <RowTag
        key={rowIdx}
        {...(feedFromPrinter && animate
          ? {
              initial:
                isNewestRow && row.length === 1
                  ? { opacity: 0, y: -8 }
                  : false,
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.22, ease: "easeOut" },
            }
          : {})}
        className="text-[10px] tracking-wider"
      >
        <div className="flex items-center gap-3 w-full">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex gap-[3px]">
              {Array.from({ length: SQUARES_PER_ROW }).map((_, i) => {
                const sq = row[i];
                const globalIdx = rowIdx * SQUARES_PER_ROW + i;
                return (
                  <SquareCell
                    key={i}
                    state={sq}
                    animate={
                      animate && sq !== undefined && globalIdx === newestSquareIdx
                    }
                  />
                );
              })}
            </div>
            {showStats ? (
              <span className="whitespace-nowrap tabular-nums">
                {fmtTime(rowEndTs)}
              </span>
            ) : null}
          </div>
          {showStats ? (
            <span className="ml-auto whitespace-nowrap tabular-nums">
              {pct}% on task
            </span>
          ) : null}
        </div>
      </RowTag>
    );
  });

  return (
    <div className="font-mono text-[color:var(--color-receipt-ink)]">
      {rows.length === 0 && footer}

      {rows.length > 0 && (
        <div className={feedFromPrinter ? "flex flex-col gap-2" : "space-y-2"}>
          {rowElements}
          {footer}
        </div>
      )}
    </div>
  );
}

function SquareCell({
  state,
  animate,
}: {
  state: SquareState | undefined;
  animate: boolean;
}) {
  if (state === undefined) {
    return <span className="block w-[14px] h-[14px]" />;
  }
  const filled = state === "work";
  const base =
    "block w-[14px] h-[14px] border border-[color:var(--color-receipt-ink)]";
  const fill = filled
    ? "bg-[color:var(--color-receipt-ink)]"
    : "bg-[color:var(--color-receipt)]";

  if (animate) {
    return (
      <motion.span
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className={`${base} ${fill}`}
      />
    );
  }
  return <span className={`${base} ${fill}`} />;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
