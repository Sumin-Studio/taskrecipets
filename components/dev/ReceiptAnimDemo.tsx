"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { TimelineEntry } from "@/lib/computeSquares";
import type { Receipt as ReceiptData } from "@/lib/store";
import { computeSquares, MS_PER_MIN } from "@/lib/computeSquares";
import { PhotoCaptureDialog } from "@/components/photo/PhotoCaptureModal";
import { SessionSummaryView } from "@/components/session/SessionSummaryView";
import {
  buildLiveStageReceiptState,
  type StageReceiptState,
} from "@/components/tray/ReceiptStage3D";
import { Tray } from "@/components/tray/Tray";

type Phase = "idle" | "printing" | "cut";
type DemoView = "tray" | "session";
type CutContext = {
  frozenAt: number;
  tl: TimelineEntry[];
  squares: ReturnType<typeof computeSquares>;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function makeDemoReceipt(
  taskStartedAt: number,
  timeline: TimelineEntry[],
  completedAt: number,
  sourceTaskId: string,
  number: number,
  squares: ReturnType<typeof computeSquares>,
  photoDataUrl: string | null,
  taskTitle: string,
): ReceiptData {
  const activeMs = Math.max(completedAt - taskStartedAt - 2 * MS_PER_MIN, MS_PER_MIN * 3);
  const printedAt = Date.now();
  return {
    kind: "task",
    id: uid(),
    sourceTaskId,
    number,
    printedAt,
    rotation: (Math.random() - 0.5) * 4,
    taskTitle,
    taskStartedAt,
    taskCompletedAt: completedAt,
    dayCounter: number,
    timeline,
    squares,
    photoDataUrl,
    totalActiveMs: activeMs,
    totalBreakMs: MS_PER_MIN,
    breakCount: 1,
    motto: "Stir, taste, repeat.",
  };
}

export function ReceiptAnimDemo() {
  const [view, setView] = useState<DemoView>("tray");
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [endedSession, setEndedSession] = useState<{
    startedAt: number;
    endedAt: number;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [taskId, setTaskId] = useState(() => uid());
  const [taskStartedAt, setTaskStartedAt] = useState(() => Date.now());
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [printUpTo, setPrintUpTo] = useState(() => Date.now());
  const [cutAt, setCutAt] = useState<number | null>(null);
  const [cutSquares, setCutSquares] = useState<ReturnType<typeof computeSquares>>([]);
  const [cutIsCut, setCutIsCut] = useState(false);
  const [cutPhotoUrl, setCutPhotoUrl] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [receiptCounter, setReceiptCounter] = useState(0);
  const [currentTaskTitle, setCurrentTaskTitle] = useState("Demo task 1");
  const [autoRun, setAutoRun] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [photoCaptureKey, setPhotoCaptureKey] = useState(0);
  const cutContext = useRef<CutContext | null>(null);

  const resetCutState = useCallback(() => {
    cutContext.current = null;
    setCutAt(null);
    setCutSquares([]);
    setCutIsCut(false);
    setCutPhotoUrl(null);
  }, []);

  const reset = useCallback(() => {
    setAutoRun(false);
    setShowPhotoCapture(false);
    setView("tray");
    setSessionStartedAt(null);
    setEndedSession(null);
    setReceiptCounter(0);
    setCurrentTaskTitle("Demo task 1");
    resetCutState();
    setPhase("idle");
    setTimeline([]);
    setTaskId(uid());
    const now = Date.now();
    setTaskStartedAt(now);
    setPrintUpTo(now);
  }, [resetCutState]);

  const addMinute = useCallback(() => {
    setPrintUpTo((t) => t + MS_PER_MIN);
  }, []);

  const startPrinting = useCallback(() => {
    setShowPhotoCapture(false);
    resetCutState();
    setAutoRun(false);
    const now = Date.now();
    setSessionStartedAt((s) => s ?? now);
    setTaskId(uid());
    setCurrentTaskTitle(`Demo task ${receiptCounter + 1}`);
    setTaskStartedAt(now);
    setPrintUpTo(now);
    setTimeline([{ ts: now, mode: "working" }]);
    setPhase("printing");
  }, [receiptCounter, resetCutState]);

  const runComplete = useCallback(() => {
    const tl =
      timeline.length > 0
        ? timeline
        : [{ ts: taskStartedAt, mode: "working" as const }];
    setTimeline(tl);

    setPrintUpTo((currentPrintUpTo) => {
      const frozenAt = currentPrintUpTo;
      const squares = computeSquares(taskStartedAt, tl, frozenAt);
      cutContext.current = { frozenAt, tl, squares };
      setCutAt(frozenAt);
      setCutSquares(squares);
      setCutIsCut(false);
      setCutPhotoUrl(null);
      setPhase("cut");
      setPhotoCaptureKey((k) => k + 1);
      setShowPhotoCapture(true);
      return currentPrintUpTo;
    });
  }, [taskStartedAt, timeline]);

  const onPhotoCommitted = useCallback((photoDataUrl: string | null) => {
    setCutPhotoUrl(photoDataUrl);
    setCutIsCut(true);
    setShowPhotoCapture(false);
  }, []);

  const handleStageLanded = useCallback(
    (receiptState: StageReceiptState) => {
      const receipt = makeDemoReceipt(
        receiptState.taskStartedAt,
        receiptState.timeline,
        receiptState.upToTs,
        receiptState.taskId,
        receiptCounter + 1,
        receiptState.squares ??
          computeSquares(
            receiptState.taskStartedAt,
            receiptState.timeline,
            receiptState.upToTs,
          ),
        receiptState.photoDataUrl ?? null,
        receiptState.taskTitle,
      );
      setReceiptCounter((n) => n + 1);
      setReceipts((prev) => [...prev, receipt]);
      resetCutState();
      setPhase("idle");
      return receipt.id;
    },
    [receiptCounter, resetCutState],
  );

  const playFullSequence = useCallback(() => {
    reset();
    setAutoRun(true);
    const now = Date.now();
    setSessionStartedAt(now);
    setTaskId(uid());
    setTaskStartedAt(now);
    setPrintUpTo(now);
    setTimeline([{ ts: now, mode: "working" }]);
    setPhase("printing");
  }, [reset]);

  useEffect(() => {
    if (phase !== "printing") return;
    const id = window.setInterval(() => {
      setPrintUpTo((t) => t + MS_PER_MIN);
    }, 1200);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!autoRun || phase !== "printing") return;
    const elapsedMs = printUpTo - taskStartedAt;
    if (elapsedMs >= MS_PER_MIN * 7) {
      setAutoRun(false);
      runComplete();
    }
  }, [autoRun, phase, printUpTo, taskStartedAt, runComplete]);

  const endSession = useCallback(() => {
    if (sessionStartedAt == null) return;

    const startedAt = sessionStartedAt;
    let flushed: ReceiptData | null = null;

    if (cutContext.current) {
      const ctx = cutContext.current;
      flushed = makeDemoReceipt(
        taskStartedAt,
        ctx.tl,
        ctx.frozenAt,
        taskId,
        receiptCounter + 1,
        ctx.squares,
        cutPhotoUrl,
        currentTaskTitle,
      );
    } else if (phase === "printing" || phase === "cut") {
      const tl =
        timeline.length > 0
          ? timeline
          : [{ ts: taskStartedAt, mode: "working" as const }];
      const frozenAt = cutAt ?? printUpTo;
      const squares =
        cutSquares.length > 0
          ? cutSquares
          : computeSquares(taskStartedAt, tl, frozenAt);
      if (squares.length > 0) {
        flushed = makeDemoReceipt(
          taskStartedAt,
          tl,
          frozenAt,
          taskId,
          receiptCounter + 1,
          squares,
          cutPhotoUrl,
          currentTaskTitle,
        );
      }
    }

    const endedAt = Date.now();

    setAutoRun(false);
    setShowPhotoCapture(false);
    resetCutState();
    setPhase("idle");

    if (flushed) {
      setReceiptCounter((n) => n + 1);
      setReceipts((prev) => [...prev, flushed!]);
    }

    setEndedSession({ startedAt, endedAt });
    setSessionStartedAt(null);
    setView("session");
  }, [
    sessionStartedAt,
    phase,
    timeline,
    taskStartedAt,
    taskId,
    receiptCounter,
    cutAt,
    printUpTo,
    cutSquares,
    cutPhotoUrl,
    currentTaskTitle,
    resetCutState,
  ]);

  const canEndSession = view === "tray" && sessionStartedAt != null;

  const activeReceiptState = useMemo((): StageReceiptState | null => {
    if (phase === "idle") return null;

    const tl =
      timeline.length > 0
        ? timeline
        : [{ ts: taskStartedAt, mode: "working" as const }];

    if (phase === "printing") {
      return buildLiveStageReceiptState({
        taskId,
        taskTitle: currentTaskTitle,
        taskStartedAt,
        timeline: tl,
        liveNow: printUpTo,
        keyPrefix: "demo-live",
      });
    }

    if (phase === "cut" && cutAt != null) {
      return {
        phase: cutIsCut ? "cut" : "frozen",
        taskId,
        taskTitle: currentTaskTitle,
        taskStartedAt,
        timeline: tl,
        upToTs: cutAt,
        textureKey: [
          "demo-cut",
          taskId,
          cutAt,
          cutIsCut ? "ready" : "frozen",
          cutPhotoUrl ?? "no-photo",
        ].join(":"),
        squares: cutSquares,
        photoDataUrl: cutPhotoUrl,
        printedAt: cutAt,
      };
    }

    return null;
  }, [
    phase,
    timeline,
    taskStartedAt,
    printUpTo,
    taskId,
    currentTaskTitle,
    cutAt,
    cutIsCut,
    cutPhotoUrl,
    cutSquares,
  ]);

  const stageDemo = useMemo(
    () => ({
      receipts,
      activeReceiptState,
      onLanded: handleStageLanded,
    }),
    [receipts, activeReceiptState, handleStageLanded],
  );

  const liveSquares =
    phase === "printing" && activeReceiptState?.phase === "live"
      ? computeSquares(
          taskStartedAt,
          timeline,
          activeReceiptState.upToTs,
        )
      : [];

  if (view === "session" && endedSession) {
    return (
      <>
        <SessionSummaryView
          key={endedSession.endedAt}
          endedSession={endedSession}
          receipts={receipts}
          onBack={() => setView("tray")}
          backLabel="← Back to demo"
        />
        {showPhotoCapture && (
          <PhotoCaptureDialog
            key={photoCaptureKey}
            onCancel={() => setShowPhotoCapture(false)}
            onCommitted={onPhotoCommitted}
          />
        )}
      </>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[color:var(--color-ground)] flex flex-col">
      <div className="shrink-0 border-b border-[color:var(--color-shell-outline)] bg-[color:var(--color-shell)] px-6 py-4 flex flex-wrap items-center gap-3 z-50">
        <Link
          href="/"
          className="text-[11px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] mr-2"
        >
          ← Back to app
        </Link>
        <span className="text-[13px] tracking-[0.18em] uppercase text-[color:var(--color-ink)]/85 mr-4">
          Receipt animation demo
        </span>
        <DemoButton onClick={reset} label="Reset" />
        <DemoButton onClick={startPrinting} label="Start live print" active={phase === "printing"} />
        <DemoButton onClick={addMinute} label="+1 minute" disabled={phase !== "printing"} />
        <DemoButton onClick={runComplete} label="Complete → stack" disabled={phase === "idle"} />
        <DemoButton onClick={playFullSequence} label="Play full sequence" />
        <DemoButton onClick={endSession} label="End session" disabled={!canEndSession} />
        <span className="text-[11px] text-[color:var(--color-muted)] ml-auto tabular-nums">
          Phase: <strong className="text-[color:var(--color-ink)]">{phase}</strong>
          {phase === "printing" && <> · {liveSquares.length} min printed</>}
          {receipts.length > 0 && <> · {receipts.length} in stack</>}
        </span>
      </div>

      <div className="flex-1 min-h-0 relative">
        <Tray
          variant="centered"
          demo={stageDemo}
          footer={
          <>
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
              <button
                type="button"
                onClick={endSession}
                disabled={!canEndSession}
                className="btn-end-session h-[68px] w-[360px] rounded-full text-[18px] tracking-[0.06em] text-[color:var(--color-ink)] disabled:opacity-60 disabled:cursor-not-allowed"
                title={
                  canEndSession
                    ? "End session"
                    : "Start the timer to begin a session"
                }
              >
                End session
              </button>
            </div>
            <div className="absolute bottom-[6.5rem] left-1/2 -translate-x-1/2 z-10 text-[10px] tracking-wider text-[color:var(--color-muted)] text-center max-w-[360px]">
              Stack a few tasks · End session opens the mega receipt summary
            </div>
          </>
          }
        />
      </div>

      {showPhotoCapture && (
        <PhotoCaptureDialog
          key={photoCaptureKey}
          onCancel={() => setShowPhotoCapture(false)}
          onCommitted={onPhotoCommitted}
        />
      )}
    </div>
  );
}

function DemoButton({
  label,
  onClick,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn-skeuo px-4 h-9 rounded-full text-[12px] tracking-wider text-[color:var(--color-ink)] disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? "ring-2 ring-[color:var(--color-ink)]/30" : ""
      }`}
    >
      {label}
    </button>
  );
}
