"use client";

import { useEffect, useState } from "react";
import { TimerWidget } from "./timer/TimerWidget";
import { TaskList } from "./tasks/TaskList";
import { Tray } from "./tray/Tray";

/**
 * Client-only wrapper so the Zustand persist hydration doesn't cause SSR
 * mismatches. We render a static skeleton on the server and let the real
 * components mount on the client.
 */
export function Workspace() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!hydrated) {
    return (
      <div className="grid grid-cols-[minmax(540px,560px)_1fr] min-h-screen">
        <div />
        <div />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(540px,560px)_1fr] gap-8 min-h-screen px-10 py-8">
      {/* Left column: brand + timer + tasks */}
      <div className="flex flex-col gap-10">
        <Brand />
        <TimerWidget />
        <TaskList />
      </div>

      {/* Right column: tray + receipts */}
      <div className="relative">
        <CreatedBy />
        <Tray />
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-[42px] h-[42px] rounded-lg bg-white/80 outline outline-1 outline-[color:var(--color-shell-outline)] flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="2" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 6V4M17 6V4M5 10H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-[14px] tracking-[0.32em] uppercase text-[color:var(--color-ink)]/85">
        Work Recipe
      </div>
    </div>
  );
}

function CreatedBy() {
  return (
    <div className="absolute top-2 right-4 text-[11px] text-[color:var(--color-muted)] tracking-wider z-50">
      Created by suminstudio
    </div>
  );
}
