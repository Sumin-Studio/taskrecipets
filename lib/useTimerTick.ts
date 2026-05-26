"use client";

import { useEffect, useState } from "react";
import { useStore } from "./store";

/**
 * Forces a re-render once per second while the timer is running, so the LCD
 * MM:SS display keeps updating. The store itself doesn't tick — elapsed time
 * is derived from Date.now() at read time via liveActiveMs/liveBreakMs.
 */
export function useTimerTick() {
  const [now, setNow] = useState<number | null>(null);
  const mode = useStore((s) => s.timer.mode);

  useEffect(() => {
    if (mode === "idle") {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [mode]);

  return now;
}
