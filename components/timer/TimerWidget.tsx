"use client";

import {
  useStore,
  formatClock,
  liveActiveMs,
  liveBreakMs,
} from "@/lib/store";
import { useTimerTick } from "@/lib/useTimerTick";

export function TimerWidget() {
  const now = useTimerTick();

  const timer = useStore((s) => s.timer);
  const currentTaskId = useStore((s) => s.currentTaskId);
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const start = useStore((s) => s.start);
  const pause = useStore((s) => s.pause);
  const requestComplete = useStore((s) => s.requestComplete);
  const pendingPhotoFor = useStore((s) => s.pendingPhotoFor);
  const updateSettings = useStore((s) => s.updateSettings);

  const currentTask = tasks.find((t) => t.id === currentTaskId) ?? null;

  const onBreak = timer.mode === "break";
  const working = timer.mode === "working";
  const active = liveActiveMs(now ?? undefined);
  const breakTime = liveBreakMs(now ?? undefined);

  // Top subheading content
  let label: React.ReactNode;
  if (!currentTask) {
    label = "Choose next task";
  } else if (onBreak) {
    label = (
      <>
        Break · <span className="tabular-nums">{formatClock(breakTime)}</span>
      </>
    );
  } else {
    label = `Working on: ${truncate(currentTask.title, 30)}`;
  }

  // big clock always shows active time — frozen on break, ticking while working
  const displayMs = active;

  const canComplete = !!currentTask && !pendingPhotoFor;

  return (
    <div className="workspace-panel relative">
      <div className="shell-skeuo timer-widget-shell">
        {/* LCD screen */}
        <div className="lcd-screen timer-widget-lcd relative overflow-hidden">
          <div className="timer-widget-label text-center text-[color:var(--color-lcd-ink)]/85">
            {label}
          </div>
          <div className="timer-widget-clock text-center font-mono text-[color:var(--color-lcd-ink)] mt-1.5 tabular-nums select-none">
            {formatClock(displayMs)}
          </div>

          {/* sub-row: just the break tally */}
          <div className="flex items-center justify-end mt-1 text-[11px] text-[color:var(--color-lcd-ink)]/55 tabular-nums px-1">
            {timer.breakCount} {timer.breakCount === 1 ? "break" : "breaks"} taken
          </div>

          {/* sound toggle in corner */}
          <button
            onClick={() => updateSettings({ soundOn: !settings.soundOn })}
            aria-label={settings.soundOn ? "Mute" : "Unmute"}
            className="absolute top-3 left-4 text-[color:var(--color-lcd-ink)]/55 hover:text-[color:var(--color-lcd-ink)] transition-colors"
          >
            {settings.soundOn ? <SoundOnIcon /> : <SoundOffIcon />}
          </button>
        </div>

        {/* control row — three latched icon buttons */}
        <div className="timer-widget-controls flex items-center justify-between px-1">
          <IconControl
            label={onBreak ? "Resume" : "Start"}
            onClick={start}
            disabled={!currentTask || working}
            pressed={working}
          >
            <PlayIcon />
          </IconControl>
          <IconControl
            label="Pause"
            onClick={pause}
            disabled={!working}
            pressed={onBreak}
          >
            <PauseIcon />
          </IconControl>
          <IconControl
            label="Complete"
            onClick={requestComplete}
            disabled={!canComplete}
            pressed={false}
          >
            <CheckIcon />
          </IconControl>
        </div>
      </div>
    </div>
  );
}

function IconControl({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      data-pressed={pressed}
      data-sound-effect="timer-main"
      className="btn-skeuo timer-widget-btn flex-1 rounded-full flex items-center justify-center text-[color:var(--color-ink)] disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function SoundOnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3Z" />
      <path d="M16 8.5a4 4 0 0 1 0 7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3Z" />
      <path d="M16 9l5 5M21 9l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
