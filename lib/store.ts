"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Phase = "focus" | "shortBreak" | "longBreak";

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
  pomodorosCompleted: number;
  totalFocusMs: number;
  totalBreakMs: number;
};

export type ReceiptKind = "task" | "session";

export type Receipt = {
  id: string;
  kind: ReceiptKind;
  number: number;
  printedAt: number;
  rotation: number;
  // task receipts
  taskTitle?: string;
  subtasks?: { title: string; done: boolean }[];
  pomodorosCompleted?: number;
  totalFocusMs?: number;
  totalBreakMs?: number;
  motto?: string;
  // session receipts
  tasksCompleted?: { title: string; pomodoros: number; focusMs: number }[];
  sessionFocusMs?: number;
  sessionBreakMs?: number;
};

export type Settings = {
  focusMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  longBreakEvery: number;
  soundOn: boolean;
};

export type TimerSnapshot = {
  phase: Phase;
  running: boolean;
  /** absolute ms remaining when timer was last stopped/started */
  remainingMs: number;
  /** performance.now() at last start; undefined when paused */
  startedAtPerf?: number;
  /** Date.now() at last start — used to recover after refresh */
  startedAtWall?: number;
  /** count of focus blocks completed in the current cycle (resets after long break) */
  focusBlocksInCycle: number;
};

type StoreState = {
  tasks: Task[];
  currentTaskId: string | null;
  receipts: Receipt[];
  receiptCounter: number;
  settings: Settings;
  timer: TimerSnapshot;
  sessionStartedAt: number | null;
  sessionFocusMs: number;
  sessionBreakMs: number;

  // task actions
  addTask: (title: string) => void;
  removeTask: (id: string) => void;
  selectTask: (id: string | null) => void;
  renameTask: (id: string, title: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subId: string) => void;
  removeSubtask: (taskId: string, subId: string) => void;
  completeTask: (id: string) => void;

  // timer actions
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  skipPhase: () => void;
  setRemainingMs: (ms: number) => void;
  onPhaseElapsed: () => void;

  // session
  endSession: () => void;

  // settings
  updateSettings: (patch: Partial<Settings>) => void;
};

const DEFAULT_SETTINGS: Settings = {
  focusMs: 25 * 60_000,
  shortBreakMs: 5 * 60_000,
  longBreakMs: 15 * 60_000,
  longBreakEvery: 4,
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

function phaseDuration(s: Settings, phase: Phase) {
  if (phase === "focus") return s.focusMs;
  if (phase === "shortBreak") return s.shortBreakMs;
  return s.longBreakMs;
}

function initialTimer(s: Settings): TimerSnapshot {
  return {
    phase: "focus",
    running: false,
    remainingMs: s.focusMs,
    focusBlocksInCycle: 0,
  };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      tasks: [],
      currentTaskId: null,
      receipts: [],
      receiptCounter: 0,
      settings: DEFAULT_SETTINGS,
      timer: initialTimer(DEFAULT_SETTINGS),
      sessionStartedAt: null,
      sessionFocusMs: 0,
      sessionBreakMs: 0,

      addTask: (title) => {
        const t: Task = {
          id: uid(),
          title: title.trim(),
          subtasks: [],
          createdAt: Date.now(),
          pomodorosCompleted: 0,
          totalFocusMs: 0,
          totalBreakMs: 0,
        };
        set((s) => ({
          tasks: [...s.tasks, t],
          currentTaskId: s.currentTaskId ?? t.id,
        }));
      },

      removeTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          currentTaskId: s.currentTaskId === id ? null : s.currentTaskId,
        })),

      selectTask: (id) => set({ currentTaskId: id }),

      renameTask: (id, title) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, title } : t)),
        })),

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

      completeTask: (id) => {
        const s = get();
        const task = s.tasks.find((t) => t.id === id);
        if (!task || task.completedAt) return;

        const nextNumber = s.receiptCounter + 1;
        const receipt: Receipt = {
          id: uid(),
          kind: "task",
          number: nextNumber,
          printedAt: Date.now(),
          rotation: (Math.random() - 0.5) * 4,
          taskTitle: task.title,
          subtasks: task.subtasks.map((su) => ({ title: su.title, done: su.done })),
          pomodorosCompleted: task.pomodorosCompleted,
          totalFocusMs: task.totalFocusMs,
          totalBreakMs: task.totalBreakMs,
          motto: pickMotto(),
        };

        set({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, completedAt: Date.now() } : t,
          ),
          receipts: [...s.receipts, receipt].slice(-50),
          receiptCounter: nextNumber,
          currentTaskId: s.currentTaskId === id ? null : s.currentTaskId,
        });
      },

      startTimer: () => {
        const s = get();
        if (s.timer.running) return;
        set({
          timer: {
            ...s.timer,
            running: true,
            startedAtPerf: performance.now(),
            startedAtWall: Date.now(),
          },
          sessionStartedAt: s.sessionStartedAt ?? Date.now(),
        });
      },

      pauseTimer: () => {
        const s = get();
        if (!s.timer.running || s.timer.startedAtPerf === undefined) {
          set({ timer: { ...s.timer, running: false } });
          return;
        }
        const elapsed = performance.now() - s.timer.startedAtPerf;
        const remaining = Math.max(0, s.timer.remainingMs - elapsed);
        // also credit elapsed to session/task totals
        const phase = s.timer.phase;
        const phaseElapsedAttribution = Math.min(elapsed, s.timer.remainingMs);
        set({
          timer: {
            ...s.timer,
            running: false,
            remainingMs: remaining,
            startedAtPerf: undefined,
            startedAtWall: undefined,
          },
          sessionFocusMs:
            phase === "focus" ? s.sessionFocusMs + phaseElapsedAttribution : s.sessionFocusMs,
          sessionBreakMs:
            phase !== "focus" ? s.sessionBreakMs + phaseElapsedAttribution : s.sessionBreakMs,
          tasks:
            phase === "focus" && s.currentTaskId
              ? s.tasks.map((t) =>
                  t.id === s.currentTaskId
                    ? { ...t, totalFocusMs: t.totalFocusMs + phaseElapsedAttribution }
                    : t,
                )
              : s.tasks,
        });
      },

      resetTimer: () => {
        const s = get();
        set({
          timer: {
            ...s.timer,
            running: false,
            remainingMs: phaseDuration(s.settings, s.timer.phase),
            startedAtPerf: undefined,
            startedAtWall: undefined,
          },
        });
      },

      skipPhase: () => {
        // pause, then advance
        get().pauseTimer();
        get().onPhaseElapsed();
      },

      setRemainingMs: (ms) =>
        set((s) => ({
          timer: { ...s.timer, remainingMs: Math.max(0, ms) },
        })),

      onPhaseElapsed: () => {
        const s = get();
        const phase = s.timer.phase;
        let nextPhase: Phase;
        let nextFocusBlocks = s.timer.focusBlocksInCycle;

        if (phase === "focus") {
          nextFocusBlocks += 1;
          // credit a pomodoro to current task
          if (s.currentTaskId) {
            set({
              tasks: s.tasks.map((t) =>
                t.id === s.currentTaskId
                  ? { ...t, pomodorosCompleted: t.pomodorosCompleted + 1 }
                  : t,
              ),
            });
          }
          nextPhase =
            nextFocusBlocks >= s.settings.longBreakEvery ? "longBreak" : "shortBreak";
          if (nextPhase === "longBreak") nextFocusBlocks = 0;
        } else {
          nextPhase = "focus";
        }

        set({
          timer: {
            phase: nextPhase,
            running: false,
            remainingMs: phaseDuration(get().settings, nextPhase),
            focusBlocksInCycle: nextFocusBlocks,
          },
        });
      },

      endSession: () => {
        const s = get();
        // commit any in-flight elapsed time first
        if (s.timer.running) get().pauseTimer();
        const after = get();
        if (after.sessionStartedAt === null) return;

        const nextNumber = after.receiptCounter + 1;
        const completedToday = after.tasks
          .filter((t) => t.completedAt && t.completedAt >= (after.sessionStartedAt ?? 0))
          .map((t) => ({
            title: t.title,
            pomodoros: t.pomodorosCompleted,
            focusMs: t.totalFocusMs,
          }));

        const sessionReceipt: Receipt = {
          id: uid(),
          kind: "session",
          number: nextNumber,
          printedAt: Date.now(),
          rotation: (Math.random() - 0.5) * 4,
          tasksCompleted: completedToday,
          sessionFocusMs: after.sessionFocusMs,
          sessionBreakMs: after.sessionBreakMs,
          motto: pickMotto(),
        };

        set({
          receipts: [...after.receipts, sessionReceipt].slice(-50),
          receiptCounter: nextNumber,
          sessionStartedAt: null,
          sessionFocusMs: 0,
          sessionBreakMs: 0,
          timer: initialTimer(after.settings),
        });
      },

      updateSettings: (patch) => {
        const s = get();
        const nextSettings = { ...s.settings, ...patch };
        const isIdle = !s.timer.running && s.timer.remainingMs === phaseDuration(s.settings, s.timer.phase);
        set({
          settings: nextSettings,
          timer: isIdle
            ? { ...s.timer, remainingMs: phaseDuration(nextSettings, s.timer.phase) }
            : s.timer,
        });
      },
    }),
    {
      name: "work-recipe:v1",
      version: 1,
      // recover an in-flight timer across reloads
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const t = state.timer;
        if (t.running && t.startedAtWall !== undefined) {
          const elapsed = Date.now() - t.startedAtWall;
          const remaining = t.remainingMs - elapsed;
          if (remaining <= 0) {
            // phase ended while we were away — collapse to phase boundary
            state.timer = {
              ...t,
              running: false,
              remainingMs: 0,
              startedAtPerf: undefined,
              startedAtWall: undefined,
            };
          } else {
            state.timer = {
              ...t,
              running: true,
              remainingMs: remaining,
              startedAtPerf: performance.now(),
              startedAtWall: Date.now(),
            };
          }
        } else {
          state.timer = { ...t, startedAtPerf: undefined };
        }
      },
    },
  ),
);

export function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function phaseLabel(p: Phase): string {
  if (p === "focus") return "Focus";
  if (p === "shortBreak") return "Short break";
  return "Long break";
}
