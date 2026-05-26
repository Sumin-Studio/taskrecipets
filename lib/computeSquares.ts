/**
 * Derives the receipt's minute-by-minute grid from a task's mode-transition timeline.
 *
 * Each square represents 1 minute of wall time since the task first started.
 * For each 1-minute slot, the dominant mode (the one that occupied >=30s of
 * the slot) determines the square's fill. If the slot is mostly working, the
 * square is "work" (black); otherwise "break" (white).
 *
 * Pure function — no side effects, no time queries. Pass the snapshot you want.
 */

export type SquareState = "work" | "break";

export type TimelineEntry = {
  ts: number;
  mode: "working" | "break";
};

export const MS_PER_MIN = 60_000;
export const SQUARES_PER_ROW = 10;

export function computeSquares(
  taskStartedAt: number,
  timeline: TimelineEntry[],
  upToTs: number,
): SquareState[] {
  if (upToTs <= taskStartedAt || timeline.length === 0) return [];

  const sorted = [...timeline].sort((a, b) => a.ts - b.ts);
  const totalMinutes = Math.floor((upToTs - taskStartedAt) / MS_PER_MIN);
  const squares: SquareState[] = [];

  for (let i = 0; i < totalMinutes; i++) {
    const slotStart = taskStartedAt + i * MS_PER_MIN;
    const slotEnd = slotStart + MS_PER_MIN;
    const workMs = msSpentInMode(sorted, "working", slotStart, slotEnd);
    squares.push(workMs >= MS_PER_MIN / 2 ? "work" : "break");
  }

  // In-progress partial minute — keeps live print and cut/stack in sync before
  // the first full wall-clock minute elapses.
  const remainderStart = taskStartedAt + totalMinutes * MS_PER_MIN;
  if (upToTs > remainderStart) {
    const workMs = msSpentInMode(sorted, "working", remainderStart, upToTs);
    const spanMs = upToTs - remainderStart;
    squares.push(workMs >= spanMs / 2 ? "work" : "break");
  }

  return squares;
}

/** Returns how many ms within [from, to] were spent in the given mode. */
function msSpentInMode(
  sorted: TimelineEntry[],
  mode: "working" | "break",
  from: number,
  to: number,
): number {
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (entry.mode !== mode) continue;
    const segStart = entry.ts;
    const segEnd = i + 1 < sorted.length ? sorted[i + 1].ts : Number.POSITIVE_INFINITY;
    const lo = Math.max(segStart, from);
    const hi = Math.min(segEnd, to);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

/** Group a flat list of squares into rows of SQUARES_PER_ROW. */
export function squareRows(squares: SquareState[]): SquareState[][] {
  const rows: SquareState[][] = [];
  for (let i = 0; i < squares.length; i += SQUARES_PER_ROW) {
    rows.push(squares.slice(i, i + SQUARES_PER_ROW));
  }
  return rows;
}

/** Efficiency = % of squares that are "work". Rounded integer 0..100. */
export function efficiency(squares: SquareState[]): number {
  if (squares.length === 0) return 0;
  const work = squares.filter((s) => s === "work").length;
  return Math.round((work / squares.length) * 100);
}
