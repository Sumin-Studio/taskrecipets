"use client";

import { useEffect, useRef } from "react";
import { useStore } from "./store";

/**
 * Drives the countdown via requestAnimationFrame. Reads start time from the
 * store (set in startTimer) so it survives tab throttling — when the tab
 * resumes, the first rAF tick reconciles against real wall time.
 *
 * When remainingMs hits 0, calls onPhaseElapsed once and stops.
 */
export function useTimerTick() {
  const tickingRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    let lastWall = Date.now();

    const loop = () => {
      const { timer, pauseTimer, onPhaseElapsed, currentTaskId, tasks } = useStore.getState();
      if (!timer.running || timer.startedAtWall === undefined) {
        tickingRef.current = false;
        return;
      }

      const now = Date.now();
      const elapsed = now - timer.startedAtWall;
      const remaining = timer.remainingMs - elapsed;

      if (remaining <= 0) {
        // attribute the remaining slice to session/task before flipping phase
        const slice = timer.remainingMs;
        useStore.setState((s) => ({
          sessionFocusMs:
            timer.phase === "focus" ? s.sessionFocusMs + slice : s.sessionFocusMs,
          sessionBreakMs:
            timer.phase !== "focus" ? s.sessionBreakMs + slice : s.sessionBreakMs,
          tasks:
            timer.phase === "focus" && currentTaskId
              ? s.tasks.map((t) =>
                  t.id === currentTaskId
                    ? { ...t, totalFocusMs: t.totalFocusMs + slice }
                    : t,
                )
              : s.tasks,
        }));
        pauseTimer(); // sets running=false; the if-guard above stops loop next frame
        onPhaseElapsed();
        // play chime
        if (useStore.getState().settings.soundOn) {
          playChime();
        }
        tickingRef.current = false;
        return;
      }

      // Periodically (every ~1s wall) update remainingMs/startedAtWall pair so
      // a refresh recovers cleanly without losing seconds.
      if (now - lastWall > 1000) {
        useStore.setState((s) => ({
          timer: {
            ...s.timer,
            remainingMs: remaining,
            startedAtWall: now,
            startedAtPerf: performance.now(),
          },
        }));
        lastWall = now;
      } else {
        // cheap, non-persisted display tick — force a re-render via a no-op set
        useStore.setState({ timer: { ...timer } });
      }

      raf = requestAnimationFrame(loop);
    };

    const unsub = useStore.subscribe((state, prev) => {
      if (state.timer.running && !tickingRef.current) {
        tickingRef.current = true;
        lastWall = Date.now();
        raf = requestAnimationFrame(loop);
      }
      if (!state.timer.running && prev.timer.running) {
        cancelAnimationFrame(raf);
        tickingRef.current = false;
      }
    });

    // kick off on mount if already running (recovered from localStorage)
    if (useStore.getState().timer.running && !tickingRef.current) {
      tickingRef.current = true;
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, []);
}

let audioCtx: AudioContext | null = null;

function playChime() {
  try {
    if (typeof window === "undefined") return;
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
    }
    const ctx = audioCtx;
    const now = ctx.currentTime;
    // two soft bell notes
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.55);
    });
  } catch {
    // no audio — silent
  }
}
