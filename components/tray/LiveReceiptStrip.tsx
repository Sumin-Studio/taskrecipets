"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MS_PER_MIN } from "@/lib/computeSquares";
import { useStore } from "@/lib/store";
import { useTimerTick } from "@/lib/useTimerTick";
import { LiveReceipt3D, type LiveReceipt3DState } from "./LiveReceipt3D";

const PARKED_RECEIPT_FALLBACK_MS = 3500;

/**
 * The in-progress receipt hanging out of the printer slot.
 */
export function LiveReceiptStrip({
  readyLandingReceiptId,
}: {
  readyLandingReceiptId?: string | null;
}) {
  const now = useTimerTick();
  const currentTaskId = useStore((s) => s.currentTaskId);
  const tasks = useStore((s) => s.tasks);
  const cutReceipt = useStore((s) => s.cutReceipt);
  const finalizeComplete = useStore((s) => s.finalizeComplete);
  const clearLandingReceipt = useStore((s) => s.clearLandingReceipt);
  const [parkedReceipt, setParkedReceipt] = useState<{
    receiptState: LiveReceipt3DState;
    landingReceiptId: string | null;
  } | null>(null);
  const fallbackReleaseTimer = useRef<number | null>(null);

  const releaseParkedReceipt = useCallback(() => {
    if (fallbackReleaseTimer.current != null) {
      window.clearTimeout(fallbackReleaseTimer.current);
      fallbackReleaseTimer.current = null;
    }
    clearLandingReceipt();
    setParkedReceipt(null);
  }, [clearLandingReceipt]);

  useEffect(() => {
    return () => {
      if (fallbackReleaseTimer.current != null) {
        window.clearTimeout(fallbackReleaseTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!parkedReceipt?.landingReceiptId) return;
    if (readyLandingReceiptId !== parkedReceipt.landingReceiptId) return;

    const frame = window.requestAnimationFrame(releaseParkedReceipt);
    return () => window.cancelAnimationFrame(frame);
  }, [
    parkedReceipt?.landingReceiptId,
    readyLandingReceiptId,
    releaseParkedReceipt,
  ]);

  const cutTask = cutReceipt
    ? tasks.find((t) => t.id === cutReceipt.taskId)
    : null;

  if (parkedReceipt) {
    return (
      <LiveReceipt3D
        receiptState={parkedReceipt.receiptState}
        onComplete={() => {}}
      />
    );
  }

  if (cutReceipt) {
    const phase = cutReceipt.isCut ? "cut" : "frozen";
    const receiptState: LiveReceipt3DState = {
      phase,
      taskId: cutReceipt.taskId,
      taskTitle: cutTask?.title ?? "Receipt",
      taskStartedAt: cutReceipt.taskStartedAt,
      timeline: cutReceipt.timeline,
      upToTs: cutReceipt.frozenAt,
      textureKey: [
        "cut",
        cutReceipt.taskId,
        cutReceipt.frozenAt,
        cutReceipt.isCut ? "ready" : "frozen",
        cutReceipt.photoDataUrl ?? "no-photo",
      ].join(":"),
      squares: cutReceipt.squares,
      photoDataUrl: cutReceipt.photoDataUrl,
      printedAt: cutReceipt.frozenAt,
    };

    const handleCutComplete = () => {
      setParkedReceipt({ receiptState, landingReceiptId: null });
      finalizeComplete(cutReceipt.photoDataUrl ?? null);

      const landingReceiptId = useStore.getState().landingReceiptId;
      setParkedReceipt({ receiptState, landingReceiptId });

      fallbackReleaseTimer.current = window.setTimeout(
        releaseParkedReceipt,
        PARKED_RECEIPT_FALLBACK_MS,
      );
    };

    return (
      <LiveReceipt3D
        receiptState={receiptState}
        onComplete={handleCutComplete}
      />
    );
  }

  const task = tasks.find((t) => t.id === currentTaskId);
  if (!task || !task.taskStartedAt) return null;

  const liveNow = now ?? task.taskStartedAt + 1;
  const elapsedMs = Math.max(1, liveNow - task.taskStartedAt);
  const minuteBucket = Math.floor(elapsedMs / MS_PER_MIN);
  const latestTimelineTs =
    task.timeline.length > 0
      ? Math.max(...task.timeline.map((entry) => entry.ts))
      : task.taskStartedAt;
  const textureUpToTs = Math.min(
    liveNow,
    Math.max(
      task.taskStartedAt + minuteBucket * MS_PER_MIN + 1,
      latestTimelineTs + 1,
      task.taskStartedAt + 1,
    ),
  );
  const timelineKey = task.timeline
    .map((entry) => `${entry.ts}-${entry.mode}`)
    .join(",");
  const liveReceiptState: LiveReceipt3DState = {
    phase: "live",
    taskId: task.id,
    taskTitle: task.title,
    taskStartedAt: task.taskStartedAt,
    timeline: task.timeline,
    upToTs: textureUpToTs,
    textureKey: ["live", task.id, minuteBucket, timelineKey].join(":"),
  };

  return (
    <LiveReceipt3D
      receiptState={liveReceiptState}
      onComplete={() => {}}
    />
  );
}
