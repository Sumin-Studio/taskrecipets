"use client";

import { useState } from "react";
import { useStore, formatMs, phaseLabel } from "@/lib/store";
import { useTimerTick } from "@/lib/useTimerTick";
import { SettingsSheet } from "./SettingsSheet";

export function TimerWidget() {
  useTimerTick();

  const timer = useStore((s) => s.timer);
  const currentTaskId = useStore((s) => s.currentTaskId);
  const tasks = useStore((s) => s.tasks);
  const startTimer = useStore((s) => s.startTimer);
  const pauseTimer = useStore((s) => s.pauseTimer);
  const resetTimer = useStore((s) => s.resetTimer);
  const skipPhase = useStore((s) => s.skipPhase);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const currentTask = tasks.find((t) => t.id === currentTaskId) ?? null;

  // live-tick local display (re-render is driven by store updates from useTimerTick)
  const liveRemaining = timer.running && timer.startedAtWall !== undefined
    ? Math.max(0, timer.remainingMs - (Date.now() - timer.startedAtWall))
    : timer.remainingMs;

  return (
    <div className="relative w-[500px]">
      {/* outer shell — rounded 48px */}
      <div className="shell-skeuo rounded-[48px] p-[11px] pb-6">
        {/* LCD screen */}
        <div className="lcd-screen relative rounded-t-[40px] rounded-b-[20px] px-6 pt-5 pb-6 overflow-hidden">
          <div className="text-center text-[15px] text-[color:var(--color-lcd-ink)]/85">
            {phaseLabel(timer.phase)} ·{" "}
            {currentTask
              ? `Current working on: ${truncate(currentTask.title, 28)}`
              : "Pick a task to begin"}
          </div>
          <div className="text-center font-mono text-[color:var(--color-lcd-ink)] leading-none mt-2 tabular-nums select-none"
               style={{ fontSize: 95, lineHeight: "114px", fontWeight: 400 }}>
            {formatMs(liveRemaining)}
          </div>
          {/* tiny phase dots in the corner */}
          <div className="absolute bottom-2 right-4 flex gap-[5px]">
            {Array.from({ length: useStore.getState().settings.longBreakEvery }).map((_, i) => (
              <span
                key={i}
                className="block w-[6px] h-[6px] rounded-full"
                style={{
                  background: i < timer.focusBlocksInCycle
                    ? "var(--color-lcd-ink)"
                    : "rgba(54,54,54,0.18)",
                }}
              />
            ))}
          </div>
          {/* settings gear */}
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="absolute top-3 left-4 text-[color:var(--color-lcd-ink)]/55 hover:text-[color:var(--color-lcd-ink)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94a7.43 7.43 0 0 0 0-1.88l2-1.55a.5.5 0 0 0 .12-.61l-1.9-3.29a.5.5 0 0 0-.6-.22l-2.36.94a7.27 7.27 0 0 0-1.63-.95l-.36-2.51a.5.5 0 0 0-.5-.42h-3.8a.5.5 0 0 0-.5.42l-.36 2.51a7.3 7.3 0 0 0-1.63.95l-2.36-.94a.5.5 0 0 0-.6.22l-1.9 3.29a.5.5 0 0 0 .12.61l2 1.55a7.43 7.43 0 0 0 0 1.88l-2 1.55a.5.5 0 0 0-.12.61l1.9 3.29a.5.5 0 0 0 .6.22l2.36-.94a7.3 7.3 0 0 0 1.63.95l.36 2.51a.5.5 0 0 0 .5.42h3.8a.5.5 0 0 0 .5-.42l.36-2.51a7.27 7.27 0 0 0 1.63-.95l2.36.94a.5.5 0 0 0 .6-.22l1.9-3.29a.5.5 0 0 0-.12-.61ZM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Z" />
            </svg>
          </button>
        </div>

        {/* control buttons */}
        <div className="mt-4 flex items-center justify-between gap-3 px-1">
          <ControlButton
            label={timer.running ? "Pause" : "Start"}
            onClick={() => (timer.running ? pauseTimer() : startTimer())}
            primary={!timer.running}
          />
          <ControlButton label="Reset" onClick={resetTimer} />
          <ControlButton label="Skip" onClick={skipPhase} />
        </div>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="btn-skeuo flex-1 h-[58px] rounded-full text-[14px] tracking-wider uppercase text-[color:var(--color-ink)]/75"
      style={primary ? { color: "var(--color-ink)" } : undefined}
    >
      {label}
    </button>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
