"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { useStore } from "@/lib/store";
import { TimerWidget } from "./timer/TimerWidget";
import { TaskList } from "./tasks/TaskList";
import { Tray } from "./tray/Tray";
import { PhotoCaptureModal } from "./photo/PhotoCaptureModal";
import { LoadingScreen } from "./LoadingScreen";
import { SoundEffects } from "./SoundEffects";

/**
 * Two-column workspace that fits the viewport without scrolling.
 * Row 1: brand (left) + attribution (right). Row 2: timer/tasks (left) + tray
 * (right) — both cells share a top edge so the scaled tray stays aligned with
 * the countdown widget. Sizes use fluid clamp() tokens (see globals.css).
 */
export function Workspace() {
  const hydrated = useStore((s) => s.hasHydrated);
  const [loadingDone, setLoadingDone] = useState(false);
  const handleLoadingComplete = useCallback(() => setLoadingDone(true), []);

  return (
    <>
      {hydrated && (
        <div className="workspace-shell h-screen w-screen overflow-hidden">
          <div className="workspace-grid">
            {/* Row 1 — brand + attribution */}
            <div className="workspace-left workspace-brand-cell">
              <Brand />
            </div>
            <div className="workspace-credit-cell relative min-w-0">
              <CreatedBy />
            </div>

            {/* Row 2 — timer/tasks and tray share the same top baseline */}
            <div className="workspace-left workspace-controls-cell flex flex-col gap-8 min-h-0">
              <TimerWidget />
              <div className="workspace-task-list-wrap flex-1 min-h-0">
                <TaskList />
              </div>
            </div>
            <div className="workspace-tray-cell relative min-h-0 min-w-0 overflow-visible">
              <Tray />
            </div>
          </div>

          <PhotoCaptureModal />
          <SoundEffects />
        </div>
      )}
      {!loadingDone && (
        <LoadingScreen ready={hydrated} onComplete={handleLoadingComplete} />
      )}
    </>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/logo.svg"
        alt="Task Recipets"
        width={2080}
        height={3294}
        unoptimized
        className="h-10 w-auto select-none"
        draggable={false}
      />
      <div className="text-[13px] tracking-[0.32em] uppercase text-[color:var(--color-ink)]/85">
        Task Recipets
      </div>
    </div>
  );
}

function CreatedBy() {
  return (
    <div className="absolute top-3 right-5 text-[10px] text-[color:var(--color-muted)] tracking-wider z-50">
      Created by suminstudio
    </div>
  );
}
