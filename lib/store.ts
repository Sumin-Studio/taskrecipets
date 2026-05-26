"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { computeSquares, type SquareState, type TimelineEntry } from "./computeSquares";

/**
 * Simple count-up task timer + live-printing receipt model.
 *
 * Each task tracks total active/break time AND a wall-time timeline of every
 * mode transition since the user first pressed Start on it. The timeline is
 * what powers the live receipt's minute-by-minute grid.
 *
 * Completing a task is now a two-step flow: requestComplete() opens the
 * photo capture modal; finalizeComplete(photoDataUrl | null) is what actually
 * mints the receipt and drops it onto the tray.
 */

export type TimerMode = "idle" | "working" | "break";

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
};

export type Task = {
  id: string;
  title: string;
  subtasks: Subtask[];
  createdAt: number;
  completedAt?: number;
  /** total ms spent actively working on this task */
  totalActiveMs: number;
  /** total ms spent on breaks while this task was selected */
  totalBreakMs: number;
  /** number of breaks taken */
  breakCount: number;
  /** Date.now() at the first Start press on this task — present once started */
  taskStartedAt?: number;
  /** every mode transition since taskStartedAt, in wall time */
  timeline: TimelineEntry[];
};

export type Receipt = {
  kind?: "task";
  id: string;
  sourceTaskId: string;
  number: number;
  printedAt: number;
  rotation: number;
  taskTitle: string;
  taskStartedAt: number;
  taskCompletedAt: number;
  dayCounter: number;
  timeline: TimelineEntry[];
  /** Frozen minute grid — omitted on receipts minted before v5 */
  squares?: SquareState[];
  photoDataUrl: string | null;
  totalActiveMs: number;
  totalBreakMs: number;
  breakCount: number;
  motto: string;
};

export type SessionReceipt = {
  id: string;
  number: number;
  printedAt: number;
  rotation: number;
  kind: "session";
  tasksCompleted: { title: string; activeMs: number; breaks: number }[];
  sessionActiveMs: number;
  sessionBreakMs: number;
  motto: string;
};

export type AnyReceipt = Receipt | SessionReceipt;

export type CutReceiptSnapshot = {
  taskId: string;
  taskStartedAt: number;
  timeline: TimelineEntry[];
  frozenAt: number;
  squares: SquareState[];
  photoDataUrl?: string | null;
  /** tear + cut line shown after photo is attached, before landing in stack */
  isCut?: boolean;
};

export type Settings = {
  soundOn: boolean;
};

export type TimerSnapshot = {
  mode: TimerMode;
  /** Date.now() when the current run started — undefined when idle */
  startedAtWall?: number;
  /** ms of running time accumulated for the *current task* before the latest start */
  accumulatedActiveMs: number;
  /** ms of break time accumulated for the *current task* before the latest start */
  accumulatedBreakMs: number;
  /** break count for the current task */
  breakCount: number;
};

type StoreState = {
  tasks: Task[];
  currentTaskId: string | null;
  receipts: AnyReceipt[];
  receiptCounter: number;
  /** "task of the day" sequence — `{ "2026-05-19": 3 }` */
  dayCounter: Record<string, number>;
  /** taskId awaiting a photo decision (drives PhotoCaptureModal) */
  pendingPhotoFor: string | null;
  /** Frozen strip at the printer while the photo modal is open */
  cutReceipt: CutReceiptSnapshot | null;
  /** Receipt currently animating from printer → stack */
  landingReceiptId: string | null;
  hasHydrated: boolean;
  settings: Settings;
  timer: TimerSnapshot;
  sessionStartedAt: number | null;
  sessionActiveMs: number;
  sessionBreakMs: number;
  /** Snapshot of the just-ended session — drives the /session/summary page */
  endedSession: { startedAt: number; endedAt: number } | null;

  // task actions
  addTask: (title: string) => void;
  removeTask: (id: string) => void;
  selectTask: (id: string | null) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subId: string) => void;
  removeSubtask: (taskId: string, subId: string) => void;

  // timer actions
  start: () => void;
  pause: () => void;
  /** Opens the photo capture modal. Does not mint the receipt. */
  requestComplete: () => void;
  /** Cancel the photo modal — return the timer to its prior running state. */
  cancelComplete: () => void;
  /** Mint the receipt, drop it onto the tray, clear the timer. */
  finalizeComplete: (photoDataUrl: string | null) => void;
  /** Attach mood photo and show the cut — then finalizeComplete runs. */
  attachPhotoToCut: (photoDataUrl: string | null) => void;
  clearLandingReceipt: () => void;

  // session
  endSession: () => void;
  /** Hard reset — wipes all tasks, receipts, counters. Called by Back-to-app confirm. */
  wipeForFreshStart: () => void;

  // settings
  updateSettings: (patch: Partial<Settings>) => void;

  // internal helper to flush in-flight time into accumulators
  _flush: () => void;
  _setHasHydrated: (hasHydrated: boolean) => void;
};

const DEFAULT_SETTINGS: Settings = {
  soundOn: true,
};

const MOTTOS = [
  "One pour at a time.",
  "Small loaves, warm kitchen.",
  "Done is the new tomorrow.",
  "Stir, taste, repeat.",
  "Patience is the first ingredient.",
  "Heat low, focus high.",
  "Mise en place, mind in place.",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function pickMotto() {
  return MOTTOS[Math.floor(Math.random() * MOTTOS.length)];
}

function freshTimer(): TimerSnapshot {
  return {
    mode: "idle",
    accumulatedActiveMs: 0,
    accumulatedBreakMs: 0,
    breakCount: 0,
  };
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      tasks: [],
      currentTaskId: null,
      receipts: [],
      receiptCounter: 0,
      dayCounter: {},
      pendingPhotoFor: null,
      cutReceipt: null,
      landingReceiptId: null,
      hasHydrated: false,
      settings: DEFAULT_SETTINGS,
      timer: freshTimer(),
      sessionStartedAt: null,
      sessionActiveMs: 0,
      sessionBreakMs: 0,
      endedSession: null,

      addTask: (title) => {
        const t: Task = {
          id: uid(),
          title: title.trim(),
          subtasks: [],
          createdAt: Date.now(),
          totalActiveMs: 0,
          totalBreakMs: 0,
          breakCount: 0,
          timeline: [],
        };
        set((s) => ({
          tasks: [...s.tasks, t],
          currentTaskId: s.currentTaskId ?? t.id,
        }));
      },

      removeTask: (id) => {
        const s = get();
        const wasCurrent = s.currentTaskId === id;
        if (wasCurrent) get()._flush();
        set((cur) => ({
          tasks: cur.tasks.filter((t) => t.id !== id),
          currentTaskId: wasCurrent ? null : cur.currentTaskId,
          timer: wasCurrent ? freshTimer() : cur.timer,
        }));
      },

      selectTask: (id) => {
        const s = get();
        if (id === s.currentTaskId) return;
        if (s.currentTaskId) {
          // commit pending time to outgoing task — but DON'T finalize its receipt
          get()._flush();
          const out = get();
          set({
            tasks: out.tasks.map((t) =>
              t.id === out.currentTaskId
                ? {
                    ...t,
                    totalActiveMs: t.totalActiveMs + out.timer.accumulatedActiveMs,
                    totalBreakMs: t.totalBreakMs + out.timer.accumulatedBreakMs,
                    breakCount: t.breakCount + out.timer.breakCount,
                  }
                : t,
            ),
          });
        }
        set({ currentTaskId: id, timer: freshTimer() });
      },

      addSubtask: (taskId, title) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: [
                    ...t.subtasks,
                    { id: uid(), title: title.trim(), done: false },
                  ],
                }
              : t,
          ),
        })),

      toggleSubtask: (taskId, subId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: t.subtasks.map((su) =>
                    su.id === subId ? { ...su, done: !su.done } : su,
                  ),
                }
              : t,
          ),
        })),

      removeSubtask: (taskId, subId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: t.subtasks.filter((su) => su.id !== subId) }
              : t,
          ),
        })),

      start: () => {
        const s = get();
        if (!s.currentTaskId) return;

        const now = Date.now();

        // ensure task has taskStartedAt + initial timeline entry
        const taskUpdates = s.tasks.map((t) => {
          if (t.id !== s.currentTaskId) return t;
          const startedAt = t.taskStartedAt ?? now;
          const isFirstStart = !t.taskStartedAt;
          return {
            ...t,
            taskStartedAt: startedAt,
            timeline: isFirstStart
              ? [{ ts: startedAt, mode: "working" as const }]
              : [...t.timeline, { ts: now, mode: "working" as const }],
          };
        });

        if (s.timer.mode === "break") {
          const elapsed = s.timer.startedAtWall ? now - s.timer.startedAtWall : 0;
          set({
            tasks: taskUpdates,
            timer: {
              ...s.timer,
              mode: "working",
              startedAtWall: now,
              accumulatedBreakMs: s.timer.accumulatedBreakMs + elapsed,
              breakCount: s.timer.breakCount + 1,
            },
          });
        } else if (s.timer.mode === "idle") {
          set({
            tasks: taskUpdates,
            timer: {
              ...s.timer,
              mode: "working",
              startedAtWall: now,
            },
            sessionStartedAt: s.sessionStartedAt ?? now,
          });
        }
      },

      pause: () => {
        const s = get();
        if (s.timer.mode !== "working" || !s.currentTaskId) return;
        const now = Date.now();
        const elapsed = s.timer.startedAtWall ? now - s.timer.startedAtWall : 0;
        set({
          tasks: s.tasks.map((t) =>
            t.id === s.currentTaskId
              ? { ...t, timeline: [...t.timeline, { ts: now, mode: "break" }] }
              : t,
          ),
          timer: {
            ...s.timer,
            mode: "break",
            startedAtWall: now,
            accumulatedActiveMs: s.timer.accumulatedActiveMs + elapsed,
          },
        });
      },

      requestComplete: () => {
        const s = get();
        if (!s.currentTaskId) return;
        get()._flush();
        const after = get();
        const task = after.tasks.find((t) => t.id === s.currentTaskId);
        if (!task) return;
        const now = Date.now();
        const activeMs = task.totalActiveMs + after.timer.accumulatedActiveMs;
        const startedAt = task.taskStartedAt ?? (activeMs > 0 ? now - activeMs : now);
        let frozenAt = now;
        if (frozenAt <= startedAt) frozenAt = startedAt + 1;
        const timeline =
          task.timeline.length > 0
            ? [...task.timeline]
            : [{ ts: startedAt, mode: "working" as const }];
        const squares = computeSquares(startedAt, timeline, frozenAt);
        set({
          tasks: after.tasks.map((t) =>
            t.id === s.currentTaskId && !t.taskStartedAt
              ? { ...t, taskStartedAt: startedAt, timeline }
              : t,
          ),
          sessionStartedAt: after.sessionStartedAt ?? startedAt,
          pendingPhotoFor: s.currentTaskId,
          cutReceipt: {
            taskId: s.currentTaskId,
            taskStartedAt: startedAt,
            timeline,
            frozenAt,
            squares,
            photoDataUrl: null,
            isCut: false,
          },
          timer: {
            ...after.timer,
            mode: "idle",
            startedAtWall: undefined,
          },
        });
      },

      cancelComplete: () => set({ pendingPhotoFor: null, cutReceipt: null }),

      attachPhotoToCut: (photoDataUrl) => {
        const s = get();
        if (!s.cutReceipt) return;
        set({
          pendingPhotoFor: null,
          cutReceipt: {
            ...s.cutReceipt,
            photoDataUrl,
            isCut: true,
          },
        });
      },

      clearLandingReceipt: () => set({ landingReceiptId: null }),

      finalizeComplete: (photoDataUrl) => {
        const s = get();
        const cut = s.cutReceipt;
        if (!cut) return;
        const taskId = cut.taskId;

        const now = Date.now();
        get()._flush();
        const after = get();

        const task = after.tasks.find((t) => t.id === taskId);
        if (!task) return;

        const activeMs = task.totalActiveMs + after.timer.accumulatedActiveMs;
        const breakMs = task.totalBreakMs + after.timer.accumulatedBreakMs;
        const breaks = task.breakCount + after.timer.breakCount;

        const dKey = dayKey(now);
        const nextDayCount = (after.dayCounter[dKey] ?? 0) + 1;
        const nextNumber = after.receiptCounter + 1;

        const receipt: Receipt = {
          kind: "task",
          id: uid(),
          sourceTaskId: taskId,
          number: nextNumber,
          printedAt: now,
          rotation: (Math.random() - 0.5) * 4,
          taskTitle: task.title,
          taskStartedAt: cut.taskStartedAt ?? task.taskStartedAt ?? now,
          taskCompletedAt: cut.frozenAt ?? now,
          dayCounter: nextDayCount,
          timeline: [...cut.timeline],
          squares: cut.squares ?? computeSquares(
            cut.taskStartedAt ?? task.taskStartedAt ?? now,
            cut.timeline,
            cut.frozenAt ?? now,
          ),
          photoDataUrl: photoDataUrl ?? cut.photoDataUrl ?? null,
          totalActiveMs: activeMs,
          totalBreakMs: breakMs,
          breakCount: breaks,
          motto: pickMotto(),
        };

        set({
          tasks: after.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  completedAt: now,
                  totalActiveMs: activeMs,
                  totalBreakMs: breakMs,
                  breakCount: breaks,
                }
              : t,
          ),
          receipts: [...after.receipts, receipt].slice(-50),
          receiptCounter: nextNumber,
          dayCounter: { ...after.dayCounter, [dKey]: nextDayCount },
          sessionActiveMs: after.sessionActiveMs + after.timer.accumulatedActiveMs,
          sessionBreakMs: after.sessionBreakMs + after.timer.accumulatedBreakMs,
          currentTaskId: after.currentTaskId === taskId ? null : after.currentTaskId,
          pendingPhotoFor: null,
          cutReceipt: null,
          landingReceiptId: receipt.id,
          timer: freshTimer(),
        });
      },

      endSession: () => {
        get()._flush();
        const after = get();
        if (after.sessionStartedAt === null) return;

        // Force-finalize any receipt still in the printer queue before locking endedAt.
        // Without this, a receipt whose finalizeComplete setTimeout hasn't fired yet
        // (e.g. user ends session while photo modal is animating) would be dropped.
        if (after.cutReceipt) {
          get().finalizeComplete(after.cutReceipt.photoDataUrl ?? null);
        }

        const final = get();
        set({
          endedSession: {
            startedAt: final.sessionStartedAt ?? after.sessionStartedAt,
            endedAt: Date.now(),
          },
          sessionStartedAt: null,
          sessionActiveMs: 0,
          sessionBreakMs: 0,
          currentTaskId: null,
          pendingPhotoFor: null,
          landingReceiptId: null,
          timer: freshTimer(),
        });
      },

      wipeForFreshStart: () =>
        set({
          tasks: [],
          receipts: [],
          dayCounter: {},
          receiptCounter: 0,
          endedSession: null,
          cutReceipt: null,
          landingReceiptId: null,
          pendingPhotoFor: null,
          currentTaskId: null,
          sessionStartedAt: null,
          sessionActiveMs: 0,
          sessionBreakMs: 0,
          timer: freshTimer(),
        }),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      _flush: () => {
        const s = get();
        if (s.timer.mode === "idle" || !s.timer.startedAtWall) return;
        const now = Date.now();
        const elapsed = now - s.timer.startedAtWall;
        if (s.timer.mode === "working") {
          set({
            timer: {
              ...s.timer,
              accumulatedActiveMs: s.timer.accumulatedActiveMs + elapsed,
              startedAtWall: now,
            },
          });
        } else if (s.timer.mode === "break") {
          set({
            timer: {
              ...s.timer,
              accumulatedBreakMs: s.timer.accumulatedBreakMs + elapsed,
              startedAtWall: now,
            },
          });
        }
      },

      _setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: "taskrecipets:v3",
      version: 4,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as { receipts?: Array<{ kind?: string; sourceTaskId?: string; id: string }> };
        if (version < 4 && state.receipts) {
          state.receipts = state.receipts.map((r) =>
            r.kind !== "session" && !r.sourceTaskId
              ? { ...r, sourceTaskId: r.id }
              : r,
          );
        }
        return state;
      },
      partialize: (state) => {
        const persistedState = { ...state } as Partial<StoreState>;
        delete persistedState.hasHydrated;
        delete persistedState._setHasHydrated;
        delete persistedState.cutReceipt;
        delete persistedState.landingReceiptId;
        return persistedState;
      },
    },
  ),
);

if (typeof window !== "undefined" && useStore.persist) {
  useStore.persist.onFinishHydration((state) => {
    state._setHasHydrated(true);
  });

  if (useStore.persist.hasHydrated()) {
    useStore.getState()._setHasHydrated(true);
  }

  window.setTimeout(() => {
    useStore.getState()._setHasHydrated(true);
  }, 0);
}

export function liveActiveMs(now?: number): number {
  const s = useStore.getState();
  const t = s.timer;
  if (t.mode === "working" && t.startedAtWall && now !== undefined) {
    return t.accumulatedActiveMs + (now - t.startedAtWall);
  }
  return t.accumulatedActiveMs;
}

export function liveBreakMs(now?: number): number {
  const s = useStore.getState();
  const t = s.timer;
  if (t.mode === "break" && t.startedAtWall && now !== undefined) {
    return t.accumulatedBreakMs + (now - t.startedAtWall);
  }
  return t.accumulatedBreakMs;
}

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
